/**
 * Stands in for binary assets under Jest.
 *
 * Metro resolves `require('…/movenet.tflite')` to an opaque module id; Jest
 * has no such transform and tries to parse the file as JavaScript. Mapping
 * every binary extension here keeps the numeric-id shape the real bundler
 * produces, so code under test sees the same kind of value it does at runtime.
 */
module.exports = 1;
