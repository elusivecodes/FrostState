import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { useEffect, useState } from '../src/index.js';

describe('useState', () => {
    describe('reads', () => {
        it('reads with state()', () => {
            const state = useState(1);

            assert.strictEqual(state(), 1);
        });

        it('reads with state.get()', () => {
            const state = useState(1);

            assert.strictEqual(state.get(), 1);
        });

        it('reads with state.value', () => {
            const state = useState(1);

            assert.strictEqual(state.value, 1);
        });

        it('reads with Symbol.toPrimitive', () => {
            const state = useState(1);

            assert.strictEqual(Number(state), 1);
        });
    });

    describe('writes', () => {
        it('writes with state(x)', () => {
            const state = useState(1);

            state(2);

            assert.strictEqual(state(), 2);
        });

        it('writes with state.set(x)', () => {
            const state = useState(1);

            state.set(3);

            assert.strictEqual(state(), 3);
        });

        it('writes with state.value = x', () => {
            const state = useState(1);

            state.value = 4;

            assert.strictEqual(state(), 4);
        });
    });

    describe('change tracking', () => {
        it('tracks state.previous', () => {
            const state = useState(1);

            state(2);
            assert.strictEqual(state.previous, 1);

            state.value = 3;
            assert.strictEqual(state.previous, 2);

            state.set(4);
            assert.strictEqual(state.previous, 3);
        });

        it('treats the same value as a no-op', () => {
            const state = useState(1);

            state(1);

            assert.strictEqual(state.value, 1);
            assert.strictEqual(state.previous, undefined);
        });

        it('handles Object.is edge cases', () => {
            const state = useState(NaN);

            state(NaN);
            assert.ok(Number.isNaN(state.value));
            assert.strictEqual(state.previous, undefined);

            state.value = -0;
            assert.strictEqual(Object.is(state.value, -0), true);

            state.value = 0;
            assert.strictEqual(Object.is(state.value, 0), true);
            assert.strictEqual(state.previous, -0);
        });
    });

    describe('dependency tracking', () => {
        it('does not track dependencies when get(false) is used', async () => {
            const state = useState(1);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                state.get(false);
            });

            state(2);
            await Promise.resolve();

            assert.strictEqual(runs, 1);
        });
    });
});
