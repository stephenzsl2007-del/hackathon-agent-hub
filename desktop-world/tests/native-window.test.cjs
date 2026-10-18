'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { dragWindowBounds } = require('../desktop/native-services.cjs');

// Evaluate the actual main process functions without Electron, a server, a native
// window or filesystem writes. The screen stub follows Electron's largest-overlap
// getDisplayMatching contract, which exposes edge traps hidden by a pure clamp test.
function fixture(areas, initial) {
  let bounds={...initial}, cursor={x:initial.x+100,y:initial.y+100}, sequence=0;
  const timers=new Map(), saves=[], ignored=[], minimums=[];
  const displays=areas.map((workArea,id)=>({id,workArea}));
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  const distance=(a,p)=>Math.hypot(Math.max(a.x-p.x,p.x-a.x-a.width,0),Math.max(a.y-p.y,p.y-a.y-a.height,0));
  const screen={getAllDisplays:()=>displays,getPrimaryDisplay:()=>displays[0],getDisplayMatching:r=>[...displays].sort((a,b)=>overlap(b.workArea,r)-overlap(a.workArea,r))[0],getCursorScreenPoint:()=>cursor,getDisplayNearestPoint:p=>[...displays].sort((a,b)=>distance(a.workArea,p)-distance(b.workArea,p))[0]};
  const electron={app:{setName(){},requestSingleInstanceLock:()=>true,whenReady:()=>({then(){}}),on(){}},screen};
  const filename=path.join(__dirname,'../desktop/main.cjs'), localRequire=createRequire(filename);
  const window={getBounds:()=>({...bounds}),setBounds:value=>{bounds={...value};},setMinimumSize:(...value)=>minimums.push(value),isVisible:()=>true,isDestroyed:()=>false,setIgnoreMouseEvents:value=>ignored.push(value),webContents:{send(){}}};
  const context=vm.createContext({require:id=>id==='electron'?electron:localRequire(id),__dirname:path.dirname(filename),process:{argv:[]},console,Buffer,setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),testWindow:window,testStore:{save:async state=>{saves.push(JSON.parse(JSON.stringify(state)));return{ok:true};}}});
  vm.runInContext(fs.readFileSync(filename,'utf8')+'\nwin=testWindow;windowStore=testStore;globalThis.qa={moveGarden,finishMove,clampBounds,rendererDragTrace,enableDebug(){dragDebugEnabled=true;dragDebugPath="/unused-debug-test-path";},debugEvents(){return dragDebugEvents;},setPartialIgnore(value){partialIgnore=value;return applyMouseMode();}};',context,{filename});
  return {...context.qa,bounds:()=>({...bounds}),setCursor:value=>{cursor=value;},timers,saves,ignored,minimums,flushTimers:async()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();await Promise.resolve();}};
}
const primary={x:0,y:30,width:1920,height:1040};
const right={x:1920,y:30,width:1920,height:1040};

test('small native drag steps cross adjacent displays and finish on the pointer display',()=>{
  const h=fixture([primary,right],{x:1000,y:400,width:600,height:400});
  for(let i=0;i<60;i++)h.moveGarden({dx:20,dy:0,dragging:true});
  assert.equal(h.bounds().x,2200); // Previous implementation got stuck at x=1320.
  h.setCursor({x:2450,y:600});h.finishMove();
  assert.deepEqual(h.bounds(),{x:2200,y:400,width:600,height:400});
  assert.deepEqual(h.minimums.at(-1),[560,360]);
});

test('single-screen dragging and menu arrow moves retain their existing edge clamps',()=>{
  const h=fixture([primary],{x:1300,y:400,width:600,height:400});
  for(let i=0;i<12;i++)h.moveGarden({dx:20,dy:0,dragging:true});
  assert.equal(h.bounds().x,1320);h.moveGarden({dx:-10,dy:0,dragging:true});assert.equal(h.bounds().x,1310);
  const menu=fixture([primary,right],{x:1310,y:400,width:600,height:400});
  menu.moveGarden({dx:50,dy:0});assert.equal(menu.bounds().x,1320);
});

test('negative-origin displays are reachable and an offscreen gap never swallows the garden',()=>{
  const left={x:-1280,y:30,width:1280,height:1040};
  const h=fixture([primary,left],{x:20,y:300,width:600,height:400});
  for(let i=0;i<25;i++)h.moveGarden({dx:-20,dy:0,dragging:true});
  assert.equal(h.bounds().x,-480);h.setCursor({x:-200,y:500});h.finishMove();
  assert.equal(h.bounds().x,-600);
  const diagonal={x:1920,y:1200,width:1920,height:1040};
  const candidate=dragWindowBounds({x:100,y:1400,width:600,height:400},[primary,diagonal]);
  assert.ok([primary,diagonal].some(area=>candidate.x>=area.x&&candidate.y>=area.y&&candidate.x+candidate.width<=area.x+area.width&&candidate.y+candidate.height<=area.y+area.height));
});

test('drag completion fits a smaller display and restores deferred passthrough',()=>{
  const small={x:1920,y:30,width:480,height:300};
  const h=fixture([primary,small],{x:1300,y:50,width:600,height:400});
  h.setPartialIgnore(true);assert.equal(h.ignored.at(-1),true);
  h.moveGarden({dx:500,dy:0,dragging:true});h.setPartialIgnore(true);assert.equal(h.ignored.at(-1),false);
  h.setCursor({x:2150,y:150});h.finishMove();
  assert.deepEqual(h.bounds(),{x:1920,y:30,width:480,height:300});
  assert.deepEqual(h.minimums.at(-1),[480,300]);assert.equal(h.ignored.at(-1),true);
});

test('movement writes only the final debounced window position',async()=>{
  const h=fixture([primary,right],{x:1000,y:400,width:600,height:400});
  for(let i=0;i<30;i++)h.moveGarden({dx:20,dy:0,dragging:true});
  h.setCursor({x:2010,y:500});h.finishMove();
  assert.equal(h.saves.length,0);assert.equal(h.timers.size,1);await h.flushTimers();
  assert.equal(h.saves.length,1);assert.deepEqual(h.saves[0].bounds,h.bounds());assert.equal(h.saves[0].layoutVersion,2);
});

test('optional drag diagnostics accept only fixed fields and keep the last 500 events',()=>{
  const h=fixture([primary],{x:1000,y:400,width:600,height:400});
  h.rendererDragTrace({event:'down',clientX:22});assert.equal(h.debugEvents().length,0);
  h.enableDebug();
  for(let i=0;i<510;i++)h.rendererDragTrace({event:'move',clientX:i,reason:'/private/file.txt',path:'/private/file.txt',key:'secret',target:'canvas',buttons:1});
  assert.equal(h.debugEvents().length,500);
  const first=h.debugEvents()[0];assert.equal(first.clientX,10);assert.equal(first.target,'canvas');
  assert.equal('path'in first,false);assert.equal('key'in first,false);assert.equal('reason'in first,false);
  assert.equal(h.timers.size,1); // The diagnostic flush stays stubbed; no file is created.
});
