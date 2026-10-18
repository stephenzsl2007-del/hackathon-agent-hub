import test from 'node:test';
import assert from 'node:assert/strict';
import { DesktopUI } from '../public/desktop-ui.js';

function element() {
  const listeners=new Map(),classes=new Set();
  return {open:false,hidden:false,disabled:false,textContent:'',children:[],
    classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}},
    setAttribute(){},removeAttribute(){},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},
    close(){if(!this.open)return;this.open=false;for(const fn of listeners.get('close')||[])fn();},
    emit(name){for(const fn of listeners.get(name)||[])fn();},click(){this.onclick?.();},
  };
}
function fixture(overrides={}) {
  const nodes=new Map(),calls={prepare:[],confirm:[],cancel:[],commands:[],meals:0};
  const $=key=>{if(!nodes.has(key))nodes.set(key,element());return nodes.get(key);};
  globalThis.document={querySelector:$,querySelectorAll:selector=>selector==='dialog[open]'?[...nodes].filter(([key,node])=>key.endsWith('-dialog')&&node.open).map(([,node])=>node):[],createElement:element};
  const bridge={setFeedingMode:async()=>{},prepareFiles:async files=>{calls.prepare.push(files);return {batchId:'batch-1',items:[{name:'old.txt',status:'ready'}]};},confirmTrash:async id=>{calls.confirm.push(id);return {rewards:1,items:[{name:'old.txt',status:'success'}]};},cancelTrash:async id=>{calls.cancel.push(id);},...overrides};
  globalThis.window={desktopWorld:bridge};
  const resources={food:0,water:3};
  const ui=new DesktopUI({command:(...args)=>calls.commands.push(args),companion:{awardMeal(){calls.meals++;return {consumed:1};}},focus:{getState:()=>({status:'idle'})},resources,changed(){},announce(){},showDialog:id=>{$(id).open=true;},toggleTools(){}});
  return {ui,$,calls,resources};
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('empty basket offers a visual practice without preparing files or awarding a meal',()=>{
  const {ui,$,calls,resources}=fixture();$('#feed-dialog').open=true;
  assert.equal($('#give-food').disabled,true);
  ui.previewFeeding();
  assert.deepEqual(calls.commands,[['food',{source:'preview'}]]);
  assert.equal(calls.meals,0);assert.equal(resources.food,0);
  assert.equal(calls.prepare.length,0);assert.equal(calls.confirm.length,0);
  assert.equal($('#feed-dialog').open,false);
});

test('review only counts eligible files and confirmation cannot run twice in flight',async()=>{
  const pending=deferred();let confirmed=0;
  const {ui,$,resources}=fixture({prepareFiles:async()=>({batchId:'batch-2',items:[{name:'a',status:'ready'},{name:'b',status:'ready'},{name:'blocked',status:'rejected',error:'受保护文件'}]}),confirmTrash:async()=>{confirmed++;return pending.promise;}});
  await ui.handleFiles([{},{}]);
  assert.equal(resources.food,0);assert.equal(ui.feedPhase,'confirm');
  assert.match($('#confirm-compost').textContent,/2 个文件/);
  const work=ui.confirmCompost();await ui.confirmCompost();
  assert.equal(confirmed,1);assert.equal($('#confirm-compost').disabled,true);
  pending.resolve({rewards:2,items:[{name:'a',status:'success'},{name:'b',status:'success'}]});await work;
  assert.equal(resources.food,2);assert.equal(ui.feedPhase,'feed');
  assert.equal($('#give-food').disabled,false);assert.equal($('#confirm-compost').disabled,true);
});

test('closing during file preparation cancels the late batch without reopening the panel',async()=>{
  const pending=deferred();const {ui,$,calls,resources}=fixture({prepareFiles:async()=>pending.promise});
  const work=ui.handleFiles([{}]);await settle();$('#feed-dialog').close();
  pending.resolve({batchId:'late-batch',items:[{name:'a',status:'ready'}]});await work;
  assert.deepEqual(calls.cancel,['late-batch']);assert.equal(ui.batch,null);
  assert.equal($('#feed-dialog').open,false);assert.equal(resources.food,0);
  assert.equal($('#confirm-compost').disabled,true);
});

test('a newer file selection wins even if an earlier inspection finishes later',async()=>{
  const old=deferred(),newer=deferred();let n=0;
  const {ui,calls}=fixture({prepareFiles:async()=>++n===1?old.promise:newer.promise});
  const first=ui.handleFiles([{}]);await settle();const second=ui.handleFiles([{}]);await settle();
  newer.resolve({batchId:'new',items:[{name:'new.txt',status:'ready'}]});await second;
  old.resolve({batchId:'old',items:[{name:'old.txt',status:'ready'}]});await first;
  assert.equal(ui.batch.batchId,'new');assert.deepEqual(calls.cancel,['old']);assert.equal(ui.feedItems[0].name,'new.txt');
});

test('feeding consumes exactly one earned portion, uses the selected point, and reveals the island',async()=>{
  const {ui,$,calls,resources}=fixture();await ui.handleFiles([{}]);await ui.confirmCompost();
  assert.equal(ui.giveFood({x:412.25,y:202.5}),true);
  assert.equal(resources.food,0);assert.equal(calls.meals,1);
  assert.deepEqual(calls.commands.at(-1),['food',{source:'compost',x:412.25,y:202.5}]);
  assert.equal($('#feed-dialog').open,false);
});

test('cancelled review never reaches native confirmation or awards food',async()=>{
  const {ui,$,calls,resources}=fixture();await ui.handleFiles([{}]);$('#feed-dialog').close();await ui.confirmCompost();
  assert.deepEqual(calls.cancel,['batch-1']);assert.equal(calls.confirm.length,0);assert.equal(resources.food,0);
});
