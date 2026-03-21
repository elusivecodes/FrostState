import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { useEffect, useState } from '../src/index.js';

const tick = () => Promise.resolve();

describe('useEffect', () => {
    describe('execution', () => {
        it('runs immediately', () => {
            const state = useState(1);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                state();
            });

            assert.strictEqual(runs, 1);
        });

        it('runs on dependency change', async () => {
            const state = useState(1);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                state();
            });

            state(2);
            await tick();

            assert.strictEqual(runs, 2);
        });

        it('does not run on the same value', async () => {
            const state = useState(1);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                state();
            });

            state(2);
            await tick();
            assert.strictEqual(runs, 2);

            state(2);
            await tick();
            assert.strictEqual(runs, 2);
        });

        it('does not drop updates triggered during an effect', async () => {
            const state = useState(0);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                if (state() < 2) {
                    state(state() + 1);
                }
            });

            for (let i = 0; i < 5; i += 1) {
                await tick();
            }

            assert.strictEqual(state(), 2);
            assert.strictEqual(runs, 3);
        });

        it('runs synchronously with effect.sync()', () => {
            const state = useState(1);
            let runs = 0;

            const effect = useEffect(() => {
                runs += 1;
                state();
            });

            assert.strictEqual(runs, 1);

            effect.sync();

            assert.strictEqual(runs, 2);
        });
    });

    describe('dependency tracking', () => {
        it('switches dependencies when the access path changes', async () => {
            const a = useState(1);
            const b = useState(1);
            const toggle = useState(true);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                if (toggle()) {
                    a();
                } else {
                    b();
                }
            });

            assert.strictEqual(runs, 1);

            toggle(false);
            await tick();

            assert.strictEqual(runs, 2);
        });

        it('does not respond to stale dependencies', async () => {
            const a = useState(1);
            const b = useState(1);
            const toggle = useState(true);
            let runs = 0;

            useEffect(() => {
                runs += 1;
                if (toggle()) {
                    a();
                } else {
                    b();
                }
            });

            toggle(false);
            await tick();

            a(2);
            await tick();
            assert.strictEqual(runs, 2);

            b(2);
            await tick();
            assert.strictEqual(runs, 3);
        });
    });

    describe('error handling', () => {
        it('throws on a re-entrant effect', () => {
            const ref = {};
            const effect = useEffect(() => {
                if (ref.effect) {
                    ref.effect.sync();
                }
            });

            ref.effect = effect;
            effect();

            assert.throws(() => {
                effect.sync();
            }, /Cannot trigger an effect inside itself/);
        });

        it('cleans up bookkeeping when the initial setup throws', () => {
            const state = useState(1);
            const other = useState(2);

            assert.throws(() => {
                useEffect(() => {
                    state();
                    throw new Error('boom');
                });
            }, /boom/);

            assert.strictEqual(state.effects.size, 0);

            other();

            assert.strictEqual(other.effects.size, 0);
        });
    });

    describe('weak effects', () => {
        it('allows weak effects to be collected', async function() {
            if (typeof global.gc !== 'function') {
                this.skip();
            }

            const state = useState(1);
            let runs = 0;
            let _effect = useEffect(() => {
                runs += 1;
                state();
            }, { weak: true });

            const refs = [...state.effects];
            assert.strictEqual(refs.length, 1);

            const ref = refs[0];
            _effect = null;

            for (let i = 0; i < 5 && ref.deref(); i += 1) {
                global.gc();
                await tick();
            }

            state(2);
            await tick();

            if (!ref.deref()) {
                assert.strictEqual(runs, 1);
            } else {
                assert.strictEqual(runs, 2);
            }
        });
    });
});
