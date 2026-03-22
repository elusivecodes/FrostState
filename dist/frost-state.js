(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.State = {}));
})(this, (function (exports) { 'use strict';

    const activeEffects = [];
    const effectNextStates = new WeakMap();

    /**
     * Checks whether state reads are currently being tracked by an active effect.
     * @returns {boolean} Whether an effect is currently collecting dependencies.
     */
    function isTrackingEffects() {
        return activeEffects.length > 0;
    }

    /**
     * Callable state accessor returned by `useState`.
     * @template T
     * @typedef {Function} StateAccessor
     * @property {(markEffects?: boolean) => T} get The function to retrieve the current value.
     * @property {(newValue: T) => void} set The function to set a new value.
     * @property {T} value The current value.
     * @property {T|undefined} previous The previous value after the last successful change.
     */

    /**
     * Registers a reactive effect that runs immediately and re-runs when any state
     * read inside the callback changes.
     * Re-execution is scheduled in a microtask unless `.sync()` is used.
     * @param {Function} callback The callback function.
     * @param {{ weak?: boolean }} [options] The effect options.
     * @param {boolean} [options.weak=false] Whether to use a WeakRef for the effect runner.
     * @returns {Function} The wrapped effect runner.
     * @throws {Error} If the effect synchronously triggers itself.
     * @throws {*} Re-throws any error thrown by `callback`.
     */
    function useEffect(callback, { weak = false } = {}) {
        const prevStates = new Set();
        const nextStates = new Set();

        const wrapped = () => {
            if (activeEffects.includes(ref)) {
                throw new Error('Cannot trigger an effect inside itself');
            }

            activeEffects.push(ref);

            try {
                callback();
            } catch (error) {
                for (const state of nextStates) {
                    if (!prevStates.has(state)) {
                        state.effects.delete(ref);
                    }
                }

                nextStates.clear();

                throw error;
            } finally {
                activeEffects.pop();
            }

            for (const state of prevStates) {
                if (!nextStates.has(state)) {
                    state.effects.delete(ref);
                }
            }

            prevStates.clear();

            for (const state of nextStates) {
                prevStates.add(state);
            }

            nextStates.clear();
        };

        let running;
        let pending = false;
        const debounced = () => {
            if (running) {
                pending = true;
                return;
            }

            running = true;

            Promise.resolve()
                .then(() => {
                    wrapped();
                })
                .finally(() => {
                    running = false;
                    if (pending) {
                        pending = false;
                        debounced();
                    }
                });
        };

        debounced.sync = wrapped;

        const ref = weak ?
            new WeakRef(debounced) :
            { deref: () => debounced };

        effectNextStates.set(ref, nextStates);

        wrapped();

        return debounced;
    }
    /**
     * Creates a reactive state container.
     * @template T
     * @param {T} value The initial state value.
     * @returns {StateAccessor<T>} The state accessor.
     */
    function useState(value) {
        let previous;
        const effects = new Set();

        const get = (markEffects = true) => {
            if (markEffects && activeEffects.length) {
                const activeEffect = activeEffects.at(-1);

                effects.add(activeEffect);

                if (effectNextStates.has(activeEffect)) {
                    effectNextStates.get(activeEffect).add(state);
                }
            }

            return value;
        };

        const set = (newValue) => {
            if (Object.is(value, newValue)) {
                return;
            }

            previous = value;
            value = newValue;

            for (const effect of effects) {
                const callback = effect.deref();

                if (callback) {
                    callback(state);
                } else {
                    effects.delete(effect);
                }
            }
        };

        const state = function(newValue) {
            if (!arguments.length) {
                return get();
            }

            set(newValue);
        };

        state[Symbol.toPrimitive] = get;
        state.get = get;
        state.set = set;

        state.cleanup = () => {
            if (!activeEffects.length) {
                return;
            }
            const activeEffect = activeEffects.at(-1);
            if (effectNextStates.has(activeEffect) && !effectNextStates.get(activeEffect).has(state)) {
                effects.delete(activeEffect);
            }
        };

        Object.defineProperty(state, 'previous', {
            get: () => previous,
        });

        Object.defineProperty(state, 'value', {
            get,
            set,
        });

        Object.defineProperty(state, 'effects', {
            get: () => effects,
        });

        return state;
    }

    /**
     * Checks whether a value is a plain object constructed by `Object`.
     * Values with a null prototype and class instances return `false`.
     * @param {*} value The value to test.
     * @returns {boolean} Whether the value is a plain object.
     */
    function isPlainObject(value) {
        return value?.constructor === Object;
    }

    /** @import { StateAccessor } from './state.js' */


    /**
     * Creates a callable, proxy-backed keyed reactive store.
     * Existing keys are read via property access, written via assignment, and raw
     * state accessors are available via `store.use(key)` or `store(key)`.
     * Missing string-key reads return `undefined`. Reads made during effect
     * tracking subscribe to later assignments without exposing the key.
     * API keys are reserved and cannot be used as state keys.
     */
    class StateStore extends Function {
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

    exports.StateStore = StateStore;
    exports.useEffect = useEffect;
    exports.useState = useState;

}));
//# sourceMappingURL=frost-state.js.map
