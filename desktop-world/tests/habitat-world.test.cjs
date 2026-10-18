'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function fixture() {
  const { HabitatWorld } = await import(pathToFileURL(path.join(__dirname, '../public/habitat-world.js')));
  const world = Object.assign(Object.create(HabitatWorld.prototype), {
    art: { active: true, plants: [], sprites: new Map() }, demoMode: false, petState: {}, selectedSpecies: null,
    _plantId: 1, _rand: () => .5, flowers: [], animals: [], clouds: [], butterflies: [], fireflies: [],
    wind: 0, windTarget: 0, windSources: new Map(), time: 10, night: false, nightMix: 0,
    tide: .28, tideCurrent: .28, mouse: { down: false, x: -100, y: -100, dx: 0, since: 0 },
    ripples: [], particles: [], flyingSeeds: [], food: [], visitors: 0, lastRain: 0, changeTime: 0,
    onEvent: () => {}, onChange: () => {}, canvas: { style: {}, setPointerCapture() {} }, tool: 'explore',
    _position: e => ({ x: e.clientX, y: e.clientY }),
  });
  world._ensureHabitat();world._initArt();return world;
}

test('animal invitations obey demo, cooldown and population limits and survive a daily restore', async () => {
  const w = await fixture(), initial = w.animals.length;
  assert.equal(w.inviteAnimal('rabbit').ok, true);assert.equal(w.animals.length, initial + 1);
  assert.equal(w.inviteAnimal('bird').ok, false);w.time += 5;
  w.demoMode = true;assert.equal(w.inviteAnimal('bird').ok, false);w.demoMode = false;
  const daily = w.serialize(), newId = w.animals.at(-1).id;w.restore(daily);
  assert.ok(w.animals.some(a => a.id === newId));
  while (w.animals.length < 12) { w.time += 5;assert.equal(w.inviteAnimal('duck').ok, true); }
  w.time += 5;assert.equal(w.inviteAnimal('rabbit').ok, false);
});

test('rain makes land animals seek walkable shelter and leaves ducks in the pond', async () => {
  const w = await fixture();w.weather.rain = .9;w._stepAnimals(.1);
  for (const a of w.animals.filter(a => a.type !== 'duck')) {
    assert.equal(a.mode, 'shelter');assert.ok(w._walkable(a.targetX, a.targetY));
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
  }
  assert.ok(!w.animals.find(a => a.type === 'duck').mode);
  w.weather.rain = 0;w._stepAnimals(.1);assert.ok(w.animals.every(a => !a.mode));
});

test('parallel photos stay out of saves, reattach after demo restore, and disconnect without removing animals', async () => {
  const w = await fixture(), count = w.animals.length;
  const state = { active: true, sunPresent: false, wind: true, rain: true, images: [{ id: 'photo-one', name: '友人' }] };
  w.setParallel(state);const saved = w.serialize();assert.equal(w.animals.length, count + 1);
  assert.equal(saved.animals.length, count);assert.equal(JSON.stringify(saved).includes('photo-one'), false);
  w._update(.1);assert.ok(w.nightMix > 0);assert.equal(w.night, false);assert.ok(w.wind > 0);
  w.restore(saved);assert.equal(w.animals.filter(a => a.photoId).length, 1);
  w.setParallel({ active: false });assert.equal(w.animals.length, count);assert.equal(w.parallelSunAway, false);
});

test('tree, animal and repeated ground clicks produce distinct visible reactions', async () => {
  const w = await fixture(), click = (x,y) => w._down({ button: 0, clientX: x, clientY: y, pointerId: 1 });
  click(220, 80);assert.equal(w.treeShakes.get('cherry'), 1);assert.ok(w.particles.length >= 20);
  const cat = w.animals.find(a => a.type === 'cat');click(cat.x, cat.y - 12);
  assert.equal(cat.mode, 'follow');assert.equal(cat.bond, 1);
  click(140, 253);assert.equal(w.animals.find(a => a.type === 'duck').mode, 'splash');
  for (let i = 0; i < 3; i++) click(342, 325);
  assert.ok(w.animals.some(a => a.mode === 'gather'));
  const daily = w.serialize();w.clearTransientState();w.restore(daily);
  assert.equal(w.treeShakes.size, 0);assert.equal(w.reactions.length, 0);
});
