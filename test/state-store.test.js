import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { StateStore, useEffect } from '../src/index.js';

const tick = () => Promise.resolve();

describe('StateStore', () => {
    describe('proxy access', () => {
        it('reads shallow values via proxy', () => {
            const store = new StateStore();

            store.set({ a: 1 });

            assert.strictEqual(store.a, 1);
        });

        it('writes shallow values via proxy', () => {
            const store = new StateStore();

            store.a = 2;

            assert.strictEqual(store.a, 2);
        });

        it('creates shallow values via proxy assignment', () => {
            const store = new StateStore();

            store.a = 1;

            assert.strictEqual(store.a, 1);
            assert.strictEqual(store.has('a'), true);
        });

        it('does not create state on symbol access', () => {
            const store = new StateStore();

            const iter = store[Symbol.iterator];

            assert.strictEqual(iter, undefined);
            assert.strictEqual(store.has('Symbol(Symbol.iterator)'), false);
        });

        it('does not create state on missing property read', () => {
            const store = new StateStore();

            assert.strictEqual(store.missing, undefined);
            assert.strictEqual(store.has('missing'), false);
            assert.deepStrictEqual(Object.keys(store), []);
        });

        it('does not expose internal-looking keys by default', () => {
            const store = new StateStore();

            assert.strictEqual(store._state, undefined);
            assert.strictEqual(store.has('_state'), false);
            assert.deepStrictEqual(Object.keys(store), []);
        });

        it('allows common function property names as state keys', () => {
            const store = new StateStore();

            store.name = 'counter';

            assert.strictEqual(store.name, 'counter');
            assert.strictEqual(store.use('name')(), 'counter');
        });
    });

    describe('state accessors', () => {
        it('reads shallow values via use()', () => {
            const store = new StateStore();

            store.set({ a: 1 });

            assert.strictEqual(store.use('a')(), 1);
        });

        it('writes shallow values via use()', () => {
            const store = new StateStore();

            store.set({ a: 1 });
            store.use('a').set(2);

            assert.strictEqual(store.a, 2);
        });

        it('returns a state accessor from use()', () => {
            const store = new StateStore();

            const state = store.use('count', 1);

            assert.strictEqual(typeof state, 'function');
        });

        it('writes through the state accessor returned by use()', () => {
            const store = new StateStore();

            const state = store.use('count', 1);
            state(2);

            assert.strictEqual(store.count, 2);
        });
    });

    describe('introspection', () => {
        it('supports has() for existing keys', () => {
            const store = new StateStore();

            store.set({ a: 1 });

            assert.strictEqual(store.has('a'), true);
        });

        it('supports has() for missing keys', () => {
            const store = new StateStore();

            assert.strictEqual(store.has('b'), false);
        });

        it('supports the "in" operator for existing keys', () => {
            const store = new StateStore();

            store.set({ a: 1 });

            assert.strictEqual('a' in store, true);
        });

        it('supports the "in" operator for missing keys', () => {
            const store = new StateStore();

            assert.strictEqual('b' in store, false);
        });

        it('supports the "in" operator for store methods', () => {
            const store = new StateStore();

            assert.strictEqual('use' in store, true);
            assert.strictEqual('set' in store, true);
            assert.strictEqual('_state' in store, false);
        });

        it('iterates keys with keys()', () => {
            const store = new StateStore();

            store.set({ a: 1, b: 2 });

            assert.deepStrictEqual(
                Array.from(store.keys()).sort(),
                ['a', 'b'],
            );
        });

        it('returns keys via Object.keys()', () => {
            const store = new StateStore();

            store.set({ a: 1, b: 2 });

            assert.deepStrictEqual(
                Object.keys(store).sort(),
                ['a', 'b'],
            );
        });
    });

    describe('reserved keys', () => {
        it('rejects reserved keys via use()', () => {
            const store = new StateStore();

            assert.throws(
                () => store.use('use', 1),
                /reserved StateStore key/,
            );
        });

        it('rejects reserved keys via proxy assignment', () => {
            const store = new StateStore();

            assert.throws(
                () => {
                    store.use = 1;
                },
                /reserved StateStore key/,
            );
        });

        it('rejects reserved keys via set()', () => {
            const store = new StateStore();

            assert.throws(
                () => store.set({ use: 1 }),
                /reserved StateStore key/,
            );
        });

        it('allows internal-looking keys when they are not part of the API', () => {
            const store = new StateStore();

            store._state = 'user value';

            assert.strictEqual(store._state, 'user value');
            assert.strictEqual(store.has('_state'), true);
        });
    });

    describe('value handling', () => {
        it('handles array values as plain values', () => {
            const store = new StateStore();
            const arr = [1, 2, 3];

            store.set({ a: arr });

            assert.strictEqual(store.a, arr);
        });

        it('handles null values as plain values', () => {
            const store = new StateStore();

            store.set({ a: null });

            assert.strictEqual(store.a, null);
        });

        it('handles Date values as plain values', () => {
            const store = new StateStore();
            const value = new Date();

            store.set({ a: value });

            assert.strictEqual(store.a, value);
        });

        it('keeps nested objects plain when using set', () => {
            const store = new StateStore();

            store.set({ a: { b: 1 } });

            assert.ok(!(store.a instanceof StateStore));
            assert.strictEqual(store.a.b, 1);
        });
    });

    describe('wrap', () => {
        it('creates a nested store', () => {
            const store = new StateStore();

            store.set({ a: StateStore.wrap({ b: 1 }) });

            assert.ok(store.a instanceof StateStore);
        });

        it('reads nested values via proxy', () => {
            const store = new StateStore();

            store.set({ a: StateStore.wrap({ b: 1 }) });

            assert.strictEqual(store.a.b, 1);
        });

        it('writes nested values via proxy', () => {
            const store = new StateStore();

            store.set({ a: StateStore.wrap({ b: 1 }) });
            store.a.b = 2;

            assert.strictEqual(store.a.b, 2);
        });

        it('returns non-plain values as-is', () => {
            const date = new Date();
            const arr = [1, 2, 3];

            assert.strictEqual(StateStore.wrap(date), date);
            assert.strictEqual(StateStore.wrap(arr), arr);
        });

        it('keeps nested objects plain when deep=false', () => {
            const wrapped = StateStore.wrap({ a: { b: 1 } });

            assert.ok(wrapped instanceof StateStore);
            assert.ok(!(wrapped.a instanceof StateStore));
            assert.strictEqual(wrapped.a.b, 1);
        });

        it('wraps nested plain objects when deep=true', () => {
            const wrapped = StateStore.wrap({ a: { b: 1 } }, { deep: true });

            assert.ok(wrapped instanceof StateStore);
            assert.ok(wrapped.a instanceof StateStore);
            assert.strictEqual(wrapped.a.b, 1);
        });
    });

    describe('merge', () => {
        it('throws when the existing value is not a store', () => {
            assert.throws(
                () => StateStore.merge(null, { a: 1 }),
                /StateStore instance/,
            );
        });

        it('falls back to wrap when allowFallback is true', () => {
            const merged = StateStore.merge(null, { a: 1 }, { allowFallback: true });

            assert.ok(merged instanceof StateStore);
            assert.strictEqual(merged.a, 1);
        });

        it('reuses nested stores on subsequent merge calls', () => {
            const store = new StateStore();

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });
            const first = store.a;

            StateStore.merge(store, { a: { c: 2 } }, { deep: true });
            const second = store.a;

            assert.strictEqual(first, second);
        });

        it('preserves existing nested values', () => {
            const store = new StateStore();

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });
            StateStore.merge(store, { a: { c: 2 } }, { deep: true });

            assert.strictEqual(store.a.b, 1);
        });

        it('adds new nested values', () => {
            const store = new StateStore();

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });
            StateStore.merge(store, { a: { c: 2 } }, { deep: true });

            assert.strictEqual(store.a.c, 2);
        });

        it('overwrites nested stores with non-objects', () => {
            const store = new StateStore();

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });
            StateStore.merge(store, { a: 3 }, { deep: true });

            assert.strictEqual(store.a, 3);
        });

        it('deep merges into existing nested stores', () => {
            const store = new StateStore();

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });
            const first = store.a;

            StateStore.merge(store, { a: { c: 2 } }, { deep: true });
            const second = store.a;

            assert.strictEqual(first, second);
            assert.strictEqual(store.a.b, 1);
            assert.strictEqual(store.a.c, 2);
        });
    });

    describe('reactivity', () => {
        it('triggers effects when a missing key is later assigned', async () => {
            const store = new StateStore();
            const values = [];

            useEffect(() => {
                values.push(store.count);
            });

            assert.deepStrictEqual(values, [undefined]);
            assert.strictEqual(store.has('count'), false);
            assert.deepStrictEqual(Object.keys(store), []);

            store.count = 1;
            await tick();

            assert.deepStrictEqual(values, [undefined, 1]);
            assert.strictEqual(store.has('count'), true);
            assert.deepStrictEqual(Object.keys(store), ['count']);
        });

        it('triggers effects for nested updates', async () => {
            const store = new StateStore();
            let runs = 0;

            StateStore.merge(store, { a: { b: 1 } }, { deep: true });

            useEffect(() => {
                runs += 1;
                store.a.b;
            });

            assert.strictEqual(runs, 1);

            store.a.b = 2;
            await tick();

            assert.strictEqual(runs, 2);
        });
    });
});
