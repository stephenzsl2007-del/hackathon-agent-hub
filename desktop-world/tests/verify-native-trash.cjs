'use strict';
const { app, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { FileRecycle } = require('../desktop/native-services.cjs');
if (process.platform !== 'darwin') {
 console.error('此脚本仅验证 macOS ~/.Trash；Windows 请使用 npm test 和人工回收站验收。');
 app.exit(1);
 return;
}
app.setName('息屿原生回收验证');
app.whenReady().then(async () => {
 const report={checkedAt:new Date().toISOString(),nativeOperation:'Electron shell.trashItem',testOnly:true};
 let dir;
 try{
  dir=await fs.mkdtemp(path.join(os.homedir(),'.xiyu-native-trash-test-'));
  const name=`息屿回收自测-${crypto.randomUUID()}.txt`,file=path.join(dir,name),content='This disposable file was created only for the Xiyu native Trash verification.\n';
  await fs.writeFile(file,content);
  const recycle=new FileRecycle({trashItem:filename=>shell.trashItem(filename)});
  const batch=await recycle.prepare([file]);
  if(batch.items[0].status!=='ready')throw new Error(batch.items[0].error);
  const result=await recycle.confirm(batch.batchId);
  report.recycleResult=result.items[0].status;report.rewards=result.rewards;
  report.originalAbsent=await fs.stat(file).then(()=>false,err=>err.code==='ENOENT');
  const trashFile=path.join(os.homedir(),'.Trash',name);
  try{const stat=await fs.stat(trashFile);report.trashMetadata={isFile:stat.isFile(),size:stat.size,expectedSize:Buffer.byteLength(content)};report.trashContentsMatch=(await fs.readFile(trashFile,'utf8'))===content;report.trashFile=trashFile;}
  catch(error){report.trashInspectionError=error.code||error.message;}
  report.repeatRewards=(await recycle.confirm(batch.batchId)).rewards;
  report.passed=report.recycleResult==='success'&&report.originalAbsent&&report.rewards===1&&report.repeatRewards===0&&report.trashContentsMatch===true;
  console.log(JSON.stringify(report,null,2));
  await fs.writeFile(path.join(__dirname,'native-trash-verification.json'),JSON.stringify(report,null,2));
 }catch(error){report.error=error.message;report.passed=false;console.error(JSON.stringify(report,null,2));}
 finally{if(dir)await fs.rm(dir,{recursive:true,force:true});app.exit(report.passed?0:1);}
});
