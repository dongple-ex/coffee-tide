const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clampPosition, validRegions, hitTest } = require('../geometry.cjs');

test('restores off-screen positions on negative-coordinate monitors', () => {
  assert.deepEqual(clampPosition({ x: -2500, y: 2000 }, { x: -1920, y: 0, width: 1920, height: 1040 }, 280, 360), { x: -1920, y: 680 });
});
test('only bounded visible controls receive mouse input', () => {
  const regions = validRegions([{ x: 20, y: 30, width: 100, height: 80 }, { x: -1, y: 0, width: 500, height: 500 }, { x: NaN, y: 0, width: 1, height: 1 }], 280, 360);
  assert.equal(regions.length, 1);
  const bounds = { x: -1000, y: 100 };
  assert.equal(hitTest({ x: -950, y: 150 }, bounds, regions), true);
  assert.equal(hitTest({ x: -999, y: 101 }, bounds, regions), false);
  assert.deepEqual(validRegions(Array(33).fill(regions[0]), 280, 360), []);
});
