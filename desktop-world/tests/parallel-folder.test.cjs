'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ParallelFolder,createPlayFolder}=require('../desktop/parallel-folder.cjs');

test('dedicated folders never overwrite existing files and watcher reflects sun, weather and image removal',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));const watcher=new ParallelFolder({thumbnail:async()=> 'data:image/png;base64,fixture'});
  t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  const first=await createPlayFolder(root),second=await createPlayFolder(root);assert.notEqual(first,second);
  const original=await fs.readFile(path.join(first,'太阳.txt'));
  await watcher.connect(first);assert.equal(watcher.state().sunPresent,true);assert.equal(watcher.state().wind,false);
  await fs.writeFile(path.join(first,'friend.png'),'fixture');await fs.writeFile(path.join(first,'风.txt'),'text is not read');await watcher.refresh();
  assert.equal(watcher.state().images.length,1);assert.equal(watcher.state().wind,true);assert.deepEqual(await fs.readFile(path.join(first,'太阳.txt')),original);
  const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('watch notification timed out')),4000);watcher.onState=state=>{if(state.active&&!state.sunPresent&&!state.images.length){clearTimeout(timer);resolve(state);}};});
  await fs.rename(path.join(first,'太阳.txt'),path.join(root,'moved-sun.txt'));await fs.unlink(path.join(first,'friend.png'));await changed;
  assert.equal(watcher.state().sunPresent,false);assert.equal(watcher.state().images.length,0);assert.deepEqual(await fs.readFile(path.join(root,'moved-sun.txt')),original);
});
test('disconnect invalidates in-flight thumbnails and unsupported or large files are ignored',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));let release;const gate=new Promise(resolve=>release=resolve);
  const watcher=new ParallelFolder({thumbnail:async()=>{await gate;return 'fixture';}});t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  await fs.writeFile(path.join(root,'photo.jpg'),'fixture');const pending=watcher.connect(root);
  await new Promise(resolve=>setTimeout(resolve,30));watcher.disconnect(false);release();await pending;assert.equal(watcher.state().active,false);
  await fs.unlink(path.join(root,'photo.jpg'));await fs.writeFile(path.join(root,'large.png'),Buffer.alloc(10*1024*1024+1));await fs.writeFile(path.join(root,'not-a-photo.svg'),'<svg/>');
  await watcher.connect(root);assert.equal(watcher.state().images.length,0);assert.equal((await fs.stat(path.join(root,'large.png'))).size,10*1024*1024+1);
});
test('many ordinary files cannot hide the sun and broken pictures do not consume visitor slots',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));
  const watcher=new ParallelFolder({thumbnail:async filename=>path.basename(filename)==='valid.png'?'fixture':''});
  t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  await Promise.all(Array.from({length:170},(_,i)=>fs.writeFile(path.join(root,`000-${i}.txt`),'')));
  await Promise.all(Array.from({length:8},(_,i)=>fs.writeFile(path.join(root,`broken-${i}.png`),'broken')));
  await fs.writeFile(path.join(root,'valid.png'),'fixture');await fs.writeFile(path.join(root,'太阳.txt'),'not read');
  await watcher.connect(root);assert.equal(watcher.state().sunPresent,true);assert.equal(watcher.state().images.length,1);
});

test('disconnect cancels a connection still validating its directory',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));
  const watcher=new ParallelFolder();let release;
  const original=fs.lstat;const gate=new Promise(resolve=>release=resolve);
  t.mock.method(fs,'lstat',async filename=>{if(filename===root)await gate;return original(filename);});
  t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  const pending=watcher.connect(root);watcher.disconnect();release();await pending;
  assert.equal(watcher.state().active,false);assert.equal(watcher.watcher,null);
});

test('a slower previous connection cannot replace the latest selected folder',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));
  const older=await createPlayFolder(root),newer=await createPlayFolder(root);
  const watcher=new ParallelFolder();let release;
  const original=fs.realpath;const gate=new Promise(resolve=>release=resolve);
  let entered;const validating=new Promise(resolve=>entered=resolve);
  t.mock.method(fs,'realpath',async filename=>{if(filename===older){entered();await gate;}return original(filename);});
  t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  const pending=watcher.connect(older);await validating;await watcher.connect(newer);release();await pending;
  assert.equal(watcher.state().active,true);assert.equal(watcher.state().folder,await original(newer));
});

test('a photo removed during a scan does not disconnect the remaining visitors',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'xiyu-folder-test-'));
  const vanished=path.join(root,'gone.png');await fs.writeFile(vanished,'fixture');
  await fs.writeFile(path.join(root,'stays.png'),'fixture');await fs.writeFile(path.join(root,'太阳.txt'),'');
  const watcher=new ParallelFolder({thumbnail:async()=> 'fixture'});const original=fs.lstat;
  t.mock.method(fs,'lstat',async filename=>{if(filename===vanished){const error=new Error('moved');error.code='ENOENT';throw error;}return original(filename);});
  t.after(async()=>{watcher.disconnect(false);await fs.rm(root,{recursive:true,force:true});});
  await watcher.connect(root);
  assert.equal(watcher.state().active,true);assert.equal(watcher.state().sunPresent,true);
  assert.deepEqual(watcher.state().images.map(image=>image.name),['stays']);
});
