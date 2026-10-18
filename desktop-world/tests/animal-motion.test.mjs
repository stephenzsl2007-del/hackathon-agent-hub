import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentClear, findAnimalRoute, resetAnimalMotion, advanceAnimalMotion, animationFrameAt } from '../public/animal-motion.js';
import { validateFrame } from '../public/animal-animation.js';
import { World } from '../public/world.js';

function context(){return new Proxy({globalAlpha:1},{get:(t,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});}
function canvas(){return {width:640,height:400,style:{},getContext:()=>context(),getBoundingClientRect:()=>({left:0,top:0,width:640,height:400}),addEventListener(){},removeEventListener(){}};}
globalThis.document={hidden:false,createElement:canvas,addEventListener(){},removeEventListener(){}};globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.devicePixelRatio=1;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
class TestWorld extends World{async loadArt(){return {};}async loadAnimalAnimations(){return this.getAnimationStatus();}}
function world(t){const w=new TestWorld(canvas());w.art.active=true;w.setDesktopMode(true);w._initArt();t.after(()=>w.destroy());return w;}
function tick(w,seconds,inspect=()=>{}){for(let elapsed=0;elapsed<seconds;elapsed+=1/30){const before=w.animals.map(a=>({x:a.x,y:a.y}));w._update(1/30);inspect(before);}}

test('segment sampling catches a thin pond even when both endpoints are on land',()=>{
  const valid=(x,y)=>!(x>19&&x<23);
  assert.equal(segmentClear({x:10,y:10},{x:30,y:10},valid),false);
});
test('navigation goes around pond and stone obstacles without cutting diagonal corners',()=>{
  const valid=(x,y)=>x>=0&&x<=100&&y>=0&&y<=70&&!(x>=35&&x<=65&&y>=10&&y<=55);
  const from={x:10,y:35},to={x:90,y:35},route=findAnimalRoute(from,to,valid,{bounds:{x:0,y:0,width:100,height:70}});
  assert(route.length>1);let last=from;
  for(const point of route){assert(segmentClear(last,point,valid));last=point;}
  assert.deepEqual(route.at(-1),to);
  const corners=(x,y)=>(x<=5&&y<=5)||(x>=10&&y>=10);
  assert.deepEqual(findAnimalRoute({x:2,y:2},{x:12,y:12},corners,{bounds:{x:0,y:0,width:15,height:15}}),[]);
});
test('movement accelerates, brakes, and never overshoots or teleports',()=>{
  const a={x:0,y:0,dir:1};resetAnimalMotion(a).route=[{x:40,y:0}];let traveled=0,lastSpeed=0,started=false;
  for(let i=0;i<300;i++){const before=a.x,result=advanceAnimalMotion(a,1/30,()=>true,{speed:12});const step=a.x-before;assert(step>=0&&step<=12/30+.00001);assert(a.x<=40+.00001);traveled+=step;if(i===0){lastSpeed=step*30;assert(lastSpeed<12);started=true;}if(result.arrived)break;}
  assert(started);assert(a.x>39.4);assert(Math.abs(a.motion.travel-traveled)<1e-9);
});
test('turning pauses at a stable foot position before facing the new direction',()=>{
  const a={x:30,y:20,dir:1};resetAnimalMotion(a).route=[{x:10,y:20}];
  const first=advanceAnimalMotion(a,.05,()=>true);assert(first.turning);assert.equal(a.x,30);
  for(let i=0;i<4;i++)advanceAnimalMotion(a,.05,()=>true);
  assert.equal(a.dir,-1);assert.equal(a.x,30);
  advanceAnimalMotion(a,.05,()=>true);assert(a.x<30);
});
test('arrival slows before the last step and does not cut a full-speed gait into idle',()=>{
  const a={x:0,y:0,dir:1};resetAnimalMotion(a).route=[{x:40,y:0}];let speedAtThree=0,speedAtOne=0,lastMovingSpeed=0;
  for(let i=0;i<600;i++){const distance=40-a.x,result=advanceAnimalMotion(a,1/30,()=>true,{speed:11});const speed=Math.hypot(a.motion.vx,a.motion.vy);if(distance<=3&&!speedAtThree)speedAtThree=speed;if(distance<=1&&!speedAtOne)speedAtOne=speed;if(result.moving)lastMovingSpeed=speed;if(result.arrived)break;}
  assert(speedAtThree>0&&speedAtThree<9);assert(speedAtOne<3);assert(lastMovingSpeed<1);assert(a.x>39.4&&a.x<=40);
});
test('frame timing follows declared holds and looping rules',()=>{
  const frames=[{id:0,durationMs:1000},{id:1,durationMs:100},{id:2,durationMs:120}];
  assert.equal(animationFrameAt(frames,999).id,0);assert.equal(animationFrameAt(frames,1000).id,1);assert.equal(animationFrameAt(frames,1150).id,2);assert.equal(animationFrameAt(frames,1220).id,0);assert.equal(animationFrameAt(frames,5000,false).id,2);
});
test('frame validation rejects wrong crop, foot anchors, and unsafe scale',()=>{
  const valid={rect:[0,0,64,64],anchorPx:[32,60],durationMs:120};assert.equal(validateFrame(valid,256,128,.5).durationMs,120);
  assert.throws(()=>validateFrame({...valid,rect:[240,0,64,64]},256,128,.5));assert.throws(()=>validateFrame({...valid,anchorPx:[32,70]},256,128,.5));assert.throws(()=>validateFrame(valid,256,128,10));
});
test('three minutes of roaming keeps all species on their habitat without jumps',t=>{
  const w=world(t);let moved=0;
  tick(w,180,before=>w.animals.forEach((a,i)=>{assert(a.type==='duck'?w._swimmable(a.x,a.y):w._walkable(a.x,a.y),`${a.type} left its terrain`);const distance=Math.hypot(a.x-before[i].x,a.y-before[i].y);assert(distance<=19/30+.001,`${a.type} jumped ${distance}`);moved+=distance;}));
  assert(moved>300);
});
test('feeding preview approaches and eats without bond, visitor, or friend-event rewards',t=>{
  const w=world(t),bonds=w.animals.map(a=>a.bond),visitors=w.visitors,events=[];w.onEvent=e=>events.push(e.type);
  w.impulse('food',{x:364,y:278,source:'preview'});let ate=false;
  tick(w,18,()=>{if(w.animals.some(a=>['eat','carry'].includes(a.state)))ate=true;});
  assert(ate,'the preview must actually reach a feeding state');assert.deepEqual(w.animals.map(a=>a.bond),bonds);assert.equal(w.visitors,visitors);assert.equal(events.includes('friend'),false);
});
test('normal feeding retains friendship rewards and distinct resting places',t=>{
  const w=world(t);w.impulse('food',{x:364,y:278});
  const seats=w.animals.filter(a=>a.foodSeat).map(a=>a.foodSeat);for(let i=0;i<seats.length;i++)for(let j=0;j<i;j++)assert(Math.hypot(seats[i].x-seats[j].x,seats[i].y-seats[j].y)>11);
  tick(w,18);assert(w.visitors>0);assert(w.animals.some(a=>a.bond>0));
});
test('stopping to receive a pet keeps feet still and preserves saved identity/bond',t=>{
  const w=world(t),cat=w.animals.find(a=>a.type==='cat');cat.bond=7;w._routeAnimal(cat,{x:364,y:278});tick(w,.5);w._stopAnimal(cat,'observe',2.5);const p={x:cat.x,y:cat.y};tick(w,2);
  assert.equal(cat.x,p.x);assert.equal(cat.y,p.y);const saved=w.serialize();w.restore(saved);const restored=w.animals.find(a=>a.id===cat.id);assert.equal(restored.bond,7);assert.equal(restored.x,p.x);
});

test('companion growth enlarges only the cat and applies equally to anchored real frames',t=>{
  const w=world(t);w.setPetState({growth:1});assert.equal(w._animalScale('cat'),1.25);assert.equal(w._animalScale('rabbit'),1);
  let drawing;w.g.drawImage=(...args)=>drawing=args;w.nightMix=0;
  w._drawAnimalFrame({frame:{rect:[0,0,100,80],anchorPx:[50,80],crop:{}},art:{worldScale:.4,defaultFacing:1}},w._animalScale('cat'));
  assert.deepEqual(drawing.slice(1),[-25,-40,50,40]);
  const saved=w.serialize();w.restore(saved);assert.equal(w.petState.growth,1);
});

test('an absent walk clip holds approved standing art without inventing a gait or reverting pose',t=>{
  const w=world(t),cat=w.animals.find(a=>a.type==='cat'),stand={durationMs:1000,id:'standing'},blink={durationMs:100,id:'blink'};
  w.animationArt.animals.set('cat',{worldScale:.08,strideWorld:9,states:new Map([['idle',{frames:[stand,blink],durationMs:1100,loop:true,realFrameCount:2}]])});
  cat.stateAge=1.04;assert.equal(w._animalFrame(cat,false).frame,blink);
  assert.equal(w._animalFrame(cat,true).frame,stand);assert.equal(w._animalFrame(cat,true).staticPose,true);
  assert.equal(w.getAnimationStatus().animals[0].states.some(s=>s.state==='walk'),false);
});

test('each departure begins on the approved contact frame and gait follows distance, not idle time',t=>{
  const w=world(t),cat=w.animals.find(a=>a.type==='cat'),frames=Array.from({length:4},(_,id)=>({id,durationMs:150}));
  w.setPetState({growth:0});w.animationArt.animals.set('cat',{worldScale:.07,strideWorld:9,states:new Map([['walk',{frames,durationMs:600,loop:true,realFrameCount:4}]])});
  const m=resetAnimalMotion(cat);m.travel=47;w._stopAnimal(cat);assert(w._routeAnimal(cat,w.scene.spawns['food.default']));assert.equal(w._animalFrame(cat,true).frame.id,0);
  m.travel+=9/4+.01;assert.equal(w._animalFrame(cat,true).frame.id,1);cat.stateAge+=200;assert.equal(w._animalFrame(cat,true).frame.id,1);
  w._stopAnimal(cat);assert(w._routeAnimal(cat,w.scene.spawns['food.default']));assert.equal(w._animalFrame(cat,true).frame.id,0);
});

test('optional animation loader keeps valid states and rejects copied still-frame walking',async()=>{
  const {loadAnimalAnimationManifest}=await import('../public/animal-animation.js');
  class ImageStub{constructor(){this.naturalWidth=128;this.naturalHeight=64;}set src(value){queueMicrotask(()=>this.onload());}}
  const createCanvas=()=>({width:0,height:0,getContext(){const self=this;return {signature:0,drawImage(image,x){this.signature=Number(x)||0;},fillRect(){},getImageData(){const data=new Uint8ClampedArray(self.width*self.height*4);for(let y=3;y<7;y++)for(let x=3;x<7;x++){const i=(y*self.width+x)*4;data[i]=100+this.signature;data[i+1]=70;data[i+2]=40;data[i+3]=255;}return {data};}};}});
  const frame={rect:[0,0,64,64],anchorPx:[32,60],durationMs:120};
  const manifest={version:1,sheets:{cat:'cat.png'},animals:{cat:{sheet:'cat',worldScale:.5,states:{idle:{frames:[frame]},walk:{frames:[frame,frame]},eat:{frames:[{...frame,rect:[100,0,64,64]}]}}}}};
  const result=await loadAnimalAnimationManifest('file:///local/manifest.json',{fetchImpl:async()=>({ok:true,json:async()=>manifest}),ImageClass:ImageStub,createCanvas});
  assert.equal(result.status,'ready');assert(result.animals.get('cat').states.has('idle'));assert.equal(result.animals.get('cat').states.has('walk'),false);assert.equal(result.animals.get('cat').states.has('eat'),false);assert(result.notes.some(note=>note.includes('distinct')));
  manifest.animals.cat.states.walk.frames=[frame,{...frame,rect:[64,0,64,64]}];
  const good=await loadAnimalAnimationManifest('file:///local/manifest.json',{fetchImpl:async()=>({ok:true,json:async()=>manifest}),ImageClass:ImageStub,createCanvas});
  assert.equal(good.animals.get('cat').states.get('walk').realFrameCount,2);
});
