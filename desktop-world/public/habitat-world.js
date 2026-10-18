import {World} from './world.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const names={rabbit:'兔子',bird:'小鸟',squirrel:'松鼠',duck:'鸭子',cat:'小猫',dog:'团团',visitor:'相片访客'};

/** Ambient interactions consume the artist's scene geometry and movement rules. */
export class HabitatWorld extends World {
  constructor(canvas,options){super(canvas,options);this._ensureHabitat();}
  _ensureHabitat(){
    this.reactions ||= [];this.treeShakes ||= new Map();this.clickTimes ||= [];
    this.photoCache ||= new Map();this.weather ||= {rain:0,cloud:0,wet:0};
    this.neighborSerial ||= 1;this.lastInvitation ??= -90;this.sun ||= {...this.scene.sun};
  }
  _skyObject(p){
    this._ensureHabitat();
    if(!this.sunAway&&!this.parallelSunAway&&Math.hypot(p.x-this.sun.x,p.y-this.sun.y)<23)return 'sun';
    const cloud=this.time<(this.visualRainUntil||0)&&this.visualRainCloud?this.visualRainCloud:this.scene.idleCloud;
    if(!this._rainCloudVisible()&&this._cloudHit(cloud,p.x,p.y))return 'cloud';
    return null;
  }
  isWeatherHandleAt(x,y){const p=this._position({clientX:x,clientY:y});return !!this._skyObject(p)||super.isWeatherHandleAt(x,y);}
  hitTest(x,y){const p=this._position({clientX:x,clientY:y});return !!this._skyObject(p)||super.hitTest(x,y);}
  _down(e){
    if(this.tool!=='explore'||e.button!==0&&e.pointerType!=='touch'){super._down(e);return;}
    this._ensureHabitat();const p=this._position(e),sky=this._skyObject(p);
    if(this._rainCloudHit(p.x,p.y)){super._down(e);return;}
    if(sky){Object.assign(this.mouse,p,{down:true,since:this.time});this.pointerId=e.skipPointerCapture?null:e.pointerId;if(!e.skipPointerCapture)this.canvas.setPointerCapture?.(e.pointerId);
      if(sky==='sun')this.dragSun=true;else{const cloud=this.time<(this.visualRainUntil||0)&&this.visualRainCloud?this.visualRainCloud:this.scene.idleCloud;this._command('rain',{x:cloud.x,y:cloud.y+120,manual:true});this.dragCloud=this.rainCloud;this.rainDragOffset={x:p.x-cloud.x,y:p.y-cloud.y};}
      return;
    }
    const animal=[...this.animals].reverse().find(a=>Math.abs(p.x-a.x)<18&&p.y>a.y-34&&p.y<a.y+7);
    if(animal){Object.assign(this.mouse,p,{since:this.time});this._stopAnimal(animal,'observe',0);animal.foodId=null;animal.foodSeat=null;animal.mode='follow';animal.interactionUntil=this.time+6;animal.bond=(animal.bond||0)+1;animal.hop=3;
      this._heart(animal.x,animal.y-30);this.say(animal.x,animal.y-45,`${animal.name||names[animal.type]}跟着你`);this._emit('pet','它记住你了，移动光标带它走一会儿。');return;}
    const tree=this.scene.interactionTrees.find(t=>Math.abs(p.x-t.x)<t.w*.42&&p.y>t.y-t.h&&p.y<t.y+3);
    if(tree){this.shakeTree(tree);return;}
    if(this._pond(p.x,p.y)){
      this._ripple(p.x,p.y);this._petals(p.x,p.y-6,12,'#b6dce0');
      for(const a of this.animals.filter(a=>a.type==='duck')){a.mode='splash';a.interactionUntil=this.time+4;}
      this.say(p.x,p.y-35,'扑通！');this._emit('splash','鸭子踩着水花向你打招呼。');return;
    }
    if(this._land(p.x,p.y)){
      this.clickTimes=this.clickTimes.filter(t=>this.time-t<1.8);this.clickTimes.push(this.time);
      if(this.clickTimes.length>=3){this.clickTimes=[];this.gather(p.x,p.y);this._petals(p.x,p.y-20,18,'#eccb8b');this.say(p.x,p.y-40,'大家来看看你');this._emit('gather','你轻轻敲了敲地面，邻居们围了过来。');return;}
      for(const f of this.flowers)if(Math.hypot(f.x-p.x,f.y-p.y)<28)f.touchUntil=this.time+1.6;
    }
    super._down(e);
  }
  _move(e){
    super._move(e);const p=this._position(e);
    if(this.dragSun)this.sun={x:p.x,y:p.y};
    if(this.tool==='explore'&&(this._skyObject(p)||this.scene.interactionTrees.some(t=>Math.abs(p.x-t.x)<t.w*.4&&p.y>t.y-t.h&&p.y<t.y)))this.canvas.style.cursor=this.dragSun?'grabbing':'pointer';
  }
  _up(event={}){
    if(this.dragSun&&!['blur','visibilitychange','pause','toolchange','restore','destroy','cancelInteraction','pointercancel','lostpointercapture'].includes(event.type)){this.sunAway=this.sun.y<15||this.sun.y>this.scene.sun.y+70||this.sun.x<35||this.sun.x>605;this.dragSun=false;this._emit('sun',this.sunAway?'太阳去休息了，小岛亮起萤火。右键可以请太阳回来。':'太阳又回到天空。');}
    this.dragSun=false;this.sun={...this.scene.sun};super._up(event);
  }
  say(x,y,text){this.reactions.push({x,y,text,life:2});this.reactions=this.reactions.slice(-8);}
  shakeTree(tree){
    if(this.time-(this.lastShake??-10)<.35)return;this.lastShake=this.time;
    this.treeShakes.set(tree.id,1);this._petals(tree.x,tree.y-tree.h*.65,20,tree.id==='cherry'?'#efafc6':tree.id==='apple'?'#d88061':'#b8d391');
    this.say(tree.x,tree.y-tree.h-5,tree.id==='apple'?'落果啦！':'沙沙沙');
    if(tree.id==='apple'){const p=this.nearby(tree.x-25,tree.y+8,'cat');this._feed(p.x,p.y);}else if(tree.id==='cherry')this.gather(tree.x+30,tree.y+15);
    this._emit('tree',tree.id==='apple'?'果子落下来了，小动物正跑来分享。':'树枝晃了晃，叶片和花瓣落在你身边。');
  }
  nearby(x,y,type){
    const valid=(px,py)=>this._animalCanStand({type},px,py);
    if(valid(x,y))return{x,y};
    for(let r=8;r<160;r+=10)for(let i=0;i<12;i++){const a=i*Math.PI/6,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(valid(px,py))return{x:px,y:py};}
    return {...this.scene.spawns[type==='duck'?'animal.duck':'plant.default']};
  }
  gather(x,y){for(const a of this.animals.filter(a=>a.type!=='duck')){const p=this.nearby(x+(this._rand()-.5)*50,y+(this._rand()-.5)*25,a.type);this._stopAnimal(a,'observe',0);a.interactionTarget=p;a.mode='gather';a.interactionUntil=this.time+6;}}
  inviteAnimal(type='rabbit'){
    if(this.demoMode)return{ok:false,error:'先结束演示，再邀请邻居。'};
    if(!['rabbit','bird','squirrel','duck'].includes(type))return{ok:false,error:'暂时还没有这种邻居。'};
    if(this.animals.filter(a=>!a.photoId).length>=12)return{ok:false,error:'岛上已经有 12 位动物邻居了，先陪它们玩一会儿。'};
    if(this.time-this.lastInvitation<4)return{ok:false,error:'新邻居正在走过来，稍等一下。'};
    this.lastInvitation=this.time;const spawn=this.scene.spawns['animal.'+type]||this.scene.spawns['plant.default'];
    const home=this.nearby(spawn.x+(this._rand()-.5)*36,spawn.y+(this._rand()-.5)*22,type),start=this.nearby(home.x-45,home.y+8,type);
    this.animals.push({id:`neighbor-${this.neighborSerial++}-${Math.round(this.time*100)}`,type,x:start.x,y:start.y,homeX:home.x,homeY:home.y,targetX:home.x,targetY:home.y,phase:0,dir:1,hop:0,wait:0,bond:0,mode:'arrive',interactionTarget:home,interactionUntil:this.time+8});
    this.visitors++;this._petals(start.x,start.y-15,12,'#e4d789');this._emit('neighbor',`一位新${names[type]}来串门了。`);return{ok:true};
  }
  impulse(action,data={}){
    if(action==='invite-animal')return this.inviteAnimal(data.animalType||data.type);
    if(action==='sun-return'){this.sunAway=false;this.night=false;this._emit('sun',this.parallelSunAway?'关联文件夹里的太阳还没回来，把「太阳.txt」移回去就能恢复白天。':'太阳回到了天空。');return{ok:true};}
    if(action==='weather-preview'){super.impulse('wind',{value:1,duration:7});super.impulse('rain',{duration:7});return{ok:true};}
    return super.impulse(action,data);
  }
  setParallel(state={}){
    this._ensureHabitat();this.parallelState=state;
    if(!state.active||!state.wind)this.windSources.delete('parallel');
    if((!state.active||!state.rain)&&this.rainSource?.origin==='parallel'){this.rainSource.active=false;this.rainSource.until=this.time;this.rainUntil=this.time;this.rainCloudVisibleUntil=this.time+.55;}this.parallelSunAway=!!state.active&&!state.sunPresent;
    const images=state.active?(state.images||[]).slice(0,8):[],ids=new Set(images.map(i=>i.id));
    this.animals=this.animals.filter(a=>!a.photoId||ids.has(a.photoId));
    for(const [i,image]of images.entries()){
      if(!this.animals.some(a=>a.photoId===image.id)){
        const spawn=this.scene.spawns['food.default'],home=this.nearby(spawn.x+(i%3)*18,spawn.y+Math.floor(i/3)*12,'visitor');
        this.animals.push({id:'photo-'+image.id,photoId:image.id,name:image.name,type:'visitor',x:home.x,y:home.y,homeX:home.x,homeY:home.y,targetX:home.x,targetY:home.y,phase:i,dir:1,hop:0,wait:0,bond:0,mode:'photo'});
        this._petals(home.x,home.y-20,9,'#e7d79a');
      }
      const cached=this.photoCache.get(image.id);
      if(image.thumbnail&&cached?.src!==image.thumbnail&&typeof Image!=='undefined'){const img=new Image();img.src=image.thumbnail;this.photoCache.set(image.id,img);}
    }
    for(const id of this.photoCache.keys())if(!ids.has(id))this.photoCache.delete(id);
  }
  serialize(){const all=this.animals;try{this.animals=all.filter(a=>!a.photoId);return{...super.serialize(),habitat:{version:1,sunAway:!!this.sunAway,neighborSerial:this.neighborSerial}};}finally{this.animals=all;}}
  restore(data){if(!data||![1,2].includes(data.version))return;super.restore(data);this._ensureHabitat();this.sunAway=!!data?.habitat?.sunAway;this.neighborSerial=Math.max(1,Math.floor(Number(data?.habitat?.neighborSerial)||1));if(this.parallelState)this.setParallel(this.parallelState);}
  reset(){this.sunAway=false;super.reset();this.clearTransientState();if(this.parallelState)this.setParallel(this.parallelState);}
  getStats(){return{...super.getStats(),animals:this.animals.filter(a=>!a.photoId).length,photoVisitors:this.animals.filter(a=>a.photoId).length,weather:{...this.weather},sunAway:!!this.sunAway||!!this.parallelSunAway};}
  clearTransientState(){super.clearTransientState();this._ensureHabitat();this.reactions=[];this.treeShakes.clear();this.clickTimes=[];this.dragSun=false;this.sun={...this.scene.sun};this.weather={rain:0,cloud:0,wet:0};for(const a of this.animals){a.mode=null;a.interactionUntil=0;a.interactionTarget=null;a.foodId=null;a.foodSeat=null;this._stopAnimal(a,'idle',1);}}
  _update(dt){
    this._ensureHabitat();const parallel=this.parallelState;
    if(!this.demoMode&&parallel?.active&&parallel.wind)this.setWind(.8,'parallel');
    if(!this.demoMode&&parallel?.active&&parallel.rain){
      if(!this._rainActive()){const target=this.flowers.find(f=>!f.demoPlant)||this.scene.spawns['plant.default'];this._startRain(target.x,target.y,{duration:2});this.rainSource.origin='parallel';}
      if(this.rainSource?.origin==='parallel'){this.rainSource.until=this.time+2;this.rainUntil=this.rainSource.until;this.rainCloudVisibleUntil=this.rainSource.until+.55;}
    }
    const rawNight=this.night;this.night=rawNight||(!this.demoMode&&(this.sunAway||this.parallelSunAway));
    try{super._update(dt);}finally{this.night=rawNight;}
    const raining=this._rainActive(),typing=this.time<(this.visualRainUntil||0);
    const target=raining ? .9 : typing ? .4+(this.visualRainIntensity||0)*.6 : 0;
    this.weather.rain+=(target-this.weather.rain)*Math.min(1,dt*(target?4:1.8));this.weather.cloud+=((target?1:0)-this.weather.cloud)*Math.min(1,dt*2.5);
    this.weather.wet=clamp(this.weather.wet+dt*(this.weather.rain*.08-.02));
    for(const [id,amount]of this.treeShakes)this.treeShakes.set(id,Math.max(0,amount-dt*.9));
    this.reactions=this.reactions.filter(r=>(r.life-=dt)>0);
    if(this.wind>.3&&this.time-(this.lastWindLeaf||0)>.18){this.lastWindLeaf=this.time;this._petals(220+this._rand()*240,130+this._rand()*60,1,'#b9ce91');}
  }
  // Supply intentions to World's shared navigation and gait pipeline. The
  // interaction layer never teleports or implements a second movement loop.
  _animalIntent(a,dt){
    const active=a.interactionUntil>this.time,badWeather=this.wind>.7||this.weather.rain>.7;
    if(active&&a.mode==='splash')return{hold:true,state:'observe',hop:Math.abs(Math.sin(a.phase*10))*4};
    if(active&&a.mode==='follow'){
      if(this.mouse.x>0)a.interactionTarget=this.nearby(this.mouse.x-12,this.mouse.y,a.type);
      return{target:a.interactionTarget||{x:a.x,y:a.y},state:'observe',speed:a.type==='duck'?8:25};
    }
    if(active)return{target:a.interactionTarget||{x:a.targetX,y:a.targetY},state:'observe',speed:24};
    if(badWeather&&a.type!=='duck'){
      if(a.mode!=='shelter'){const shelters=this.scene.shelter,spot=shelters[a.x<320?0:1];a.interactionTarget=this.nearby(spot.x,spot.y,a.type);this._stopAnimal(a,'observe',0);}
      a.mode='shelter';return{target:a.interactionTarget,state:'rest',speed:29};
    }
    if(a.mode&&a.mode!=='photo'){a.mode=null;a.interactionTarget=null;this._stopAnimal(a,'observe',.5);}
    if(a.photoId){a.mode='photo';return null;}
    return null;
  }
  _tree(x,y,s,phase,p,decor=null){
    const id=phase===2?'pine':'apple',shake=this.treeShakes?.get(id)||0;
    const sway=this.wind*(.11+Math.sin(this.time*3+phase)*.06)+Math.sin(this.time*24)*shake*.16;
    this.g.save();this.g.translate(x,y);this.g.transform(1,0,sway,1,0,0);this.g.translate(-x,-y);super._tree(x,y,s,phase,p,decor);this.g.restore();
  }
  _drawArtLand(p){
    const shear=this.wind*(.045+Math.sin(this.time*2.7)*.025)+Math.sin(this.time*21)*(this.treeShakes?.get('cherry')||0)*.09;
    if(Math.abs(shear)<.001){super._drawArtLand(p);return;}
    // Move the existing canopy pixels; no replacement of the artist's PNGs.
    const g=this.g,c=this.scene.canopy,r=this.scene.worldRect;g.save();g.beginPath();g.rect(-100,-100,840,600);g.rect(c.x,c.y,c.width,c.height);g.clip('evenodd');super._drawArtLand(p);g.restore();
    g.save();g.translate(c.anchorX,c.anchorY);g.transform(1,0,shear,1,0,0);g.translate(-c.anchorX,-c.anchorY);g.beginPath();g.rect(c.x,c.y,c.width,c.height);g.clip();this._sprite('island.pond',r.x,r.y,r.width,r.height,{anchor:[0,0]});g.restore();
  }
  _artFlower(f,p){const g=this.g;g.save();g.translate(f.x,f.y);const touch=this.time<(f.touchUntil||0)?Math.sin(this.time*16)*.14:0;g.rotate(this.wind*(.07+Math.sin(this.time*4+f.p)*.04)+touch);g.translate(-f.x,-f.y);super._artFlower(f,p);g.restore();}
  _animal(a,p){
    const g=this.g;
    if(a.photoId){const img=this.photoCache.get(a.photoId),y=a.y-(a.hop||0);g.save();g.translate(a.x,y);g.fillStyle='#b6c59b';g.fillRect(-7,-13,14,12);g.fillStyle='#c6ac84';g.fillRect(-9,-31,18,19);if(img?.complete&&img.naturalWidth)g.drawImage(img,-8,-30,16,16);g.fillStyle='#776f63';g.fillRect(-6,-1,4,4);g.fillRect(2,-1,4,4);g.restore();return;}
    super._animal(a,p);
    if(a.mode==='shelter'&&a.state==='rest')this._bubble(a.x,a.y-37,'避风');
  }
  _drawWind(p){super._drawWind(p);if(this.wind<.25)return;const g=this.g;g.save();g.globalAlpha=this.wind*.65;g.strokeStyle='#d7e7ce';g.lineWidth=1.5;for(let i=0;i<8;i++){const x=((this.time*(120+this.wind*70)+i*91)%670)-40,y=145+(i%5)*32;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+23,y-7,x+50,y);g.stroke();}g.restore();}
  _drawCursor(p){
    super._drawCursor(p);this._ensureHabitat();const g=this.g;
    if(!this.sunAway&&!this.parallelSunAway&&this.desktopMode){const{x,y}=this.sun;g.save();g.translate(x,y);g.fillStyle=this.nightMix>.5?'#d9d7bd':'#efd188';g.fillRect(-10,-13,20,26);g.fillRect(-13,-9,26,18);g.restore();}
    if(this.desktopMode&&!this._rainCloudVisible()&&!(this.time<(this.visualRainUntil||0)))this._drawCloud(this.scene.idleCloud,p,false);
    for(const r of this.reactions)this._bubble(r.x,r.y,r.text,Math.min(1,r.life));
  }
  _bubble(x,y,text,alpha=1){const g=this.g;g.save();g.globalAlpha=alpha;g.font='9px "Microsoft YaHei",sans-serif';g.textAlign='center';const w=g.measureText(text).width+10;g.fillStyle='#fbf6dfed';g.fillRect(x-w/2,y-11,w,16);g.fillStyle='#6c815e';g.fillText(text,x,y);g.restore();}
}
