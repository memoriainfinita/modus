// Imported first by worker.ts, before TensorFlow.js: its WebGL backend tests `if (!window …)`
// (tfjs 3.21, setTimeoutCustom), which in a worker throws, as `window` is not declared there.
// Declared as undefined, the test reads false and tfjs uses plain setTimeout. Not `self`:
// tfjs would then post its timer messages through the worker's postMessage, to the page.
;(self as unknown as { window?: undefined }).window = undefined
