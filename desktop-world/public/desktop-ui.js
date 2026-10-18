/** Small, on-demand surfaces. Native filesystem authority stays behind preload. */
export class DesktopUI {
  constructor({command,companion,focus,resources,isDemo=()=>false,platform={},changed,announce,showDialog,toggleTools,onState}={}) {
    Object.assign(this,{command,companion,focus,resources,isDemo,platform,changed,announce,showDialog,toggleTools,onState});
    this.native=window.desktopWorld;this.batch=null;this.busy=false;this.moveMode=false;
    const $=s=>document.querySelector(s);this.$=$;
    $('#choose-compost-files').onclick=()=>$('#compost-files').click();
    $('#compost-files').onchange=event=>{this.handleFiles([...event.target.files]);event.target.value='';};
    $('#confirm-compost').onclick=()=>this.confirmCompost();
    $('#open-trash').onclick=async()=>{const result=await this.native?.openTrash();if(result?.error)this.announce(result.error);};
    $('#give-food').onclick=()=>this.giveFood();$('#water-garden').onclick=()=>this.waterGarden();
    $('#focus-start').onclick=()=>{focus.start(Number($('#focus-minutes').value));this.changed();};
    $('#focus-pause').onclick=()=>{focus.getState().status==='paused'?focus.resume():focus.pause();this.changed();};
    $('#focus-cancel').onclick=()=>{focus.cancel();this.changed();};
    $('#focus-minutes').onchange=()=>{if(!['running','paused'].includes(focus.getState().status))$('#focus-clock').textContent=`${String($('#focus-minutes').value).padStart(2,'0')}:00`;};
    $('#native-topmost').onclick=()=>this.native?.setAlwaysOnTop(!this.desktopState?.alwaysOnTop);
    $('#native-pass').onclick=async()=>{await this.native?.setMouseMode('passthrough');$('#settings-dialog').close();this.announce(`已开启完全穿透 · ${platform.trayLabel}或 ${platform.recoverShortcut} 可恢复`,6000);};
    $('#native-smaller').onclick=()=>this.native?.resizeGarden(.9);$('#native-larger').onclick=()=>this.native?.resizeGarden(1.1);
    $('#native-reset').onclick=()=>this.native?.resetBounds();
    $('#native-hide').onclick=()=>{this.closePanels();this.native?.setVisible(false);};
    $('#native-quit').onclick=()=>this.native?.close();
    $('#settings-help').onclick=()=>{$('#settings-dialog').close();this.showDialog('#guide-dialog');};
    $('#settings-share').onclick=()=>{$('#settings-dialog').close();this.showDialog('#share-dialog');};
    $('#feed-dialog').addEventListener('close',()=>{if(this.batch&&!this.busy){this.native?.cancelTrash(this.batch.batchId);this.batch=null;}this.native?.setFeedingMode(false);});
    this.native?.onCommand?.(command=>this.handleCommand(command));
    this.native?.onDesktopState?.(state=>this.updateDesktopState(state));
    this.native?.getDesktopState?.().then(state=>this.updateDesktopState(state));
    this.updateResources();
  }
  updateDesktopState(state){this.desktopState=state;this.moveMode=Boolean(state.moving);document.body.classList.toggle('move-mode',this.moveMode);this.$('#native-topmost').textContent=state.alwaysOnTop?'取消置顶':'保持置顶';this.onState?.(state);}
  closePanels(){document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());}
  async handleCommand(event){
    const type=event.type;
    if(type==='tools'){this.toggleTools(true);return;}
    if(type==='feed'){if(!this.native?.setFeedingMode){this.announce('文件堆肥请在息屿桌面版中使用；浏览器版可体验播种、专注与风雨。',6000);return;}if(event.active===false){this.$('#feed-dialog').close();return;}if(event.active===undefined){await this.native.setFeedingMode(true);return;}this.showDialog('#feed-dialog');return;}
    if(type==='focus'){this.showDialog('#focus-dialog');return;}
    if(type==='settings'){this.showDialog('#settings-dialog');return;}
    if(type==='guide'){this.showDialog('#guide-dialog');return;}
    if(type==='share'){this.showDialog('#share-dialog');return;}
    if(type==='move'){this.moveMode=event.active??!this.moveMode;document.body.classList.toggle('move-mode',this.moveMode);this.announce(this.moveMode?'拖住岛屿移动位置 · 再次右键可结束移动':'花园位置已放好');return;}
    this.command(type,event);
  }
  async handleFiles(files){
    if(!files.length)return;
    if(!this.native?.prepareFiles){this.announce('文件堆肥需要打开息屿桌面版；浏览器版可体验播种、专注与风雨。',6000);return;}
    if(this.isDemo()){this.announce('先结束演示，再整理文件；日常花园会等你回来。');return;}
    if(this.busy){this.announce('这一批文件还在处理中，请稍等。');return;}
    await this.native.setFeedingMode(true);this.showDialog('#feed-dialog');
    this.$('#compost-status').textContent='正在检查你选择的文件…';
    if(this.batch)await this.native.cancelTrash(this.batch.batchId);
    try{
      this.batch=await this.native.prepareFiles(files);this.renderBatch(this.batch.items||[]);
      const ready=(this.batch.items||[]).filter(item=>!item.error&&item.status!=='failed'&&item.status!=='rejected');
      this.$('#confirm-compost').disabled=!this.batch.batchId||!ready.length;
      const trash=this.platform.trashLabel||'废纸篓';
      this.$('#compost-status').textContent=ready.length?`将把以上 ${ready.length} 个文件移入系统${trash}。可以从${trash}找回；取消不会改变文件。`:'没有可回收的文件。请检查文件路径或重新选择。';
    }catch(error){this.batch=null;this.$('#compost-status').textContent=error.message||'暂时无法读取文件，请重新拖入。';}
  }
  renderBatch(items){
    const list=this.$('#compost-list');list.replaceChildren();
    for(const item of items){
      const row=document.createElement('div');row.className=`compost-item ${item.status||''}`;const name=document.createElement('span');name.textContent=item.name;
      const note=document.createElement('small');note.textContent=item.status==='success'?`已移入${this.platform.trashLabel||'废纸篓'} · +1 份饲料`:item.error||item.path||'等待确认';
      row.append(name,note);list.append(row);
    }
  }
  async confirmCompost(){
    if(!this.batch||this.busy)return;this.busy=true;this.$('#confirm-compost').disabled=true;this.$('#choose-compost-files').disabled=true;
    try{
      const result=await this.native.confirmTrash(this.batch.batchId);this.renderBatch(result.items||[]);
      const count=Math.max(0,Math.min(30,Number(result.rewards)||0));
      if(count){this.resources.food+=count;this.changed();this.updateResources();this.command('compost',{count});}
      this.$('#compost-status').textContent=count?`成功回收 ${count} 个文件，饲料已放进篮子。点下方按钮喂给小动物。`:result.duplicate?'这批文件已经处理，不会重复发放奖励。':'未成功回收文件，没有发放饲料。请查看逐项结果。';
      this.batch=null;
    }catch(error){this.$('#compost-status').textContent=error.message||'回收失败，未发放饲料。请重新选择文件。';}
    finally{this.busy=false;this.$('#choose-compost-files').disabled=false;}
  }
  giveFood(){
    if(this.isDemo()){this.announce('演示中的点心不消耗饲料；结束演示后再喂团团。');return false;}
    if(this.resources.food<1){this.announce('饲料篮暂时空了，可以先整理一个不需要的文件。');return false;}
    const result=this.companion.awardMeal(1,'compost');
    if(result?.consumed>0){this.resources.food-=result.consumed;this.command('food',{source:'compost'});this.changed();this.updateResources();this.announce('团团收到点心了，正在靠近饲料。');return true;}
    this.announce(result?.message||'团团已经吃饱了，点心先留在篮子里。');return false;
  }
  waterGarden(){
    if(this.isDemo()){this.announce('先结束演示，再用水滴照顾自己的花园。');return false;}
    if(this.resources.water<1){this.announce('水壶还是空的，完成一段专注就能收集水滴。');return;}
    const result=this.command('nurture',{source:'focus-water'});
    if(!result?.ok){this.announce(result?.error||'暂时没有需要浇水的小苗，水滴已保留。',5500);return false;}
    this.resources.water--;this.changed();this.updateResources();this.announce(result.message,5000);return true;
  }
  updateResources(){this.$('#food-count').textContent=this.resources.food;this.$('#water-count').textContent=this.resources.water;this.$('#focus-water-count').textContent=this.resources.water;this.$('#give-food').disabled=this.resources.food<1;this.$('#water-garden').disabled=this.resources.water<1;}
  updateFocus(state){
    const secs=Math.max(0,Math.ceil(state.remainingSeconds||0));const clock=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
    this.$('#focus-clock').textContent=clock;this.$('#floating-focus-time').textContent=`专注 ${clock}${state.status==='paused'?' · 已暂停':''}`;
    this.$('#floating-focus').hidden=!['running','paused'].includes(state.status);
    const active=['running','paused'].includes(state.status);this.$('#focus-start').hidden=active;this.$('#focus-pause').hidden=!active;this.$('#focus-cancel').hidden=!active;
    this.$('#focus-pause').textContent=state.status==='paused'?'继续':'暂停';this.$('#focus-minutes').disabled=active;
    this.$('#focus-state').textContent={idle:'准备开始',running:'不必赶路，时间正在安静地流淌',paused:'暂停一下，想继续时再回来',completed:'这一段专注完成了 · 已收集 3 滴水',cancelled:'已取消，不会影响花园'}[state.status]||'准备开始';
  }
}
