import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/audio.js', import.meta.url), 'utf8').replaceAll('export class ', 'class ');
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const settle = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function fixture() {
  const timers=new Map(), listeners=new Map(), contexts=[], gates={resume:[],suspend:[]}; let timerId=0;
  class Param {
    constructor(){this.value=0;this.cancelled=0;}
    setValueAtTime(value){this.value=value;} setTargetAtTime(value){this.value=value;}
    linearRampToValueAtTime(value){this.value=value;} exponentialRampToValueAtTime(value){this.value=value;}
    cancelScheduledValues(){this.cancelled++;}
  }
  class Node {
    constructor(kind){this.kind=kind;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.connected=false;this.stopped=false;this.disconnects=0;}
    connect(node){this.connected=true;return node;} disconnect(){this.connected=false;this.disconnects++;}
    start(){this.started=true;} stop(at){if(at===undefined)this.stopped=true;else this.stopAt=at;}
  }
  class Context {
    constructor(){this.state='suspended';this.currentTime=1;this.sampleRate=32;this.nodes=[];this.calls=[];this.inFlight=0;this.maxInFlight=0;this.destination={};contexts.push(this);}
    node(kind){const node=new Node(kind);this.nodes.push(node);return node;}
    createGain(){return this.node('gain');} createBufferSource(){return this.node('noise');} createBiquadFilter(){return this.node('filter');} createOscillator(){return this.node('tone');}
    createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
    async transition(kind,next){this.calls.push(kind);this.maxInFlight=Math.max(this.maxInFlight,++this.inFlight);try{const gate=gates[kind].shift();if(gate)await gate.promise;if(this.state!=='closed')this.state=next;}finally{this.inFlight--;}}
    resume(){return this.transition('resume','running');} suspend(){return this.transition('suspend','suspended');}
    async close(){this.calls.push('close');this.state='closed';}
  }
  const sandbox=vm.createContext({AudioContext:Context,setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type){listeners.delete(type);}});
  vm.runInContext(`${source}\nglobalThis.GardenAudio=GardenAudio;`,sandbox);
  const audio=new sandbox.GardenAudio();
  return {audio,contexts,timers,listeners,gate(kind){const gate=deferred();gates[kind].push(gate);return gate;}};
}

test('sound is opt-in and suspension does not allocate an audio context',async()=>{
  const h=fixture();assert.equal(h.audio.enabled,false);
  await h.audio.setSuspended(true);await h.audio.setSuspended(false);
  assert.equal(h.contexts.length,0);assert.equal(h.timers.size,0);h.audio.dispose();
});

test('hide pauses the entire sound graph, clears scheduled notes, and retains the user preference',async()=>{
  const h=fixture();await h.audio.toggle();const context=h.contexts[0];
  assert.equal(context.state,'running');assert.equal(h.timers.size,1);assert.equal(h.audio._notes.size,3);
  const notes=[...h.audio._notes];await h.audio.setSuspended(true);
  assert.equal(h.audio.enabled,true);assert.equal(context.state,'suspended');assert.equal(h.timers.size,0);assert.equal(h.audio._master.gain.value,0);
  assert.equal(h.audio._notes.size,0);for(const [oscillator,envelope] of notes){assert.equal(oscillator.stopped,true);assert.equal(oscillator.connected,false);assert.equal(envelope.connected,false);}
  h.audio.chime('seed');assert.equal(h.audio._notes.size,0);
  await h.audio.setSuspended(false);assert.equal(context.state,'running');assert.equal(h.audio.enabled,true);assert.equal(h.timers.size,1);assert.equal(h.contexts.length,1);
  h.audio.dispose();assert.equal(context.state,'closed');assert.equal(h.timers.size,0);
});

test('repeated lifecycle requests are idempotent and keep only one ambient timer',async()=>{
  const h=fixture();await h.audio.toggle();const context=h.contexts[0];
  await Promise.all(Array.from({length:5},()=>h.audio.setSuspended(true)));
  assert.deepEqual(context.calls,['resume','suspend']);
  await Promise.all(Array.from({length:5},()=>h.audio.setSuspended(false)));
  assert.deepEqual(context.calls,['resume','suspend','resume']);assert.equal(h.timers.size,1);
  h.audio.dispose();h.audio.dispose();assert.equal(context.calls.filter(call=>call==='close').length,1);assert.equal(h.listeners.size,0);
});

test('turning sound off while hidden stays off after showing the island',async()=>{
  const h=fixture();await h.audio.toggle();await h.audio.setSuspended(true);await h.audio.toggle();
  await h.audio.setSuspended(false);assert.equal(h.audio.enabled,false);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.timers.size,0);h.audio.dispose();
});

test('turning sound on while suspended records the preference without starting playback',async()=>{
  const h=fixture();await h.audio.setSuspended(true);assert.equal(await h.audio.toggle(),true);
  assert.equal(h.contexts[0].state,'suspended');assert.equal(h.audio._master.gain.value,0);assert.equal(h.timers.size,0);
  await h.audio.setSuspended(false);assert.equal(h.contexts[0].state,'running');assert.equal(h.timers.size,1);h.audio.dispose();
});

test('a hide during a pending resume cannot rearm notes or the ambient timer',async()=>{
  const h=fixture(),gate=h.gate('resume');const toggle=h.audio.toggle();const context=h.contexts[0];
  const hide=h.audio.setSuspended(true);assert.equal(h.audio._master.gain.value,0);gate.resolve();await Promise.all([toggle,hide]);
  assert.equal(context.state,'suspended');assert.equal(context.maxInFlight,1);assert.equal(h.timers.size,0);assert.equal(h.audio._notes.size,0);assert.equal(h.audio.enabled,true);h.audio.dispose();
});

test('show and toggle races wait for suspension, then apply only the latest preference',async()=>{
  const h=fixture();await h.audio.toggle();const gate=h.gate('suspend');const hide=h.audio.setSuspended(true);
  const show=h.audio.setSuspended(false),off=h.audio.toggle(),on=h.audio.toggle();gate.resolve();await Promise.all([hide,show,off,on]);
  assert.equal(h.audio.enabled,true);assert.equal(h.contexts[0].state,'running');assert.equal(h.contexts[0].maxInFlight,1);assert.equal(h.timers.size,1);assert.equal(h.contexts.length,1);
  assert.equal(h.contexts[0].nodes.filter(node=>node.kind==='noise').length,1);h.audio.dispose();
});

test('disposing during resume closes all nodes and pending work cannot restart sound',async()=>{
  const h=fixture(),gate=h.gate('resume');const pending=h.audio.toggle();const context=h.contexts[0];h.audio.dispose();gate.resolve();await pending;await settle();
  assert.equal(h.audio.enabled,false);assert.equal(context.state,'closed');assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);assert.ok(context.nodes.every(node=>!node.connected));
  assert.equal(context.nodes.find(node=>node.kind==='noise').stopped,true);assert.equal(await h.audio.setSuspended(false),false);assert.equal(await h.audio.toggle(),false);
});

test('a denied resume leaves sound off without timers; a later user gesture can retry',async()=>{
  const h=fixture(),gate=h.gate('resume');const pending=h.audio.toggle();gate.reject(new Error('not allowed'));assert.equal(await pending,false);
  assert.equal(h.audio._master.gain.value,0);assert.equal(h.timers.size,0);assert.equal(await h.audio.toggle(),true);assert.equal(h.timers.size,1);h.audio.dispose();
});

test('a failed background suspension still mutes immediately and does not erase preference',async()=>{
  const h=fixture();await h.audio.toggle();const gate=h.gate('suspend');const pending=h.audio.setSuspended(true);gate.reject(new Error('unavailable'));await pending;
  assert.equal(h.audio.enabled,true);assert.equal(h.audio._master.gain.value,0);assert.equal(h.timers.size,0);assert.equal(h.audio._notes.size,0);
  await h.audio.setSuspended(false);assert.equal(h.audio._master.gain.value,.24);assert.equal(h.timers.size,1);h.audio.dispose();
});

test('an automatic resume failure retains the preference and a later visibility cycle retries',async()=>{
  const h=fixture();await h.audio.toggle();await h.audio.setSuspended(true);
  const gate=h.gate('resume');const pending=h.audio.setSuspended(false);gate.reject(new Error('device unavailable'));await pending;
  assert.equal(h.audio.enabled,true);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.timers.size,0);assert.equal(h.audio._master.gain.value,0);
  await h.audio.setSuspended(true);await h.audio.setSuspended(false);assert.equal(h.audio.enabled,true);assert.equal(h.contexts[0].state,'running');assert.equal(h.timers.size,1);h.audio.dispose();
});
