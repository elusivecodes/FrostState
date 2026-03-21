const activeEffects = [];
const effectNextStates = new WeakMap();

/**
 * Checks whether state reads are currently being tracked by an active effect.
 * @returns {boolean} Whether an effect is currently collecting dependencies.
 */
export function isTrackingEffects() {
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
export function useEffect(callback, { weak = false } = {}) {
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
};

/**
 * Creates a reactive state container.
 * @template T
 * @param {T} value The initial state value.
 * @returns {StateAccessor<T>} The state accessor.
 */
export function useState(value) {
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
};
