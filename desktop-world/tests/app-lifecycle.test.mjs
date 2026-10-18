import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Evaluate the actual app with only automatic boot disabled. DOM/native/world
// dependencies are controlled here; the tested commands and FocusSession are real.
const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/\ninit\(\);\s*$/,'\n');
const focusSource=readFileSync(new URL('../public/focus.js',import.meta.url),'utf8').replace('export class FocusSession','class FocusSession');
function element(id='') {
  const classes=new Set(),listeners=new Map(),attributes=new Map();
  return {id,open:false,hidden:false,disabled:false,style:{},dataset:{},value:'',textContent:'',innerHTML:'',
    classList:{add(name){classes.add(name);},remove(name){classes.delete(name);},contains(name){return classes.has(name);},toggle(name,on){if(on===undefined)on=!classes.has(name);on?classes.add(name):classes.delete(name);return on;}},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener(){},
    emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},
    setAttribute(key,value){attributes.set(key,value);},getAttribute(key){return attributes.get(key);},
    show(){this.open=true;},showModal(){this.open=true;},close(){this.open=false;this.emit('close');},
    matches(selector){return selector===':modal'&&this.open;},
  };
}
function fixture() {
  let now=100000,timerId=0;const timers=new Map(),nodes=new Map(),writes=[],pauses=[],audioChanges=[],rewards=[];
  const $=selector=>{if(!nodes.has(selector))nodes.set(selector,element(selector));return nodes.get(selector);};
  for(const id of ['#board-dialog','#feed-dialog','#guide-dialog','#focus-dialog'])$(id);
  const doc=element('document');Object.assign(doc,{body:element('body'),documentElement:element('html'),hidden:false,querySelector:$,
    querySelectorAll(selector){if(selector==='dialog'||selector==='dialog[open]')return [...nodes].filter(([key,node])=>key.endsWith('-dialog')&&(selector==='dialog'||node.open)).map(([,node])=>node);return [];}});
  const view=element('window');view.desktopWorld={setIgnoreMouse(){},async saveState(data){writes.push(structuredClone(data));return {ok:true,revision:writes.length};}};
  let model={plants:['existing'],night:false,tide:.28},demoMode=false;
  const world={mouse:{down:false},tool:'explore',cancelled:0,
    serialize:()=>structuredClone(model),restore(value){model=structuredClone(value);},getStats:()=>({night:model.night,flowers:model.plants.length}),
    setDemoMode(value){demoMode=value;},setTool(value){this.tool=value;},setNight(value){model.night=value;},setTide(value){model.tide=value;},
    setPaused(value){pauses.push(value);},cancelInteraction(){this.cancelled++;},
    impulse(kind,data){if(kind==='demo-stage')model.plants=[`demo-${data.stage}`];if(kind==='seed')model.plants.push(`${data.source||'local'}-seed`);},
  };
  const mic={active:true,starts:0,stops:0,start(){this.starts++;this.active=true;},stop(){this.stops++;this.active=false;}};
  const audio={enabled:true,suspended:false,setSuspended(value){this.suspended=value;audioChanges.push(value);return Promise.resolve(this.enabled);},setNight(){},chime(){}};
  const desktopUI={closePanels(){for(const [key,node] of nodes)if(key.endsWith('-dialog')&&node.open)node.close();}};
  const context=vm.createContext({console,document:doc,window:view,structuredClone,
    Date:class extends Date {static now(){return now;}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    setInterval(fn,ms){const id=++timerId;timers.set(id,{fn,ms,interval:true});return id;},clearInterval(id){timers.delete(id);},
    __fixture:{world,mic,gardenAudio:audio,desktopUI,rewards},
  });
  vm.runInContext(`${focusSource}\n${appSource}\n({world,mic,gardenAudio,desktopUI}=globalThis.__fixture);\nfocusSession=new FocusSession({onReward:event=>globalThis.__fixture.rewards.push(event)});\nstateReady=true;desktopMode=true;\nglobalThis.api={command,startDemo,stopDemo,selectTool,showDialog,runAction,snapshot,saveNow,focusSession};`,context);
  return {api:context.api,world,mic,audio,$,timers,writes,pauses,audioChanges,rewards,model:()=>model,isDemo:()=>demoMode,
    advance(ms){now+=ms;},fireTimeout(ms){for(const [id,timer] of [...timers])if(!timer.interval&&timer.ms===ms){timers.delete(id);timer.fn();}}};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

for(const action of ['tool','panel','phone']) {
  test(`real ${action} interaction ends the demonstration before changing the saved world`,async()=>{
    const h=fixture();h.api.startDemo();h.fireTimeout(0);
    assert.equal(h.isDemo(),true);assert.deepEqual(h.model().plants,['demo-0']);assert.deepEqual(h.api.snapshot().world.plants,['existing']);
    if(action==='tool'){h.api.selectTool('seed');h.world.impulse('seed',{source:'local'});}
    if(action==='panel'){h.api.showDialog('#guide-dialog');assert.equal(h.$('#guide-dialog').open,true);h.world.impulse('seed',{source:'after-panel'});}
    if(action==='phone')h.api.runAction('seed',undefined,'phone');
    assert.equal(h.isDemo(),false);assert.equal(h.model().plants[0],'existing');assert.equal(h.model().plants.length,2);
    const planted=h.model().plants[1];assert.notEqual(planted,'demo-0');
    // The previously scheduled final stage must not restore an old backup later.
    h.fireTimeout(3500);h.fireTimeout(26000);assert.deepEqual(h.model().plants,['existing',planted]);
    await h.api.saveNow();assert.deepEqual(h.writes.at(-1).world.plants,['existing',planted]);
  });
}

test('hiding stops demonstration and microphone, pauses rendering/audio, and saves the ordinary garden',async()=>{
  const h=fixture();h.api.startDemo();h.fireTimeout(0);h.api.command('visibility',{visible:false});await settle();
  assert.equal(h.isDemo(),false);assert.deepEqual(h.model().plants,['existing']);assert.deepEqual(h.pauses,[true]);assert.deepEqual(h.audioChanges,[true]);assert.equal(h.audio.enabled,true);assert.equal(h.mic.active,false);
  assert.equal(h.mic.stops,1);assert.deepEqual(h.writes.at(-1).world.plants,['existing']);
  h.api.command('visibility',{visible:true});assert.deepEqual(h.pauses,[true,false]);assert.deepEqual(h.audioChanges,[true,false]);assert.equal(h.mic.starts,0);assert.equal(h.mic.active,false);
});

test('ordinary hiding allows a focus timer to continue while OS sleep pauses elapsed time and rewards',async()=>{
  const h=fixture();h.api.focusSession.start(1);h.advance(10000);h.api.command('visibility',{visible:false});
  assert.equal(h.api.focusSession.getState().status,'running');h.advance(10000);h.api.command('suspend');
  assert.equal(h.api.focusSession.getState().status,'paused');assert.equal(h.api.focusSession.getState().remainingSeconds,40);
  h.advance(3600000);h.api.command('resume');await settle();
  assert.equal(h.api.focusSession.getState().status,'paused');assert.equal(h.api.focusSession.getState().remainingSeconds,40);assert.equal(h.rewards.length,0);assert.equal(h.mic.starts,0);
  assert.equal(h.audio.suspended,true);assert.equal(h.pauses.at(-1),true);assert.match(h.$('#world-notice').textContent,/已暂停专注/);
  h.api.command('visibility',{visible:true});assert.equal(h.audio.suspended,false);assert.equal(h.api.focusSession.getState().status,'paused');
  h.api.focusSession.resume();h.advance(40000);assert.equal(h.api.focusSession.getState().status,'completed');assert.equal(h.rewards.length,1);
  h.api.command('resume');assert.equal(h.rewards.length,1);assert.equal(h.mic.starts,0);
});

test('showing the window during OS suspension cannot unpause audio or rendering',()=>{
  const h=fixture();h.api.command('suspend');h.api.command('visibility',{visible:true});
  assert.equal(h.audio.suspended,true);assert.equal(h.pauses.at(-1),true);
  h.api.command('resume');assert.equal(h.audio.suspended,false);assert.equal(h.pauses.at(-1),false);assert.equal(h.mic.starts,0);
});

test('temporary notices replace their earlier timeout and disappear after their final duration',()=>{
  const h=fixture();h.api.command('notice',{message:'第一条'});h.api.command('notice',{message:'第二条'});
  assert.equal(h.$('#world-notice').textContent,'第二条');assert.equal(h.$('#world-notice').classList.contains('show'),true);
  assert.equal([...h.timers.values()].filter(timer=>timer.ms===3500).length,1);h.fireTimeout(3500);assert.equal(h.$('#world-notice').classList.contains('show'),false);
});
