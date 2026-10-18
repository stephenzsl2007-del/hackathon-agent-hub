import test from 'node:test';
import assert from 'node:assert/strict';
import { installIslandDrag } from '../public/island-drag.js';

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { event.type = type; for (const fn of [...(listeners.get(type) || [])]) { fn(event); if (event.stopped) break; } return event; },
    listenerCount() { return [...listeners.values()].reduce((sum, values) => sum + values.size, 0); },
  };
}
function fixture(t, options = {}) {
  const doc = target(), view = target(); doc.defaultView = view; doc.hidden = false;
  const captures = new Set();
  const canvas = { ownerDocument: doc, closest: () => null, contains: element => element === canvas };
  const handle = { closest: selector => selector === '#island-drag-handle' ? handle : null };
  for (const element of [canvas,handle]) {
    element.setPointerCapture = id => captures.add(id);
    element.hasPointerCapture = id => captures.has(id);
    element.releasePointerCapture = id => { captures.delete(id); doc.emit('lostpointercapture', { pointerId: id }); };
  }
  const state = { tool: 'explore', desktopMode: true, moveMode: false, hasOpenDialog: false, ...options.state };
  const taps = [], moves = [], phases = [], ignore = [], starts = [];
  const world = { hitTest: () => true, isWeatherHandleAt: () => false, tapInteraction: payload => taps.push(payload), ...options.world };
  const bridge = { moveGarden: async delta => { moves.push(delta); return delta; }, setIgnoreMouse: value => { ignore.push(value); }, ...options.bridge };
  const drag = installIslandDrag({ canvas, world, bridge, getState: () => state, onInteractionStart: () => starts.push(true), onDragState: value => phases.push(value) });
  t.after(() => drag.destroy());
  const pointer = (type, extra = {}) => doc.emit(type, { target: canvas, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, screenX: 100, screenY: 100, clientX: 70, clientY: 60, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra });
  return { doc, view, canvas, handle, captures, state, taps, moves, phases, ignore, starts, drag, pointer };
}
const settle = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };

test('explore defers object interaction until a tap is released', t => {
  const h = fixture(t);
  const down = h.pointer('pointerdown');
  assert.equal(down.stopped,true); assert.equal(h.drag.isActive(),true); assert.equal(h.taps.length,0); assert.equal(h.captures.has(1),true);
  h.pointer('pointermove',{screenX:104});
  assert.equal(h.moves.length,0);
  h.pointer('pointerup',{screenX:104});
  assert.equal(h.taps.length,1); assert.equal(h.taps[0].clientX,70); assert.equal(h.moves.length,0); assert.equal(h.captures.size,0); assert.equal(h.drag.isActive(),false);
  assert.deepEqual(h.ignore,[false]); assert.equal(h.starts.length,1);
});

test('crossing 5 CSS px drags the island and does not activate its object', async t => {
  const h = fixture(t);
  h.pointer('pointerdown'); h.pointer('pointermove',{screenX:105,clientX:75});
  h.pointer('pointermove',{screenX:112,clientX:71}); // Window movement changes clientX, never the native delta.
  h.pointer('pointerup',{screenX:112,clientX:71}); await settle();
  assert.equal(h.taps.length,0); assert.equal(h.moves.reduce((sum,p)=>sum+p.dx,0),12);
  assert.equal(h.moves.reduce((sum,p)=>sum+p.dy,0),0); assert.equal(h.drag.isActive(),false);
  assert.ok(h.phases.some(value=>value.phase==='dragging'));
  assert.equal(h.pointer('click').stopped,true);
});

test('cancel, lost capture, blur and hidden document never replay a tap', t => {
  for (const event of ['pointercancel','lostpointercapture','blur','hidden']) {
    const h = fixture(t); h.pointer('pointerdown');
    if(event==='blur')h.view.emit('blur');
    else if(event==='hidden'){h.doc.hidden=true;h.doc.emit('visibilitychange');}
    else h.pointer(event);
    assert.equal(h.drag.isActive(),false,event);assert.equal(h.captures.size,0,event);assert.equal(h.taps.length,0,event);
  }
});

test('other tools and weather handles keep their normal pointer interactions', t => {
  const h=fixture(t,{state:{tool:'rain'}});
  assert.equal(h.pointer('pointerdown').stopped,undefined);assert.equal(h.drag.isActive(),false);
  const cloud=fixture(t,{world:{isWeatherHandleAt:()=>true}});
  assert.equal(cloud.pointer('pointerdown').stopped,undefined);assert.equal(cloud.drag.isActive(),false);
  const empty=fixture(t,{world:{hitTest:()=>false}});
  assert.equal(empty.pointer('pointerdown').stopped,undefined);
});

test('Option, the drag handle and legacy move mode can move in any tool', async t => {
  for (const kind of ['option','handle','moveMode']) {
    const h=fixture(t,{state:{tool:'seed'},world:{hitTest:()=>false,isWeatherHandleAt:()=>true}});
    if(kind==='moveMode')h.state.moveMode=true;
    const extra=kind==='option'?{altKey:true}:kind==='handle'?{target:h.handle}:{};
    h.pointer('pointerdown',extra);h.pointer('pointermove',{...extra,screenX:110});h.pointer('pointerup',{...extra,screenX:110});await settle();
    assert.equal(h.moves.reduce((sum,value)=>sum+value.dx,0),10,kind);assert.equal(h.taps.length,0,kind);
  }
});

test('dialogs, right clicks, control-click and non-desktop views are not intercepted', t => {
  const h=fixture(t,{state:{hasOpenDialog:true}});
  assert.equal(h.pointer('pointerdown',{altKey:true}).stopped,undefined);
  h.state.hasOpenDialog=false;
  assert.equal(h.pointer('pointerdown',{button:2}).stopped,undefined);
  assert.equal(h.pointer('pointerdown',{ctrlKey:true}).stopped,undefined);
  h.state.desktopMode=false;
  assert.equal(h.pointer('pointerdown',{altKey:true}).stopped,undefined);
});

test('native moves are serialized, queued deltas survive release, and native boundary clamp wins', async t => {
  const calls=[], pending=[];let x=430;
  const h=fixture(t,{bridge:{moveGarden:delta=>{calls.push(delta);return new Promise(resolve=>pending.push(()=>{x=Math.max(0,Math.min(440,x+delta.dx));resolve({bounds:{x}});}));}}});
  h.pointer('pointerdown');h.pointer('pointermove',{screenX:130});h.pointer('pointermove',{screenX:150});h.pointer('pointerup',{screenX:150});
  assert.equal(calls.length,1);assert.equal(h.drag.isActive(),true);
  pending.shift()();await settle();assert.equal(calls.length,2);assert.equal(x,440);
  pending.shift()();await settle();assert.equal(x,440);assert.equal(h.drag.isActive(),false);
  assert.deepEqual(calls,[{dx:30,dy:0,dragging:true},{dx:20,dy:0,dragging:true}]);
  h.pointer('pointerdown',{screenX:150});h.pointer('pointermove',{screenX:140});h.pointer('pointerup',{screenX:140});
  pending.shift()();await settle();assert.equal(x,430);
});

test('cancel discards unsent movements and destroy removes every listener', async t => {
  const calls=[],pending=[];
  const h=fixture(t,{bridge:{moveGarden:delta=>{calls.push(delta);return new Promise(resolve=>pending.push(resolve));}}});
  h.pointer('pointerdown');h.pointer('pointermove',{screenX:110});h.pointer('pointermove',{screenX:130});h.drag.cancel();
  assert.equal(h.drag.isActive(),false);pending.shift()();await settle();assert.equal(calls.length,1);
  h.drag.destroy();assert.equal(h.doc.listenerCount(),0);assert.equal(h.view.listenerCount(),0);
});

test('native drag finishes only after the final queued movement has completed', async t => {
  const order=[],pending=[];
  const h=fixture(t,{bridge:{moveGarden:delta=>{order.push(`move:${delta.dx}`);return new Promise(resolve=>pending.push(resolve));},finishMove:async()=>{order.push('finish');}}});
  h.pointer('pointerdown');h.pointer('pointermove',{screenX:120});h.pointer('pointermove',{screenX:150});h.pointer('pointerup',{screenX:150});
  assert.deepEqual(order,['move:20']);pending.shift()();await settle();
  assert.deepEqual(order,['move:20','move:30']);pending.shift()();await settle();
  assert.deepEqual(order,['move:20','move:30','finish']);assert.equal(h.drag.isActive(),false);
});

test('cancellation and destruction still finish an in-flight native drag', async t => {
  for(const action of ['cancel','destroy']){
    const order=[],pending=[];
    const h=fixture(t,{bridge:{moveGarden:()=>{order.push('move');return new Promise(resolve=>pending.push(resolve));},finishMove:async()=>order.push('finish')}});
    h.pointer('pointerdown');h.pointer('pointermove',{screenX:120});h.pointer('pointermove',{screenX:150});h.drag[action]();
    pending.shift()();await settle();assert.deepEqual(order,['move','finish'],action);
  }
});

test('Electron zero-button forwarded movement follows a captured drag before pointerup', async t => {
  const h=fixture(t);
  h.pointer('pointerdown');
  h.pointer('pointermove',{buttons:0,button:-1});
  assert.equal(h.drag.isActive(),true);assert.equal(h.captures.has(1),true);assert.equal(h.moves.length,0);
  h.pointer('pointermove',{screenX:130,buttons:0,button:-1});
  assert.deepEqual(h.moves,[{dx:30,dy:0,dragging:true}]); // Move immediately, not only on release.
  h.pointer('pointerup',{screenX:130});await settle();
  assert.deepEqual(h.moves,[{dx:30,dy:0,dragging:true}]);assert.equal(h.taps.length,0);assert.equal(h.drag.isActive(),false);
});

test('a new primary down recovers a stale captured gesture without replaying its tap', async t => {
  const h=fixture(t);
  h.pointer('pointerdown');h.pointer('pointermove',{buttons:0});
  h.pointer('pointerdown',{screenX:140});
  h.pointer('pointermove',{screenX:150});h.pointer('pointerup',{screenX:150});await settle();
  assert.deepEqual(h.moves,[{dx:10,dy:0,dragging:true}]);assert.equal(h.taps.length,0);assert.equal(h.drag.isActive(),false);
});

test('zero-button hover without a captured primary gesture never moves the island', t => {
  const h=fixture(t);
  h.pointer('pointermove',{screenX:130,buttons:0,button:-1});assert.equal(h.moves.length,0);
  h.pointer('pointerdown');h.captures.clear(); // Capture failed/lost before its cleanup notification.
  h.pointer('pointermove',{screenX:160,buttons:0,button:-1});assert.equal(h.moves.length,0);
  h.pointer('pointercancel');h.pointer('pointermove',{screenX:190,buttons:0,button:-1});assert.equal(h.moves.length,0);
});
