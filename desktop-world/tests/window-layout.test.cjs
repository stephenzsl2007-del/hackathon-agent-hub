'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WINDOW_LAYOUT_VERSION, DESKTOP_SCENE_VIEWPORT, defaultWindowBounds, migrateWindowLayout, fitWindowBounds } = require('../desktop/native-services.cjs');

test('wide garden defaults to 1002 × 440 and fits its 640 × 280 camera', () => {
  const area = { x: 0, y: 38, width: 1728, height: 1002 };
  const bounds = defaultWindowBounds(area);
  assert.equal(bounds.width, 1002); assert.equal(bounds.height, 440);
  assert.ok(bounds.width * DESKTOP_SCENE_VIEWPORT.height / DESKTOP_SCENE_VIEWPORT.width <= bounds.height);
  assert.ok(bounds.height - bounds.width * DESKTOP_SCENE_VIEWPORT.height / DESKTOP_SCENE_VIEWPORT.width < 2);
  assert.equal(bounds.x + bounds.width, area.x + area.width - 16);
  assert.equal(bounds.y + bounds.height, area.y + area.height - 12);
});

test('legacy large layout shrinks once with the same bottom-right anchor', () => {
  const area = { x: 0, y: 38, width: 1728, height: 1002 };
  const old = { bounds: { x: 468, y: 387, width: 1244, height: 641 }, alwaysOnTop: false, mouseMode: 'passthrough' };
  const migrated = migrateWindowLayout(old, area);
  assert.equal(migrated.settings.layoutVersion, WINDOW_LAYOUT_VERSION);
  assert.equal(migrated.changed, true); assert.equal(migrated.shrunk, true);
  assert.equal(migrated.settings.bounds.width, 1020); assert.equal(migrated.settings.bounds.height, 446);
  assert.equal(migrated.settings.bounds.x + migrated.settings.bounds.width, old.bounds.x + old.bounds.width);
  assert.equal(migrated.settings.bounds.y + migrated.settings.bounds.height, old.bounds.y + old.bounds.height);
  assert.equal(migrated.settings.alwaysOnTop, false); assert.equal(migrated.settings.mouseMode, 'passthrough');
  const repeated = migrateWindowLayout(migrated.settings, area);
  assert.equal(repeated.changed, false); assert.deepEqual(repeated.settings, migrated.settings);
  assert.equal(old.bounds.width, 1244);
});

test('legacy custom compact layouts keep their size and position', () => {
  const area = { x: 0, y: 38, width: 1728, height: 1002 };
  const old = { bounds: { x: 75, y: 88, width: 900, height: 460 } };
  const migrated = migrateWindowLayout(old, area);
  assert.equal(migrated.shrunk, false); assert.deepEqual(migrated.settings.bounds, old.bounds);
  assert.equal(migrated.settings.layoutVersion, WINDOW_LAYOUT_VERSION);
});

test('legacy wide but shallow custom windows are not made taller', () => {
  const area = { x: 0, y: 38, width: 1728, height: 1002 };
  const old = { bounds: { x: 468, y: 628, width: 1244, height: 400 } };
  const migrated = migrateWindowLayout(old, area);
  assert.equal(migrated.settings.bounds.width, 1020);
  assert.equal(migrated.settings.bounds.height, 400);
  assert.equal(migrated.settings.bounds.y, old.bounds.y);
});

test('small and detached-display layouts remain inside available workareas', () => {
  const small = { x: -480, y: 20, width: 480, height: 300 };
  const bounds = defaultWindowBounds(small);
  assert.deepEqual(bounds, { x: -480, y: 20, width: 480, height: 300 });
  const area = { x: 0, y: 30, width: 800, height: 600 };
  const normal = defaultWindowBounds(area);
  assert.equal(normal.width,560); assert.equal(normal.height,440);
  assert.equal(normal.x + normal.width,784); assert.equal(normal.y + normal.height,618);
  const recovered = fitWindowBounds({ x: 2500, y: -700, width: 1002, height: 521 },area);
  assert.equal(recovered.width,800);assert.equal(recovered.x,0);assert.equal(recovered.y,30);
});
