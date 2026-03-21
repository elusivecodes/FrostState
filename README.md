# FrostState

[![CI](https://github.com/elusivecodes/FrostState/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/elusivecodes/FrostState/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fr0st%2Fstate?style=flat-square)](https://www.npmjs.com/package/@fr0st/state)
[![npm downloads](https://img.shields.io/npm/dm/%40fr0st%2Fstate?style=flat-square)](https://www.npmjs.com/package/@fr0st/state)
[![minzipped size](https://img.shields.io/bundlejs/size/%40fr0st%2Fstate?format=minzip&style=flat-square)](https://bundlejs.com/?q=@fr0st/state)
[![license](https://img.shields.io/github/license/elusivecodes/FrostState?style=flat-square)](./LICENSE)

Small, focused reactive state primitives for values, effects, and keyed stores. FrostState has zero runtime dependencies, works in Node and bundlers, and also ships a browser-friendly UMD bundle that exposes `globalThis.State`.

## Highlights

- Named exports for tree-shaking
- Browser UMD bundle in `dist/`
- No runtime dependencies
- JSDoc-powered IntelliSense

## Installation

### Node / bundlers

```bash
npm i @fr0st/state
```

FrostState is ESM-only. Use `import` syntax in Node and bundlers.

### Browser (UMD)

Load the bundle from your own copy or a CDN:

```html
<script src="/path/to/dist/frost-state.min.js"></script>
<!-- or -->
<script src="https://cdn.jsdelivr.net/npm/@fr0st/state@latest/dist/frost-state.min.js"></script>
<script>
    const { StateStore, useEffect, useState } = globalThis.State;

    const count = useState(0);

    useEffect(() => {
        console.log('count =', count());
    });

    count(1);
</script>
```

## Quick Start

### Reactive values

```js
import { useEffect, useState } from '@fr0st/state';

const first = useState('Ada');
const last = useState('Lovelace');

useEffect(() => {
    console.log(`${first()} ${last()}`);
});

last('Byron'); // logs "Ada Byron" on the next microtask
first.value = 'Augusta'; // logs "Augusta Byron"
```

### Keyed stores

```js
import { StateStore, useEffect } from '@fr0st/state';

const store = StateStore.wrap({
    count: 0,
});

useEffect(() => {
    console.log('count =', store.count);
});

store.count = 1; // logs "count = 1"
```

TypeScript note: FrostState is written in JavaScript and uses JSDoc types, which most editors surface as IntelliSense.

## API

FrostState exports three named APIs from `@fr0st/state`: `useState`, `useEffect`, and `StateStore`.

### `useState(value)`

Creates a callable state accessor for a single value.

```js
const state = useState(value);
```

The returned accessor supports:

- `state()`: read the current value
- `state(next)`: write the current value
- `state.get(markEffects = true)`: read the current value, optionally without effect tracking
- `state.set(next)`: write the current value
- `state.value`: read or write the current value
- `state.previous`: read the previous value after the last successful change

```js
import { useState } from '@fr0st/state';

const state = useState('hello');

state(); // 'hello'
state('world');

state.get(); // 'world'
state.set('again');

state.value = 'done';
state.previous; // 'again'
```

### `useEffect(callback, options)`

Runs an effect immediately, tracks the states read during that run, and schedules
re-runs when any of those states change.

```js
const effect = useEffect(callback, options);
```

Options:

- `options.weak`: use a `WeakRef`-backed runner

The returned runner supports:

- `effect()`: schedule a re-run in a microtask
- `effect.sync()`: run immediately

```js
import { useEffect, useState } from '@fr0st/state';

const a = useState(1);
const b = useState(2);

const effect = useEffect(() => {
    console.log(a() + b());
});

a(3); // logs 5 on the next microtask
effect.sync(); // logs immediately
```

### `StateStore`

Creates a callable, proxy-backed keyed store for state accessors. Property reads
return existing keys, property assignment writes keys, and missing property reads
return `undefined`. Effects that read missing keys subscribe to later assignment
without exposing those keys through enumeration.

```js
const store = new StateStore();
const state = store(key, defaultValue);
```

#### Instance API

The returned store supports:

- `store.key`: read an existing key
- `store.key = value`: write a key
- `store.use(key, defaultValue)`: retrieve or create a state accessor
- `store(key, defaultValue)`: retrieve or create a state accessor through the callable form
- `store.set(object)`: set top-level keys from an object
- `store.has(key)`: check whether a key exists
- `store.keys()`: iterate stored keys

```js
import { StateStore, useEffect } from '@fr0st/state';

const store = new StateStore();
const count = store('count', 0);

store.set({ label: 'Clicks' });

useEffect(() => {
    console.log(store.label, count());
});

count(1); // logs "Clicks 1"
store.count = 2; // logs "Clicks 2"

store.has('count'); // true
Array.from(store.keys()); // ['count', 'label']
```

#### Static helpers

- `StateStore.wrap(value, options)`: wrap a plain object in a store
- `StateStore.merge(store, value, options)`: merge plain-object data into a store

```js
import { StateStore } from '@fr0st/state';

const nested = StateStore.wrap(
    {
        user: {
            name: 'Ada',
        },
    },
    { deep: true },
);

nested.user.name = 'Grace';

const settings = new StateStore();

StateStore.merge(
    settings,
    {
        ui: {
            theme: 'dark',
        },
    },
    { deep: true },
);

StateStore.merge(
    settings,
    {
        ui: {
            compact: true,
        },
    },
    { deep: true },
);

settings.ui.theme = 'light';

nested.user.name; // 'Grace'
settings.ui.theme; // 'light'
settings.ui.compact; // true
```

## Behavior Notes

- `useEffect()` tracks only the states read during the latest successful run.
- `useEffect()` schedules normal re-runs in a microtask, and `.sync()` bypasses that scheduling.
- `store.set(...)` assigns top-level keys only. Nested plain objects remain plain values.
- Use `StateStore.wrap(..., { deep: true })` or `StateStore.merge(..., { deep: true })` for nested reactive stores.
- Missing property reads such as `store.missing` return `undefined`. Reads made during effect tracking still subscribe to later assignment without exposing the key.
- API keys such as `use`, `set`, `has`, and `keys` are reserved and cannot be used as state keys.
- Weak effects rely on `WeakRef`. The test suite uses `node --expose-gc` to cover weak-reference behavior.

## Development

```bash
npm test
npm run js-lint
npm run build
```

## License

FrostState is released under the [MIT License](./LICENSE).
