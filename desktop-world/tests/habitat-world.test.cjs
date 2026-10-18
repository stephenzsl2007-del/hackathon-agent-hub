'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function fixture(scene) {
  const { HabitatWorld } = await import(pathToFileURL(path.join(__dirname, '../public/habitat-world.js')));
  const { ROUND_ISLAND_SCENE } = await import(pathToFileURL(path.join(__dirname, '../public/scene-profile.js')));
  const world = Object.assign(Object.create(HabitatWorld.prototype), {
    scene: scene||ROUND_ISLAND_SCENE, layoutSceneId: (scene||ROUND_ISLAND_SCENE).id, rainImpactParticles: [], _foodId: 1,
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

function tick(world,seconds,inspect=()=>{}) {
  for(let elapsed=0;elapsed<seconds;elapsed+=1/60){world._update(1/60);inspect();}
}

test('former round scene remains valid for saves while runtime artwork follows the latest long island', async () => {
  const w=await fixture(),manifest=require('../public/assets/pixel-world/runtime-manifest.json');
  assert.equal(w.scene.id,'island-pond-round-v1');
  assert.deepEqual(w.scene.worldRect,{x:60,y:14,width:520,height:370});
  assert.deepEqual(w.scene.viewBounds,{x:0,y:0,width:640,height:400});
  const island=manifest.sprites.find(s=>s.id==='island.pond');
  assert.equal(island.source,'island-long');assert.deepEqual(island.rect,[17,101,2065,586]);
  assert.equal(manifest.scene.id,'island-pond-long-v1');
  assert.deepEqual(w.scene.decor.map(d=>[d.x,d.y,d.width,d.height]),[[461,184,62,88],[497,258,69,84]]);
  const old=w.serialize();delete old.layout.sceneId;delete old.layout.version;
  w.restore(old);assert.deepEqual(w.serialize().flowers,old.flowers);assert.deepEqual(w.serialize().animals,old.animals);
  assert(w.flowers.every(f=>w._plantable(f.x,f.y,f.speciesId)));
  assert(w.animals.every(a=>w._animalCanStand(a,a.x,a.y)));
});

test('follow and shelter share routed acceleration and never cross the round pond', async () => {
  const w=await fixture(),cat=w.animals.find(a=>a.type==='cat'),before={x:cat.x,y:cat.y};
  w._down({button:0,clientX:cat.x,clientY:cat.y-8,pointerId:1});
  w.mouse.x=105;w.mouse.y=250;let previous={...before},steps=0;
  tick(w,5,()=>{
    assert(w._animalCanStand(cat,cat.x,cat.y));
    assert(Math.hypot(cat.x-previous.x,cat.y-previous.y)<=25/60+.001);
    previous={x:cat.x,y:cat.y};steps++;
  });
  assert(steps>200);assert(cat.motion.travel>30);assert(cat.motion.gaitActive);
  w.wind=1;w.setWind(1,'test');w.windHold=w.time+5;cat.interactionUntil=0;
  tick(w,3,()=>assert(w.animals.every(a=>w._animalCanStand(a,a.x,a.y))));
  assert.equal(cat.mode,'shelter');assert(w._animalCanStand(cat,cat.targetX,cat.targetY));
  assert(cat.motion.travel>0,'movement must update the shared animation distance clock');
});

test('round keyboard rain lands on real surfaces without watering or becoming manual weather', async () => {
  const w=await fixture(),saved=w.serialize();w.impulse('keyboard-rain',{duration:1,intensity:1});
  w._update(.1);const drops=w.particles.filter(p=>p.kind==='rain');
  assert(drops.length>=4);assert(w.visualRainCloud);assert(w.isWeatherHandleAt(w.visualRainCloud.x,w.visualRainCloud.y));
  assert(drops.every(p=>Number.isFinite(p.landingY)&&!p.waters&&w._rainLandingKind(p.landingX,p.landingY)===p.landingKind));
  assert.equal(w._rainActive(),false);
  tick(w,2);
  assert(w.flowers.every(f=>f.water===0));
  assert(w.flowers.every((f,i)=>Math.abs(f.growthProgress-saved.flowers[i].growthProgress)<=.00006));
  assert.equal(w.particles.some(p=>p.kind==='rain'),false);
  assert.equal(w.visitors,saved.visitors);assert.equal(w.visualRainUntil> w.time,false);
});

test('parallel weather uses the same localized rain engine and stops when the control file leaves', async () => {
  const w=await fixture();w._rand=()=>0;w.setParallel({active:true,sunPresent:true,rain:true,wind:true,images:[]});
  tick(w,.8);assert.equal(w.rainSource.origin,'parallel');assert(w._rainActive());
  assert(w.flowers.some(f=>f.water>0));assert(w.particles.some(p=>p.kind==='rain'&&p.waters));
  w.setParallel({active:true,sunPresent:true,rain:false,wind:false,images:[]});
  assert.equal(w._rainActive(),false);assert.equal(w.windSources.has('parallel'),false);
  tick(w,1);assert.equal(w.particles.some(p=>p.kind==='rain'),false);
});

test('sun and cloud are native drag exclusions and cancelled gestures release the pointer', async () => {
  const w=await fixture();w.desktopMode=true;
  assert(w.isWeatherHandleAt(505,70));assert(w.isWeatherHandleAt(355,77));
  w._down({button:0,clientX:505,clientY:70,pointerId:1});w.sun={x:600,y:180};w._up({type:'blur'});
  assert.equal(w.sunAway,undefined);assert.equal(w.dragSun,false);assert.equal(w.mouse.down,false);
  w._down({button:0,clientX:355,clientY:77,pointerId:1});
  assert(w._rainActive());assert(w.rainSource.manual);assert(w.dragCloud);
  w._move({clientX:390,clientY:120});assert.equal(w.rainSource.x,390);assert.equal(w.rainSource.y,240);
  w._up({type:'pointercancel'});assert.equal(w._rainActive(),false);assert.equal(w.pointerId,null);
  tick(w,1);assert.equal(w._rainCloudVisible(),false);
});

test('deferred taps keep pet and cloud actions without capturing inactive pointers', async () => {
  const w=await fixture();w.canvas.setPointerCapture=()=>{throw Error('inactive pointer capture');};
  const cat=w.animals.find(a=>a.type==='cat');
  assert(w.tapInteraction({clientX:cat.x,clientY:cat.y-10,button:0,pointerId:12}));
  assert.equal(cat.mode,'follow');assert.equal(cat.bond,1);
  assert(w.tapInteraction({clientX:355,clientY:77,button:0,pointerId:12}));
  assert.equal(w.mouse.down,false);assert.equal(w.pointerId,null);
  assert(w.particles.some(p=>p.kind==='rain'));
});

test('latest long scene supports invitations, photo visitors, weather and tree interactions on its own geometry',async()=>{
  const {LONG_ISLAND_SCENE}=await import(pathToFileURL(path.join(__dirname,'../public/scene-profile.js')));
  const w=await fixture(LONG_ISLAND_SCENE);
  assert(w.animals.every(a=>w._animalCanStand(a,a.x,a.y)));
  for(const type of ['rabbit','bird','squirrel','duck']){assert.equal(w.inviteAnimal(type).ok,true);w.time+=5;}
  w.setParallel({active:true,sunPresent:true,rain:true,wind:true,images:[{id:'long-photo',name:'访客'}]});
  tick(w,2,()=>assert(w.animals.every(a=>w._animalCanStand(a,a.x,a.y))));
  assert.equal(w.animals.filter(a=>a.photoId).length,1);assert(w._rainActive());
  assert(w.particles.some(p=>p.kind==='rain'&&p.waters));
  const apple=w.scene.interactionTrees.find(t=>t.id==='apple');w.shakeTree(apple);
  assert.equal(w.treeShakes.get('apple'),1);assert(w.food.every(f=>w._walkable(f.x,f.y)));
  w.setParallel({active:false});w.clearTransientState();w.impulse('keyboard-rain',{duration:1,intensity:1});w._update(.1);
  assert(w.particles.some(p=>p.kind==='rain'&&!p.waters));
  assert(w.isWeatherHandleAt(w.scene.sun.x,w.scene.sun.y));
  const saved=w.serialize();assert.equal(saved.layout.sceneId,LONG_ISLAND_SCENE.id);assert.equal(JSON.stringify(saved).includes('long-photo'),false);
});
