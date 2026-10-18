'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { AtomicStore, FileRecycle } = require('../desktop/native-services.cjs');
async function fixture(t) { const dir = await fs.mkdtemp(path.join(os.homedir(), '.xiyu-services-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
test('atomic save coalesces, restores, rejects stale revision and recovers backup', async t => {
 const dir = await fixture(t), filename = path.join(dir, 'garden.json'); const store = new AtomicStore(filename, { delay: 15 });
 assert.equal((await store.load()).state, null);
 const a = store.save({ world: { stage: 1 }, resources: { water: 2 } });
 const b = store.save({ world: { stage: 3 }, resources: { water: 5 } });
 const results = await Promise.all([a,b]); assert.ok(results.every(r => r.ok)); assert.equal(results[0].revision,1);
 const disk = new AtomicStore(filename); const saved = await disk.load(); assert.equal(saved.state.world.stage,3); assert.equal(saved.state.resources.water,5);
 assert.equal((await store.save({ world: {} }, { baseRevision: 0 })).ok,false);
 await store.save({ world: { stage: 4 }, resources: { water: 6 } });
 await fs.writeFile(filename, '{bad'); const recovered = await new AtomicStore(filename).load();
 assert.equal(recovered.ok,true); assert.equal(recovered.recovered,true); assert.equal(recovered.state.world.stage,3);
});
test('save failure does not report success or destroy previous data', async t => {
 const dir=await fixture(t), filename=path.join(dir,'garden.json'); const store=new AtomicStore(filename,{delay:1});
 assert.equal((await store.save({world:{value:1}})).ok,true);
 await fs.mkdir(filename+'.tmp-'+process.pid);
 const failed=await store.save({world:{value:2}}); assert.equal(failed.ok,false);
 assert.equal(JSON.parse(await fs.readFile(filename,'utf8')).state.world.value,1);
});
test('recycle only confirms prepared unchanged files and never double rewards', async t => {
 const dir=await fixture(t); const trash=path.join(dir,'trash');await fs.mkdir(trash);
 const good=path.join(dir,'good.txt'),changed=path.join(dir,'changed.txt'),cancelled=path.join(dir,'cancelled.txt');
 await Promise.all([good,changed,cancelled].map(file=>fs.writeFile(file,'created only for test')));
 let calls=0; const recycle=new FileRecycle({trashItem:async file=>{calls++;await new Promise(r=>setTimeout(r,5));await fs.rename(file,path.join(trash,path.basename(file)));}});
 const batch=await recycle.prepare([good,good,changed,dir]); assert.equal(batch.items.filter(i=>i.status==='ready').length,2);
 await fs.appendFile(changed,'changed after preparation');
 const [first,duplicate]=await Promise.all([recycle.confirm(batch.batchId),recycle.confirm(batch.batchId)]);
 assert.equal(first.rewards,1);assert.equal(duplicate.rewards,0);assert.equal(duplicate.duplicate,true);assert.equal(calls,1);
 assert.equal((await recycle.confirm(batch.batchId)).rewards,0);
 assert.equal(await fs.readFile(path.join(trash,'good.txt'),'utf8'),'created only for test');
 assert.ok((await fs.stat(changed)).isFile());
 const cancel=await recycle.prepare([cancelled]); recycle.cancel(cancel.batchId);assert.equal((await recycle.confirm(cancel.batchId)).rewards,0);assert.ok((await fs.stat(cancelled)).isFile());
});
test('recycle rejects protected paths, expired batches, and failed native operation', async t => {
 const dir=await fixture(t);const file=path.join(dir,'owned.txt');await fs.writeFile(file,'test');
 let now=1;const recycle=new FileRecycle({now:()=>now,trashItem:async()=>{throw Object.assign(new Error('denied'),{code:'EPERM'});},protectedPaths:[path.join(dir,'protected')]});
 await fs.mkdir(path.join(dir,'protected'));await fs.writeFile(path.join(dir,'protected','file.txt'),'test');
 const blocked=await recycle.prepare([path.join(dir,'protected','file.txt')]);assert.ok(blocked.items.every(i=>i.status==='rejected'));
 const batch=await recycle.prepare([file]);const failed=await recycle.confirm(batch.batchId);assert.equal(failed.rewards,0);assert.equal(failed.items[0].status,'failed');
 const expired=await recycle.prepare([file]);now=400000;assert.equal((await recycle.confirm(expired.batchId)).ok,false);
});

test('recycle rejects symbolic links including Windows junctions', async t => {
 const dir=await fixture(t),file=path.join(dir,'owned.txt'),link=path.join(dir,'link');
 await fs.writeFile(file,'test');
 await fs.symlink(process.platform==='win32'?dir:file,link,process.platform==='win32'?'junction':'file');
 const recycle=new FileRecycle({trashItem:async()=>assert.fail('must not recycle a link')});
 const batch=await recycle.prepare([link]);
 assert.equal(batch.items[0].status,'rejected');assert.match(batch.items[0].error,/符号链接/);
});

test('Windows recycle policy protects system and application data regardless of case', () => {
 const recycle=new FileRecycle({platform:'win32',home:'C:\\Users\\Alice',env:{SystemRoot:'D:\\Windows',ProgramFiles:'D:\\Apps',APPDATA:'D:\\Profiles\\Roaming'},protectedPaths:['E:\\Garden'],trashItem:async()=>{}});
 for(const file of ['d:\\WINDOWS\\temp\\file.txt','D:\\apps\\product\\data.db','d:\\profiles\\ROAMING\\settings.json','c:\\USERS\\alice\\appdata\\Local\\file.db','e:\\GARDEN\\state.json','F:\\$RECYCLE.BIN\\item.txt'])assert.equal(recycle._protected(file),true,file);
 assert.equal(recycle._protected('C:\\Users\\Alice\\Documents\\note.txt'),false);
 assert.equal(recycle._protected('E:\\Garden-copy\\note.txt'),false);
 assert.equal(recycle._protected('\\\\?\\D:\\WINDOWS\\temp\\file.txt'),true);
 const unc=new FileRecycle({platform:'win32',home:'C:\\Users\\Alice',env:{},protectedPaths:['\\\\server\\share\\private'],trashItem:async()=>{}});
 assert.equal(unc._protected('\\\\SERVER\\SHARE\\PRIVATE\\file.txt'),true);
 assert.equal(unc._protected('\\\\?\\UNC\\server\\share\\private\\file.txt'),true);
 assert.equal(unc._protected('\\\\?\\unc\\server\\share\\private\\file.txt'),true);
 assert.equal(unc._protected('\\\\server\\share\\private-copy\\file.txt'),false);
});

test('quit handshake waits for saved renderer acknowledgement and rejects wrong IDs', async () => {
 const {QuitHandshake}=require('../desktop/native-services.cjs');const handshake=new QuitHandshake({timeout:200});let command;
 let finished=false;const waiting=handshake.request(value=>command=value).then(result=>{finished=true;return result;});
 assert.equal(command.type,'prepare-quit');assert.equal(handshake.acknowledge('wrong').ok,false);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(finished,false);
 assert.equal(handshake.acknowledge(command.requestId).ok,true);assert.equal((await waiting).acknowledged,true);
 assert.equal(handshake.acknowledge(command.requestId).ok,false);
});
test('failed renderer save is reported by the quit handshake and can be retried',async()=>{
 const {QuitHandshake}=require('../desktop/native-services.cjs');const handshake=new QuitHandshake({timeout:200});let command;
 const failed=handshake.request(value=>command=value);handshake.acknowledge(command.requestId,false);
 assert.deepEqual(await failed,{acknowledged:true,saved:false,requestId:command.requestId});
 const retry=handshake.request(value=>command=value);handshake.acknowledge(command.requestId,true);
 assert.equal((await retry).saved,true);
});
test('unresponsive renderer quit handshake has a bounded timeout',async()=>{
 const {QuitHandshake}=require('../desktop/native-services.cjs');const handshake=new QuitHandshake({timeout:15});
 const started=Date.now();const result=await handshake.request(()=>{});assert.equal(result.acknowledged,false);assert.ok(Date.now()-started>=10);
});
