'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = name => import(pathToFileURL(path.join(__dirname, '..', 'public', name)));

async function fixture() {
  const { World } = await load('world.js');
  const events = [];
  const { ROUND_ISLAND_SCENE } = await import(pathToFileURL(path.join(__dirname, '../public/scene-profile.js')));
  const world = Object.assign(Object.create(World.prototype), {
    scene: ROUND_ISLAND_SCENE, layoutSceneId: ROUND_ISLAND_SCENE.id, rainImpactParticles: [], _foodId: 1,
    art: { active: false, plants: [], sprites: new Map() }, demoMode: false, petState: {}, selectedSpecies: null,
    _plantId: 1, _rand: () => .5, flowers: [], animals: [], clouds: [], butterflies: [], fireflies: [],
    wind: 0, windTarget: 0, windSources: new Map(), time: 10, night: false, nightMix: 0,
    tide: .28, tideCurrent: .28, mouse: { down: false, x: -100, y: -100, dx: 0, since: 0 },
    ripples: [], particles: [], flyingSeeds: [], food: [], visitors: 0, lastRain: 0, changeTime: 0,
    canvas: { style: {} }, onEvent: event => events.push(event), onChange: () => {},
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
    changed: () => {}, announce: () => {}, updateResources: () => {}, closePanels: () => {},
  });
  assert.equal(ui.waterGarden(), true);assert.equal(ui.resources.water, 1);
  world.flowers.forEach(f => f.growth = f.growthProgress = 1);
  assert.equal(ui.waterGarden(), false);assert.equal(ui.resources.water, 1);
  ui.isDemo = () => true;world.flowers[0].growthProgress = .1;
  assert.equal(ui.waterGarden(), false);assert.equal(ui.resources.water, 1);
});

test('keyboard rain is transient feedback and grants no growth or resources', async () => {
  const { world } = await fixture();const before = world.flowers[0].growthProgress;
  world.impulse('keyboard-rain', { duration: .9, intensity: 1 });world._update(.1);
  assert.ok(world.particles.some(p => p.kind === 'rain'));
  assert.equal(world.rainUntil || 0, 0);assert.equal(world.flowers[0].water, 0);
  assert.ok(Math.abs(world.flowers[0].growthProgress - before - .000025 * .1) < 1e-9);
  assert.equal('visualRainUntil' in world.serialize(), false);
  world.time += 3;world._update(2);assert.equal(world.particles.filter(p => p.kind === 'rain').length, 0);
});

test('fractional-DPI resize paints immediately and identical size notifications retain pixels', async t => {
  const {world}=await fixture();let rect={width:690,height:434},clears=0,draws=0,painted=true;
  const canvas={getBoundingClientRect:()=>rect};
  for(const [key,initial]of Object.entries({width:1138,height:716})){
    let value=initial;Object.defineProperty(canvas,key,{get:()=>value,set:next=>{value=next;clears++;painted=false;}});
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
  Object.defineProperty(globalThis,'devicePixelRatio',{value:1.65,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'devicePixelRatio',previous);else delete globalThis.devicePixelRatio;});
  Object.assign(world,{canvas,surface:{width:640},desktopMode:true,_frame:()=>{},_draw:()=>{draws++;painted=true;}});
  world._resize();assert.equal(painted,true);assert.equal(draws,1);
  const firstClears=clears;world._resize();world._resize();
  assert.equal(clears,firstClears);assert.equal(draws,1);assert.equal(painted,true);
  rect={width:690,height:435};world._resize();
  assert.equal(painted,true);assert.equal(draws,2);assert.equal(world.time,10);
});
