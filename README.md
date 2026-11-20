# mini-error-cause-chain-walker

Follows the ES2022 `cause` property through nested errors and returns the chain as an ordered array of plain frames (outermost first), or as a single report string.

```js
import { collectCauseChain, walkCauseChain } from 'mini-error-cause-chain-walker';

try {
  try {
    throw new Error('disk full');
  } catch (inner) {
    throw new Error('could not save profile', { cause: inner });
  }
} catch (err) {
  console.log(walkCauseChain(err));
  // Error: could not save profile
  // Error: disk full

  const frames = collectCauseChain(err);
  // [
  //   { name: 'Error', message: 'could not save profile', stack: '...' },
  //   { name: 'Error', message: 'disk full', stack: '...' }
  // ]
}
```

## Why this exists

`Error.cause` was added in ES2022 and most runtimes now populate it, but nothing in the language walks it for you. Loggers and HTTP error handlers want the whole chain flattened so a top-level report carries the root cause. This library does exactly that and nothing else. The trade-off: it returns plain objects rather than Error instances, because the realistic consumer serializes the result (JSON logs, API responses) and `Error` does not serialize usefully. If you need the live Error objects, keep your own reference; this module is for reporting.

## The awkward edge

`cause` is not guaranteed to be an Error. A thrown value can carry a string, a number, or a plain object as its cause. This library stops the walk at the first non-Error cause and omits it from the result. That is a deliberate choice: a report of errors should contain errors, not arbitrary values that happen to sit in a `cause` slot. If your code stores non-Error causes, inspect them yourself before calling in.

Cyclic chains (`a.cause = b; b.cause = a`) are truncated when a repeated Error reference is seen, and `maxDepth` (default 1000) caps the total frame count. Both guards exist so a malformed chain cannot hang the caller.

## API

### `collectCauseChain(error, options?)`

Returns an array of `{ name, message, stack }` objects, outermost first. `name`, `message`, and `stack` are strings; missing or non-string fields become `''`.

Options:

- `maxDepth` (number, default `1000`): maximum number of frames. Must be a non-negative finite number, otherwise a `TypeError` is thrown.

Throws `TypeError` if `error` is not an `Error` instance.

### `walkCauseChain(error, options?)`

Returns a single string, one frame per line, formatted as `Name: message`. A frame with an empty `name` is rendered as `Error`. A frame with an empty `message` is rendered as just its name.

Options: `maxDepth` as above, plus:

- `includeStack` (boolean, default `false`): when `true`, each frame's stack is appended below it, indented by two spaces.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

