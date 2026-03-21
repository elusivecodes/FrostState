/** @import { StateAccessor } from './state.js' */

import { isPlainObject } from './helpers.js';
import { isTrackingEffects, useState } from './state.js';

/**
 * Creates a callable, proxy-backed keyed reactive store.
 * Existing keys are read via property access, written via assignment, and raw
 * state accessors are available via `store.use(key)` or `store(key)`.
 * Missing string-key reads return `undefined`. Reads made during effect
 * tracking subscribe to later assignments without exposing the key.
 * API keys are reserved and cannot be used as state keys.
 */
export default class StateStore extends Function {
    #state = new Map();
    #visibleKeys = new Set();

    static #isReservedStateKey(key) {
        return typeof key === 'string' && (
            Object.prototype.hasOwnProperty.call(StateStore.prototype, key)
        );
    }

    /**
     * Wraps a plain object in a `StateStore`.
     * Non-plain values are returned unchanged.
     * @template T
     * @param {T} value The value to wrap.
     * @param {{ deep?: boolean }} [options] The wrap options.
     * @param {boolean} [options.deep=false] Whether to recursively wrap nested plain objects.
     * @returns {StateStore|T} The wrapped store, or the original value.
     * @throws {TypeError} If the wrapped object contains a reserved `StateStore` key.
     */
    static wrap(value, options = { deep: false }) {
        if (value instanceof StateStore) {
            return value;
        }

        if (!isPlainObject(value)) {
            return value;
        }

        const store = new StateStore();

        for (const [key, val] of Object.entries(value)) {
            store[key] = options.deep ?
                StateStore.wrap(val, options) :
                val;
        }

        return store;
    }

    /**
     * Merges plain-object data into a `StateStore`.
     * Non-plain values replace the current value and are returned unchanged.
     * @template T
     * @param {*} store The target store to merge into. It must already be a `StateStore`
     *   unless `options.allowFallback` is true.
     * @param {T} value The value to merge.
     * @param {{ deep?: boolean, allowFallback?: boolean }} [options] The merge options.
     * @param {boolean} [options.deep=false] Whether to recursively merge nested plain objects into nested stores.
     * @param {boolean} [options.allowFallback=false] Whether to wrap the value when the target is not already a `StateStore`.
     * @returns {StateStore|T} The updated store, or the original value.
     * @throws {TypeError} If `store` is not a `StateStore` and fallback is disabled.
     * @throws {TypeError} If the merged data contains a reserved `StateStore` key.
     */
    static merge(store, value, options = { deep: false, allowFallback: false }) {
        if (!(store instanceof StateStore)) {
            if (options.allowFallback) {
                return StateStore.wrap(value, options);
            }

            throw new TypeError('First argument must be a StateStore instance');
        }

        if (!isPlainObject(value)) {
            return value;
        }

        for (const [key, val] of Object.entries(value)) {
            store[key] = options.deep ?
                StateStore.merge(
                    store.has(key) ?
                        store.use(key).value :
                        undefined,
                    val,
                    {
                        ...options,
                        allowFallback: true,
                    },
                ) :
                val;
        }

        return store;
    }

    /**
     * Creates a new callable `StateStore` proxy.
     */
    constructor() {
        super();

        return new Proxy(
            this,
            {
                apply(target, thisArg, args) {
                    if (!args.length) {
                        return target;
                    }

                    return target.use(...args);
                },
                get(target, prop) {
                    if (typeof prop === 'symbol') {
                        return Reflect.get(target, prop, target);
                    }

                    if (StateStore.#isReservedStateKey(prop)) {
                        const value = Reflect.get(target, prop, target);

                        if (typeof value === 'function') {
                            return value.bind(target);
                        }

                        return value;
                    }

                    return target.#readKey(prop);
                },
                getOwnPropertyDescriptor(target, prop) {
                    const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

                    if (descriptor) {
                        return descriptor;
                    }

                    if (target.has(prop)) {
                        return {
                            configurable: true,
                            enumerable: true,
                            writable: true,
                            value: target.use(prop).value,
                        };
                    }

                    return undefined;
                },
                has(target, prop) {
                    if (typeof prop === 'symbol') {
                        return Reflect.has(target, prop);
                    }

                    return StateStore.#isReservedStateKey(prop) || target.has(prop);
                },
                ownKeys(target) {
                    const baseKeys = Reflect.ownKeys(target);
                    const stateKeys = target.keys();

                    return Array.from(
                        new Set([...baseKeys, ...stateKeys]),
                    );
                },
                set(target, prop, value) {
                    if (typeof prop === 'symbol') {
                        return Reflect.set(target, prop, value, target);
                    }

                    target.#assignKey(prop, value);

                    return true;
                },
            },
        );
    }

    /**
     * Checks whether a state key exists in the store.
     * @param {string} key The state key.
     * @returns {boolean} Whether the key exists.
     */
    has(key) {
        return this.#visibleKeys.has(key);
    }

    /**
     * Retrieves the stored state keys.
     * Reserved API keys are not included.
     * @returns {IterableIterator<string>} The key iterator.
     */
    keys() {
        return this.#visibleKeys.values();
    }

    /**
     * Sets multiple keys from an object's own enumerable string properties.
     * @param {Record<string, *>} data The key/value pairs.
     * @throws {TypeError} If `data` contains a reserved `StateStore` key.
     */
    set(data) {
        for (const [key, value] of Object.entries(data)) {
            this.#assignKey(key, value);
        }
    }

    /**
     * Retrieves or creates a state by key.
     * Missing keys become visible only through this method, `set(...)`, or proxy assignment.
     * @template T
     * @param {string} key The state key.
     * @param {T} [defaultValue] The default value when creating.
     * @returns {StateAccessor<T>} The state accessor for the key.
     * @throws {TypeError} If `key` is reserved for the `StateStore` API.
     */
    use(key, defaultValue) {
        if (StateStore.#isReservedStateKey(key)) {
            throw new TypeError(`"${key}" is a reserved StateStore key`);
        }

        if (this.#state.has(key)) {
            const state = this.#state.get(key);

            if (!this.has(key)) {
                this.#visibleKeys.add(key);

                if (arguments.length > 1) {
                    state.value = defaultValue;
                }
            }

            return state;
        }

        const state = useState(defaultValue);

        this.#state.set(key, state);
        this.#visibleKeys.add(key);

        return state;
    }

    #readKey(key) {
        if (this.#state.has(key)) {
            return this.#state.get(key).value;
        }

        if (!isTrackingEffects()) {
            return undefined;
        }

        const state = useState(undefined);

        this.#state.set(key, state);

        return state.value;
    }

    #assignKey(key, value) {
        if (StateStore.#isReservedStateKey(key)) {
            throw new TypeError(`"${key}" is a reserved StateStore key`);
        }

        if (this.#state.has(key)) {
            this.#visibleKeys.add(key);
            this.#state.get(key).value = value;
            return;
        }

        const state = useState(value);

        this.#state.set(key, state);
        this.#visibleKeys.add(key);
    }
}
