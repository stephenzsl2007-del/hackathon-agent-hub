// Local artist atlases, world rules, and procedural weather. No remote services.
import { LONG_ISLAND_SCENE } from './scene-profile.js';
import { segmentClear, findAnimalRoute, resetAnimalMotion, advanceAnimalMotion, animationFrameAt } from './animal-motion.js';
import { loadAnimalAnimationManifest } from './animal-animation.js';
const W = 640, H = 400;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function random(seed = 1247) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function blend(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t))).join(',')})`; }
const LAND = [[61,275],[69,240],[102,223],[108,205],[144,195],[187,190],[230,193],[262,186],[311,190],[343,182],[393,187],[428,195],[469,195],[486,217],[523,223],[552,251],[568,285],[556,310],[527,330],[481,349],[421,357],[347,360],[273,355],[215,361],[157,350],[120,335],[91,324],[73,304]];
const RAIN_ALTITUDE = 120;
const inPolygon = (x,y,polygon) => {let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside;};
// A hand-pixelled cloud tile: integer texels and stepped clusters, never blur.
const CLOUD_ROWS = [[27,36],[24,40],[22,42],[21,44],[20,45],[20,46],[19,46],[13,47],[10,51],[8,54],[7,56],[6,57],[5,58],[4,58],[3,60],[2,61],[1,62],[1,62],[0,63],[0,63],[0,63],[1,62],[2,61],[3,60],[4,59],[6,57],[8,55],[11,53],[14,50],[18,46]];
const CLOUD_TILE = (()=>{
  const pixels=Array.from({length:30},(_,y)=>Array.from({length:64},(_,x)=>x>=CLOUD_ROWS[y][0]&&x<=CLOUD_ROWS[y][1]?5:0));
  const paint=(x,y,w,h,color)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(pixels[yy]?.[xx])pixels[yy][xx]=color;};
  // Slate underside, rounded lobes, warm light gathered on the upper left.
  [[1,20,62,4,4],[5,24,54,3,3],[14,27,37,3,2],[50,14,12,9,3],[55,17,7,5,2],
   [24,2,16,3,6],[22,5,21,4,6],[20,9,23,5,6],[25,2,11,1,7],[22,4,5,2,7],[20,7,3,3,7],
   [43,6,3,8,4],[40,14,5,3,4],[34,17,9,2,4],[27,18,7,2,4],
   [11,9,10,3,6],[8,12,14,4,6],[6,16,14,3,5],[10,10,5,1,7],[7,13,3,2,7],
   [21,14,3,5,4],[18,19,6,2,4],[11,21,11,2,4],
   [47,10,7,3,6],[46,13,10,4,5],[48,10,4,1,7],[53,17,4,3,3],
   [6,22,6,2,5],[24,22,10,2,5],[38,21,8,2,5],[20,25,15,1,4],[37,24,9,1,4]
  ].forEach(args=>paint(...args));
  // One-pixel contour, with a lighter north edge and a deeper blue base.
  for(let y=0;y<30;y++)for(let x=0;x<64;x++)if(pixels[y][x]&&(!pixels[y-1]?.[x]||!pixels[y+1]?.[x]||!pixels[y][x-1]||!pixels[y][x+1]))pixels[y][x]=y<14?3:1;
  const runs=[];for(let y=0;y<30;y++)for(let x=0;x<64;){const color=pixels[y][x],start=x;while(x<64&&pixels[y][x]===color)x++;if(color)runs.push({x:start,y,width:x-start,color});}
  return {pixels,runs,width:64,height:30,anchorX:31,anchorY:18};
})();
const CLOUD_DAY = ['','#6d8c99','#91aab3','#afc4c7','#cedbd6','#e5e8dc','#f4efdc','#fff9e9'];
const CLOUD_NIGHT = ['','#344b65','#526c87','#6d849e','#8e9dac','#acb6bc','#cad0c9','#e6e5d7'];
const FLOWER_SPECIES = ['cosmos','daisy','lavender','sunflower','buttercup','forget-me-not'];
const SPECIES = [...FLOWER_SPECIES,'oak','birch','pine','cherry','apple','willow','blueberry','raspberry','hydrangea','fern','cattail','waterlily','fly-agaric','chanterelle','moss-clover','pumpkin','strawberry','carrot'];
const canonicalSpecies = id => ({marigold:'buttercup',blueflower:'forget-me-not'})[id]||id;

const NIGHT = { sky:'#232d53', skyBottom:'#675a81', water:'#354c71', waterDark:'#293e65', wave:'#7398ad', grass:'#567664', grassLight:'#78937a', grassDark:'#3f625b', soil:'#63585d', cliff:'#4e4454', sand:'#968379', tree:'#45625d', treeDark:'#304d52', treeLight:'#668373', trunk:'#66595d' };
const DAY = { sky:'#b7d9d3', skyBottom:'#e8ddba', water:'#86bcbc', waterDark:'#6fa6ad', wave:'#c7e4d6', grass:'#a7c879', grassLight:'#bed78a', grassDark:'#84b16b', soil:'#ba9670', cliff:'#8c7664', sand:'#e7d1a0', tree:'#8fb969', treeDark:'#5e9860', treeLight:'#b5cf7a', trunk:'#90715d' };

export class World {
  constructor(canvas, { onEvent = () => {}, onChange = () => {}, onCommand = null, scene = LONG_ISLAND_SCENE } = {}) {
    this.canvas = canvas;this.scene=scene;this.layoutSceneId='procedural-v1';
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.surface = document.createElement('canvas');
    this.surface.width = W; this.surface.height = H;
    this.g = this.surface.getContext('2d');
    this.onEvent = onEvent; this.onChange = onChange;this.onCommand=onCommand;
    this.tool = 'explore'; this.night = false; this.nightMix = 0;
    this.desktopMode = !!(document.documentElement?.classList?.contains('desktop-mode')||document.body?.classList?.contains('desktop-mode')||globalThis.window?.desktopWorld); this.petState = {growth:.2,satiety:70};
    this.animationArt={animals:new Map(),status:'static',notes:[]};
    this.art = {sprites:new Map(),active:false,missing:[],source:null,plants:[]};this.demoMode=false;this.rainAffectsGrowth=true;this._plantId=1;this.selectedSpecies=null;
    this.tide = .28; this.tideCurrent = .28;
    this.wind = 0; this.windTarget = 0; this.windAt = 0;
    this.windSources = new Map();
    this.time = 0; this.lastTime = 0; this.changeTime = -10;
    this.mouse = { x: -100, y: -100, down: false, dx: 0, since: 0 };
    this.clouds = [{x:142,y:91,w:1.2},{x:402,y:69,w:.95},{x:538,y:132,w:.7}];
    this.dragCloud = null; this.rainCloud = null; this.rainUntil = 0; this.lastRain = 0;
    this.rainSource=null;this.rainCloudVisibleUntil=0;this.rainDragOffset=null;this.rainImpactParticles=[];
    this.ripples = []; this.particles = []; this.flyingSeeds = []; this.food = [];this._foodId=1;
    this.flowers = []; this.animals = []; this.visitors = 0;
    this._rand = random();
    this.stars = Array.from({length:60}, () => ({x:this._rand()*W,y:15+this._rand()*165,s:this._rand(),phase:this._rand()*TAU}));
    this.grass = Array.from({length:230}, () => ({x:65+this._rand()*495,y:198+this._rand()*150,h:2+this._rand()*5,p:this._rand()*TAU})).filter(p=>this._land(p.x,p.y)&&!this._pond(p.x,p.y)&&!this._path(p.x,p.y));
    this.texture = Array.from({length:700}, () => ({x:55+this._rand()*520,y:190+this._rand()*170,s:1+Math.floor(this._rand()*3),v:this._rand()})).filter(p=>this._land(p.x,p.y));
    this.pebbles = Array.from({length:28}, () => ({x:450+this._rand()*95,y:302+this._rand()*39,s:2+this._rand()*3})).filter(p=>this._land(p.x,p.y));
    this.butterflies = Array.from({length:6}, (_,i) => ({x:190+i*36,y:200+this._rand()*105,phase:this._rand()*TAU,color:i%3,rest:0}));
    this.fireflies = Array.from({length:33}, () => ({x:80+this._rand()*480,y:175+this._rand()*165,p:this._rand()*TAU}));
    this._init();
    this._pointerDown = e => this._down(e);
    this._pointerMove = e => this._move(e);
    this._pointerUp = e => this._up(e);
    this._blur = () => this._up({type:'blur'});
    this._visibility = () => {if(document.hidden)this._up({type:'visibilitychange'});};
    this._pointerLeave = () => { if (!this.mouse.down) { this.mouse.x=-100; this.mouse.y=-100; } };
    canvas.addEventListener('pointerdown',this._pointerDown);
    canvas.addEventListener('pointermove',this._pointerMove);
    canvas.addEventListener('pointerup',this._pointerUp);
    canvas.addEventListener('pointercancel',this._pointerUp);
    canvas.addEventListener('lostpointercapture',this._pointerUp);
    canvas.addEventListener('pointerleave',this._pointerLeave);
    globalThis.window?.addEventListener?.('blur',this._blur);
    document.addEventListener?.('visibilitychange',this._visibility);
    canvas.style.touchAction = 'none';
    this.resizeObserver = new ResizeObserver(()=>this._resize());
    this.resizeObserver.observe(canvas);
    this._resize();
    this._frame = now => { if(this.dead)return;this.frame=requestAnimationFrame(this._frame);if(document.hidden||this.paused){this.lastTime=now;return;}const elapsed=now-(this.lastTime||now);if(this.lastTime&&elapsed<32)return;const dt=Math.min(.2,elapsed/1000);this.lastTime=now;this._update(dt);this._draw(); };
    this.frame = requestAnimationFrame(this._frame);
    this.artReady=this.loadArt().catch(error=>{this.art.missing.push(error.message);this._emit('art-missing','部分像素素材暂未加载，已保留可操作的临时画面。');return this.getArtStatus();});
    this.animationReady=this.artReady.then(()=>this.loadAnimalAnimations());
  }

  async loadArt(options={}) {
    const manifestUrl=typeof options==='string'?options:options.manifestUrl||new URL('./assets/pixel-world/runtime-manifest.json',import.meta.url).href;
    const response=await fetch(manifestUrl,{cache:'no-cache'});if(!response.ok)throw new Error(`素材清单不可用 (${response.status})`);
    const manifest=await response.json();if(!Array.isArray(manifest.sprites)||!manifest.images)throw new Error('素材清单格式不支持');
    const base=new URL(manifestUrl,globalThis.location?.href||import.meta.url);const images=new Map();
    await Promise.all(Object.entries(manifest.images).map(async([key,path])=>{const img=new Image();img.decoding='async';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error(`素材未能加载：${path}`));img.src=new URL(path,base).href;});images.set(key,img);}));
    for(const entry of manifest.sprites){const image=images.get(entry.source);if(!image)continue;const rect=Array.isArray(entry.rect)?entry.rect:[entry.rect?.x,entry.rect?.y,entry.rect?.w??entry.rect?.width,entry.rect?.h??entry.rect?.height];const [x,y,w,h]=rect;if(!rect.every(Number.isFinite)||w<1||h<1||x<0||y<0||x+w>image.naturalWidth||y+h>image.naturalHeight){this.art.missing.push(`裁切越界：${entry.id}`);continue;}
      const crop=document.createElement('canvas');crop.width=w;crop.height=h;const cg=crop.getContext('2d',{willReadFrequently:true});cg.imageSmoothingEnabled=false;cg.drawImage(image,x,y,w,h,0,0,w,h);
      const rgba=cg.getImageData(0,0,w,h).data,step=4,mw=Math.ceil(w/step),mh=Math.ceil(h/step),mask=new Uint8Array(mw*mh);let transparent=0;
      for(let py=0;py<h;py++)for(let px=0;px<w;px++){const alpha=rgba[(py*w+px)*4+3];if(alpha<10)transparent++;if(alpha>24)mask[Math.floor(py/step)*mw+Math.floor(px/step)]=1;}
      if(transparent/(w*h)<.015){this.art.missing.push(`缺少透明边缘：${entry.id}`);continue;}
      const dark=document.createElement('canvas');dark.width=w;dark.height=h;const dg=dark.getContext('2d');dg.drawImage(crop,0,0);dg.globalCompositeOperation='source-atop';dg.fillStyle='rgba(25,36,65,.46)';dg.fillRect(0,0,w,h);
      this.art.sprites.set(entry.id,{...entry,rect,crop,dark,mask,mw,mh,step,anchor:entry.anchor||[.5,1]});
    }
    const wasActive=this.art.active;this.art.active=this.art.sprites.has('island.pond');this.art.source=manifestUrl;this.art.plants=Array.isArray(manifest.plants)?manifest.plants:this.art.plants;this.art.missing.push(...(manifest.missing||[]));
    if(this.art.active&&!wasActive){if(!this.hasRestored)this._initArt();else this._adaptLayout();this._resetSceneDecor();this._resize();}
    this._emit('art-ready','像素花园已经展开，小动物们也到了。');return this.getArtStatus();
  }
  async loadAnimalAnimations(options={}) {
    const manifestUrl=typeof options==='string'?options:options.manifestUrl||new URL('./assets/pixel-world/animations/manifest.json',import.meta.url).href;
    try{this.animationArt=await loadAnimalAnimationManifest(manifestUrl);}catch(error){this.animationArt={animals:new Map(),status:'static',notes:[error.message]};}
    return this.getAnimationStatus();
  }
  getAnimationStatus() { return {status:this.animationArt.status,animals:[...this.animationArt.animals].map(([species,a])=>({species,worldScale:a.worldScale,states:[...a.states].map(([state,clip])=>({state,realFrameCount:clip.realFrameCount}))})),notes:[...this.animationArt.notes]}; }
  _animalFrame(animal,moving) {
    const art=this.animationArt.animals.get(animal.type);if(!art)return null;
    const state=moving?'walk':['eat','carry'].includes(animal.state)?'eat':animal.state==='rest'?'rest':'idle';
    const clip=art.states.get(state);
    // A missing gait holds the approved standing pose; it is never counted as a walk clip.
    // This avoids switching between an upright new cat and the old seated atlas mid-step.
    if(!clip){const idle=art.states.get('idle');return idle?{frame:idle.frames[0],art,staticPose:true}:null;}
    const clock=moving?Math.max(0,(animal.motion?.travel||0)-(animal.motion?.gaitStartTravel||0))/(art.strideWorld*this._animalScale(animal.type))*clip.durationMs:(animal.stateAge||0)*1000;
    return {frame:animationFrameAt(clip.frames,clock,clip.loop),art};
  }
  _animalScale(type) { return type==='cat'?1+this.petState.growth*.25:1; }
  _drawAnimalFrame(record,size=1) {
    const {frame,art}=record,[,,w,h]=frame.rect,scale=art.worldScale*size,g=this.g,x=-frame.anchorPx[0]*scale,y=-frame.anchorPx[1]*scale;
    g.save();g.scale(art.defaultFacing,1);g.drawImage(frame.crop,Math.round(x),Math.round(y),Math.round(w*scale),Math.round(h*scale));if(this.nightMix>.01){g.globalAlpha=this.nightMix;g.drawImage(frame.dark,Math.round(x),Math.round(y),Math.round(w*scale),Math.round(h*scale));}g.restore();
  }
  getArtStatus() { const species=SPECIES;return {active:this.art.active,loadedSprites:this.art.sprites.size,animalSpecies:['cat','dog','bird','squirrel','rabbit','duck'].filter(id=>this.art.sprites.has(`animal.${id}`)),plantSpecies:this.art.plants.map(plant=>({...plant,stagesAvailable:[0,1,2,3,4].filter(stage=>this.art.sprites.has(`plant.${plant.id}.${stage}`)),complete:[0,1,2,3,4].every(stage=>this.art.sprites.has(`plant.${plant.id}.${stage}`))})),completeGrowthSpecies:species.filter(id=>[0,1,2,3,4].every(stage=>this.art.sprites.has(`plant.${id}.${stage}`))),missingStages:species.flatMap(id=>[0,1,2,3,4].filter(stage=>!this.art.sprites.has(`plant.${id}.${stage}`)).map(stage=>({speciesId:id,stage}))),notes:[...new Set(this.art.missing)]}; }
  setSelectedSpecies(speciesId) { const id=canonicalSpecies(speciesId);if(id===null||id==='random'){this.selectedSpecies=null;return true;}if(!SPECIES.includes(id))return false;this.selectedSpecies=id;return true; }
  setPaused(value) { this.paused=!!value;this.lastTime=0;if(value)this._up({type:'pause'}); }
  setDemoMode(value) { this.demoMode=!!value;if(value){let flower=this.flowers.find(f=>f.demoPlant);if(!flower){flower=this._makePlant(this.scene.spawns['plant.demo'].x,this.scene.spawns['plant.demo'].y,3,0);flower.demoPlant=true;this.flowers.push(flower);}flower.growth=0;flower.growthProgress=0;flower.stage=0;this.demoPlant=flower;this._emit('demo-stage','演示花苗 · 第 1 阶段：萌芽');}else this.demoPlant=null; }
  _makePlant(x,y,type,growth=0,speciesId=null) { return {id:`plant-${this._plantId++}`,x,y,type,speciesId:SPECIES.includes(canonicalSpecies(speciesId))?canonicalSpecies(speciesId):FLOWER_SPECIES[type%FLOWER_SPECIES.length],growth,growthProgress:growth,stage:Math.min(4,Math.floor(growth*5)),p:this._rand()*TAU,water:0,seeded:false}; }
  getSceneProfile() { return {id:this.scene.id,version:this.scene.version,worldRect:{...this.scene.worldRect},viewBounds:{...this.scene.viewBounds},sourceRect:[...this.scene.sourceRect]}; }
  _initArt() {
    this.flowers=[];
    this.scene.initialPlants.forEach((point,i)=>{const p=this._plantable(point.x,point.y)?point:this._findPlantPoint(null,i);this.flowers.push(this._makePlant(p.x,p.y,i%6,i<5?i*.2+.03:1));});
    this.animals=['cat','dog','bird','squirrel','rabbit','duck'].map((type,i)=>{const p=this.scene.spawns[`animal.${type}`];return {id:`animal-${type}`,type,x:p.x,y:p.y,homeX:p.x,homeY:p.y,targetX:p.x,targetY:p.y,dir:1,phase:i,wait:1+i*.7,hop:0,state:'idle',bond:0};});
    this.layoutSceneId=this.scene.id;
  }
  _findPlantPoint(speciesId=null,index=0,occupied=this.flowers||[],allowCrowding=false,rng=this._rand) {
    const water=canonicalSpecies(speciesId)==='waterlily',bounds=this.scene.meadowBounds,origin=this.scene.spawns[water?'plant.waterlily.new':'plant.default'];
    for(let attempt=0;attempt<240;attempt++){const angle=(index*2.399+attempt*.73),radius=water?Math.min(28,attempt*.65):0;const x=water?origin.x+Math.cos(angle)*radius:bounds.x+rng()*bounds.width,y=water?origin.y+Math.sin(angle)*radius*.45:bounds.y+rng()*bounds.height;if(this._plantable(x,y,speciesId)&&occupied.every(p=>Math.hypot(p.x-x,p.y-y)>=(allowCrowding&&attempt>160?4:9)))return {x,y};}
    return {...origin};
  }
  _adaptLayout() {
    const migrating=this.layoutSceneId!==this.scene.id&&!(this.layoutSceneId==='legacy-round-v1'&&this.scene.id==='island-pond-round-v1'),placed=[],migrationRandom=random(9917);
    for(const [i,f] of this.flowers.entries()){
      f.speciesId=canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6];
      if(migrating||!this._plantable(f.x,f.y,f.speciesId)){const p=this._findPlantPoint(f.speciesId,i,placed,true,migrationRandom);f.x=p.x;f.y=p.y;}
      f.growthProgress=f.growthProgress??f.growth??1;f.growth=f.growthProgress;f.stage=Math.min(4,Math.floor(f.growthProgress*5));placed.push(f);
    }
    for(const type of ['cat','dog','bird','squirrel','rabbit','duck'])if(!this.animals.some(a=>a.type===type)){const p=this.scene.spawns[`animal.${type}`];this.animals.push({id:`animal-${type}`,type,...p,homeX:p.x,homeY:p.y,targetX:p.x,targetY:p.y,dir:1,phase:0,wait:2,hop:0,state:'idle',bond:0});}
    for(const a of this.animals){if(!this.scene.spawns[`animal.${a.type}`])continue;if(migrating||!(a.type==='duck'?this._swimmable(a.x,a.y):this._walkable(a.x,a.y))){const p=this.scene.spawns[`animal.${a.type}`];a.x=p.x;a.y=p.y;}a.homeX=a.targetX=a.x;a.homeY=a.targetY=a.y;}
    this.layoutSceneId=this.scene.id;
  }
  _resetSceneDecor() {
    const b=this.scene.meadowBounds,a=this.scene.ambient;
    this.grass=Array.from({length:95},()=>({x:b.x+this._rand()*b.width,y:b.y+this._rand()*b.height,h:2+this._rand()*3,p:this._rand()*TAU})).filter(p=>this._plantable(p.x,p.y));
    this.butterflies.forEach((p,i)=>{p.x=a.x+Math.sin(i*1.4)*a.radiusX;p.y=a.y+Math.cos(i*2.4)*a.radiusY;});
    this.fireflies=Array.from({length:33},()=>({x:a.x+(this._rand()-.5)*a.radiusX*2,y:a.y+(this._rand()-.5)*a.radiusY*2,p:this._rand()*TAU}));
  }
  _sprite(id,x,y,width,height,options={}) { const s=this.art.sprites.get(id);if(!s)return false;const w=width||s.rect[2],h=height||w*s.rect[3]/s.rect[2],ax=options.anchor?.[0]??s.anchor[0],ay=options.anchor?.[1]??s.anchor[1];const g=this.g;g.save();g.imageSmoothingEnabled=false;const left=Math.round(x-w*ax),top=Math.round(y-h*ay);g.drawImage(s.crop,left,top,Math.round(w),Math.round(h));if(this.nightMix>.01){g.globalAlpha=this.nightMix;g.drawImage(s.dark,left,top,Math.round(w),Math.round(h));}g.restore();return true; }
  _spriteHit(id,px,py,x,y,width,height,anchor) { const s=this.art.sprites.get(id);if(!s)return false;const h=height||width*s.rect[3]/s.rect[2],a=anchor||s.anchor;const u=(px-(x-width*a[0]))/width,v=(py-(y-h*a[1]))/h;if(u<0||u>=1||v<0||v>=1)return false;return !!s.mask[Math.min(s.mh-1,Math.floor(v*s.rect[3]/s.step))*s.mw+Math.min(s.mw-1,Math.floor(u*s.rect[2]/s.step))]; }

  _init() {
    const rand = random(16);
    this.flowers = [];
    for(let i=0;i<48;i++) {
      const x=172+rand()*202, y=234+rand()*105;
      if(this._land(x,y)&&!this._path(x,y)) this.flowers.push({x,y,type:Math.floor(rand()*6),growth:.7+rand()*.3,p:rand()*TAU,water:0,seeded:false});
    }
    [[116,267],[126,282],[145,307],[495,248],[516,288],[486,328],[398,332],[234,332],[158,331],[97,293]].forEach(([x,y],i)=>this.flowers.push({x,y,type:i%6,growth:1,p:i*1.7,water:0,seeded:false}));
    this.animals = [
      {x:346,y:301,homeX:346,homeY:301,targetX:346,targetY:301,type:'rabbit',dir:1,phase:0,wait:2,hop:0},
      {x:153,y:278,homeX:153,homeY:278,targetX:153,targetY:278,type:'rabbit',dir:-1,phase:3,wait:4,hop:0},
      {x:477,y:279,homeX:477,homeY:279,targetX:477,targetY:279,type:'duck',dir:-1,phase:2,wait:5,hop:0}
    ];
  }

  setTool(tool) { if(['explore','wind','rain','seed','food','tide'].includes(tool)) { if(tool!==this.tool)this._up({type:'toolchange'});this.tool=tool;this.canvas.style.cursor=tool==='explore'?'default':'crosshair'; } }
  isWeatherHandleAt(clientX,clientY) { const p=this._position({clientX,clientY});return this._rainCloudHit(p.x,p.y); }
  canDragIslandAt(clientX,clientY) { return this.tool==='explore'&&this.hitTest(clientX,clientY)&&!this.isWeatherHandleAt(clientX,clientY); }
  tapInteraction(payload={}) {
    if(!Number.isFinite(payload.clientX)||!Number.isFinite(payload.clientY)||(payload.button??0)!==0||payload.isPrimary===false)return false;
    this._down({clientX:payload.clientX,clientY:payload.clientY,button:0,pointerType:payload.pointerType||'mouse',pointerId:payload.pointerId??0,skipPointerCapture:true});
    this._up({type:'tap'});return true;
  }
  cancelInteraction() { this._up({type:'cancelInteraction'}); }
  setDesktopMode(value) { this.desktopMode=!!value;this._resize(); }
  setPetState(state={}) { this.petState={...this.petState,...state,growth:clamp(Number(state.growth??this.petState.growth)||0),satiety:clamp(Number(state.satiety??this.petState.satiety)||0,0,100)}; }
  hitTest(clientX,clientY) { const p=this._position({clientX,clientY});if(p.x<0||p.x>=W||p.y<0||p.y>=H)return false;if(!this.desktopMode)return true;if(this._rainCloudHit(p.x,p.y))return true;if(this.art.active){const r=this.scene.worldRect;if(this._spriteHit('island.pond',p.x,p.y,r.x,r.y,r.width,r.height,[0,0]))return true;if(this.animals.some(a=>Math.abs(p.x-a.x)<18&&p.y>a.y-34&&p.y<a.y+3))return true;if(this.scene.decor.some(d=>this._spriteHit(d.id,p.x,p.y,d.x,d.y,d.width,d.height)))return true;if(this.flowers.some(f=>{const id=`plant.${canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6]}.${f.stage??Math.min(4,Math.floor(f.growth*5))}`,s=this.art.sprites.get(id);return s&&this._spriteHit(id,p.x,p.y,f.x,f.y,s.rect[2]*(s.worldScale||.1),s.rect[3]*(s.worldScale||.1));}))return true;return Object.values(this.scene.props).some(s=>Math.abs(p.x-s.x)<20&&p.y>s.y-48&&p.y<s.y+4);}return this._land(p.x,p.y)||((p.x-324)/255)**2+((p.y-319)/61)**2<1||[{x:137,y:160,rx:54,ry:70},{x:203,y:168,rx:37,ry:52},{x:516,y:199,rx:36,ry:52},{x:89,y:313,rx:30,ry:40},{x:409,y:199,rx:42,ry:46}].some(s=>((p.x-s.x)/s.rx)**2+((p.y-s.y)/s.ry)**2<1); }
  setNight(value) { this.night=!!value;this._emit('night',this.night?'夜色降临，萤火虫醒来了。':'天亮了，小岛开始新的一天。'); }
  setWind(amount, source='manual') { const channel=['mic','microphone'].includes(source)?'microphone':source;this.windSources.set(channel,{value:clamp(Number(amount)||0),time:this.time});this.windAt=this.time;this.windSource=source; }
  setTide(value) { this.tide=clamp(Number(value)||0); }
  clearTransientState() {
    this._clearWeather();
    this.wind=this.windTarget=this.windHold=0;this.windSources.clear();
    this.rainCloud=this.dragCloud=null;this.rainUntil=this.visualRainUntil=this.visualRainIntensity=0;
    this.ripples=[];this.particles=[];this.flyingSeeds=[];this.food=[];
    this.mouse.down=false;this.mouse.x=this.mouse.y=-100;this.tideStart=null;
    this.fireflies=this.fireflies.slice(0,33);
    for(const flower of this.flowers)flower.seeded=false;
  }
  nurture() {
    if(this.demoMode)return {ok:false,error:'先结束演示，再照顾自己的花园。'};
    const plant=this.flowers.filter(f=>!f.demoPlant&&(f.growthProgress??f.growth)<.8).sort((a,b)=>(a.growthProgress??a.growth)-(b.growthProgress??b.growth))[0];
    if(!plant)return {ok:false,error:'花园里的植物都已进入最后阶段。先种一颗新种子，水滴会留在水壶里。'};
    const stage=Math.min(4,Math.floor((plant.growthProgress??plant.growth)*5)+1);
    plant.growth=plant.growthProgress=stage===4?1:stage/5+.000001;plant.stage=stage;
    plant.water=Math.max(plant.water||0,30);
    this._petals(plant.x,plant.y-10,14,'#d8ebac');
    const name=this.art.plants.find(p=>p.id===plant.speciesId)?.name||'小苗';
    const message=`这一滴专注，让${name}长到了第 ${stage+1} 阶段。`;
    this._emit('growth',message,{plantId:plant.id,stage});
    return {ok:true,plantId:plant.id,stage,message};
  }
  impulse(action, data={}) {
    if(action==='nurture')return this.nurture();
    const norm = (v, fallback, size) => Number.isFinite(v) ? (v>=0&&v<=1 ? v*size : v) : fallback;
    const thirsty=[...this.flowers].sort((a,b)=>(a.growthProgress??a.growth)-(b.growthProgress??b.growth)||(a.water||0)-(b.water||0))[0];
    const rainTarget=(this.demoMode&&this.demoPlant)||thirsty;
    const defaultPoint=this.art.active?(action==='food'?this.scene.spawns['food.default']:['rain','water'].includes(action)&&rainTarget?rainTarget:this._findPlantPoint(data.speciesId??this.selectedSpecies)):{x:230+this._rand()*120,y:270+this._rand()*50};
    let x=norm(data.x,defaultPoint.x,W),y=norm(data.y,defaultPoint.y,H);
    if(action==='wind') { this.setWind(data.amount ?? data.value ?? .95,data.source||'guest');this.windHold=this.time+(data.duration||2.3);this._releaseSeeds(5);this._emit('wind','风来了，蒲公英飞向新的地方。'); }
    else if(action==='rain'||action==='water') { this._startRain(x,y,{manual:!!data.manual,duration:data.duration??5});this._emit('rain',this._pond(x,y)?'雨滴落进池塘，水面泛起了涟漪。':'一场小雨，正在浇醒这一小片花园。'); }
    else if(action==='keyboard-rain'||action==='keyboardRain') { this.visualRainUntil=this.time+clamp(data.duration??.6,.1,2);this.visualRainIntensity=clamp(Number(data.intensity)||.3,.15,1); }
    else if(action==='seed') { const species=canonicalSpecies(data.speciesId??this.selectedSpecies);if(species==='waterlily'&&!Number.isFinite(data.x)&&!Number.isFinite(data.y)){const p=this._findPlantPoint('waterlily');x=p.x;y=p.y;}const ok=this._plant(x,y,false,species);return {ok,error:ok?undefined:'这里暂时不能播种，请在电脑上选择一片空地。'}; }
    else if(action==='food') { this._feed(x,y,data); }
    else if(action==='tide') { this.setTide(data.amount ?? data.value ?? (this.tide<.6?.9:.15));this._emit('tide',this.tide>.5?'潮水轻轻漫过沙滩。':'潮水退去，贝壳留在岸边。'); }
    else if(action==='fireflies') { this.night=true;for(let i=0;i<14;i++) this.fireflies.push({x:this.scene.ambient.x+(this._rand()-.5)*this.scene.ambient.radiusX*2,y:this.scene.ambient.y+(this._rand()-.5)*this.scene.ambient.radiusY*2,p:this._rand()*TAU});if(this.fireflies.length>80)this.fireflies.splice(0,this.fireflies.length-80);this._emit('fireflies','你放来了一群萤火虫。'); }
    else if(action==='ripple') { this._ripple(x,y); }
    else if(action==='compost') { const spot=this.scene.props.compost;for(let i=0;i<16;i++)this.particles.push({kind:'petal',x:spot.x+(this._rand()-.5)*18,y:spot.y-21-this._rand()*15,vx:(this._rand()-.5)*16,vy:-10-this._rand()*14,life:1.5+this._rand(),max:2.5,color:i%3===0?'#e8dab0':i%3===1?'#b2c78e':'#d5c2a0'});this._emit('compost','文件已回收，堆肥箱收到了新的养分。'); }
    else if(action==='demo-stage'&&this.demoMode) { const stage=clamp(Math.round(Number(data.stage)||0),0,4);this._demoManualStage=true;if(!this.demoPlant)this.setDemoMode(true);this.demoPlant.growth=this.demoPlant.growthProgress=stage===4?1:(stage+.02)/5;this.demoPlant.stage=stage;const real=this.art.sprites.has(`plant.${this.demoPlant.speciesId}.${stage}`);this._emit('demo-stage',`演示花苗 · 第 ${stage+1} 阶段${real?'':'（本阶段素材待交付）'}`,{stage,realAsset:real}); }
    return {ok:true};
  }
  getStats() { return {flowers:this.flowers.filter(f=>(f.stage??Math.min(4,Math.floor(f.growth*5)))===4).length,visitors:this.visitors,seeds:this.flyingSeeds.length,night:this.night,tide:Math.round(this.tide*100),plants:this.flowers.length,stages:[0,1,2,3,4].map(stage=>this.flowers.filter(f=>(f.stage??Math.min(4,Math.floor(f.growth*5)))===stage).length),demo:this.demoMode,artReady:this.art.active}; }
  serialize() { return {version:2,savedAt:Date.now(),layout:{version:this.scene.version,sceneId:this.layoutSceneId,island:'island.pond',base:Object.values(this.scene.worldRect)},selectedSpecies:this.selectedSpecies,petState:{...this.petState},flowers:this.flowers.filter(f=>!f.demoPlant).map(f=>({id:f.id,x:f.x,y:f.y,type:f.type,speciesId:canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6],growth:f.growth,growthProgress:f.growthProgress??f.growth,stage:f.stage??Math.min(4,Math.floor(f.growth*5)),water:f.water||0,...(f.watered!==undefined?{watered:f.watered}:{}),p:f.p})),animals:this.animals.map(a=>({id:a.id,type:a.type,x:a.x,y:a.y,bond:a.bond||0})),night:this.night,tide:this.tide,visitors:this.visitors}; }
  restore(data) { if(!data||![1,2].includes(data.version))return;this.hasRestored=true;this.layoutSceneId=data.layout?.sceneId||'legacy-round-v1';this.clearTransientState();this.demoMode=false;this.demoPlant=null;this._demoManualStage=false;this.setSelectedSpecies(data.selectedSpecies??null);if(data.petState)this.setPetState(data.petState);if(Array.isArray(data.flowers))this.flowers=data.flowers.slice(0,220).filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&f.x>=0&&f.x<=W&&f.y>=0&&f.y<=H).map(f=>{const type=clamp(Math.round(f.type||0),0,5),progress=clamp(Number(f.growthProgress??f.growth)||0),species=canonicalSpecies(f.speciesId);return {...this._makePlant(f.x,f.y,type,progress),id:typeof f.id==='string'?f.id:`plant-${this._plantId++}`,speciesId:SPECIES.includes(species)?species:FLOWER_SPECIES[type],p:Number(f.p)||0,...(f.watered!==undefined?{watered:f.watered}:{}),water:clamp(Number(f.water)||0,0,300)};});if(Array.isArray(data.animals))this.animals=data.animals.slice(0,12).filter(a=>['cat','dog','bird','squirrel','rabbit','duck'].includes(a.type)).map((a,i)=>({id:a.id,type:a.type,x:Number(a.x)||0,y:Number(a.y)||0,homeX:Number(a.x)||0,homeY:Number(a.y)||0,targetX:Number(a.x)||0,targetY:Number(a.y)||0,bond:Math.max(0,Number(a.bond)||0),dir:1,phase:i,wait:2,state:'idle',hop:0}));this.night=!!data.night;this.tide=clamp(Number(data.tide)||0);this.visitors=Math.max(0,Number(data.visitors)||0);this.nightMix=this.night?1:0;this.tideCurrent=this.tide;if(this.art.active)this._adaptLayout(); }
  reset() { this._clearWeather();this.art.active?this._initArt():this._init();this.night=false;this.tide=.28;this.windTarget=0;this.windSources.clear();this.food=[];this.flyingSeeds=[];this.particles=[];this.visitors=0;this._emit('reset','新的小岛，等你来照顾。'); }
  destroy() { this._up({type:'destroy'});this.dead=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.canvas.removeEventListener('pointerdown',this._pointerDown);this.canvas.removeEventListener('pointermove',this._pointerMove);this.canvas.removeEventListener('pointerup',this._pointerUp);this.canvas.removeEventListener('pointercancel',this._pointerUp);this.canvas.removeEventListener('lostpointercapture',this._pointerUp);this.canvas.removeEventListener('pointerleave',this._pointerLeave);globalThis.window?.removeEventListener?.('blur',this._blur);document.removeEventListener?.('visibilitychange',this._visibility); }
  _clearWeather() { this._up({type:'restore'});this.rainSource=null;this.rainCloud=null;this.rainUntil=0;this.rainCloudVisibleUntil=0;this.visualRainUntil=this.visualRainIntensity=0;this.visualRainCloud=null;this.ripples=[];this.particles=[];this.rainImpactParticles=[]; }
  _emit(type,message,detail={}) { this.onEvent({...detail,type,message}); }
  _command(action,data={}) { if(this.onCommand)this.onCommand(action,data);else this.impulse(action,data); }
  _resize() {
    const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),v=this.art?.active?this.scene.viewBounds:{x:0,y:0,width:W,height:H};
    const width=Math.max(1,Math.round(r.width*dpr)),height=Math.max(1,Math.round(r.height*dpr));
    let resized=false;
    // Assigning even an unchanged Canvas dimension erases its pixels. Windows
    // fractional-DPI moves may report a one-pixel resize between paint frames.
    if(this.canvas.width!==width){this.canvas.width=width;resized=true;}
    if(this.canvas.height!==height){this.canvas.height=height;resized=true;}
    this.scale=Math.min(this.canvas.width/v.width,this.canvas.height/v.height);
    this.offsetX=(this.canvas.width-v.width*this.scale)/2-v.x*this.scale;this.offsetY=(this.canvas.height-v.height*this.scale)/2-v.y*this.scale;
    this.dpr=dpr;this.extension=this.desktopMode?0:Math.max(0,Math.ceil((this.canvas.width/this.scale-W)/2));
    const surfaceWidth=W+this.extension*2;
    if(this.surface.width!==surfaceWidth){this.surface.width=surfaceWidth;resized=true;}
    // Repaint in this ResizeObserver turn instead of exposing an empty backing
    // store until the 30 FPS animation loop next advances. Do not advance time.
    if(resized&&this._frame&&!this.dead)this._draw();
  }
  _position(e) { const r=this.canvas.getBoundingClientRect();return {x:((e.clientX-r.left)*this.dpr-this.offsetX)/this.scale,y:((e.clientY-r.top)*this.dpr-this.offsetY)/this.scale}; }
  _rainActive() { const rain=this.rainSource;return !!(rain&&rain.active&&(rain.manual?this.mouse.down:this.time<rain.until)); }
  _rainCloudVisible() { return !!this.rainCloud&&(this._rainActive()||this.time<this.rainCloudVisibleUntil); }
  _rainCloudHit(x,y) {
    if(!this._rainCloudVisible())return false;
    return this._cloudHit(this.rainCloud,x,y);
  }
  _cloudHit(cloud,x,y) {
    const px=x-Math.round(cloud.x-CLOUD_TILE.anchorX*cloud.w),py=y-Math.round(cloud.y-CLOUD_TILE.anchorY*cloud.w);
    return CLOUD_TILE.runs.some(run=>px>=Math.round(run.x*cloud.w)&&px<Math.round((run.x+run.width)*cloud.w)&&py>=Math.round(run.y*cloud.w)&&py<Math.round((run.y+1)*cloud.w));
  }
  _rainLandingKind(x,y) { if(this._pond(x,y))return 'pond';return this.art.active?inPolygon(x,y,this.scene.rainGround)?'ground':null:this._land(x,y)?'ground':null; }
  _startRain(x,y,{manual=false,duration=5}={}) {
    const until=this.time+clamp(Number(duration)||5,.1,30);
    this.rainSource={x:clamp(x,20,W-20),y:clamp(y,RAIN_ALTITUDE+18,H-12),radiusX:25,radiusY:12,manual,active:true,until};
    this.rainCloud={x:this.rainSource.x,y:this.rainSource.y-RAIN_ALTITUDE,w:.88};
    this.rainUntil=manual?Infinity:until;this.rainCloudVisibleUntil=until+.55;this.lastRain=this.time;this.rainAffectsGrowth=true;
    // A down/up in one frame still creates a visible shower that reaches its target.
    this._spawnRainDrops(9);
  }
  _moveRainTarget(x,y) {
    if(!this.rainSource)return;
    this.rainSource.x=clamp(x,20,W-20);this.rainSource.y=clamp(y,RAIN_ALTITUDE+18,H-12);
    this.rainCloud.x=this.rainSource.x;this.rainCloud.y=this.rainSource.y-RAIN_ALTITUDE;
  }
  _stopManualRain() {
    if(this.rainSource?.manual&&this.rainSource.active){this.rainSource.active=false;this.rainSource.until=this.time;this.rainUntil=this.time;this.rainCloudVisibleUntil=this.time+.55;}
    this.dragCloud=null;this.rainDragOffset=null;
  }
  _spawnRainDrops(count,source=this.rainSource,cloud=this.rainCloud,{waters=true}={}) {
    if(!source||!cloud)return;
    const targetKind=this._rainLandingKind(source.x,source.y);if(!targetKind)return;
    for(let i=0;i<count;i++){
      let landing=null;
      for(let attempt=0;attempt<12;attempt++){const angle=this._rand()*TAU,radius=Math.sqrt(this._rand());const x=source.x+Math.cos(angle)*radius*source.radiusX,y=source.y+Math.sin(angle)*radius*source.radiusY;if(this._rainLandingKind(x,y)===targetKind){landing={x,y};break;}}
      if(!landing)continue;
      const fallTime=.42+this._rand()*.16,startY=cloud.y+9,startX=landing.x-this.wind*12;
      this.particles.push({kind:'rain',x:startX,y:startY,vx:(landing.x-startX)/fallTime,vy:(landing.y-startY)/fallTime,landingX:landing.x,landingY:landing.y,landingKind:targetKind,waters,depth:this._rand(),strokeLength:waters?3+Math.floor(this._rand()*3):6+Math.floor(this._rand()*3),createdAt:this.time,life:fallTime+.05,max:fallTime+.05});
    }
  }
  _rainImpact(drop) {
    const {landingX:x,landingY:y,landingKind}=drop;
    if(this._rainLandingKind(x,y)!==landingKind)return;
    if(landingKind==='pond')this._ripple(x,y,{small:true});
    else this.rainImpactParticles.push({kind:'splash',x,y,vx:0,vy:0,life:.22,max:.22,color:'#8abbb7'});
    if(drop.waters)for(const flower of this.flowers){const wet=((flower.x-x)/15)**2+((flower.y-y)/9)**2<1;if(wet&&(landingKind==='pond'?canonicalSpecies(flower.speciesId)==='waterlily':!this._pond(flower.x,flower.y))){flower.water=Math.min(120,(flower.water||0)+.7);flower.rainBoostUntil=this.time+.3;}}
  }
  _down(e) {
    if(e.button!==0&&e.pointerType!=='touch')return;
    const p=this._position(e);Object.assign(this.mouse,p,{down:true,since:this.time});this.pointerId=e.skipPointerCapture?null:e.pointerId;if(!e.skipPointerCapture)this.canvas.setPointerCapture?.(e.pointerId);
    if(['explore','rain'].includes(this.tool)&&this._rainCloudHit(p.x,p.y)){
      const cloud=this.rainCloud,offset={x:p.x-cloud.x,y:p.y-cloud.y},target={x:this.rainSource.x,y:this.rainSource.y};
      this._command('rain',{x:target.x,y:target.y,manual:true});this.dragCloud=this.rainCloud;this.rainDragOffset=offset;return;
    }
    if(this.tool==='explore') {
      if(this.art.active){if(Math.abs(p.x-this.scene.props.compost.x)<22&&p.y>this.scene.props.compost.y-28&&p.y<this.scene.props.compost.y+6){this._emit('request-feed','把需要回收的文件交给堆肥箱。');return;}if(Math.abs(p.x-this.scene.props.windmill.x)<24&&p.y>this.scene.props.windmill.y-57&&p.y<this.scene.props.windmill.y+5){this._emit('request-microphone','风车等着你送来一口风。');return;}if(Math.abs(p.x-this.scene.props.focus.x)<24&&p.y>this.scene.props.focus.y-20&&p.y<this.scene.props.focus.y+7){this._emit('request-focus','坐一会儿，和花园一起专注。');return;}}
      const cloud=this.desktopMode?null:this.clouds.find(c=>Math.abs(p.x-c.x)<45*c.w&&Math.abs(p.y-c.y)<20*c.w);
      if(cloud){this._command('rain',{x:cloud.x,y:cloud.y+RAIN_ALTITUDE,manual:true});this.dragCloud=this.rainCloud;this.rainDragOffset={x:p.x-cloud.x,y:p.y-cloud.y};this._emit('rain','拖着这朵云，为你喜欢的地方下一场雨。');return;}
      if(this._water(p.x,p.y))this._ripple(p.x,p.y);
      else { const animal=[...this.animals].sort((a,b)=>b.y-a.y).find(a=>Math.abs(a.x-p.x)<18&&p.y>a.y-33&&p.y<a.y+7);if(animal){this._stopAnimal(animal,'observe',2.5);animal.bond=(animal.bond||0)+1;this._heart(animal.x,animal.y-30);this._emit('pet',({cat:'小猫抬起头，安静地看着你。',dog:'小狗摇摇尾巴，记住了你的温柔。',bird:'小鸟轻轻一跳，向你打了个招呼。',squirrel:'松鼠抱住果实，好奇地看向你。',rabbit:'小兔子向你蹭了蹭。',duck:'小鸭子开心地摇了摇。'})[animal.type]);}else this._petals(p.x,p.y,5); }
    }
    else if(this.tool==='seed')this._command('seed',{x:p.x,y:p.y,speciesId:this.selectedSpecies});
    else if(this.tool==='food')this._emit('request-food','在草地上放下一份饲料。',{x:p.x,y:p.y});
    else if(this.tool==='rain'){this._command('rain',{x:p.x,y:p.y,manual:true});}
    else if(this.tool==='wind'){this.setWind(.85);this.windHold=this.time+.3;this._releaseSeeds(4);}
    else if(this.tool==='tide'){this.tideStart={y:p.y,value:this.tide};this._ripple(p.x,p.y);}
  }
  _move(e) {
    const p=this._position(e),dx=p.x-this.mouse.x,dy=p.y-this.mouse.y;
    if(Math.hypot(dx,dy)>1)this.mouse.since=this.time;
    this.mouse.dx=clamp(dx,-15,15);this.mouse.x=p.x;this.mouse.y=p.y;
    if(this.mouse.down&&this.dragCloud&&this.rainDragOffset)this._moveRainTarget(p.x-this.rainDragOffset.x,p.y-this.rainDragOffset.y+RAIN_ALTITUDE);
    else if(this.mouse.down&&this.tool==='rain'&&this.rainSource?.manual)this._moveRainTarget(p.x,p.y);
    if(this.mouse.down&&this.tool==='wind'){this.setWind(clamp(.5+Math.abs(dx)*.06));this.windHold=this.time+.3;}
    if(this.mouse.down&&this.tool==='tide'&&this.tideStart)this.setTide(this.tideStart.value+(this.tideStart.y-p.y)/130);
    if(!this.mouse.down&&['explore','rain'].includes(this.tool))this.canvas.style.cursor=this._rainCloudHit(p.x,p.y)?'grab':this.tool==='rain'?'crosshair':Object.values(this.scene.props).some(s=>Math.abs(p.x-s.x)<23&&p.y>s.y-48&&p.y<s.y+7)?'pointer':!this.desktopMode&&this.clouds.some(c=>Math.abs(p.x-c.x)<45*c.w&&Math.abs(p.y-c.y)<20*c.w)?'grab':'default';
  }
  _up() { this.mouse.down=false;this._stopManualRain();this.tideStart=null;if(this.tool==='wind')this.setWind(0,'manual');const pointerId=this.pointerId;this.pointerId=null;if(pointerId!==null&&pointerId!==undefined&&this.canvas.hasPointerCapture?.(pointerId))this.canvas.releasePointerCapture?.(pointerId); }
  _land(x,y) { const polygon=this.art?.active?this.scene.land:LAND;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside; }
  _pond(x,y) { return this.art?.active?inPolygon(x,y,this.scene.pond):((x-450)/52)**2+((y-280)/27)**2<1; }
  _swimmable(x,y) { return this._pond(x,y)&&(!this.art.active||!this.scene.bakedLilies.some(o=>((x-o.x)/o.radiusX)**2+((y-o.y)/o.radiusY)**2<1)); }
  _walkable(x,y) {
    if(!this._land(x,y)||this._pond(x,y))return false;
    if(this.art.active){if(this.scene.obstacles.some(o=>((x-o.x)/o.radiusX)**2+((y-o.y)/o.radiusY)**2<1))return false;if(this.scene.decor.some(d=>Math.hypot(x-d.x,(y-d.y)*1.4)<9))return false;if(Object.values(this.scene.props).some(s=>Math.abs(x-s.x)<15&&Math.abs(y-s.y)<8))return false;return true;}
    return ![[137,222,10],[203,218,8],[516,249,8]].some(([tx,ty,r])=>Math.hypot(x-tx,y-ty)<r);
  }
  _plantable(x,y,speciesId=null) {
    if(canonicalSpecies(speciesId)==='waterlily')return this._swimmable(x,y);
    return this._walkable(x,y)&&!this._path(x,y)&&(!this.art.active?!(x>389&&x<457&&y<239):[[3,0],[-3,0],[0,3],[0,-3]].every(([dx,dy])=>this._land(x+dx,y+dy)&&!this._pond(x+dx,y+dy)));
  }
  _path(x,y) {
    if(!this.art?.active)return (x>356&&x<393&&y>220&&y<305)||(x>306&&x<386&&y>290&&y<316);
    return this.scene.path.some((a,i,points)=>{if(!i)return false;const b=points[i-1],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<this.scene.pathHalfWidth;});
  }
  _water(x,y) { return (!this.desktopMode&&y>190&&!this._land(x,y))||this._pond(x,y); }
  _plant(x,y,quiet=false,speciesId=null) {
    const species=canonicalSpecies(speciesId);if(species&&!SPECIES.includes(species)){if(!quiet)this._emit('hint','这颗种子的素材暂未接入，请换一种试试。');return false;}
    if(!this._plantable(x,y,species)){if(!quiet)this._emit('hint',species==='waterlily'?'睡莲喜欢水，把它种在池塘里。':this.art.active?'把种子放在岛屿中间的种植草地上。':'把种子放在草地上，它就会留下来。');return false;}
    if(this.flowers.some(f=>Math.hypot(f.x-x,f.y-y)<9)){if(!quiet)this._emit('hint','给小苗留一点距离，换一块旁边的空地吧。');return false;}
    if(this.flowers.length>=220){if(!quiet)this._emit('hint','花园已经很茂盛了，给小动物留一点空地吧。');return false;}
    this.flowers.push(this._makePlant(x,y,Math.floor(this._rand()*6),.015,species));
    this._petals(x,y-2,7,'#e7ecaa');if(!quiet)this._emit('seed','一颗小种子，正在慢慢长大。');return true;
  }
  _animalCanStand(animal,x,y) {
    const valid=animal.type==='duck'?(x,y)=>this._swimmable(x,y):(x,y)=>this._walkable(x,y),margin=animal.type==='duck'?1:1.5;
    return valid(x,y)&&[[margin,0],[-margin,0],[0,margin],[0,-margin]].every(([dx,dy])=>valid(x+dx,y+dy));
  }
  _stopAnimal(animal,state='idle',wait=2) { const motion=animal.motion||resetAnimalMotion(animal);motion.route=[];motion.vx=motion.vy=0;motion.turnTime=0;motion.gaitActive=false;animal.targetX=animal.x;animal.targetY=animal.y;animal.state=state;animal.stateAge=0;animal.wait=wait; }
  _routeAnimal(animal,target,state='walk') {
    const motion=animal.motion||resetAnimalMotion(animal),allowed=(x,y)=>this._animalCanStand(animal,x,y);
    const route=findAnimalRoute(animal,target,allowed,{cell:animal.type==='duck'?3:5,bounds:this.art.active?this.scene.viewBounds:{x:0,y:0,width:W,height:H}});
    if(!route.length)return false;
    if(!motion.gaitActive){motion.gaitStartTravel=motion.travel;motion.gaitActive=true;}
    motion.route=route;motion.blocked=0;animal.targetX=target.x;animal.targetY=target.y;animal.routeState=state;animal.state=state;animal.stateAge=0;animal.wait=0;return true;
  }
  _foodSeat(animal,food,index) {
    const angles=[Math.PI,0,-Math.PI/2,-Math.PI/3,Math.PI/3],angle=angles[index%angles.length];
    for(const radius of [19,24,14])for(const offset of [0,.3,-.3,.6,-.6]){const p={x:food.x+Math.cos(angle+offset)*radius,y:food.y+Math.sin(angle+offset)*radius*.65};if(this._animalCanStand(animal,p.x,p.y)&&this.animals.every(other=>other===animal||other.foodId!==food.id||!other.foodSeat||distance(p,other.foodSeat)>11))return p;}
    return this._animalCanStand(animal,food.x,food.y)?{x:food.x,y:food.y}:null;
  }
  _feed(x,y,options={}) {
    if(!this._walkable(x,y)){const p=this.art.active?this.scene.spawns['food.default']:{x:364,y:278};x=p.x;y=p.y;}
    const food={id:`food-${this._foodId++}`,x,y,life:22,preview:options.source==='preview'||options.preview===true};this.food.push(food);this._emit('food','留下几粒点心，小动物正在靠近。');
    this.animals.filter(a=>a.type!=='duck').forEach((animal,index)=>{const seat=this._foodSeat(animal,food,index);if(seat&&this._routeAnimal(animal,seat,'approach')){animal.foodId=food.id;animal.foodSeat=seat;}});
  }

  _ripple(x,y,{small=false}={}) {
    if(!this._water(x,y))return;
    // Nearby raindrops share a quiet surface response instead of stacking white rings.
    if(small&&this.ripples.some(r=>r.small&&r.age<.2&&Math.abs(r.x-x)<7&&Math.abs(r.y-y)<4))return;
    this.ripples.push({x,y,age:0,life:small?.5:1.65,size:small?2.5+this._rand()*1.6:10+this._rand()*6,pond:this._pond(x,y),small});
    const smallRipples=this.ripples.filter(r=>r.small);if(smallRipples.length>12)this.ripples.splice(this.ripples.indexOf(smallRipples[0]),1);
    if(this.ripples.length>32)this.ripples.shift();
  }
  _heart(x,y) { this.particles.push({kind:'heart',x,y,vx:0,vy:-9,life:1.8,max:1.8}); }
  _petals(x,y,n,color) { for(let i=0;i<n;i++)this.particles.push({kind:'petal',x,y,vx:(this._rand()-.5)*24,vy:-10-this._rand()*20,life:1+this._rand(),max:2,color:color||['#eaaeb1','#f1d889','#d1c6dc'][i%3]}); }
  _releaseSeeds(count=2) { const stems=this.flowers.filter(f=>f.type===4&&f.growth>.7&&!f.seeded);for(let i=0;i<Math.min(count,stems.length);i++){const f=stems[i];f.seeded=true;f.regrow=this.time+15;this.flyingSeeds.push({x:f.x,y:f.y-20,vx:9+this._rand()*10,vy:-15-this._rand()*14,age:0,life:4+this._rand()*3,p:this._rand()*TAU});} }

  _update(dt) {
    this.time+=dt;
    this.nightMix=lerp(this.nightMix,this.night?1:0,Math.min(1,dt*.7));
    this.tideCurrent=lerp(this.tideCurrent,this.tide,dt*.9);
    if(this.mouse.down&&this.tool==='wind')this.setWind(.8,'manual');
    for(const [source,input] of this.windSources){const hold=source==='microphone'?0:(this.windHold||0);if(this.time>input.time+.45&&this.time>hold)input.value*=Math.pow(.12,dt);}
    this.windTarget=Math.max(0,...Array.from(this.windSources.values(),input=>input.value));
    this.wind=lerp(this.wind,this.windTarget,dt*5);
    if(this.wind>.65&&this.time-(this.lastSeedRelease||0)>1.2){this._releaseSeeds(2);this.lastSeedRelease=this.time;}
    this.mouse.dx*=Math.pow(.01,dt);
    this.clouds.forEach((c,i)=>{if(c!==this.dragCloud){c.x+=dt*(.6+this.wind*5)*(i%2?1:-1);if(c.x<-55)c.x=695;if(c.x>695)c.x=-55;}});
    if(this._rainActive()&&this.time-this.lastRain>.075){this.lastRain=this.time;this._spawnRainDrops(2);}
    if(this.time<(this.visualRainUntil||0)&&this.time-(this.lastVisualRain||0)>.075){
      this.lastVisualRain=this.time;const target=this.scene.keyboardRain;
      this.visualRainCloud={x:target.x,y:target.y-RAIN_ALTITUDE,w:1.3};
      this._spawnRainDrops(Math.ceil(1+(this.visualRainIntensity||.3)*3),{...target,radiusX:90,radiusY:40},this.visualRainCloud,{waters:false});
    }
    for(const f of this.flowers){const before=f.stage??Math.min(4,Math.floor(f.growth*5));let speed=.000025;if(this.time<(f.rainBoostUntil||0))speed=.008;else if((f.water||0)>0){f.water=Math.max(0,f.water-dt);speed=.00025;}if(f.demoPlant&&this.demoMode)speed=this._demoManualStage?0:.11;f.growth=f.growthProgress=Math.min(1,(f.growthProgress??f.growth??0)+dt*speed);f.stage=Math.min(4,Math.floor(f.growthProgress*5));if(f.stage!==before){this._petals(f.x,f.y-10,5,'#f0e4a4');this._emit('growth',f.demoPlant?`演示花苗 · 第 ${f.stage+1} 阶段`:'你照顾的小苗，长出了新的模样。',{plantId:f.id,stage:f.stage,realAsset:this.art.sprites.has(`plant.${f.speciesId}.${f.stage}`)});}if(f.seeded&&this.time>f.regrow)f.seeded=false;}
    this.ripples=this.ripples.filter(r=>(r.age+=dt)<r.life);
    this.particles=this.particles.filter(p=>{
      p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.kind==='rain'&&Number.isFinite(p.landingY)&&p.y>=p.landingY){p.x=p.landingX;p.y=p.landingY;this._rainImpact(p);return false;}
      if(p.kind==='petal'){p.vy+=dt*12;p.x+=Math.sin(this.time*3+p.y)*dt*3+this.wind*dt*20;}
      return p.life>0;
    });
    if(this.rainImpactParticles.length){this.particles.push(...this.rainImpactParticles);this.rainImpactParticles.length=0;}
    this.flyingSeeds=this.flyingSeeds.filter(s=>{
      s.age+=dt;s.x+=(s.vx+this.wind*27)*dt;s.y+=(s.vy+Math.sin(this.time*2+s.p)*5)*dt;s.vy+=dt*9;
      if(s.age>s.life||s.y>(this.art.active?this.scene.meadowBounds.y+this.scene.meadowBounds.height:340)){if(this.art.active){if(this._plantable(s.x,s.y))this._plant(s.x,s.y,true);}else this._plant(clamp(s.x,100,530),clamp(s.y,240,335),true);return false;}return s.x<W+10;
    });
    this.food=this.food.filter(f=>(f.life-=dt)>0);
    this._stepAnimals(dt);
    this.butterflies.forEach((b,i)=>{
      const resting=this.time-this.mouse.since>2.5&&this._land(this.mouse.x,this.mouse.y)&&i===0;
      const tx=resting?this.mouse.x:(this.art.active?this.scene.ambient.x:250)+Math.sin(this.time*.22+i*1.1)*(this.art.active?this.scene.ambient.radiusX:155);
      const ty=resting?this.mouse.y-5:(this.art.active?this.scene.ambient.y:240)+Math.sin(this.time*.3+i*2.4)*(this.art.active?this.scene.ambient.radiusY:45);
      b.x+=clamp(tx-b.x,-30,30)*dt;b.y+=clamp(ty-b.y,-20,20)*dt;b.rest=resting&&Math.abs(tx-b.x)<4?1:0;
      if(b.rest&&!this.butterflyRested){this.butterflyRested=true;this._emit('butterfly','安静一会儿，蝴蝶也愿意为你停留。');}
      if(!resting)this.butterflyRested=false;
    });
    if(this.particles.length>360)this.particles.splice(0,this.particles.length-360);if(this.flyingSeeds.length>40)this.flyingSeeds.splice(0,this.flyingSeeds.length-40);
    if(this.time-this.changeTime>1){this.changeTime=this.time;this.onChange(this.getStats());}
  }

  _stepAnimals(dt) {
    const speeds={cat:11,dog:17,bird:19,squirrel:19,rabbit:15,duck:4.8},strides={cat:9,dog:11,bird:7,squirrel:8,rabbit:10,duck:9};
    for(const [index,a] of this.animals.entries()){
      a.phase=(a.phase||0)+dt;a.stateAge=(a.stateAge||0)+dt;a.wait=Math.max(0,(a.wait||0)-dt);
      const motion=a.motion||resetAnimalMotion(a),allowed=(x,y)=>this._animalCanStand(a,x,y);
      const intent=this._animalIntent?.(a,dt);
      if(intent){
        a.foodId=null;a.foodSeat=null;
        if(intent.hold){this._stopAnimal(a,intent.state||'observe',0);a.hop=intent.hop||0;continue;}
        const target=intent.target;
        if(target&&(distance(a,target)>.7)&&(!motion.route.length||Math.hypot(target.x-a.targetX,target.y-a.targetY)>6)&&this.time>=(a.nextIntentRoute||0)){
          a.nextIntentRoute=this.time+.25;
          if(!this._routeAnimal(a,target,'walk'))this._stopAnimal(a,'observe',0);
        }
        this._advanceAnimalStep(a,dt,allowed,{speed:intent.speed||speeds[a.type]||12,stride:strides[a.type]||9,intent});
        continue;
      }
      let food=a.type==='duck'?null:this.food.find(f=>f.id===a.foodId&&f.life>0);
      if(!food&&a.foodId){a.foodId=null;a.foodSeat=null;this._stopAnimal(a,'observe',.5);}
      const atSeat=food&&a.foodSeat&&distance(a,a.foodSeat)<.65&&distance(a,food)<29&&segmentClear(a,a.foodSeat,allowed);
      if(atSeat){
        const look=food.x-a.x,face=Math.abs(look)>3?(look<0?-1:1):a.dir;
        if(face!==a.dir){motion.foodTurnTime=(motion.foodTurnTime||.16)-dt;motion.vx=motion.vy=0;a.state='turn';if(motion.foodTurnTime<=0){a.dir=face;motion.foodTurnTime=0;}continue;}
        if(!['eat','carry'].includes(a.state))this._stopAnimal(a,a.type==='squirrel'?'carry':'eat',.4);
        food.life-=dt*.9;a.wait=.4;a.hop=lerp(a.hop||0,0,Math.min(1,dt*12));a.flight=lerp(a.flight||0,0,Math.min(1,dt*12));
        const dx=food.x-a.x;if(Math.abs(dx)>3)a.dir=dx<0?-1:1;
        if(!food.preview&&this.time-(a.lastHeart||0)>2.5){this._heart(a.x,a.y-30);a.lastHeart=this.time;a.bond=(a.bond||0)+1;if(!food.counted){this.visitors++;food.counted=true;this._emit('friend','一份小点心，让你们更熟悉了。');}}
        continue;
      }
      if(a.wait>0){a.hop=lerp(a.hop||0,0,Math.min(1,dt*12));a.flight=lerp(a.flight||0,0,Math.min(1,dt*12));continue;}
      if(!motion.route.length){
        if(food&&a.foodSeat){if(!this._routeAnimal(a,a.foodSeat,'approach')){this._stopAnimal(a,'observe',1);continue;}}
        else {
          food=a.type==='duck'?null:this.food.find(f=>f.life>2);
          const seat=food?this._foodSeat(a,food,index):null;
          if(seat&&this._routeAnimal(a,seat,'approach')){a.foodId=food.id;a.foodSeat=seat;}
          else {
            const radius={cat:30,dog:35,bird:40,squirrel:25,rabbit:27,duck:16}[a.type]||25;
            let planned=false;
            for(let attempt=0;attempt<16;attempt++){const p={x:a.homeX+(this._rand()-.5)*radius*2,y:a.homeY+(this._rand()-.5)*radius};if(distance(a,p)>7&&allowed(p.x,p.y)&&this._routeAnimal(a,p,'walk')){planned=true;break;}}
            if(!planned){this._stopAnimal(a,'observe',1+this._rand());continue;}
          }
        }
      }
      this._advanceAnimalStep(a,dt,allowed,{speed:speeds[a.type]||12,stride:strides[a.type]||9});
    }
  }
  _advanceAnimalStep(a,dt,allowed,{speed,stride,intent=null}) {
      const motion=a.motion||resetAnimalMotion(a),move=advanceAnimalMotion(a,dt,allowed,{speed,stride});
      if(move.blocked){
        const target={x:a.targetX,y:a.targetY};motion.route=[];
        if(!this._routeAnimal(a,target,a.routeState||'walk'))this._stopAnimal(a,'observe',.8);
        return;
      }
      if(move.turning){a.state='turn';a.hop=lerp(a.hop||0,0,Math.min(1,dt*12));return;}
      if(move.arrived){
        if(a.foodId){a.state='approach';return;}
        this._stopAnimal(a,intent?.state||(a.type==='cat'&&this._rand()<.5?'rest':a.type==='bird'?'perch':a.type==='squirrel'?'observe':'idle'),intent?0:(a.type==='cat'?2.5:1)+this._rand()*3.5);
      }else if(move.moving){
        a.state=a.routeState||'walk';const cycle=move.cycle||0;
        a.hop=a.type==='rabbit'?Math.max(0,Math.sin(cycle))*1.8:a.type==='bird'?Math.max(0,Math.sin(cycle))*1.5:0;
        a.flight=0;
        if(a.type==='duck'&&this.time-(a.lastWake||0)>.55){this._ripple(a.x-a.dir*5,a.y+2,{small:true});a.lastWake=this.time;}
      }
  }

  _rect(x,y,w,h,color) { if(color)this.g.fillStyle=color;this.g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h)); }
  _poly(points,color,dx=0,dy=0) { const g=this.g;g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x+dx),Math.round(y+dy)):g.moveTo(Math.round(x+dx),Math.round(y+dy)));g.closePath();g.fill(); }
  _ellipse(x,y,rx,ry,color) { this.g.fillStyle=color;for(let yy=-Math.ceil(ry);yy<=ry;yy++){const span=Math.sqrt(Math.max(0,1-yy*yy/(ry*ry)))*rx;this.g.fillRect(Math.round(x-span),Math.round(y+yy),Math.max(1,Math.round(span*2)),1);} }
  _line(x1,y1,x2,y2,color,width=1) { const dx=x2-x1,dy=y2-y1,steps=Math.max(Math.abs(dx),Math.abs(dy));this.g.fillStyle=color;for(let s=0;s<=steps;s++)this.g.fillRect(Math.round(x1+dx*(s/(steps||1))),Math.round(y1+dy*(s/(steps||1))),width,width); }
  _colors() { const p={};for(const key of Object.keys(DAY))p[key]=blend(DAY[key],NIGHT[key],this.nightMix);return p; }

  _draw() {
    const g=this.g,p=this._colors(),t=this.time,n=this.nightMix;
    g.clearRect(0,0,this.surface.width,H);g.save();g.translate(this.extension||0,0);
    if(!this.desktopMode){
    const sky=g.createLinearGradient(0,0,0,205);sky.addColorStop(0,p.sky);sky.addColorStop(1,p.skyBottom);g.fillStyle=sky;g.fillRect(-this.extension,0,W+this.extension*2,H);
    // A soft, deliberately pixelated halo around the sun / moon.
    if(!this.sunAway&&!this.parallelSunAway){const sun=this.sun||{x:505,y:70};
    g.globalAlpha=.09;this._ellipse(sun.x,sun.y,55,52,n>.5?'#e9dca4':'#fff2c4');g.globalAlpha=.16;this._ellipse(sun.x,sun.y,37,35,'#fff0bd');g.globalAlpha=1;
    this._ellipse(sun.x,sun.y,20,20,blend('#f6df9e','#f2e7bd',n));
    if(n>.05){g.globalAlpha=n;this._ellipse(sun.x+8,sun.y-7,17,18,p.sky);g.globalAlpha=1;}}
    for(const s of this.stars){if(n<.02)break;g.globalAlpha=n*(.3+Math.sin(t*.6+s.phase)*.2+s.s*.3);this._rect(s.x,s.y,s.s>.7?2:1,1,'#f2e7c0');if(s.s>.9)this._rect(s.x,s.y-1,1,3,'#f2e7c0');}g.globalAlpha=1;
    // Layered distant landscape keeps the scene grounded, quiet and spacious.
    this._poly([[-this.extension,166],[32,155],[62,158],[95,145],[126,158],[150,149],[183,166],[216,162],[251,171],[284,161],[324,170],[359,156],[397,167],[430,157],[463,166],[492,153],[525,160],[552,151],[588,157],[613,145],[640+this.extension,157],[640+this.extension,221],[-this.extension,221]],blend('#a7beb0','#535c76',n));
    this._poly([[-this.extension,179],[29,168],[52,181],[85,169],[117,185],[144,172],[176,182],[210,174],[246,186],[283,178],[324,183],[360,170],[399,181],[437,172],[469,184],[503,172],[544,184],[583,170],[615,181],[640+this.extension,174],[640+this.extension,220],[-this.extension,220]],blend('#95b7a2','#465c71',n));
    }
    if(!this.desktopMode||!this.art.active)this._drawWater(p);
    if(!this.desktopMode)this.clouds.forEach(c=>this._drawCloud(c,p,c===this.dragCloud));
    if(!this.desktopMode)this._drawBirds(p);
    this._drawLand(p);
    this._drawRipples(p);
    // Render tall scenery and inhabitants by foot position for believable overlap.
    const objects=this.art.active?[...this.scene.decor.map(d=>({y:d.y,draw:()=>this._tree(d.x,d.y,1,d.phase,p,d)})),{y:this.scene.props.compost.y,draw:()=>this._compost(p)},{y:this.scene.props.windmill.y,draw:()=>this._windmill(p)},{y:this.scene.props.focus.y,draw:()=>this._bench(this.scene.props.focus.x,this.scene.props.focus.y,p)}]:[{y:222,draw:()=>this._tree(137,222,1.13,0,p)},{y:218,draw:()=>this._tree(203,218,.8,2,p)},{y:241,draw:()=>this._cottage(409,237,p)},{y:249,draw:()=>this._tree(516,249,.78,5,p)}];
    for(const flower of this.flowers)objects.push({y:flower.y,draw:()=>this._flower(flower,p)});
    for(const animal of this.animals)objects.push({y:animal.y,draw:()=>this._animal(animal,p)});
    for(const grass of this.grass)if(!this.art.active||this._plantable(grass.x,grass.y))objects.push({y:grass.y,draw:()=>this._grass(grass,p)});
    if(!this.art.active)objects.push({y:328,draw:()=>this._bench(392,321,p)},{y:246,draw:()=>this._sign(301,241,p)},{y:350,draw:()=>this._tree(89,350,.63,8,p)});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    this._drawParticles(p);
    for(const b of this.butterflies)if(n<.9)this._butterfly(b,1-n*.8);
    if(n>.05)this._drawFireflies(n);
    this._drawWind(p);
    // The interactive weather cloud is always above terrain and tree canopies.
    if(this._rainCloudVisible()){g.save();if(!this._rainActive())g.globalAlpha=clamp((this.rainCloudVisibleUntil-this.time)/.55);this._drawCloud(this.rainCloud,p,true);g.restore();}
    if(!this._rainCloudVisible()&&this.time<(this.visualRainUntil||0)&&this.visualRainCloud)this._drawCloud(this.visualRainCloud,p,true);
    this._drawCursor(p);
    // Low-resolution art is scaled in one pass, without smoothing.
    g.restore();this.ctx.imageSmoothingEnabled=false;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    if(!this.desktopMode){this.ctx.fillStyle=p.sky;this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);}
    this.ctx.drawImage(this.surface,Math.round(this.offsetX-this.extension*this.scale),Math.round(this.offsetY),Math.round(this.surface.width*this.scale),Math.round(H*this.scale));
  }

  _drawWater(p) {
    const g=this.g,t=this.time,n=this.nightMix;
    if(this.desktopMode){this._ellipse(324,323,255,64,p.waterDark);this._ellipse(324,319,254,61,p.water);g.save();g.beginPath();g.ellipse(324,319,254,61,0,0,TAU);g.clip();}
    else {const water=g.createLinearGradient(0,190,0,400);water.addColorStop(0,p.water);water.addColorStop(1,p.waterDark);g.fillStyle=water;g.fillRect(-this.extension,189,W+this.extension*2,211);}
    g.globalAlpha=.25;for(let i=0;i<22;i++){const y=203+i*8;const width=18+i*2;this._rect(505-width/2+Math.sin(i*4+t*.6)*8,y,width,1,blend('#f3e8b7','#c2cfbb',n));}g.globalAlpha=1;
    for(let i=0;i<84;i++){const x=(i*89+Math.sin(t*.24+i)*8)%650,y=198+(i*37)%199;g.globalAlpha=.16+(Math.sin(t*1.2+i*2)*.5+.5)*.22;this._rect(x,y,4+i%12,1,p.wave);if(i%4===0)this._rect(x+3,y+2,2,1,p.wave);}g.globalAlpha=1;
    this._ellipse(328,352,230,23,blend('#679ca0','#253a5f',n));
    if(this.desktopMode)g.restore();
  }

  _drawLand(p) {
    if(this.art.active){this._drawArtLand(p);return;}
    const g=this.g,n=this.nightMix;
    this._poly(LAND,p.cliff,0,17);
    this._poly(LAND,p.soil,0,10);
    // Chunky stone seams at the island's exposed front face.
    for(let i=0;i<13;i++){const x=113+i*32,y=345+Math.sin((i/12)*Math.PI)*24;this._rect(x,y,13,3,blend('#93795f','#49434e',n));this._rect(x+7,y-3,4,3,blend('#c5a47b','#77646a',n));}
    this._poly(LAND,p.grassDark,0,3);
    this._poly(LAND,p.grass);
    // Short chunky grass rim, little light blocks along the bank.
    for(let i=1;i<LAND.length-1;i++){const a=LAND[i];if(a[1]>285)this._rect(a[0],a[1]-2,7,3,p.grassLight);}
    for(const bit of this.texture){g.globalAlpha=bit.v>.5?.23:.15;this._rect(bit.x,bit.y,bit.s+1,1,bit.v>.5?p.grassLight:p.grassDark);}g.globalAlpha=1;
    // A narrow ochre walk winds from the cottage into the wildflower meadow.
    this._poly([[388,229],[407,235],[390,263],[389,290],[367,308],[325,319],[313,310],[350,299],[369,283],[370,259]],p.soil);
    this._poly([[392,233],[400,237],[383,265],[382,287],[362,302],[324,314],[321,311],[355,301],[375,282],[376,260]],p.sand);
    for(let i=0;i<16;i++){const x=375+Math.sin(i*2)*7,y=245+i*3;this._rect(x,y,2,1,p.soil);}
    // Crescent-shaped pond with a stepped pixel shore.
    this._ellipse(450,281,55,29,p.grassDark);this._ellipse(450,279,52,27,p.sand);this._ellipse(451,279,48,23,p.waterDark);this._ellipse(452,276,45,20,p.water);
    this._rect(425,260,25,2,p.wave);this._rect(409,278,6,1,p.wave);this._rect(477,282,12,1,p.wave);this._rect(430,294,20,1,p.wave);
    this._lily(425,280,p);this._lily(471,267,p);this._lily(461,292,p);
    // The tide reveals a warm sandy beach, with shells when the water recedes.
    const tide=this.tideCurrent;
    this._poly([[504,302],[550,289],[558,308],[526,329],[483,348],[448,351],[460,337]],p.sand);
    this._poly([[543,316-tide*15],[565,293],[566,320],[526,344],[479,360],[447,359],[472,348-tide*7],[509,335-tide*10]],p.water);
    this._poly([[543,316-tide*15],[559,302],[556,306],[543,319-tide*15],[510,338-tide*10],[471,351-tide*7],[461,351-tide*7],[507,335-tide*10]],p.wave);
    for(const pebble of this.pebbles)if(pebble.y<335-tide*13){this._rect(pebble.x,pebble.y,pebble.s,2,p.soil);this._rect(pebble.x+1,pebble.y-1,pebble.s-1,1,p.sand);}
    if(tide<.55){this._shell(500,330,p);this._shell(527,313,p);}
    this._reeds(408,289,p);this._reeds(484,298,p);this._reeds(499,269,p);
    // A little wooden crossing and a red watering can near the garden.
    this._rect(346,284,41,6,blend('#8d765a','#665362',n));for(let i=0;i<7;i++)this._rect(347+i*6,282,4,7,blend('#d3ac76','#a38b8a',n));
    this._rect(285,310,7,6,blend('#c97b68','#92687b',n));this._rect(283,310,2,3,blend('#c97b68','#92687b',n));this._line(292,310,298,307,blend('#c97b68','#92687b',n),2);this._rect(287,307,4,1,p.soil);
    for(const f of this.food){this._ellipse(f.x,f.y,7,3,blend('#92ac6d','#516655',n));this._rect(f.x-3,f.y-1,2,2,'#dbb16d');this._rect(f.x+2,f.y,2,2,'#ecc47e');this._rect(f.x,f.y-3,2,2,'#d19c61');}
  }

  _drawArtLand(p) {
    const r=this.scene.worldRect;this._sprite('island.pond',r.x,r.y,r.width,r.height,{anchor:[0,0]});
    // Local highlights remain inside the artist's pond. No rectangular water plane.
    const g=this.g;g.save();this._clipPond();g.globalAlpha=.35;for(let i=0;i<7;i++){const q=this.scene.pond[(i*5)%this.scene.pond.length],x=q[0]+Math.sin(this.time*.5+i)*3,y=q[1]+3+this.tideCurrent*2;this._rect(x,y,5+i%3*3,1,p.wave);}g.restore();
    for(const food of this.food){this._ellipse(food.x,food.y,8,3,'rgba(52,75,30,.25)');this._rect(food.x-4,food.y-1,3,2,'#ecc47e');this._rect(food.x+2,food.y,2,2,'#b7804d');this._rect(food.x-1,food.y-4,2,2,'#d7b06a');}
    if(this.demoMode&&this.demoPlant){const f=this.demoPlant;g.globalAlpha=.55;this._ellipse(f.x,f.y+2,21,5,'#f7e7aa');g.globalAlpha=1;}
  }

  _compost(p) {
    const {x,y}=this.scene.props.compost,n=this.nightMix,g=this.g;const hover=Math.abs(this.mouse.x-x)<23&&this.mouse.y>y-28&&this.mouse.y<y+6;
    this._ellipse(x,y+2,20,5,'rgba(35,55,25,.22)');this._rect(x-17,y-23,34,23,blend('#946a42','#71586b',n));
    this._rect(x-14,y-21,28,18,blend('#bb8b54','#967381',n));for(let i=0;i<4;i++)this._rect(x-14,y-20+i*5,28,1,blend('#84603f','#665064',n));this._rect(x-18,y-25,36,4,blend('#d2a76a','#ac8b8d',n));this._rect(x-14,y-26,28,2,blend('#5e763a','#51624c',n));
    this._rect(x-2,y-18,4,10,'#d7d596');this._rect(x-6,y-15,12,3,'#d7d596');this._rect(x-7,y-13,4,3,p.treeDark);this._rect(x+4,y-18,3,3,p.treeDark);
    if(hover){g.globalAlpha=.3;this._ellipse(x,y+1,24,6,'#f5e4a9');g.globalAlpha=1;}
  }
  _windmill(p) {
    const {x,y}=this.scene.props.windmill,n=this.nightMix,g=this.g;this._ellipse(x,y+1,15,4,'rgba(35,55,25,.20)');
    this._poly([[x-9,y],[x-6,y-34],[x+6,y-34],[x+11,y]],blend('#cfb584','#a39194',n));this._rect(x-3,y-14,6,14,p.trunk);this._poly([[x-10,y-33],[x,y-43],[x+11,y-33]],blend('#9b7056','#79596d',n));
    const cy=y-32,angle=this.time*(.15+this.wind*4);for(let i=0;i<4;i++){const a=angle+i*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),nx=-dy,ny=dx;this._line(x,cy,x+dx*22,cy+dy*22,p.trunk,2);this._poly([[x+dx*6+nx*2,cy+dy*6+ny*2],[x+dx*23+nx*2,cy+dy*23+ny*2],[x+dx*23+nx*7,cy+dy*23+ny*7],[x+dx*8+nx*5,cy+dy*8+ny*5]],blend('#e8d8ac','#c1b1b5',n));}this._rect(x-2,cy-2,5,5,blend('#8d6952','#76566d',n));
  }

  _tree(x,y,s,phase,p,decor=null) {
    if(this.art.active){const sway=Math.round(Math.sin(this.time*1.1+phase)*(.4+this.wind*1.5));if(this._sprite(phase===2?'decor.pine':'decor.apple',x+sway,y,decor?.width||(phase===2?62:69),decor?.height||(phase===2?88:84)))return;}
    const g=this.g,n=this.nightMix,sway=Math.sin(this.time*1.2+phase)*(.7+this.wind*3.8);
    g.save();g.translate(Math.round(x),Math.round(y));g.scale(s,s);
    g.globalAlpha=.17;this._ellipse(2,2,29,7,'#315944');g.globalAlpha=1;
    this._rect(-5,-44,10,44,p.trunk);this._rect(-2,-44,3,43,blend('#b28c67','#8b7370',n));this._rect(-8,-3,15,4,p.trunk);
    this._line(-2,-24,-20,-43,p.trunk,4);this._line(2,-31,19,-49,p.trunk,4);
    const clusters=[[-25,-54,19,14],[-13,-70,22,17],[12,-74,21,17],[30,-58,16,14],[4,-51,31,19],[-8,-85,18,13],[14,-87,14,11]];
    for(const [cx,cy,rx,ry] of clusters){const ax=cx+sway*(1+(cy+45)/-90);this._pixelPuff(ax,cy,rx,ry,p.treeDark);this._pixelPuff(ax-2,cy-4,rx-2,ry-3,p.tree);}
    [[-23,-63,16,4],[-7,-80,16,5],[16,-81,12,3],[26,-62,12,4],[-4,-59,15,4],[4,-95,9,3],[-32,-54,9,3]].forEach(([a,b,c,d])=>this._rect(a+sway,b,c,d,p.treeLight));
    for(let i=0;i<9;i++){const bx=Math.sin(i*17+phase)*29,by=-57-(i*7)%34;this._rect(bx+sway,by,3,3,blend('#cccf80','#8b967a',n));}
    if(phase===0){this._rect(16+sway,-45,3,4,blend('#dc9880','#b88392',n));this._rect(-20+sway,-58,3,4,blend('#dc9880','#b88392',n));}
    g.restore();
  }
  _pixelPuff(x,y,rx,ry,color) { this._rect(x-rx+5,y-ry,rx*2-10,ry*2,color);this._rect(x-rx,y-ry+5,rx*2,ry*2-10,color);this._rect(x-rx+2,y-ry+2,rx*2-4,ry*2-4,color); }
  _cottage(x,y,p) {
    const n=this.nightMix,t=this.time,g=this.g;
    g.globalAlpha=.18;this._ellipse(x+6,y+3,42,9,'#4a634e');g.globalAlpha=1;
    this._rect(x-28,y-48,57,48,blend('#e6c79a','#c1a195',n));this._rect(x+17,y-44,14,44,blend('#c8aa82','#9f8790',n));
    this._rect(x-29,y-4,60,5,blend('#a28664','#796779',n));
    this._poly([[x-38,y-46],[x-5,y-76],[x+10,y-76],[x+42,y-46]],blend('#785f59','#50485d',n));
    this._poly([[x-34,y-48],[x-5,y-73],[x+9,y-73],[x+37,y-48]],blend('#bb7966','#8e6478',n));
    for(let row=0;row<5;row++){const yy=y-69+row*5,half=9+row*5;this._rect(x+2-half,yy,half*2,1,blend('#d18e72','#a77886',n));for(let c=0;c<row+2;c++)this._rect(x+2-half+c*10+row%2*3,yy+1,1,4,blend('#9a6b5e','#75586d',n));}
    this._rect(x+19,y-76,8,17,blend('#a3816d','#766375',n));this._rect(x+18,y-77,10,3,blend('#d1ac88','#9c8a95',n));
    for(let i=0;i<3;i++){g.globalAlpha=.25-i*.06;const sy=y-88-i*8-((t*4)%8),sx=x+22+Math.sin(t*.6+i)*4+this.wind*i*5;this._pixelPuff(sx,sy,4+i,3+i,p.skyBottom);}g.globalAlpha=1;
    this._rect(x-8,y-25,16,25,blend('#9d8064','#6f6177',n));this._rect(x-5,y-23,10,22,blend('#bb9971','#a28a88',n));this._rect(x+2,y-12,2,2,'#eedba7');
    const glow=blend('#9bbdb0','#f8d58d',n);
    this._rect(x-25,y-34,13,14,blend('#8c755d','#6c6172',n));this._rect(x-23,y-32,9,10,glow);this._rect(x-20,y-32,1,10,p.soil);this._rect(x-23,y-27,9,1,p.soil);
    this._rect(x+13,y-34,13,14,blend('#8c755d','#6c6172',n));this._rect(x+15,y-32,9,10,glow);this._rect(x+18,y-32,1,10,p.soil);this._rect(x+15,y-27,9,1,p.soil);
    this._rect(x-28,y-18,18,3,p.trunk);for(let i=0;i<4;i++){this._rect(x-25+i*4,y-21,2,4,p.treeDark);this._rect(x-26+i*4,y-24,4,3,blend('#d9949a','#d399b4',n));}
    this._rect(x-12,y+1,23,3,p.sand);
    if(n>.1){g.globalAlpha=n*.13;this._ellipse(x-19,y-27,21,18,'#ffe2a0');this._ellipse(x+19,y-27,21,18,'#ffe2a0');g.globalAlpha=1;}
    // Mailbox, a tiny familiar detail without visual noise.
    this._rect(x-41,y-9,2,16,p.trunk);this._rect(x-47,y-14,12,8,blend('#739591','#58798c',n));this._rect(x-47,y-15,9,2,blend('#a0b5a0','#82939e',n));this._rect(x-36,y-15,1,4,blend('#c87668','#a67a8a',n));
  }
  _grass(grass,p) { const{x,y,h}=grass;const proximity=Math.max(0,1-Math.hypot(x-this.mouse.x,y-this.mouse.y)/24);const sway=Math.sin(this.time*1.7+grass.p)*(.5+this.wind*2)+this.wind*2+proximity*this.mouse.dx*.1;this._line(x,y,x+sway,y-h,p.grassDark);this._line(x,y,x-2+sway*.7,y-h*.7,p.grassDark);if(h>5)this._rect(x+sway,y-h,1,2,p.grassLight); }
  _flower(f,p) {
    if(this.art.active){this._artFlower(f,p);return;}
    const n=this.nightMix,scale=clamp(f.growth),height=(9+f.type*1.6)*scale;
    if(scale<.12){this._rect(f.x-1,f.y-1,3,2,p.soil);this._rect(f.x,f.y-3,1,2,p.treeDark);return;}
    const nearby=Math.max(0,1-Math.hypot(f.x-this.mouse.x,f.y-this.mouse.y)/27);
    const sway=(Math.sin(this.time*1.7+f.p)*(.7+this.wind*3)+this.wind*3+nearby*this.mouse.dx*.12)*scale;
    const x=Math.round(f.x+sway),y=Math.round(f.y-height);
    this._line(f.x,f.y,x,y,p.treeDark);
    if(scale>.3){this._rect(f.x-3+sway*.3,f.y-height*.42,3,2,p.treeDark);this._rect(f.x+sway*.5+1,f.y-height*.66,3,2,p.grassDark);}
    if(scale<.55){this._rect(x-1,y,3,3,p.treeLight);return;}
    const colors=[['#e6b3af','#f4d8bd'],['#f1d38b','#bf9768'],['#e4c4df','#b788b0'],['#f6e8c9','#d9b86d'],['#eee7c8','#d5ccaa'],['#c095b9','#e5b5cd']];
    const petal=blend(colors[f.type][0],['#b39bba','#d5be91','#c0a4d4','#e4d7ba','#c7cfbd','#b595d0'][f.type],n),center=colors[f.type][1];
    if(f.type===4){if(f.seeded){this._rect(x,y,2,2,p.soil);return;}this._rect(x-3,y-2,7,1,petal);this._rect(x-2,y-4,5,1,petal);this._rect(x-4,y-1,1,3,petal);this._rect(x+4,y-1,1,3,petal);this._rect(x-2,y+3,5,1,petal);this._rect(x,y-3,1,6,petal);this._rect(x-2,y,5,1,petal);}
    else if(f.type===2){this._rect(x-2,y-5,4,4,petal);this._rect(x-3,y-2,6,3,petal);this._rect(x-2,y+1,4,2,petal);this._rect(x,y-3,1,2,center);}
    else {this._rect(x-2,y-4,4,3,petal);this._rect(x-4,y-2,3,4,petal);this._rect(x+1,y-2,3,4,petal);this._rect(x-2,y+1,4,3,petal);this._rect(x-1,y-1,2,2,center);}
    if(n>.3&&f.type===2){this.g.globalAlpha=n*.13;this._ellipse(x,y,8,6,'#d6c4e5');this.g.globalAlpha=1;}
  }
  _artFlower(f,p) {
    const stage=f.stage??Math.min(4,Math.floor((f.growthProgress??f.growth)*5));const species=canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6];const sway=Math.round(Math.sin(this.time*1.7+f.p)*(.35+this.wind*1.8)+this.wind*1.5);
    // Each stage requests its own sprite. Missing stages never reuse a scaled mature plant.
    const width=species==='sunflower'?26:species==='lavender'?23:22;
    const sprite=this.art.sprites.get(`plant.${species}.${stage}`);if(sprite){const sw=sprite.worldScale?sprite.rect[2]*sprite.worldScale:width,sh=sprite.worldScale?sprite.rect[3]*sprite.worldScale:27;if(this._sprite(`plant.${species}.${stage}`,f.x+sway,f.y,sw,sh))return;}
    const x=f.x+sway,y=f.y;this._ellipse(x,y,5,2,p.soil);
    if(stage===0){this._rect(x-1,y-3,2,2,'#d4ba79');this._rect(x,y-5,1,3,p.treeDark);this._rect(x+1,y-5,2,1,p.treeLight);}
    else if(stage===1){this._line(x,y,x,y-9,p.treeDark);this._rect(x-4,y-9,4,2,p.treeLight);this._rect(x+1,y-7,4,2,p.grassDark);}
    else if(stage===2){this._line(x,y,x+1,y-16,p.treeDark);this._rect(x-5,y-11,5,3,p.treeLight);this._rect(x+2,y-14,5,3,p.grassDark);this._rect(x-4,y-7,4,2,p.treeDark);}
    else {this._line(x,y,x+1,y-21,p.treeDark);this._rect(x-6,y-12,6,3,p.treeLight);this._rect(x+2,y-16,5,3,p.grassDark);this._rect(x-1,y-23,5,5,blend('#d59bad','#bd91b9',this.nightMix));this._rect(x,y-24,3,2,p.treeLight);}
  }
  _animal(a,p) {
    const g=this.g,n=this.nightMix,x=Math.round(a.x),y=Math.round(a.y-a.hop),dir=a.dir,size=this._animalScale(a.type);
    if(this.art.active&&this.art.sprites.has(`animal.${a.type}`)){const sizes={cat:33*size,dog:36,bird:24,squirrel:31,rabbit:29,duck:30};const width=sizes[a.type]||30;g.globalAlpha=.16;this._ellipse(a.x,a.y+1,width*.35,3,'#314c31');g.globalAlpha=1;const moving=['walk','approach'].includes(a.state)&&Math.hypot(a.motion?.vx||0,a.motion?.vy||0)>.4,cycle=(a.motion?.travel||0)/(a.type==='dog'?11:9)*TAU,breath=['eat','carry'].includes(a.state)?1-Math.max(0,Math.sin(a.stateAge*7))*.008:1+Math.sin(this.time*1.4+a.phase)*.003;g.save();g.translate(Math.round(a.x),Math.round(a.y-(a.hop||0)));const actualFrame=this._animalFrame(a,moving);g.rotate((!actualFrame||actualFrame.staticPose)&&moving?Math.sin(cycle)*.012:0);g.scale(a.dir||1,actualFrame?1:breath);if(actualFrame)this._drawAnimalFrame(actualFrame,size);else this._sprite(`animal.${a.type}`,0,0,width);g.restore();if(a.state==='rest'){g.globalAlpha=.55;this._rect(a.x+12,a.y-32,3,1,'#f3e4b5');this._rect(a.x+14,a.y-31,1,1,'#f3e4b5');this._rect(a.x+12,a.y-30,3,1,'#f3e4b5');g.globalAlpha=1;}if(a.state==='carry'){this._rect(a.x+3,a.y-9,4,4,'#bd874e');this._rect(a.x+3,a.y-10,4,2,'#795d3a');}return;}
    g.globalAlpha=.15;this._ellipse(a.x,a.y+1,a.type==='rabbit'?10*size:9,3,'#365a4a');g.globalAlpha=1;
    g.save();g.translate(x,y);g.scale(dir*size,size);
    if(a.type==='rabbit'){
      const fur=blend('#f3e5c8','#d2c6c6',n),shade=blend('#dbc9b1','#a9a6ba',n);
      this._rect(-8,-9,13,8,fur);this._rect(-6,-12,9,4,fur);this._rect(2,-13,7,9,fur);this._rect(4,-21,2,10,fur);this._rect(7,-19,2,8,fur);this._rect(4,-19,1,6,'#dca8a6');this._rect(7,-17,1,4,'#dca8a6');this._rect(-8,-3,13,3,shade);this._rect(-6,-2,4,2,fur);this._rect(3,-2,4,2,fur);this._rect(7,-11,1,2,'#584f56');this._rect(9,-7,1,1,'#b77f8c');this._rect(-10,-7,3,4,fur);
      if(this.night&&Math.sin(this.time*.8+a.phase)>.7){this._rect(7,-11,2,1,'#584f56');}
    } else {
      const body=blend('#eddbad','#c7c2bb',n);this._rect(-8,-7,13,6,body);this._rect(-6,-9,9,3,body);this._rect(3,-13,6,9,blend('#6a9985','#669a98',n));this._rect(5,-15,4,3,blend('#6a9985','#669a98',n));this._rect(9,-10,4,2,'#dfb56d');this._rect(7,-13,1,1,'#3a5052');this._rect(-3,-6,6,2,blend('#cfbd99','#a9a4a8',n));this._rect(-7,0,14,1,p.wave);
    }
    g.restore();
  }
  _butterfly(b,alpha=1) { const g=this.g,flap=b.rest?1:Math.sin(this.time*15+b.phase);const w=Math.abs(flap)*3+1;g.globalAlpha=alpha;const colors=['#efd299','#d8b5d0','#f0b6a6'];this._rect(b.x-w-1,b.y-2,w,4,colors[b.color]);this._rect(b.x+1,b.y-2,w,4,colors[b.color]);this._rect(b.x,b.y-2,1,4,'#6d6a6b');this._rect(b.x-w,b.y+2,w-1,2,colors[b.color]);this._rect(b.x+1,b.y+2,w-1,2,colors[b.color]);g.globalAlpha=1; }
  _drawCloud(c,p,raining=false) {
    const g=this.g;g.save();
    const shade=raining?Math.max(.65,this.nightMix):this.nightMix,colors=CLOUD_DAY.map((color,i)=>i?blend(color,CLOUD_NIGHT[i],shade):'');
    const left=Math.round(c.x-CLOUD_TILE.anchorX*c.w),top=Math.round(c.y-CLOUD_TILE.anchorY*c.w);
    // Snap every edge to the world pixel grid; fractional display scale never blurs it.
    for(const run of CLOUD_TILE.runs){const x0=Math.round(run.x*c.w),x1=Math.round((run.x+run.width)*c.w),y0=Math.round(run.y*c.w),y1=Math.round((run.y+1)*c.w);if(x1>x0&&y1>y0)this._rect(left+x0,top+y0,x1-x0,y1-y0,colors[run.color]);}
    if(raining&&this.wind>.25){g.globalAlpha*=.35;this._rect(left+3,top+CLOUD_TILE.height*c.w+2,5,1,colors[3]);this._rect(left+12,top+CLOUD_TILE.height*c.w+1,3,1,colors[4]);}
    g.restore();
  }
  _drawBirds(p) { if(this.nightMix>.8)return;for(let i=0;i<3;i++){const x=((this.time*(4+i)+i*38+224)%730)-45,y=118+Math.sin(this.time*.3+i)*10+i*8,flap=Math.round(Math.sin(this.time*4+i)*2);this._line(x-4,y-flap,x,y+1,blend('#6d9891','#788598',this.nightMix));this._line(x,y+1,x+4,y-flap,blend('#6d9891','#788598',this.nightMix));} }
  _lily(x,y,p) { this._ellipse(x,y,6,3,p.grassDark);this._line(x,y,x+5,y-2,p.water);this._rect(x-1,y-3,3,3,blend('#e6c0be','#c7a5c1',this.nightMix));this._rect(x,y-4,1,2,'#f0d3aa'); }
  _reeds(x,y,p) { for(let i=0;i<4;i++){const sway=Math.sin(this.time*1.5+i)*this.wind*2;this._line(x+i*3,y,x+i*3-3+sway,y-10-i%2*4,p.treeDark);this._rect(x+i*3-3+sway,y-13-i%2*4,2,4,p.soil);} }
  _shell(x,y,p) { this._rect(x-3,y-1,7,3,blend('#f6e7c9','#b9a8b0',this.nightMix));this._rect(x-2,y-3,5,2,blend('#e2bda9','#b098a5',this.nightMix));this._rect(x,y-3,1,4,p.sand); }
  _bench(x,y,p) { this._rect(x-10,y-3,2,7,p.trunk);this._rect(x+10,y-3,2,7,p.trunk);this._rect(x-13,y-6,28,5,blend('#bc996d','#9d8183',this.nightMix));this._rect(x-12,y-17,26,3,blend('#cfac77','#b29491',this.nightMix));this._rect(x-12,y-12,26,3,blend('#cfac77','#b29491',this.nightMix));this._rect(x-10,y-17,2,11,p.trunk);this._rect(x+10,y-17,2,11,p.trunk); }
  _sign(x,y,p) { this._rect(x-1,y-13,2,15,p.trunk);this._rect(x-10,y-22,21,11,blend('#d5b17a','#ad9490',this.nightMix));this._rect(x-8,y-20,17,7,p.sand);this._rect(x-3,y-19,2,2,p.treeDark);this._rect(x+2,y-19,2,2,p.treeDark);this._rect(x-2,y-16,5,1,p.treeDark); }
  _clipPond() { const g=this.g;g.beginPath();if(this.art.active){this.scene.pond.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();for(const lily of this.scene.bakedLilies){g.moveTo(lily.x+lily.radiusX,lily.y);g.ellipse(lily.x,lily.y,lily.radiusX,lily.radiusY,0,0,TAU);g.closePath();}}else g.ellipse(450,280,52,27,0,0,TAU);g.clip('evenodd'); }
  _drawRipples(p) {
    const g=this.g,light=blend('#8ccbc9','#88b6c5',this.nightMix),shade=blend('#328a9c','#456f93',this.nightMix);
    for(const r of this.ripples){g.save();if(r.pond)this._clipPond();const progress=r.age/r.life,rx=1+progress*r.size,ry=Math.max(.6,rx*.32);
      const alpha=(r.small?.44:.58)*Math.pow(1-progress,1.25);
      // Broken, one-pixel arcs leave the water artwork visible between highlights.
      for(let i=0;i<8;i++){if(r.small&&(i===1||i===5))continue;const angle=i/8*TAU,x=r.x+Math.cos(angle)*rx,y=r.y+Math.sin(angle)*ry;g.globalAlpha=alpha*(i<4?.7:1);this._rect(x,y,r.small?1:i%3===0?2:1,1,i<4?shade:light);}
      if(r.small&&progress<.28){g.globalAlpha=(.28-progress)*1.5;this._rect(r.x-2,r.y-2-progress*5,1,1,light);this._rect(r.x+2,r.y-1-progress*4,1,1,light);}
      g.restore();
    }
  }
  _drawParticles(p) {
    const g=this.g;
    for(const item of this.particles){
      if(item.kind==='rain'){
        const depth=item.depth??.6,length=item.strokeLength??3,lean=clamp((item.vx||0)/Math.max(1,item.vy||80)*length,-2,2),head=blend('#c4e2d9','#b0ccd5',this.nightMix),body=blend('#75b3bd','#719fb5',this.nightMix),tail=blend('#547f96','#547c9b',this.nightMix);
        // A dark-blue tail, cyan body and one tiny light head, all in integer texels.
        g.globalAlpha=.25+depth*.16;this._line(item.x-lean,item.y-length,item.x-lean*.65,item.y-length*.55,tail);
        g.globalAlpha=.43+depth*.25;this._line(item.x-lean*.6,item.y-length*.55,item.x,item.y-1,body);
        if(depth>.33){g.globalAlpha=.55+depth*.22;this._rect(item.x,item.y,1,1,head);}
      }else if(item.kind==='splash'){
        const progress=1-item.life/item.max;g.globalAlpha=(1-progress)*.5;this._rect(item.x-1-progress*3,item.y-1-Math.sin(progress*Math.PI)*2,1,1,item.color);this._rect(item.x+1+progress*3,item.y-Math.sin(progress*Math.PI)*2,1,1,item.color);
      }else{g.globalAlpha=Math.min(1,item.life*1.5);if(item.kind==='heart'){const c='#e5a4a5';this._rect(item.x-3,item.y,2,2,c);this._rect(item.x+1,item.y,2,2,c);this._rect(item.x-3,item.y+2,6,2,c);this._rect(item.x-1,item.y+4,2,2,c);}else this._rect(item.x,item.y,2,2,item.color);}
    }g.globalAlpha=1;
    for(const s of this.flyingSeeds){this._line(s.x,s.y,s.x-2,s.y+5,p.treeDark);this._rect(s.x-3,s.y,7,1,'#f1edcf');this._rect(s.x,s.y-2,1,4,'#f1edcf');this._rect(s.x-2,s.y-1,1,1,'#f1edcf');this._rect(s.x+2,s.y-1,1,1,'#f1edcf');}
  }
  _drawFireflies(n) { const g=this.g;for(const f of this.fireflies){const x=f.x+Math.sin(this.time*.4+f.p)*12,y=f.y+Math.cos(this.time*.65+f.p)*8,bright=.25+(Math.sin(this.time*1.2+f.p)*.5+.5)*.75;g.globalAlpha=n*bright*.1;this._ellipse(x,y,8,7,'#eff0ab');g.globalAlpha=n*bright*.24;this._rect(x-2,y-2,5,5,'#e9e8a3');g.globalAlpha=n*bright;this._rect(x,y,1,2,'#f7eeb4');}g.globalAlpha=1; }
  _drawWind(p) { if(this.wind<.18)return;const g=this.g;g.globalAlpha=this.wind*.35;for(let i=0;i<6;i++){const x=((this.time*(55+this.wind*70)+i*107)%740)-60,y=(this.art.active?140:165)+i*(this.art.active?17:31)+Math.sin(this.time+i)*7;this._rect(x,y,20+i%3*8,1,p.wave);this._rect(x+23,y-1,10,1,p.wave);}g.globalAlpha=1; }
  _drawCursor(p) { const m=this.mouse;if(m.x<0||m.x>W||m.y<0||m.y>H||this.tool==='explore')return;const g=this.g;g.globalAlpha=.45;const color=this._land(m.x,m.y)?'#fff4ce':p.wave;for(let i=0;i<8;i++){const a=i/8*TAU;this._rect(m.x+Math.cos(a)*10,m.y+Math.sin(a)*5,2,1,color);}g.globalAlpha=1;if(this.tool==='seed'){this._rect(m.x-1,m.y-11,2,5,p.treeDark);this._rect(m.x-4,m.y-12,3,2,p.treeLight);this._rect(m.x+1,m.y-14,3,2,p.treeLight);}else if(this.tool==='food'){this._rect(m.x-2,m.y-10,4,3,'#ecc47e');} }
}
