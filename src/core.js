const DEFAULT_MAX_DEPTH = 1000;

/**
 * Why a max depth? Cyclic `cause` references are possible (a.cause = b; b.cause = a)
 * and an unbounded loop would hang the host. 1000 is far beyond any realistic
 * nesting and cheap to check.
 */
function normalizeMaxDepth(value) {
  if (value === undefined) return DEFAULT_MAX_DEPTH;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError('maxDepth must be a non-negative finite number');
  }
  return Math.floor(value);
}

/**
 * Returns true when `value` looks like an Error we can read fields from.
 * We check `instanceof Error` first because that is the only reliable signal;
 * a plain object with a `message` key is not an Error and should not be walked
 * (the ES2022 spec ties `cause` to Error instances).
 */
function isErrorLike(value) {
  return value instanceof Error;
}

function readName(error) {
  const name = error.name;
  return typeof name === 'string' ? name : '';
}

function readMessage(error) {
  const message = error.message;
  return typeof message === 'string' ? message : '';
}

function readStack(error) {
  const stack = error.stack;
  return typeof stack === 'string' ? stack : '';
}

/**
 * Walk the ES2022 `cause` chain starting at `error` and return an ordered array
 * of frames, outermost first. Each frame is a plain object:
 *
 *   { name: string, message: string, stack: string }
 *
 * Rules:
 * - The starting error is always frame 0.
 * - We follow `error.cause` while it is an Error instance. A non-Error cause
 *   (string, number, plain object) stops the walk and is NOT included, because
 *   the spec only guarantees `cause` is meaningful on Error instances and mixing
 *   arbitrary values into a report of errors is misleading.
 * - A repeated Error reference (cycle) stops the walk before repeating a frame.
 * - `maxDepth` caps the number of frames; the default is 1000.
 *
 * Returning a plain data structure instead of Error instances is deliberate:
 * callers usually serialize this (JSON logs, HTTP responses) and Error objects
 * do not serialize usefully.
 */
export function collectCauseChain(error, options = {}) {
  if (!isErrorLike(error)) {
    throw new TypeError('collectCauseChain expects an Error instance');
  }
  const maxDepth = normalizeMaxDepth(options.maxDepth);
  const frames = [];
  const seen = new Set();
  let current = error;
  let depth = 0;

  while (isErrorLike(current) && depth < maxDepth) {
    if (seen.has(current)) break;
    seen.add(current);

    frames.push({
      name: readName(current),
      message: readMessage(current),
      stack: readStack(current),
    });

    current = current.cause;
    depth += 1;
  }

  return frames;
}

/**
 * Convenience wrapper that turns the collected frames into a single report
 * string, one frame per line, outermost first. This is the shape most loggers
 * want when a top-level error should carry its whole cause chain.
 *
 * Format per frame: `Name: message` (or just `Name` when message is empty).
 * A frame whose name is empty falls back to `Error`. Stacks are included only
 * when `includeStack` is true, indented by two spaces under their frame.
 */
export function walkCauseChain(error, options = {}) {
  const includeStack = options.includeStack === true;
  const frames = collectCauseChain(error, options);
  const lines = [];

  for (const frame of frames) {
    const label = frame.name === '' ? 'Error' : frame.name;
    lines.push(frame.message === '' ? label : `${label}: ${frame.message}`);
    if (includeStack && frame.stack !== '') {
      for (const stackLine of frame.stack.split('\n')) {
        lines.push(`  ${stackLine}`);
      }
    }
  }

  return lines.join('\n');
}
