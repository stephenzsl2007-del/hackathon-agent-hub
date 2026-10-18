import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/world.js';
import { LONG_ISLAND_SCENE, sourcePoint } from '../public/scene-profile.js';

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn({ type, ...event }); },
  };
}
function context() {
  return new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return target[key] ?? (() => {});
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}
function canvas() {
  const target = eventTarget();
  const captured = new Set();
  return Object.assign(target, {
    width: 640, height: 280, style: {},
    getContext: () => context(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 280 }),
    setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id),
    releasePointerCapture: id => captured.delete(id),
  });
}

globalThis.document = Object.assign(eventTarget(), { hidden: false, createElement: canvas });
globalThis.window = eventTarget();
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

// The weather tests exercise real world rules and draw ordering. Asset decoding
// is intentionally excluded; it has a separate native/real-Canvas verification.
class RainWorld extends World {
  async loadArt() { return {}; }
}
function makeWorld(t) {
  document.hidden = false;
  const element = canvas();
  const world = new RainWorld(element);
  world.art.active = true;
  world.setDesktopMode(true);
  world._initArt();
  t.after(() => { world.destroy(); document.hidden = false; });
  return { world, element };
}
function tick(world, seconds) { for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) world._update(1 / 60); }
function pointer(x, y) { return { clientX: x, clientY: y, button: 0, pointerType: 'mouse', pointerId: 1 }; }

test('pond hit area follows the painted upper water and excludes the former lower bank', t => {
  const { world } = makeWorld(t);
  for (const point of [[354,476],[346,454],[170,440],[325,484]].map(p=>Object.values(sourcePoint(p)))) assert.equal(world._pond(...point), true, point.join(','));
  for (const point of [[100,550],[350,550],[450,470],[600,400]].map(p=>Object.values(sourcePoint(p)))) assert.equal(world._pond(...point), false, point.join(','));
});

test('a down/up within one frame still rains into the pond and ripples at actual landing points', t => {
  const { world, element } = makeWorld(t);
  const impacts = [];
  const ripple = world._ripple.bind(world);
  world._ripple = (x, y, options) => { impacts.push({ x, y }); ripple(x, y, options); };
  world.setTool('rain');
  element.emit('pointerdown', pointer(115, 190));
  const firstDrops = world.particles.filter(p => p.kind === 'rain');
  assert(firstDrops.length >= 6, 'short clicks must emit immediately');
  assert(world.rainSource.y - world.rainCloud.y >= 70, 'cloud must not cover the pond target');
  element.emit('pointerup', pointer(115, 190));
  assert.equal(world.mouse.down, false);
  assert.equal(world._rainActive(), false);
  tick(world, 0.9);
  assert(impacts.length >= 6);
  assert(impacts.every(point => world._pond(point.x, point.y)));
  assert(world.ripples.every(ripple => ripple.pond));
  assert.equal(world.particles.some(p => p.kind === 'rain'), false);
});

test('rain waters a local two-dimensional patch, not every plant sharing its x coordinate', t => {
  const { world } = makeWorld(t);
  world.flowers = [world._makePlant(350, 185, 0, 0.1), world._makePlant(350, 217, 0, 0.1), world._makePlant(430, 185, 0, 0.1)];
  world.impulse('rain', { x: 350, y: 185, duration: 2 });
  tick(world, 1.4);
  assert(world.flowers[0].water > 0);
  assert.equal(world.flowers[1].water, 0);
  assert.equal(world.flowers[2].water, 0);
  assert(world.flowers[0].growthProgress > world.flowers[1].growthProgress + 0.002);
});

test('shore showers stay in the selected water region and cliff targets produce no falling-through rain', t => {
  const { world } = makeWorld(t);
  world.impulse('rain', { x: 62, y: 184, duration: 1 });
  tick(world, 0.2);
  const drops = world.particles.filter(p => p.kind === 'rain');
  assert(drops.length > 0);
  assert(drops.every(p => p.landingKind === 'pond' && world._pond(p.landingX, p.landingY)));
  world.particles = [];
  world.impulse('rain', { x: 350, y: 245, duration: 1 });
  tick(world, 0.3);
  assert.equal(world.particles.filter(p => p.kind === 'rain').length, 0);
});

test('desktop clouds have compact live hit targets and can be dragged while held still rain continues', t => {
  const { world, element } = makeWorld(t);
  world.impulse('rain', { x: 310, y: 180, duration: 3 });
  const cloud = { ...world.rainCloud };
  assert.equal(world.hitTest(cloud.x, cloud.y), true);
  assert.equal(world._rainCloudHit(cloud.x + 60, cloud.y), false);
  assert.equal(world.hitTest(10, 10), false);
  element.emit('pointerdown', pointer(cloud.x, cloud.y));
  element.emit('pointermove', pointer(cloud.x + 35, cloud.y + 15));
  assert.equal(world.rainSource.x, 345);
  assert.equal(world.rainSource.y, 195);
  tick(world, 1.4);
  assert(world.particles.some(p => p.kind === 'rain' && p.createdAt > 1));
  element.emit('pointerup', pointer(cloud.x + 35, cloud.y + 15));
  tick(world, 0.8);
  assert.equal(world._rainCloudVisible(), false);
  assert.equal(world._rainCloudHit(world.rainCloud.x, world.rainCloud.y), false);
});

for (const stop of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'hidden', 'toolchange', 'pause', 'cancelInteraction']) {
  test(`${stop} ends held rainfall and releases the mouse state`, t => {
    const { world, element } = makeWorld(t);
    world.setTool('rain');
    element.emit('pointerdown', pointer(350, 185));
    tick(world, 0.25);
    if (stop === 'blur') window.emit('blur');
    else if (stop === 'hidden') { document.hidden = true; document.emit('visibilitychange'); }
    else if (stop === 'toolchange') world.setTool('explore');
    else if (stop === 'pause') world.setPaused(true);
    else if (stop === 'cancelInteraction') world.cancelInteraction();
    else element.emit(stop, pointer(350, 185));
    assert.equal(world.mouse.down, false);
    assert.equal(world._rainActive(), false);
    const stoppedAt = world.time;
    tick(world, 0.2);
    assert(world.particles.filter(p => p.kind === 'rain').every(p => p.createdAt <= stoppedAt));
  });
}

test('timed external rain keeps its duration; keyboard rain never adds plant water', t => {
  const { world } = makeWorld(t);
  world.impulse('rain', { x: 350, y: 185, duration: 1.5 });
  world._up();
  tick(world, 0.8);
  assert.equal(world._rainActive(), true);
  tick(world, 0.9);
  assert.equal(world._rainActive(), false);
  world.particles = [];
  world.flowers = [world._makePlant(450, 200, 0, 0.1)];
  world.impulse('keyboard-rain', { duration: 1 });
  tick(world, 1);
  assert.equal(world.flowers[0].water, 0);
});

test('surface ripples render behind animals, and the interactive cloud renders above scenery', t => {
  const { world } = makeWorld(t);
  const order = [];
  world._drawLand = () => order.push('land');
  world._drawRipples = () => order.push('ripples');
  world._tree = () => order.push('tree');
  world._animal = () => order.push('animal');
  world._drawParticles = () => order.push('rain');
  world._drawCloud = () => order.push('cloud');
  world.impulse('rain', { x: 115, y: 190, duration: 1 });
  world._draw();
  assert(order.indexOf('land') < order.indexOf('ripples'));
  assert(order.indexOf('ripples') < order.indexOf('animal'));
  assert(order.lastIndexOf('animal') < order.indexOf('rain'));
  assert(order.lastIndexOf('tree') < order.indexOf('cloud'));
  assert(order.indexOf('rain') < order.indexOf('cloud'));
});

test('long island preserves source aspect ratio and fits the shared viewport', () => {
  const { sourceRect: [, , sw, sh], worldRect: r, viewBounds: v } = LONG_ISLAND_SCENE;
  assert(Math.abs(r.width / sw - r.height / sh) < 1e-10);
  assert(r.x >= v.x && r.y >= v.y);
  assert(r.x + r.width <= v.x + v.width && r.y + r.height <= v.y + v.height);
  assert.deepEqual(sourcePoint([17, 101]), { x: r.x, y: r.y });
  const corner = sourcePoint([17 + sw, 101 + sh]);
  assert(Math.abs(corner.x - r.x - r.width) < 1e-10);
  assert(Math.abs(corner.y - r.y - r.height) < 1e-10);
});

test('native camera and pointer conversion stay aligned at noninteger scale and screen offsets', t => {
  const { world, element } = makeWorld(t);
  element.getBoundingClientRect = () => ({ left: 17, top: 31, width: 1002, height: 440 });
  const previousRatio = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  world._resize();
  globalThis.devicePixelRatio = previousRatio;
  for (const point of [[20,85], [115,190], [350,185], [620,255]]) {
    const [x, y] = point;
    const screen = { clientX: 17 + (world.offsetX + x * world.scale) / world.dpr, clientY: 31 + (world.offsetY + y * world.scale) / world.dpr };
    const result = world._position(screen);
    assert(Math.abs(result.x - x) < 1e-9);
    assert(Math.abs(result.y - y) < 1e-9);
  }
});

test('legacy layout migration preserves every species and growth record and runs only once', t => {
  const { world } = makeWorld(t);
  const species = ['cosmos','daisy','lavender','sunflower','buttercup','forget-me-not','oak','birch','pine','cherry','apple','willow','blueberry','raspberry','hydrangea','fern','cattail','waterlily','fly-agaric','chanterelle','moss-clover','pumpkin','strawberry','carrot'];
  const legacy = {
    version: 2, layout: { island: 'island.pond', base: [60,14,520,370] }, selectedSpecies: 'waterlily', night: true, tide: 0.7, visitors: 14,
    petState: { growth: 0.8, satiety: 91 },
    flowers: species.map((speciesId, i) => ({ id: `saved-${i}`, speciesId, x: 310 + i % 7 * 12, y: 230 + i % 3 * 20, type: i % 6, stage: i % 5, growth: (i % 5 + 0.2) / 5, growthProgress: (i % 5 + 0.2) / 5, water: i * 2, watered: true, p: 0.3 })),
    animals: ['cat','dog','bird','squirrel','rabbit','duck'].map((type, i) => ({ id: `saved-${type}`, type, x: 330 + i * 5, y: 300, bond: i + 21 })),
  };
  const before = structuredClone(legacy);
  world.restore(legacy);
  assert.deepEqual(legacy, before, 'restore must not mutate the supplied save');
  const migrated = world.serialize();
  assert.equal(migrated.layout.sceneId, LONG_ISLAND_SCENE.id);
  assert.equal(migrated.flowers.length, legacy.flowers.length);
  for (const f of migrated.flowers) {
    const old = legacy.flowers.find(item => item.id === f.id);
    for (const key of ['speciesId','growth','growthProgress','stage','water','watered']) assert.equal(f[key], old[key], `${f.id} ${key}`);
    assert(world._plantable(f.x, f.y, f.speciesId), f.speciesId);
  }
  for (const animal of world.animals) {
    assert.equal(animal.bond, legacy.animals.find(a => a.type === animal.type).bond);
    assert.equal(animal.homeX, animal.x); assert.equal(animal.targetY, animal.y);
    assert(animal.type === 'duck' ? world._swimmable(animal.x, animal.y) : world._walkable(animal.x, animal.y), animal.type);
  }
  assert.equal(migrated.night, true); assert.equal(migrated.tide, 0.7); assert.equal(migrated.visitors, 14);
  assert.deepEqual(migrated.petState, legacy.petState);
  world.restore(migrated);
  const again = world.serialize();
  assert.deepEqual(again.flowers, migrated.flowers, 'a reload must not scatter the garden again');
  assert.deepEqual(again.animals, migrated.animals);
});

test('new scene defaults keep plants and animals on their respective surfaces', t => {
  const { world } = makeWorld(t);
  assert(world.flowers.every(p => world._plantable(p.x, p.y, p.speciesId)));
  assert(world.animals.every(a => a.type === 'duck' ? world._swimmable(a.x, a.y) : world._walkable(a.x, a.y)));
  world.impulse('food', { x: 320, y: 360 });
  assert(world._walkable(world.food[0].x, world.food[0].y));
  assert.deepEqual({ x: world.food[0].x, y: world.food[0].y }, LONG_ISLAND_SCENE.spawns['food.default']);
  world.impulse('seed', { speciesId: 'waterlily' });
  assert.equal(world.flowers.at(-1).speciesId, 'waterlily');
  assert(world._swimmable(world.flowers.at(-1).x, world.flowers.at(-1).y));
});

test('seeding reserves nine world pixels between roots and migration respects spacing', t => {
  const { world } = makeWorld(t);
  const first = world.flowers[0], count = world.flowers.length;
  assert.equal(world._plant(first.x + 2, first.y, false, 'daisy'), false);
  assert.equal(world.flowers.length, count);
  const old = world.serialize(); delete old.layout.sceneId;
  world.restore(old);
  for (const [i, p] of world.flowers.entries()) for (const q of world.flowers.slice(0, i)) assert(Math.hypot(p.x - q.x, p.y - q.y) >= 9);
});

test('default reward rain and demo rain choose an actual plant; restoring clears transient rain', t => {
  const { world } = makeWorld(t);
  world.impulse('rain');
  assert(world.flowers.some(f => f.x === world.rainSource.x && f.y === world.rainSource.y));
  const saved = world.serialize();
  world.setDemoMode(true); world.impulse('rain');
  assert.equal(world.rainSource.x, world.demoPlant.x); assert.equal(world.rainSource.y, world.demoPlant.y);
  assert.equal(world.serialize().flowers.length, saved.flowers.length);
  world.restore(saved);
  assert.equal(world._rainActive(), false); assert.equal(world._rainCloudVisible(), false);
  assert.equal(world.flowers.length, saved.flowers.length);
});

test('a blocked duck cannot sidestep onto grass', t => {
  const { world } = makeWorld(t);
  const duck = world.animals.find(a => a.type === 'duck');
  const start = { x: duck.x, y: duck.y };
  world.animals = [duck]; duck.wait = 0; duck.targetX = duck.x + 10; duck.targetY = duck.y + 10;
  world._swimmable = () => false; world._walkable = () => true;
  world._stepAnimals(0.1);
  assert.deepEqual({ x: duck.x, y: duck.y }, start);
});

test('deferred native tap preserves pet interaction without capturing an inactive pointer', t => {
  const { world, element } = makeWorld(t);
  element.setPointerCapture = () => { throw new Error('inactive pointer cannot be captured'); };
  element.releasePointerCapture = () => { throw new Error('deferred tap has no capture to release'); };
  const cat = world.animals.find(a => a.type === 'cat'), bond = cat.bond;
  assert.equal(world.tapInteraction({clientX:cat.x,clientY:cat.y-3,pointerId:42,button:0,pointerType:'mouse'}), true);
  assert.equal(cat.bond, bond + 1);
  assert.equal(world.mouse.down, false); assert.equal(world.pointerId, null);
  assert.equal(world.tapInteraction({clientX:cat.x,clientY:cat.y,button:2}), false);
  assert.equal(world.tapInteraction({clientX:cat.x,clientY:cat.y,isPrimary:false}), false);
  assert.equal(cat.bond, bond + 1);
});

test('native island dragging excludes only visible weather handles in explore mode', t => {
  const { world } = makeWorld(t);
  world.hitTest = () => true;
  world.impulse('rain',{x:115,y:190,duration:0.2});
  const {x,y} = world.rainCloud;
  assert.equal(world.isWeatherHandleAt(x,y), true);
  assert.equal(world.canDragIslandAt(x,y), false);
  assert.equal(world.canDragIslandAt(350,185), true);
  assert.equal(world.isWeatherHandleAt(x-28,y-15), false, 'transparent cloud corners must not claim the desktop');
  world.setTool('seed'); assert.equal(world.canDragIslandAt(350,185), false);
  tick(world,1); assert.equal(world.isWeatherHandleAt(x,y), false);
});

test('rain surface feedback coalesces repeated impacts and keeps a bounded quiet ripple layer', t => {
  const { world } = makeWorld(t);
  for(let i=0;i<50;i++) world._ripple(115,190,{small:true});
  assert.equal(world.ripples.length,1);
  world.impulse('rain',{x:115,y:190,duration:5});
  tick(world,2);
  assert(world.ripples.filter(r=>r.small).length<=12);
  assert(world.particles.filter(p=>p.kind==='rain').length<20);
  assert(world.ripples.every(r=>world._pond(r.x,r.y)));
});

test('raised rain cloud stays inside the viewport above the highest garden edge', t => {
  const { world } = makeWorld(t);
  for(const [x,y] of LONG_ISLAND_SCENE.land){
    world.impulse('rain',{x,y,duration:.1});
    const c=world.rainCloud;
    assert(Math.round(c.y-18*c.w)>=0);
    assert(Math.round(c.y+12*c.w)<=LONG_ISLAND_SCENE.viewBounds.height);
    assert(world.rainSource.y-c.y>=120);
  }
});
