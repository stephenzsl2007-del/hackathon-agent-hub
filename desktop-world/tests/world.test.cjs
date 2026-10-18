'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = name => import(pathToFileURL(path.join(__dirname, '..', 'public', name)));

async function fixture() {
  const { World } = await load('world.js');
  const events = [];
  const world = Object.assign(Object.create(World.prototype), {
    art: { active: false, plants: [], sprites: new Map() }, demoMode: false, petState: {}, selectedSpecies: null,
    _plantId: 1, _rand: () => .5, flowers: [], animals: [], clouds: [], butterflies: [], fireflies: [],
    wind: 0, windTarget: 0, windSources: new Map(), time: 10, night: false, nightMix: 0,
    tide: .28, tideCurrent: .28, mouse: { down: false, x: -100, y: -100, dx: 0, since: 0 },
    ripples: [], particles: [], flyingSeeds: [], food: [], visitors: 0, lastRain: 0, changeTime: 0,
    onEvent: event => events.push(event), onChange: () => {},
  });
  world.flowers.push(world._makePlant(300, 275, 0, .015));
  return { world, events };
}

test('restoring daily world clears demo weather, food and seeds before the next update', async () => {
  const { world } = await fixture(), daily = world.serialize();
  world.impulse('rain', { duration: 5 });world.impulse('wind', { value: 1 });world.impulse('food');
  world.flyingSeeds.push({ x: 300, y: 340 });world.visualRainUntil = 90;world.mouse.down = true;
  world.restore(daily);
  assert.equal(world.rainCloud, null);assert.equal(world.rainUntil, 0);assert.equal(world.windSources.size, 0);
  assert.deepEqual(world.food, []);assert.deepEqual(world.flyingSeeds, []);assert.equal(world.mouse.down, false);
  const before = world.flowers[0].growthProgress;world._update(1);
  assert.ok(Math.abs(world.flowers[0].growthProgress - before - .000025) < 1e-9);
});

test('one focus drop advances exactly one plant stage, never a mature plant', async () => {
  const { world } = await fixture();
  for (let stage = 1; stage <= 4; stage++) {
    const result = world.impulse('nurture');
    assert.equal(result.ok, true);assert.equal(result.stage, stage);assert.equal(world.flowers[0].stage, stage);
  }
  const mature = world.serialize();assert.equal(world.impulse('nurture').ok, false);
  assert.deepEqual(world.serialize().flowers, mature.flowers);
});

test('focus drops are retained when no plant can grow or a demo is active', async () => {
  const { DesktopUI } = await load('desktop-ui.js');
  const { world } = await fixture();
  const ui = Object.assign(Object.create(DesktopUI.prototype), {
    resources: { water: 2 }, isDemo: () => false, command: () => world.impulse('nurture'),
    changed: () => {}, announce: () => {}, updateResources: () => {},
  });
  assert.equal(ui.waterGarden(), true);assert.equal(ui.resources.water, 1);
  world.flowers.forEach(f => f.growth = f.growthProgress = 1);
  assert.equal(ui.waterGarden(), false);assert.equal(ui.resources.water, 1);
  ui.isDemo = () => true;world.flowers[0].growthProgress = .1;
  assert.equal(ui.waterGarden(), false);assert.equal(ui.resources.water, 1);
});
