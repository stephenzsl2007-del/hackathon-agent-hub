// Original procedural pixel artwork. No images, trackers, or remote services.
const W = 640, H = 400;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function random(seed = 1247) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function blend(a, b, t) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); return `rgb(${[16, 8, 0].map(s => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t))).join(',')})`; }
const LAND = [[61,275],[69,240],[102,223],[108,205],[144,195],[187,190],[230,193],[262,186],[311,190],[343,182],[393,187],[428,195],[469,195],[486,217],[523,223],[552,251],[568,285],[556,310],[527,330],[481,349],[421,357],[347,360],[273,355],[215,361],[157,350],[120,335],[91,324],[73,304]];
const ART_LAND = [[107,173],[151,149],[207,135],[259,140],[303,132],[352,143],[400,148],[449,166],[501,190],[548,225],[566,267],[524,297],[461,317],[403,336],[329,347],[257,335],[194,318],[135,289],[91,256],[81,214]];
const FLOWER_SPECIES = ['cosmos','daisy','lavender','sunflower','buttercup','forget-me-not'];
const SPECIES = [...FLOWER_SPECIES,'oak','birch','pine','cherry','apple','willow','blueberry','raspberry','hydrangea','fern','cattail','waterlily','fly-agaric','chanterelle','moss-clover','pumpkin','strawberry','carrot'];
const canonicalSpecies = id => ({marigold:'buttercup',blueflower:'forget-me-not'})[id]||id;
const PROP_SPOTS = {compost:{x:382,y:303},windmill:{x:420,y:198},focus:{x:342,y:184}};
const NIGHT = { sky:'#232d53', skyBottom:'#675a81', water:'#354c71', waterDark:'#293e65', wave:'#7398ad', grass:'#567664', grassLight:'#78937a', grassDark:'#3f625b', soil:'#63585d', cliff:'#4e4454', sand:'#968379', tree:'#45625d', treeDark:'#304d52', treeLight:'#668373', trunk:'#66595d' };
const DAY = { sky:'#b7d9d3', skyBottom:'#e8ddba', water:'#86bcbc', waterDark:'#6fa6ad', wave:'#c7e4d6', grass:'#a7c879', grassLight:'#bed78a', grassDark:'#84b16b', soil:'#ba9670', cliff:'#8c7664', sand:'#e7d1a0', tree:'#8fb969', treeDark:'#5e9860', treeLight:'#b5cf7a', trunk:'#90715d' };

export class World {
  constructor(canvas, { onEvent = () => {}, onChange = () => {}, onCommand = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.surface = document.createElement('canvas');
    this.surface.width = W; this.surface.height = H;
    this.g = this.surface.getContext('2d');
    this.onEvent = onEvent; this.onChange = onChange;this.onCommand=onCommand;
    this.tool = 'explore'; this.night = false; this.nightMix = 0;
    this.desktopMode = !!(document.documentElement?.classList?.contains('desktop-mode')||document.body?.classList?.contains('desktop-mode')||globalThis.window?.desktopWorld); this.petState = {growth:.2,satiety:70};
    this.art = {sprites:new Map(),active:false,missing:[],source:null,plants:[]};this.demoMode=false;this.rainAffectsGrowth=true;this._plantId=1;this.selectedSpecies=null;
    this.tide = .28; this.tideCurrent = .28;
    this.wind = 0; this.windTarget = 0; this.windAt = 0;
    this.windSources = new Map();
    this.time = 0; this.lastTime = 0; this.changeTime = -10;
    this.mouse = { x: -100, y: -100, down: false, dx: 0, since: 0 };
    this.clouds = [{x:142,y:91,w:1.2},{x:402,y:69,w:.95},{x:538,y:132,w:.7}];
    this.dragCloud = null; this.rainCloud = null; this.rainUntil = 0; this.lastRain = 0;
    this.ripples = []; this.particles = []; this.flyingSeeds = []; this.food = [];
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
    this._pointerLeave = () => { if (!this.mouse.down) { this.mouse.x=-100; this.mouse.y=-100; } };
    canvas.addEventListener('pointerdown',this._pointerDown);
    canvas.addEventListener('pointermove',this._pointerMove);
    canvas.addEventListener('pointerup',this._pointerUp);
    canvas.addEventListener('pointercancel',this._pointerUp);
    canvas.addEventListener('pointerleave',this._pointerLeave);
    canvas.style.touchAction = 'none';
    this.resizeObserver = new ResizeObserver(()=>this._resize());
    this.resizeObserver.observe(canvas);
    this._resize();
    this._frame = now => { if(this.dead)return;this.frame=requestAnimationFrame(this._frame);if(document.hidden||this.paused){this.lastTime=now;return;}const elapsed=now-(this.lastTime||now);if(this.lastTime&&elapsed<32)return;const dt=Math.min(.2,elapsed/1000);this.lastTime=now;this._update(dt);this._draw(); };
    this.frame = requestAnimationFrame(this._frame);
    this.artReady=this.loadArt().catch(error=>{this.art.missing.push(error.message);this._emit('art-missing','部分像素素材暂未加载，已保留可操作的临时画面。');return this.getArtStatus();});
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
    if(this.art.active&&!wasActive){if(!this.hasRestored)this._initArt();else this._adaptLayout();}
    this._emit('art-ready','像素花园已经展开，小动物们也到了。');return this.getArtStatus();
  }
  getArtStatus() { const species=SPECIES;return {active:this.art.active,loadedSprites:this.art.sprites.size,animalSpecies:['cat','dog','bird','squirrel','rabbit','duck'].filter(id=>this.art.sprites.has(`animal.${id}`)),plantSpecies:this.art.plants.map(plant=>({...plant,stagesAvailable:[0,1,2,3,4].filter(stage=>this.art.sprites.has(`plant.${plant.id}.${stage}`)),complete:[0,1,2,3,4].every(stage=>this.art.sprites.has(`plant.${plant.id}.${stage}`))})),completeGrowthSpecies:species.filter(id=>[0,1,2,3,4].every(stage=>this.art.sprites.has(`plant.${id}.${stage}`))),missingStages:species.flatMap(id=>[0,1,2,3,4].filter(stage=>!this.art.sprites.has(`plant.${id}.${stage}`)).map(stage=>({speciesId:id,stage}))),notes:[...new Set(this.art.missing)]}; }
  setSelectedSpecies(speciesId) { const id=canonicalSpecies(speciesId);if(id===null||id==='random'){this.selectedSpecies=null;return true;}if(!SPECIES.includes(id))return false;this.selectedSpecies=id;return true; }
  setPaused(value) { this.paused=!!value;this.lastTime=0; }
  setDemoMode(value) { this.demoMode=!!value;if(value){let flower=this.flowers.find(f=>f.demoPlant);if(!flower){flower=this._makePlant(346,260,3,0);flower.demoPlant=true;this.flowers.push(flower);}flower.growth=0;flower.growthProgress=0;flower.stage=0;this.demoPlant=flower;this._emit('demo-stage','演示花苗 · 第 1 阶段：萌芽');}else this.demoPlant=null; }
  _makePlant(x,y,type,growth=0,speciesId=null) { return {id:`plant-${this._plantId++}`,x,y,type,speciesId:SPECIES.includes(canonicalSpecies(speciesId))?canonicalSpecies(speciesId):FLOWER_SPECIES[type%FLOWER_SPECIES.length],growth,growthProgress:growth,stage:Math.min(4,Math.floor(growth*5)),p:this._rand()*TAU,water:0,seeded:false}; }
  _initArt() {
    this.flowers=[];const positions=[[307,227],[329,215],[351,218],[310,251],[332,247],[355,245],[292,276],[314,281],[338,279],[429,285],[452,272],[445,294],[393,323],[415,316],[271,305],[287,315],[404,211],[422,220]];
    positions.forEach(([x,y],i)=>this.flowers.push(this._makePlant(x,y,i%6,i<5?i*.2+.03:1)));
    this.animals=[['cat',378,259],['dog',345,306],['bird',400,246],['squirrel',252,167],['rabbit',287,237],['duck',191,257]].map(([type,x,y],i)=>({id:`animal-${type}`,type,x,y,homeX:x,homeY:y,targetX:x,targetY:y,dir:1,phase:i,wait:1+i*.7,hop:0,state:'idle',bond:0}));
  }
  _adaptLayout() { for(const f of this.flowers){f.speciesId=canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6];if(!this._plantable(f.x,f.y,f.speciesId)){f.x=f.speciesId==='waterlily'?170+this._rand()*40:294+(this._rand()*134);f.y=f.speciesId==='waterlily'?244+this._rand()*18:220+this._rand()*80;}f.growthProgress=f.growthProgress??f.growth??1;f.stage=Math.min(4,Math.floor(f.growthProgress*5));}if(!this.animals.some(a=>a.type==='cat')){const flowers=this.flowers;this._initArt();this.flowers=flowers;} }
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

  setTool(tool) { if(['explore','wind','rain','seed','food','tide'].includes(tool)) { this.tool=tool;this.canvas.style.cursor=tool==='explore'?'default':'crosshair'; } }
  setDesktopMode(value) { this.desktopMode=!!value;this._resize(); }
  setPetState(state={}) { this.petState={...this.petState,...state,growth:clamp(Number(state.growth??this.petState.growth)||0),satiety:clamp(Number(state.satiety??this.petState.satiety)||0,0,100)}; }
  hitTest(clientX,clientY) { const p=this._position({clientX,clientY});if(p.x<0||p.x>=W||p.y<0||p.y>=H)return false;if(!this.desktopMode)return true;if(this.art.active){if(this._spriteHit('island.pond',p.x,p.y,60,14,520,370,[0,0]))return true;if(this.animals.some(a=>Math.abs(p.x-a.x)<18&&p.y>a.y-34&&p.y<a.y+3))return true;if(this._spriteHit('decor.pine',p.x,p.y,461,184,62,88))return true;if(this._spriteHit('decor.apple',p.x,p.y,497,258,69,84))return true;return Object.values(PROP_SPOTS).some(s=>Math.abs(p.x-s.x)<20&&p.y>s.y-48&&p.y<s.y+4);}return this._land(p.x,p.y)||((p.x-324)/255)**2+((p.y-319)/61)**2<1||[{x:137,y:160,rx:54,ry:70},{x:203,y:168,rx:37,ry:52},{x:516,y:199,rx:36,ry:52},{x:89,y:313,rx:30,ry:40},{x:409,y:199,rx:42,ry:46}].some(s=>((p.x-s.x)/s.rx)**2+((p.y-s.y)/s.ry)**2<1); }
  setNight(value) { this.night=!!value;this._emit('night',this.night?'夜色降临，萤火虫醒来了。':'天亮了，小岛开始新的一天。'); }
  setWind(amount, source='manual') { const channel=['mic','microphone'].includes(source)?'microphone':source;this.windSources.set(channel,{value:clamp(Number(amount)||0),time:this.time});this.windAt=this.time;this.windSource=source; }
  setTide(value) { this.tide=clamp(Number(value)||0); }
  impulse(action, data={}) {
    const norm = (v, fallback, size) => Number.isFinite(v) ? (v>=0&&v<=1 ? v*size : v) : fallback;
    let x = norm(data.x,this.art.active?300+this._rand()*130:230+this._rand()*120,W), y=norm(data.y,this.art.active?220+this._rand()*75:270+this._rand()*50,H);
    if(action==='wind') { this.setWind(data.amount ?? data.value ?? .95,data.source||'guest');this.windHold=this.time+(data.duration||2.3);this._releaseSeeds(5);this._emit('wind','风来了，蒲公英飞向新的地方。'); }
    else if(action==='rain'||action==='water') { this.rainCloud={x:clamp(x,105,530),y:clamp(y-100,65,165),w:.85};this.rainUntil=this.time+(data.duration||5);this.rainAffectsGrowth=true;this._emit('rain','一场小雨，正在浇醒花园。'); }
    else if(action==='keyboard-rain'||action==='keyboardRain') { this.visualRainUntil=this.time+clamp(data.duration??.6,.1,2); }
    else if(action==='seed') { const species=canonicalSpecies(data.speciesId??this.selectedSpecies);if(species==='waterlily'&&!Number.isFinite(data.x)&&!Number.isFinite(data.y)){x=170+this._rand()*40;y=245+this._rand()*15;}this._plant(x,y,false,species); }
    else if(action==='food') { this._feed(x,y); }
    else if(action==='tide') { this.setTide(data.amount ?? data.value ?? (this.tide<.6?.9:.15));this._emit('tide',this.tide>.5?'潮水轻轻漫过沙滩。':'潮水退去，贝壳留在岸边。'); }
    else if(action==='fireflies') { this.night=true;for(let i=0;i<14;i++) this.fireflies.push({x:110+this._rand()*420,y:180+this._rand()*150,p:this._rand()*TAU});if(this.fireflies.length>80)this.fireflies.splice(0,this.fireflies.length-80);this._emit('fireflies','你放来了一群萤火虫。'); }
    else if(action==='ripple') { this._ripple(x,y); }
    else if(action==='compost') { const spot=PROP_SPOTS.compost;for(let i=0;i<16;i++)this.particles.push({kind:'petal',x:spot.x+(this._rand()-.5)*18,y:spot.y-21-this._rand()*15,vx:(this._rand()-.5)*16,vy:-10-this._rand()*14,life:1.5+this._rand(),max:2.5,color:i%3===0?'#e8dab0':i%3===1?'#b2c78e':'#d5c2a0'});this._emit('compost','文件已回收，堆肥箱收到了新的养分。'); }
    else if(action==='demo-stage'&&this.demoMode) { const stage=clamp(Math.round(Number(data.stage)||0),0,4);this._demoManualStage=true;if(!this.demoPlant)this.setDemoMode(true);this.demoPlant.growth=this.demoPlant.growthProgress=stage===4?1:(stage+.02)/5;this.demoPlant.stage=stage;const real=this.art.sprites.has(`plant.${this.demoPlant.speciesId}.${stage}`);this._emit('demo-stage',`演示花苗 · 第 ${stage+1} 阶段${real?'':'（本阶段素材待交付）'}`,{stage,realAsset:real}); }
  }
  getStats() { return {flowers:this.flowers.filter(f=>(f.stage??Math.min(4,Math.floor(f.growth*5)))===4).length,visitors:this.visitors,seeds:this.flyingSeeds.length,night:this.night,tide:Math.round(this.tide*100),plants:this.flowers.length,stages:[0,1,2,3,4].map(stage=>this.flowers.filter(f=>(f.stage??Math.min(4,Math.floor(f.growth*5)))===stage).length),demo:this.demoMode,artReady:this.art.active}; }
  serialize() { return {version:2,savedAt:Date.now(),layout:{island:'island.pond',base:[60,14,520,370]},selectedSpecies:this.selectedSpecies,petState:{...this.petState},flowers:this.flowers.filter(f=>!f.demoPlant).map(f=>({id:f.id,x:f.x,y:f.y,type:f.type,speciesId:canonicalSpecies(f.speciesId)||FLOWER_SPECIES[f.type%6],growth:f.growth,growthProgress:f.growthProgress??f.growth,stage:f.stage??Math.min(4,Math.floor(f.growth*5)),water:f.water||0,p:f.p})),animals:this.animals.map(a=>({id:a.id,type:a.type,x:a.x,y:a.y,bond:a.bond||0})),night:this.night,tide:this.tide,visitors:this.visitors}; }
  restore(data) { if(!data||![1,2].includes(data.version))return;this.hasRestored=true;this.demoMode=false;this.demoPlant=null;this._demoManualStage=false;this.setSelectedSpecies(data.selectedSpecies??null);if(data.petState)this.setPetState(data.petState);if(Array.isArray(data.flowers))this.flowers=data.flowers.slice(0,220).filter(f=>Number.isFinite(f.x)&&Number.isFinite(f.y)&&f.x>=0&&f.x<=W&&f.y>=0&&f.y<=H).map(f=>{const type=clamp(Math.round(f.type||0),0,5),progress=clamp(Number(f.growthProgress??f.growth)||0),species=canonicalSpecies(f.speciesId);return {...this._makePlant(f.x,f.y,type,progress),id:typeof f.id==='string'?f.id:`plant-${this._plantId++}`,speciesId:SPECIES.includes(species)?species:FLOWER_SPECIES[type],p:Number(f.p)||0,water:clamp(Number(f.water)||0,0,300)};});if(Array.isArray(data.animals)&&data.animals.some(a=>a.type==='cat'))this.animals=data.animals.slice(0,12).filter(a=>['cat','dog','bird','squirrel','rabbit','duck'].includes(a.type)).map((a,i)=>({id:a.id,type:a.type,x:Number(a.x)||350,y:Number(a.y)||270,homeX:Number(a.x)||350,homeY:Number(a.y)||270,targetX:Number(a.x)||350,targetY:Number(a.y)||270,bond:Math.max(0,Number(a.bond)||0),dir:1,phase:i,wait:2,state:'idle',hop:0}));this.night=!!data.night;this.tide=clamp(Number(data.tide)||0);this.visitors=Math.max(0,Number(data.visitors)||0);if(this.art.active)this._adaptLayout(); }
  reset() { this.art.active?this._initArt():this._init();this.night=false;this.tide=.28;this.windTarget=0;this.windSources.clear();this.food=[];this.flyingSeeds=[];this.particles=[];this.visitors=0;this._emit('reset','新的小岛，等你来照顾。'); }
  destroy() { this.dead=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.canvas.removeEventListener('pointerdown',this._pointerDown);this.canvas.removeEventListener('pointermove',this._pointerMove);this.canvas.removeEventListener('pointerup',this._pointerUp);this.canvas.removeEventListener('pointercancel',this._pointerUp);this.canvas.removeEventListener('pointerleave',this._pointerLeave); }
  _emit(type,message,detail={}) { this.onEvent({...detail,type,message}); }
  _command(action,data={}) { if(this.onCommand)this.onCommand(action,data);else this.impulse(action,data); }
  _resize() { const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.max(1,Math.round(r.width*dpr));this.canvas.height=Math.max(1,Math.round(r.height*dpr));this.scale=Math.min(this.canvas.width/W,this.canvas.height/H);this.offsetX=(this.canvas.width-W*this.scale)/2;this.offsetY=(this.canvas.height-H*this.scale)/2;this.dpr=dpr;this.extension=this.desktopMode?0:Math.max(0,Math.ceil((this.canvas.width/this.scale-W)/2));this.surface.width=W+this.extension*2; }
  _position(e) { const r=this.canvas.getBoundingClientRect();return {x:((e.clientX-r.left)*this.dpr-this.offsetX)/this.scale,y:((e.clientY-r.top)*this.dpr-this.offsetY)/this.scale}; }
  _down(e) {
    if(e.button!==0&&e.pointerType!=='touch')return;
    const p=this._position(e);Object.assign(this.mouse,p,{down:true,since:this.time});this.canvas.setPointerCapture?.(e.pointerId);
    if(this.tool==='explore') {
      if(this.art.active){if(Math.abs(p.x-PROP_SPOTS.compost.x)<22&&p.y>PROP_SPOTS.compost.y-28&&p.y<PROP_SPOTS.compost.y+6){this._emit('request-feed','把需要回收的文件交给堆肥箱。');return;}if(Math.abs(p.x-PROP_SPOTS.windmill.x)<24&&p.y>PROP_SPOTS.windmill.y-57&&p.y<PROP_SPOTS.windmill.y+5){this._emit('request-microphone','风车等着你送来一口风。');return;}if(Math.abs(p.x-PROP_SPOTS.focus.x)<24&&p.y>PROP_SPOTS.focus.y-20&&p.y<PROP_SPOTS.focus.y+7){this._emit('request-focus','坐一会儿，和花园一起专注。');return;}}
      const cloud=this.desktopMode?null:this.clouds.find(c=>Math.abs(p.x-c.x)<45*c.w&&Math.abs(p.y-c.y)<20*c.w);
      if(cloud){this.dragCloud=cloud;this.rainUntil=this.time+1;this._emit('rain','拖着这朵云，为你喜欢的地方下一场雨。');return;}
      if(this._water(p.x,p.y))this._ripple(p.x,p.y);
      else { const animal=[...this.animals].sort((a,b)=>b.y-a.y).find(a=>Math.abs(a.x-p.x)<18&&p.y>a.y-33&&p.y<a.y+7);if(animal){animal.state='observe';animal.wait=2.5;animal.bond=(animal.bond||0)+1;this._heart(animal.x,animal.y-30);this._emit('pet',({cat:'小猫抬起头，安静地看着你。',dog:'小狗摇摇尾巴，记住了你的温柔。',bird:'小鸟轻轻一跳，向你打了个招呼。',squirrel:'松鼠抱住果实，好奇地看向你。',rabbit:'小兔子向你蹭了蹭。',duck:'小鸭子开心地摇了摇。'})[animal.type]);}else this._petals(p.x,p.y,5); }
    }
    else if(this.tool==='seed')this._command('seed',{x:p.x,y:p.y,speciesId:this.selectedSpecies});
    else if(this.tool==='food')this._emit('request-food','在草地上放下一份饲料。',{x:p.x,y:p.y});
    else if(this.tool==='rain'){this._command('rain',{x:p.x,y:p.y,duration:1});}
    else if(this.tool==='wind'){this.setWind(.85);this.windHold=this.time+.3;this._releaseSeeds(4);}
    else if(this.tool==='tide'){this.tideStart={y:p.y,value:this.tide};this._ripple(p.x,p.y);}
  }
  _move(e) {
    const p=this._position(e),dx=p.x-this.mouse.x,dy=p.y-this.mouse.y;
    if(Math.hypot(dx,dy)>1)this.mouse.since=this.time;
    this.mouse.dx=clamp(dx,-15,15);this.mouse.x=p.x;this.mouse.y=p.y;
    if(this.dragCloud){this.dragCloud.x=clamp(p.x,45,595);this.dragCloud.y=clamp(p.y,50,165);this.rainUntil=this.time+.4;}
    if(this.mouse.down&&this.tool==='rain'&&this.rainCloud){this.rainCloud.x=clamp(p.x,40,600);this.rainCloud.y=clamp(p.y-100,50,165);this.rainUntil=this.time+.8;}
    if(this.mouse.down&&this.tool==='wind'){this.setWind(clamp(.5+Math.abs(dx)*.06));this.windHold=this.time+.3;}
    if(this.mouse.down&&this.tool==='tide'&&this.tideStart)this.setTide(this.tideStart.value+(this.tideStart.y-p.y)/130);
    if(!this.mouse.down&&this.tool==='explore')this.canvas.style.cursor=Object.values(PROP_SPOTS).some(s=>Math.abs(p.x-s.x)<23&&p.y>s.y-48&&p.y<s.y+7)?'pointer':!this.desktopMode&&this.clouds.some(c=>Math.abs(p.x-c.x)<45*c.w&&Math.abs(p.y-c.y)<20*c.w)?'grab':'default';
  }
  _up() { this.mouse.down=false;this.dragCloud=null;this.tideStart=null;if(this.tool==='wind')this.setWind(0,'manual'); }
  _land(x,y) { const polygon=this.art?.active?ART_LAND:LAND;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside;}return inside; }
  _pond(x,y) { return this.art?.active?((x-191)/76)**2+((y-253)/43)**2<1:((x-450)/52)**2+((y-280)/27)**2<1; }
  _walkable(x,y) { if(!this._land(x,y)||this._pond(x,y))return false;const trees=this.art.active?[[220,142,15],[461,184,12],[497,258,12]]:[[137,222,10],[203,218,8],[516,249,8]];if(trees.some(([tx,ty,r])=>Math.hypot(x-tx,y-ty)<r))return false;if(this.art.active&&Object.values(PROP_SPOTS).some(s=>Math.abs(x-s.x)<15&&Math.abs(y-s.y)<8))return false;return true; }
  _plantable(x,y,speciesId=null) { if(canonicalSpecies(speciesId)==='waterlily')return this._pond(x,y);return this._walkable(x,y)&&(!this.art.active?!(x>389&&x<457&&y<239):x>267&&x<458&&y>199&&y<328); }
  _path(x,y) { return (x>356&&x<393&&y>220&&y<305)||(x>306&&x<386&&y>290&&y<316); }
  _water(x,y) { return (!this.desktopMode&&y>190&&!this._land(x,y))||this._pond(x,y); }
  _plant(x,y,quiet=false,speciesId=null) {
    const species=canonicalSpecies(speciesId);if(species&&!SPECIES.includes(species)){if(!quiet)this._emit('hint','这颗种子的素材暂未接入，请换一种试试。');return false;}
    if(!this._plantable(x,y,species)){if(!quiet)this._emit('hint',species==='waterlily'?'睡莲喜欢水，把它种在池塘里。':this.art.active?'把种子放在岛屿中间的种植草地上。':'把种子放在草地上，它就会留下来。');return false;}
    if(this.flowers.length>=220){if(!quiet)this._emit('hint','花园已经很茂盛了，给小动物留一点空地吧。');return false;}
    this.flowers.push(this._makePlant(x,y,Math.floor(this._rand()*6),.015,species));
    this._petals(x,y-2,7,'#e7ecaa');if(!quiet)this._emit('seed','一颗小种子，正在慢慢长大。');return true;
  }
  _feed(x,y) { if(!this._walkable(x,y)){x=364;y=278;}this.food.push({x,y,life:22});this._emit('food','留下几粒点心，小动物正在靠近。');for(const a of this.animals)if(a.type!=='duck'){a.targetX=x+(this._rand()-.5)*12;a.targetY=y+(this._rand()-.5)*8;a.wait=0;a.state=a.type==='bird'?'fly':'approach';} }
  _ripple(x,y) { this.ripples.push({x,y,age:0,life:2.1,size:12+this._rand()*9});if(this.ripples.length>35)this.ripples.shift(); }
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
    if(this.mouse.down&&this.tool==='rain')this.rainUntil=this.time+.7;
    this.mouse.dx*=Math.pow(.01,dt);
    this.clouds.forEach((c,i)=>{if(c!==this.dragCloud){c.x+=dt*(.6+this.wind*5)*(i%2?1:-1);if(c.x<-55)c.x=695;if(c.x>695)c.x=-55;}});
    const rain=this.dragCloud||(this.time<this.rainUntil?this.rainCloud:null);
    if(rain&&this.time-this.lastRain>.025){this.lastRain=this.time;for(let i=0;i<4;i++)this.particles.push({kind:'rain',x:rain.x+(this._rand()-.5)*70*rain.w,y:rain.y+12,vy:130+this._rand()*50,vx:8+this.wind*24,life:1.9,max:1.9});}
    if(this.time<(this.visualRainUntil||0)&&this.time-(this.lastVisualRain||0)>.06){this.lastVisualRain=this.time;for(let i=0;i<2;i++)this.particles.push({kind:'rain',x:448+(this._rand()-.5)*44,y:169+this._rand()*14,vy:65,vx:2,life:.7,max:.7});}
    for(const f of this.flowers){const before=f.stage??Math.min(4,Math.floor(f.growth*5));let speed=.000025;if(rain&&this.rainAffectsGrowth&&Math.abs(f.x-rain.x)<65){f.water=Math.min(120,(f.water||0)+dt*6);speed=.008;}else if((f.water||0)>0){f.water=Math.max(0,f.water-dt);speed=.00025;}if(f.demoPlant&&this.demoMode)speed=this._demoManualStage?0:.11;f.growth=f.growthProgress=Math.min(1,(f.growthProgress??f.growth??0)+dt*speed);f.stage=Math.min(4,Math.floor(f.growthProgress*5));if(f.stage!==before){this._petals(f.x,f.y-10,5,'#f0e4a4');this._emit('growth',f.demoPlant?`演示花苗 · 第 ${f.stage+1} 阶段`:'你照顾的小苗，长出了新的模样。',{plantId:f.id,stage:f.stage,realAsset:this.art.sprites.has(`plant.${f.speciesId}.${f.stage}`)});}if(f.seeded&&this.time>f.regrow)f.seeded=false;}
    this.ripples=this.ripples.filter(r=>(r.age+=dt)<r.life);
    this.particles=this.particles.filter(p=>{
      p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.kind==='rain'&&p.y>260+(p.x%48)){if(this._water(p.x,p.y))this._ripple(p.x,p.y);return false;}
      if(p.kind==='petal'){p.vy+=dt*12;p.x+=Math.sin(this.time*3+p.y)*dt*3+this.wind*dt*20;}
      return p.life>0;
    });
    this.flyingSeeds=this.flyingSeeds.filter(s=>{
      s.age+=dt;s.x+=(s.vx+this.wind*27)*dt;s.y+=(s.vy+Math.sin(this.time*2+s.p)*5)*dt;s.vy+=dt*9;
      if(s.age>s.life||s.y>340){this._plant(clamp(s.x,100,530),clamp(s.y,240,335),true);return false;}return s.x<W+10;
    });
    this.food=this.food.filter(f=>(f.life-=dt)>0);
    this._stepAnimals(dt);
    this.butterflies.forEach((b,i)=>{
      const resting=this.time-this.mouse.since>2.5&&this._land(this.mouse.x,this.mouse.y)&&i===0;
      const tx=resting?this.mouse.x:250+Math.sin(this.time*.22+i*1.1)*155;
      const ty=resting?this.mouse.y-5:240+Math.sin(this.time*.3+i*2.4)*45;
      b.x+=clamp(tx-b.x,-30,30)*dt;b.y+=clamp(ty-b.y,-20,20)*dt;b.rest=resting&&Math.abs(tx-b.x)<4?1:0;
      if(b.rest&&!this.butterflyRested){this.butterflyRested=true;this._emit('butterfly','安静一会儿，蝴蝶也愿意为你停留。');}
      if(!resting)this.butterflyRested=false;
    });
    if(this.particles.length>360)this.particles.splice(0,this.particles.length-360);if(this.flyingSeeds.length>40)this.flyingSeeds.splice(0,this.flyingSeeds.length-40);
    if(this.time-this.changeTime>1){this.changeTime=this.time;this.onChange(this.getStats());}
  }

  _stepAnimals(dt) {
    for(const [i,a] of this.animals.entries()){
      a.phase+=dt;a.wait-=dt;const nearFood=a.type==='duck'?null:this.food.find(f=>distance(a,f)<14);
      if(nearFood){a.state=a.type==='squirrel'?'carry':'eat';a.wait=1.5;nearFood.life-=dt*2.5;a.hop=Math.sin(a.phase*8)>.4?1:0;if(this.time-(a.lastHeart||0)>2){this._heart(a.x,a.y-29);a.lastHeart=this.time;a.bond=(a.bond||0)+1;if(!nearFood.counted){this.visitors++;nearFood.counted=true;this._emit('friend','一份小点心，让你们更熟悉了。');}}continue;}
      const d=Math.hypot(a.x-a.targetX,a.y-a.targetY);
      if(d<3&&a.wait<=0){const f=this.food.find(item=>this._walkable(item.x,item.y));if(f&&a.type!=='duck'){a.targetX=f.x;a.targetY=f.y;a.state=a.type==='bird'?'fly':'approach';}else{const radius={cat:32,dog:28,bird:47,squirrel:21,rabbit:25,duck:15}[a.type]||20;for(let attempt=0;attempt<18;attempt++){const tx=a.homeX+(this._rand()-.5)*radius*2,ty=a.homeY+(this._rand()-.5)*radius;if(a.type==='duck'?this._pond(tx,ty):this._walkable(tx,ty)){a.targetX=tx;a.targetY=ty;break;}}a.state=a.type==='cat'&&this._rand()<.5?'rest':a.type==='bird'?'perch':a.type==='squirrel'?'observe':'idle';a.wait=(a.type==='cat'?3:1.5)+this._rand()*4;}}
      if(a.wait>0){a.hop*=.8;a.flight=lerp(a.flight||0,0,Math.min(1,dt*5));continue;}
      const dx=a.targetX-a.x,dy=a.targetY-a.y,len=Math.hypot(dx,dy);if(len<2)continue;
      const speed={cat:11,dog:21,bird:30,squirrel:23,rabbit:17,duck:5}[a.type]||13;
      if(a.type==='bird')a.state='fly';else if(a.state!=='approach')a.state='walk';
      const nx=a.x+dx/len*dt*speed,ny=a.y+dy/len*dt*speed;
      if(a.type==='duck'?this._pond(nx,ny):a.type==='bird'||this._walkable(nx,ny)){a.x=nx;a.y=ny;a.dir=dx<0?-1:1;}else{const px=a.x-dy/len*dt*speed,py=a.y+dx/len*dt*speed;if(this._walkable(px,py)){a.x=px;a.y=py;}else{a.targetX=a.x;a.targetY=a.y;a.wait=.4;}}
      a.hop=a.type==='rabbit'?Math.abs(Math.sin(a.phase*11))*2.4:a.type==='bird'?0:Math.abs(Math.sin(a.phase*8))*.7;
      a.flight=lerp(a.flight||0,a.type==='bird'?14:0,Math.min(1,dt*4));
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
    g.globalAlpha=.09;this._ellipse(505,70,55,52,n>.5?'#e9dca4':'#fff2c4');g.globalAlpha=.16;this._ellipse(505,70,37,35,'#fff0bd');g.globalAlpha=1;
    this._ellipse(505,70,20,20,blend('#f6df9e','#f2e7bd',n));
    if(n>.05){g.globalAlpha=n;this._ellipse(513,63,17,18,p.sky);g.globalAlpha=1;}
    for(const s of this.stars){if(n<.02)break;g.globalAlpha=n*(.3+Math.sin(t*.6+s.phase)*.2+s.s*.3);this._rect(s.x,s.y,s.s>.7?2:1,1,'#f2e7c0');if(s.s>.9)this._rect(s.x,s.y-1,1,3,'#f2e7c0');}g.globalAlpha=1;
    // Layered distant landscape keeps the scene grounded, quiet and spacious.
    this._poly([[-this.extension,166],[32,155],[62,158],[95,145],[126,158],[150,149],[183,166],[216,162],[251,171],[284,161],[324,170],[359,156],[397,167],[430,157],[463,166],[492,153],[525,160],[552,151],[588,157],[613,145],[640+this.extension,157],[640+this.extension,221],[-this.extension,221]],blend('#a7beb0','#535c76',n));
    this._poly([[-this.extension,179],[29,168],[52,181],[85,169],[117,185],[144,172],[176,182],[210,174],[246,186],[283,178],[324,183],[360,170],[399,181],[437,172],[469,184],[503,172],[544,184],[583,170],[615,181],[640+this.extension,174],[640+this.extension,220],[-this.extension,220]],blend('#95b7a2','#465c71',n));
    }
    if(!this.desktopMode||!this.art.active)this._drawWater(p);
    if(!this.desktopMode)this.clouds.forEach(c=>this._drawCloud(c,p,c===this.dragCloud));
    if(this.rainCloud&&this.time<this.rainUntil&&this.rainCloud!==this.dragCloud)this._drawCloud(this.rainCloud,p,true);
    if(!this.desktopMode)this._drawBirds(p);
    this._drawLand(p);
    // Render tall scenery and inhabitants by foot position for believable overlap.
    const objects=this.art.active?[{y:184,draw:()=>this._tree(461,184,.85,2,p)},{y:258,draw:()=>this._tree(497,258,.8,0,p)},{y:PROP_SPOTS.compost.y,draw:()=>this._compost(p)},{y:PROP_SPOTS.windmill.y,draw:()=>this._windmill(p)},{y:PROP_SPOTS.focus.y,draw:()=>this._bench(PROP_SPOTS.focus.x,PROP_SPOTS.focus.y,p)}]:[{y:222,draw:()=>this._tree(137,222,1.13,0,p)},{y:218,draw:()=>this._tree(203,218,.8,2,p)},{y:241,draw:()=>this._cottage(409,237,p)},{y:249,draw:()=>this._tree(516,249,.78,5,p)}];
    for(const flower of this.flowers)objects.push({y:flower.y,draw:()=>this._flower(flower,p)});
    for(const animal of this.animals)objects.push({y:animal.y,draw:()=>this._animal(animal,p)});
    for(const grass of this.grass)if(!this.art.active||this._walkable(grass.x,grass.y)&&grass.x>270&&grass.x<460)objects.push({y:grass.y,draw:()=>this._grass(grass,p)});
    if(!this.art.active)objects.push({y:328,draw:()=>this._bench(392,321,p)},{y:246,draw:()=>this._sign(301,241,p)},{y:350,draw:()=>this._tree(89,350,.63,8,p)});
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    this._drawRipples(p);
    this._drawParticles(p);
    for(const b of this.butterflies)if(n<.9)this._butterfly(b,1-n*.8);
    if(n>.05)this._drawFireflies(n);
    this._drawWind(p);
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
    this._sprite('island.pond',60,14,520,370,{anchor:[0,0]});
    // Local highlights remain inside the artist's pond. No rectangular water plane.
    const g=this.g;g.globalAlpha=.35;for(let i=0;i<7;i++){const x=153+(i*19)%75+Math.sin(this.time*.5+i)*4,y=237+(i*11)%36+this.tideCurrent*4;this._rect(x,y,5+i%3*3,1,p.wave);}g.globalAlpha=1;
    for(const food of this.food){this._ellipse(food.x,food.y,8,3,'rgba(52,75,30,.25)');this._rect(food.x-4,food.y-1,3,2,'#ecc47e');this._rect(food.x+2,food.y,2,2,'#b7804d');this._rect(food.x-1,food.y-4,2,2,'#d7b06a');}
    if(this.demoMode&&this.demoPlant){const f=this.demoPlant;g.globalAlpha=.55;this._ellipse(f.x,f.y+2,21,5,'#f7e7aa');g.globalAlpha=1;}
  }

  _compost(p) {
    const {x,y}=PROP_SPOTS.compost,n=this.nightMix,g=this.g;const hover=Math.abs(this.mouse.x-x)<23&&this.mouse.y>y-28&&this.mouse.y<y+6;
    this._ellipse(x,y+2,20,5,'rgba(35,55,25,.22)');this._rect(x-17,y-23,34,23,blend('#946a42','#71586b',n));
    this._rect(x-14,y-21,28,18,blend('#bb8b54','#967381',n));for(let i=0;i<4;i++)this._rect(x-14,y-20+i*5,28,1,blend('#84603f','#665064',n));this._rect(x-18,y-25,36,4,blend('#d2a76a','#ac8b8d',n));this._rect(x-14,y-26,28,2,blend('#5e763a','#51624c',n));
    this._rect(x-2,y-18,4,10,'#d7d596');this._rect(x-6,y-15,12,3,'#d7d596');this._rect(x-7,y-13,4,3,p.treeDark);this._rect(x+4,y-18,3,3,p.treeDark);
    if(hover){g.globalAlpha=.3;this._ellipse(x,y+1,24,6,'#f5e4a9');g.globalAlpha=1;}
  }
  _windmill(p) {
    const {x,y}=PROP_SPOTS.windmill,n=this.nightMix,g=this.g;this._ellipse(x,y+1,15,4,'rgba(35,55,25,.20)');
    this._poly([[x-9,y],[x-6,y-34],[x+6,y-34],[x+11,y]],blend('#cfb584','#a39194',n));this._rect(x-3,y-14,6,14,p.trunk);this._poly([[x-10,y-33],[x,y-43],[x+11,y-33]],blend('#9b7056','#79596d',n));
    const cy=y-32,angle=this.time*(.15+this.wind*4);for(let i=0;i<4;i++){const a=angle+i*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),nx=-dy,ny=dx;this._line(x,cy,x+dx*22,cy+dy*22,p.trunk,2);this._poly([[x+dx*6+nx*2,cy+dy*6+ny*2],[x+dx*23+nx*2,cy+dy*23+ny*2],[x+dx*23+nx*7,cy+dy*23+ny*7],[x+dx*8+nx*5,cy+dy*8+ny*5]],blend('#e8d8ac','#c1b1b5',n));}this._rect(x-2,cy-2,5,5,blend('#8d6952','#76566d',n));
  }

  _tree(x,y,s,phase,p) {
    if(this.art.active){const sway=Math.round(Math.sin(this.time*1.1+phase)*(.4+this.wind*1.5));if(this._sprite(phase===2?'decor.pine':'decor.apple',x+sway,y,phase===2?62:69,phase===2?88:84))return;}
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
    const g=this.g,n=this.nightMix,x=Math.round(a.x),y=Math.round(a.y-a.hop),dir=a.dir,size=a.type==='rabbit'?1+this.petState.growth*.5:1;
    if(this.art.active&&this.art.sprites.has(`animal.${a.type}`)){const sizes={cat:33,dog:36,bird:24,squirrel:31,rabbit:29*size,duck:30};const width=sizes[a.type]||30;g.globalAlpha=.16;this._ellipse(a.x,a.y+1,width*.35,3,'#314c31');g.globalAlpha=1;const bob=a.state==='eat'?Math.sin(this.time*8):0;this._sprite(`animal.${a.type}`,a.x,a.y-a.hop-(a.flight||0)+bob,width);if(a.state==='rest'){g.globalAlpha=.55;this._rect(a.x+12,a.y-32,3,1,'#f3e4b5');this._rect(a.x+14,a.y-31,1,1,'#f3e4b5');this._rect(a.x+12,a.y-30,3,1,'#f3e4b5');g.globalAlpha=1;}if(a.state==='carry'){this._rect(a.x+3,a.y-9,4,4,'#bd874e');this._rect(a.x+3,a.y-10,4,2,'#795d3a');}return;}
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
  _drawCloud(c,p,raining=false) { const g=this.g,n=this.nightMix;g.save();g.translate(Math.round(c.x),Math.round(c.y));g.scale(c.w,c.w);const color=blend(raining?'#d6ded0':'#f1e9cd',raining?'#7a809c':'#8990ac',n);this._pixelPuff(-18,1,24,8,color);this._pixelPuff(4,-7,21,15,color);this._pixelPuff(27,2,18,7,color);this._rect(-33,7,73,4,blend('#d8d8bd','#737e99',n));this._rect(-10,-19,18,3,blend('#f8f0d7','#a0a5b8',n));g.restore(); }
  _drawBirds(p) { if(this.nightMix>.8)return;for(let i=0;i<3;i++){const x=((this.time*(4+i)+i*38+224)%730)-45,y=118+Math.sin(this.time*.3+i)*10+i*8,flap=Math.round(Math.sin(this.time*4+i)*2);this._line(x-4,y-flap,x,y+1,blend('#6d9891','#788598',this.nightMix));this._line(x,y+1,x+4,y-flap,blend('#6d9891','#788598',this.nightMix));} }
  _lily(x,y,p) { this._ellipse(x,y,6,3,p.grassDark);this._line(x,y,x+5,y-2,p.water);this._rect(x-1,y-3,3,3,blend('#e6c0be','#c7a5c1',this.nightMix));this._rect(x,y-4,1,2,'#f0d3aa'); }
  _reeds(x,y,p) { for(let i=0;i<4;i++){const sway=Math.sin(this.time*1.5+i)*this.wind*2;this._line(x+i*3,y,x+i*3-3+sway,y-10-i%2*4,p.treeDark);this._rect(x+i*3-3+sway,y-13-i%2*4,2,4,p.soil);} }
  _shell(x,y,p) { this._rect(x-3,y-1,7,3,blend('#f6e7c9','#b9a8b0',this.nightMix));this._rect(x-2,y-3,5,2,blend('#e2bda9','#b098a5',this.nightMix));this._rect(x,y-3,1,4,p.sand); }
  _bench(x,y,p) { this._rect(x-10,y-3,2,7,p.trunk);this._rect(x+10,y-3,2,7,p.trunk);this._rect(x-13,y-6,28,5,blend('#bc996d','#9d8183',this.nightMix));this._rect(x-12,y-17,26,3,blend('#cfac77','#b29491',this.nightMix));this._rect(x-12,y-12,26,3,blend('#cfac77','#b29491',this.nightMix));this._rect(x-10,y-17,2,11,p.trunk);this._rect(x+10,y-17,2,11,p.trunk); }
  _sign(x,y,p) { this._rect(x-1,y-13,2,15,p.trunk);this._rect(x-10,y-22,21,11,blend('#d5b17a','#ad9490',this.nightMix));this._rect(x-8,y-20,17,7,p.sand);this._rect(x-3,y-19,2,2,p.treeDark);this._rect(x+2,y-19,2,2,p.treeDark);this._rect(x-2,y-16,5,1,p.treeDark); }
  _drawRipples(p) { const g=this.g;for(const r of this.ripples){const a=r.age/r.life,rx=4+a*r.size,ry=rx*.35;g.globalAlpha=(1-a)*.7;for(let i=0;i<12;i++){const angle=i/12*TAU;const x=r.x+Math.cos(angle)*rx,y=r.y+Math.sin(angle)*ry;this._rect(x,y,i%3===0?4:2,1,p.wave);}}g.globalAlpha=1; }
  _drawParticles(p) {
    const g=this.g;
    for(const item of this.particles){g.globalAlpha=Math.min(1,item.life*1.5);if(item.kind==='rain'){this._rect(item.x,item.y,1,4,blend('#d5e6da','#9fbad6',this.nightMix));}else if(item.kind==='heart'){const c='#e5a4a5';this._rect(item.x-3,item.y,2,2,c);this._rect(item.x+1,item.y,2,2,c);this._rect(item.x-3,item.y+2,6,2,c);this._rect(item.x-1,item.y+4,2,2,c);}else this._rect(item.x,item.y,2,2,item.color);}g.globalAlpha=1;
    for(const s of this.flyingSeeds){this._line(s.x,s.y,s.x-2,s.y+5,p.treeDark);this._rect(s.x-3,s.y,7,1,'#f1edcf');this._rect(s.x,s.y-2,1,4,'#f1edcf');this._rect(s.x-2,s.y-1,1,1,'#f1edcf');this._rect(s.x+2,s.y-1,1,1,'#f1edcf');}
  }
  _drawFireflies(n) { const g=this.g;for(const f of this.fireflies){const x=f.x+Math.sin(this.time*.4+f.p)*12,y=f.y+Math.cos(this.time*.65+f.p)*8,bright=.25+(Math.sin(this.time*1.2+f.p)*.5+.5)*.75;g.globalAlpha=n*bright*.1;this._ellipse(x,y,8,7,'#eff0ab');g.globalAlpha=n*bright*.24;this._rect(x-2,y-2,5,5,'#e9e8a3');g.globalAlpha=n*bright;this._rect(x,y,1,2,'#f7eeb4');}g.globalAlpha=1; }
  _drawWind(p) { if(this.wind<.18)return;const g=this.g;g.globalAlpha=this.wind*.35;for(let i=0;i<6;i++){const x=((this.time*(55+this.wind*70)+i*107)%740)-60,y=165+i*31+Math.sin(this.time+i)*7;this._rect(x,y,20+i%3*8,1,p.wave);this._rect(x+23,y-1,10,1,p.wave);}g.globalAlpha=1; }
  _drawCursor(p) { const m=this.mouse;if(m.x<0||m.x>W||m.y<0||m.y>H||this.tool==='explore')return;const g=this.g;g.globalAlpha=.45;const color=this._land(m.x,m.y)?'#fff4ce':p.wave;for(let i=0;i<8;i++){const a=i/8*TAU;this._rect(m.x+Math.cos(a)*10,m.y+Math.sin(a)*5,2,1,color);}g.globalAlpha=1;if(this.tool==='seed'){this._rect(m.x-1,m.y-11,2,5,p.treeDark);this._rect(m.x-4,m.y-12,3,2,p.treeLight);this._rect(m.x+1,m.y-14,3,2,p.treeLight);}else if(this.tool==='food'){this._rect(m.x-2,m.y-10,4,3,'#ecc47e');} }
}
