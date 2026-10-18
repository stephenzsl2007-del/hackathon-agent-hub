import {World} from './world.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const names={rabbit:'兔子',bird:'小鸟',squirrel:'松鼠',duck:'鸭子',cat:'小猫',dog:'团团',visitor:'相片访客'};
const trees=[{id:'cherry',x:220,y:142,w:150,h:125},{id:'pine',x:461,y:184,w:62,h:88},{id:'apple',x:497,y:258,w:69,h:84}];

/** Gameplay extension of Am1Reux7's round island; its layout and art stay intact. */
export class HabitatWorld extends World {
  constructor(canvas,options){super(canvas,options);this._ensureHabitat();}
  _ensureHabitat(){
    this.reactions ||= [];this.treeShakes ||= new Map();this.clickTimes ||= [];
    this.photoCache ||= new Map();this.weather ||= {rain:0,cloud:0,wet:0};
    this.neighborSerial ||= 1;this.lastInvitation ??= -90;this.sun ||= {x:505,y:70};
  }
  _skyObject(p){
    this._ensureHabitat();
    if(!this.sunAway&&!this.parallelSunAway&&Math.hypot(p.x-this.sun.x,p.y-this.sun.y)<23)return 'sun';
    if(p.x>280&&p.x<440&&p.y>42&&p.y<103)return 'cloud';
    return null;
  }
  hitTest(x,y){const p=this._position({clientX:x,clientY:y});return !!this._skyObject(p)||super.hitTest(x,y);}
  _down(e){
    if(this.tool!=='explore'||e.button!==0&&e.pointerType!=='touch'){super._down(e);return;}
    const p=this._position(e),sky=this._skyObject(p);
    if(sky){Object.assign(this.mouse,p,{down:true,since:this.time});this.canvas.setPointerCapture?.(e.pointerId);
      if(sky==='sun')this.dragSun=true;else{this.dragCloud={x:p.x,y:p.y,w:1.4};this.rainUntil=this.time+1;}
      return;
    }
    const animal=[...this.animals].reverse().find(a=>Math.abs(p.x-a.x)<18&&p.y>a.y-34&&p.y<a.y+7);
    if(animal){animal.mode='follow';animal.interactionUntil=this.time+6;animal.bond=(animal.bond||0)+1;animal.hop=3;
      this._heart(animal.x,animal.y-30);this.say(animal.x,animal.y-45,`${animal.name||names[animal.type]}跟着你`);this._emit('pet','它记住你了，移动光标带它走一会儿。');return;}
    const tree=trees.find(t=>Math.abs(p.x-t.x)<t.w*.42&&p.y>t.y-t.h&&p.y<t.y+3);
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
    if(this.tool==='explore'&&(this._skyObject(p)||trees.some(t=>Math.abs(p.x-t.x)<t.w*.4&&p.y>t.y-t.h&&p.y<t.y)))this.canvas.style.cursor=this.dragSun?'grabbing':'pointer';
  }
  _up(){
    if(this.dragSun){this.sunAway=this.sun.y<15||this.sun.y>140||this.sun.x<35||this.sun.x>605;this.sun={x:505,y:70};this.dragSun=false;this._emit('sun',this.sunAway?'太阳去休息了，小岛亮起萤火。右键可以请太阳回来。':'太阳又回到天空。');}
    if(this.dragCloud)this.rainCloud={...this.dragCloud};
    super._up();
  }
  say(x,y,text){this.reactions.push({x,y,text,life:2});this.reactions=this.reactions.slice(-8);}
  shakeTree(tree){
    if(this.time-(this.lastShake??-10)<.35)return;this.lastShake=this.time;
    this.treeShakes.set(tree.id,1);this._petals(tree.x,tree.y-tree.h*.65,20,tree.id==='cherry'?'#efafc6':tree.id==='apple'?'#d88061':'#b8d391');
    this.say(tree.x,tree.y-tree.h-5,tree.id==='apple'?'落果啦！':'沙沙沙');
    if(tree.id==='apple'){this._feed(437,286);this.gather(437,286);}else if(tree.id==='cherry')this.gather(258,175);
    this._emit('tree',tree.id==='apple'?'果子落下来了，小动物正跑来分享。':'树枝晃了晃，叶片和花瓣落在你身边。');
  }
  nearby(x,y,type){
    const valid=(px,py)=>type==='duck'?this._pond(px,py):this._walkable(px,py);
    if(valid(x,y))return{x,y};
    for(let r=8;r<160;r+=10)for(let i=0;i<12;i++){const a=i*Math.PI/6,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(valid(px,py))return{x:px,y:py};}
    return type==='duck'?{x:191,y:253}:{x:345,y:280};
  }
  gather(x,y){for(const a of this.animals.filter(a=>a.type!=='duck')){const p=this.nearby(x+(this._rand()-.5)*50,y+(this._rand()-.5)*25,a.type);a.targetX=p.x;a.targetY=p.y;a.mode='gather';a.interactionUntil=this.time+6;}}
  inviteAnimal(type='rabbit'){
    if(this.demoMode)return{ok:false,error:'先结束演示，再邀请邻居。'};
    if(!['rabbit','bird','squirrel','duck'].includes(type))return{ok:false,error:'暂时还没有这种邻居。'};
    if(this.animals.filter(a=>!a.photoId).length>=12)return{ok:false,error:'岛上已经有 12 位动物邻居了，先陪它们玩一会儿。'};
    if(this.time-this.lastInvitation<4)return{ok:false,error:'新邻居正在走过来，稍等一下。'};
    this.lastInvitation=this.time;const home=this.nearby(330+this._rand()*100,235+this._rand()*65,type),start=this.nearby(home.x-65,home.y+15,type);
    this.animals.push({id:`neighbor-${this.neighborSerial++}-${Math.round(this.time*100)}`,type,x:start.x,y:start.y,homeX:home.x,homeY:home.y,targetX:home.x,targetY:home.y,phase:0,dir:1,hop:0,wait:0,bond:0,mode:'arrive',interactionUntil:this.time+8});
    this.visitors++;this._petals(start.x,start.y-15,12,'#e4d789');this._emit('neighbor',`一位新${names[type]}来串门了。`);return{ok:true};
  }
  impulse(action,data={}){
    if(action==='invite-animal')return this.inviteAnimal(data.animalType||data.type);
    if(action==='sun-return'){this.sunAway=false;this.night=false;this._emit('sun',this.parallelSunAway?'关联文件夹里的太阳还没回来，把「太阳.txt」移回去就能恢复白天。':'太阳回到了天空。');return{ok:true};}
    if(action==='weather-preview'){super.impulse('wind',{value:1,duration:7});super.impulse('rain',{x:360,y:220,duration:7});return{ok:true};}
    return super.impulse(action,data);
  }
  setParallel(state={}){
    this._ensureHabitat();this.parallelState=state;this.parallelSunAway=!!state.active&&!state.sunPresent;
    const images=state.active?(state.images||[]).slice(0,8):[],ids=new Set(images.map(i=>i.id));
    this.animals=this.animals.filter(a=>!a.photoId||ids.has(a.photoId));
    for(const [i,image]of images.entries()){
      if(!this.animals.some(a=>a.photoId===image.id)){
        const home=this.nearby(395+(i%3)*18,263+Math.floor(i/3)*15,'visitor');
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
  clearTransientState(){super.clearTransientState();this._ensureHabitat();this.reactions=[];this.treeShakes.clear();this.clickTimes=[];this.dragSun=false;this.sun={x:505,y:70};this.weather={rain:0,cloud:0,wet:0};}
  _update(dt){
    this._ensureHabitat();const parallel=this.parallelState;
    if(!this.demoMode&&parallel?.active&&parallel.wind)this.setWind(.8,'parallel');
    if(!this.demoMode&&parallel?.active&&parallel.rain){this.rainCloud={x:350,y:110,w:1.5};this.rainUntil=this.time+.6;}
    const rawNight=this.night;this.night=rawNight||(!this.demoMode&&(this.sunAway||this.parallelSunAway));
    try{super._update(dt);}finally{this.night=rawNight;}
    const raining=this.dragCloud||this.time<this.rainUntil,typing=this.time<(this.visualRainUntil||0);
    const target=raining ? .9 : typing ? .4+(this.visualRainIntensity||0)*.6 : 0;
    this.weather.rain+=(target-this.weather.rain)*Math.min(1,dt*(target?4:1.8));this.weather.cloud+=((target?1:0)-this.weather.cloud)*Math.min(1,dt*2.5);
    this.weather.wet=clamp(this.weather.wet+dt*(this.weather.rain*.08-.02));
    for(const [id,amount]of this.treeShakes)this.treeShakes.set(id,Math.max(0,amount-dt*.9));
    this.reactions=this.reactions.filter(r=>(r.life-=dt)>0);
    if(this.wind>.3&&this.time-(this.lastWindLeaf||0)>.18){this.lastWindLeaf=this.time;this._petals(220+this._rand()*240,130+this._rand()*60,1,'#b9ce91');}
  }
  _stepAnimals(dt){
    const all=this.animals,locked=[],normal=[];
    for(const a of all){
      const badWeather=this.wind>.7||this.weather?.rain>.7;
      if(a.photoId||a.interactionUntil>this.time||badWeather&&a.type!=='duck'){
        if(!(a.interactionUntil>this.time)&&badWeather){a.mode='shelter';const p=this.nearby(a.x<320?245:450,a.x<320?172:215,a.type);a.targetX=p.x;a.targetY=p.y;}
        locked.push(a);
      }else{a.mode=null;normal.push(a);}
    }
    this.animals=normal;try{super._stepAnimals(dt);}finally{this.animals=all;}
    for(const a of locked){
      a.phase+=dt;
      if(a.photoId&&a.mode==='follow'&&!(a.interactionUntil>this.time))a.mode='photo';
      if(a.mode==='follow'&&this.mouse.x>0){const p=this.nearby(this.mouse.x-12,this.mouse.y,a.type);a.targetX=p.x;a.targetY=p.y;}
      if(a.photoId&&a.mode!=='follow'&&Math.hypot(a.targetX-a.x,a.targetY-a.y)<3&&this._rand()<dt*.6){const p=this.nearby(a.homeX+(this._rand()-.5)*55,a.homeY+(this._rand()-.5)*30,'visitor');a.targetX=p.x;a.targetY=p.y;}
      if(a.mode==='splash'){a.hop=Math.abs(Math.sin(a.phase*10))*5;continue;}
      const dx=a.targetX-a.x,dy=a.targetY-a.y,d=Math.hypot(dx,dy),step=Math.min(d,dt*(a.mode==='shelter'?36:27));
      if(d>2){const angle=Math.atan2(dy,dx);let best=null;
        for(const offset of [0,.45,-.45,.9,-.9,1.5,-1.5]){const heading=angle+offset,nx=a.x+Math.cos(heading)*step,ny=a.y+Math.sin(heading)*step,valid=a.type==='duck'?this._pond(nx,ny):this._walkable(nx,ny);if(valid){const score=Math.hypot(a.targetX-nx,a.targetY-ny)+Math.abs(offset)*.2;if(!best||score<best.score)best={nx,ny,score};}}
        if(best){a.dir=best.nx<a.x?-1:1;a.x=best.nx;a.y=best.ny;}a.hop=Math.abs(Math.sin(a.phase*12))*2.8;a.state='walk';
      }else{a.hop=Math.max(0,(a.hop||0)-dt*5);a.state=a.mode==='shelter'?'rest':'observe';}
    }
  }
  _tree(x,y,s,phase,p){
    const id=phase===2?'pine':'apple',shake=this.treeShakes?.get(id)||0;
    const sway=this.wind*(.11+Math.sin(this.time*3+phase)*.06)+Math.sin(this.time*24)*shake*.16;
    this.g.save();this.g.translate(x,y);this.g.transform(1,0,sway,1,0,0);this.g.translate(-x,-y);super._tree(x,y,s,phase,p);this.g.restore();
  }
  _drawArtLand(p){
    const shear=this.wind*(.045+Math.sin(this.time*2.7)*.025)+Math.sin(this.time*21)*(this.treeShakes?.get('cherry')||0)*.09;
    if(Math.abs(shear)<.001){super._drawArtLand(p);return;}
    // Move the existing canopy pixels; no replacement of the artist's PNGs.
    const g=this.g;g.save();g.beginPath();g.rect(-100,-100,840,600);g.rect(144,14,174,121);g.clip('evenodd');super._drawArtLand(p);g.restore();
    g.save();g.translate(220,140);g.transform(1,0,shear,1,0,0);g.translate(-220,-140);g.beginPath();g.rect(144,14,174,121);g.clip();this._sprite('island.pond',60,14,520,370,{anchor:[0,0]});g.restore();
  }
  _artFlower(f,p){const g=this.g;g.save();g.translate(f.x,f.y);const touch=this.time<(f.touchUntil||0)?Math.sin(this.time*16)*.14:0;g.rotate(this.wind*(.07+Math.sin(this.time*4+f.p)*.04)+touch);g.translate(-f.x,-f.y);super._artFlower(f,p);g.restore();}
  _animal(a,p){
    const g=this.g;
    if(a.photoId){const img=this.photoCache.get(a.photoId),y=a.y-(a.hop||0);g.save();g.translate(a.x,y);g.fillStyle='#b6c59b';g.fillRect(-7,-13,14,12);g.fillStyle='#c6ac84';g.fillRect(-9,-31,18,19);if(img?.complete&&img.naturalWidth)g.drawImage(img,-8,-30,16,16);g.fillStyle='#776f63';g.fillRect(-6,-1,4,4);g.fillRect(2,-1,4,4);g.restore();return;}
    g.save();if(a.dir<0){g.translate(a.x*2,0);g.scale(-1,1);}super._animal(a,p);g.restore();
    if(a.mode==='shelter'&&a.state==='rest')this._bubble(a.x,a.y-37,'避风');
  }
  _drawCloud(c,p,raining=false){if(!raining){super._drawCloud(c,p,false);return;}const g=this.g;g.save();g.translate(c.x,c.y);g.scale(c.w,c.w);this._pixelPuff(-18,0,27,12,'#737e90');this._pixelPuff(7,-10,28,18,'#7e899a');this._pixelPuff(34,2,24,12,'#6c798c');this._rect(-41,10,93,5,'#56677d');g.restore();}
  _drawWind(p){super._drawWind(p);if(this.wind<.25)return;const g=this.g;g.save();g.globalAlpha=this.wind*.65;g.strokeStyle='#d7e7ce';g.lineWidth=1.5;for(let i=0;i<8;i++){const x=((this.time*(120+this.wind*70)+i*91)%670)-40,y=145+(i%5)*32;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+23,y-7,x+50,y);g.stroke();}g.restore();}
  _drawParticles(p){
    super._drawParticles(p);const g=this.g;g.save();g.strokeStyle='#a7cbdc';g.lineWidth=1.2;
    for(const drop of this.particles.filter(p=>p.kind==='rain')){g.globalAlpha=clamp(drop.life*1.5);g.beginPath();g.moveTo(drop.x,drop.y);g.lineTo(drop.x-2-this.wind*4,drop.y-7);g.stroke();}g.restore();
  }
  _drawCursor(p){
    super._drawCursor(p);this._ensureHabitat();const g=this.g;
    if(!this.sunAway&&!this.parallelSunAway&&this.desktopMode){const{x,y}=this.sun;g.save();g.translate(x,y);g.fillStyle=this.nightMix>.5?'#d9d7bd':'#efd188';g.fillRect(-10,-13,20,26);g.fillRect(-13,-9,26,18);g.restore();}
    if(this.weather.cloud>.01){g.save();g.globalAlpha=this.weather.cloud;this._drawCloud({x:this.dragCloud?.x||this.rainCloud?.x||355,y:80,w:1.6},p,true);g.restore();}
    else if(this.desktopMode)this._drawCloud({x:355,y:77,w:1},p,false);
    for(const r of this.reactions)this._bubble(r.x,r.y,r.text,Math.min(1,r.life));
  }
  _bubble(x,y,text,alpha=1){const g=this.g;g.save();g.globalAlpha=alpha;g.font='9px "Microsoft YaHei",sans-serif';g.textAlign='center';const w=g.measureText(text).width+10;g.fillStyle='#fbf6dfed';g.fillRect(x-w/2,y-11,w,16);g.fillStyle='#6c815e';g.fillText(text,x,y);g.restore();}
}
