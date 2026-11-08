import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkCauseChain, collectCauseChain } from '../src/index.js';

function makeError(name, message, cause) {
  const err = new Error(message);
  err.name = name;
  if (cause !== undefined) err.cause = cause;
  return err;
}

test('single error produces one frame', () => {
  const err = makeError('TypeError', 'boom');
  const frames = collectCauseChain(err);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].name, 'TypeError');
  assert.equal(frames[0].message, 'boom');
  assert.equal(typeof frames[0].stack, 'string');
});

test('nested causes are collected outermost first', () => {
  const root = makeError('RootError', 'root');
  const mid = makeError('MidError', 'mid', root);
  const top = makeError('TopError', 'top', mid);
  const frames = collectCauseChain(top);
  assert.deepEqual(
    frames.map((f) => f.name),
    ['TopError', 'MidError', 'RootError']
  );
  assert.deepEqual(
    frames.map((f) => f.message),
    ['top', 'mid', 'root']
  );
});

test('non-Error cause stops the walk and is not included', () => {
  const top = makeError('TopError', 'top', 'a string cause');
  const frames = collectCauseChain(top);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].name, 'TopError');
});

test('missing cause property stops the walk', () => {
  const err = new Error('plain');
  const frames = collectCauseChain(err);
  assert.equal(frames.length, 1);
});

test('cyclic cause chain is truncated without hanging', () => {
  const a = makeError('A', 'a');
  const b = makeError('B', 'b', a);
  a.cause = b; // cycle: a -> b -> a
  const frames = collectCauseChain(a);
  assert.deepEqual(
    frames.map((f) => f.name),
    ['A', 'B']
  );
});

test('maxDepth caps the number of frames', () => {
  const root = makeError('Root', 'root');
  const mid = makeError('Mid', 'mid', root);
  const top = makeError('Top', 'top', mid);
  const frames = collectCauseChain(top, { maxDepth: 2 });
  assert.deepEqual(
    frames.map((f) => f.name),
    ['Top', 'Mid']
  );
});

test('maxDepth zero yields an empty array', () => {
  const err = makeError('Only', 'only');
  const frames = collectCauseChain(err, { maxDepth: 0 });
  assert.deepEqual(frames, []);
});

test('invalid maxDepth throws TypeError', () => {
  const err = makeError('E', 'e');
  assert.throws(() => collectCauseChain(err, { maxDepth: -1 }), TypeError);
  assert.throws(() => collectCauseChain(err, { maxDepth: NaN }), TypeError);
  assert.throws(() => collectCauseChain(err, { maxDepth: '2' }), TypeError);
});

test('non-Error input throws TypeError', () => {
  assert.throws(() => collectCauseChain('nope'), TypeError);
  assert.throws(() => collectCauseChain({ message: 'fake' }), TypeError);
  assert.throws(() => collectCauseChain(null), TypeError);
});

test('empty name falls back to Error in walkCauseChain', () => {
  const err = makeError('', 'no name');
  const report = walkCauseChain(err);
  assert.equal(report, 'Error: no name');
});

test('walkCauseChain joins frames with newlines', () => {
  const root = makeError('Root', 'r');
  const top = makeError('Top', 't', root);
  const report = walkCauseChain(top);
  assert.equal(report, 'Top: t\nRoot: r');
});

test('walkCauseChain includes indented stacks when asked', () => {
  const err = makeError('E', 'msg');
  err.stack = 'E: msg\n    at one\n    at two';
  const report = walkCauseChain(err, { includeStack: true });
  assert.equal(report, 'E: msg\n  E: msg\n      at one\n      at two');
});

test('walkCauseChain omits stacks by default', () => {
  const err = makeError('E', 'msg');
  err.stack = 'E: msg\n    at one';
  const report = walkCauseChain(err);
  assert.equal(report, 'E: msg');
});
