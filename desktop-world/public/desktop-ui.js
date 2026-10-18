/** Small, on-demand surfaces. Native filesystem authority stays behind preload. */
export class DesktopUI {
  constructor({command,companion,focus,resources,changed,announce,showDialog,toggleTools,onState}={}) {
    Object.assign(this,{command,companion,focus,resources,changed,announce,showDialog,toggleTools,onState});
    this.native=window.desktopWorld;this.batch=null;this.busy=false;this.preparing=false;this.prepareVersion=0;this.feedItems=[];this.feedPhase='choose';this.moveMode=false;
    const $=s=>document.querySelector(s);this.$=$;
    $('#choose-compost-files').onclick=()=>$('#compost-files').click();
    $('#compost-files').onchange=event=>{this.handleFiles([...event.target.files]);event.target.value='';};
    $('#confirm-compost').onclick=()=>this.confirmCompost();
    $('#open-trash').onclick=()=>this.native?.openTrash();
    $('#give-food').onclick=()=>this.giveFood();
    document.querySelector('[data-feed-practice]')?.addEventListener('click',()=>this.previewFeeding());$('#water-garden').onclick=()=>this.waterGarden();
    $('#focus-start').onclick=()=>{focus.start(Number($('#focus-minutes').value));this.changed();};
    $('#focus-pause').onclick=()=>{focus.getState().status==='paused'?focus.resume():focus.pause();this.changed();};
    $('#focus-cancel').onclick=()=>{focus.cancel();this.changed();};
    $('#focus-minutes').onchange=()=>{if(!['running','paused'].includes(focus.getState().status))$('#focus-clock').textContent=`${String($('#focus-minutes').value).padStart(2,'0')}:00`;};
    $('#native-topmost').onclick=()=>this.native?.setAlwaysOnTop(!this.desktopState?.alwaysOnTop);
    $('#native-pass').onclick=async()=>{await this.native?.setMouseMode('passthrough');$('#settings-dialog').close();this.announce('已开启完全穿透 · 菜单栏叶子或 ⌘⌥⇧G 可恢复');};
    $('#native-smaller').onclick=()=>this.native?.resizeGarden(.9);$('#native-larger').onclick=()=>this.native?.resizeGarden(1.1);
    $('#native-reset').onclick=()=>this.native?.resetBounds();
    $('#native-hide').onclick=()=>{this.closePanels();this.native?.setVisible(false);};
    $('#native-quit').onclick=()=>this.native?.close();
    $('#settings-help').onclick=()=>{$('#settings-dialog').close();this.showDialog('#guide-dialog');};
    $('#settings-share').onclick=()=>{$('#settings-dialog').close();this.showDialog('#share-dialog');};
    $('#feed-dialog').addEventListener('close',()=>{
      this.prepareVersion++;this.preparing=false;
      if(this.batch&&!this.busy){this.native?.cancelTrash(this.batch.batchId);this.batch=null;}
      if(!this.busy){this.renderBatch([]);this.feedPhase=this.resources.food>0?'feed':'choose';$('#compost-status').textContent='先选择你确实不再需要的文件。未点击确认前，文件不会移动。';}
      this.updateFeedUI();this.native?.setFeedingMode(false);
    });
    this.native?.onCommand?.(command=>this.handleCommand(command));
    this.native?.onDesktopState?.(state=>this.updateDesktopState(state));
    this.native?.getDesktopState?.().then(state=>this.updateDesktopState(state));
    this.updateResources();
  }
  updateDesktopState(state){this.desktopState=state;this.moveMode=Boolean(state.moving);document.body.classList.toggle('move-mode',this.moveMode);this.$('#native-topmost').textContent=state.alwaysOnTop?'取消置顶':'保持置顶';this.onState?.(state);}
  closePanels(){document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());}
  async handleCommand(event){
    const type=event.type;
    if(type==='tools'){this.showDialog('#board-dialog');return;}
    if(type==='feed'){if(event.active===false){this.$('#feed-dialog').close();return;}if(event.active===undefined&&this.native){await this.native.setFeedingMode(true);return;}this.showDialog('#feed-dialog');this.updateFeedUI();return;}
    if(type==='focus'){this.showDialog('#focus-dialog');return;}
    if(type==='settings'){this.showDialog('#settings-dialog');return;}
    if(type==='guide'){this.showDialog('#guide-dialog');return;}
    if(type==='share'){this.showDialog('#share-dialog');return;}
    if(type==='move'){this.moveMode=event.active??!this.moveMode;document.body.classList.toggle('move-mode',this.moveMode);this.announce(this.moveMode?'拖住岛屿移动位置 · 再次右键可结束移动':'花园位置已放好');return;}
    this.command(type,event);
  }
  async handleFiles(files){
    if(!files.length)return;
    if(!this.native?.prepareFiles){this.announce('文件回收需要打开「息屿.app」。这里可以先看投喂动画。',6000);return;}
    if(this.busy){this.announce('这一批文件还在处理中，请稍等。');return;}
    const version=++this.prepareVersion;this.preparing=true;this.feedPhase='choose';this.updateFeedUI();
    await this.native.setFeedingMode(true);this.showDialog('#feed-dialog');
    this.$('#compost-status').textContent='正在检查所选文件，暂时不会移动任何文件…';
    const previous=this.batch;this.batch=null;
    if(previous)await this.native.cancelTrash(previous.batchId);
    try{
      const prepared=await this.native.prepareFiles(files);
      if(version!==this.prepareVersion||!this.$('#feed-dialog').open){if(prepared.batchId)await this.native.cancelTrash(prepared.batchId);return;}
      this.batch=prepared;this.renderBatch(prepared.items||[]);
      const ready=this.readyItems();this.feedPhase=ready.length?'confirm':'choose';
      this.$('#compost-status').textContent=ready.length?`已选 ${ready.length} 个可回收文件。点击“确认回收”后才会移入系统废纸篓，并获得 ${ready.length} 份饲料；关闭面板即取消。`:'这些文件暂时无法回收，请查看逐项原因或重新选择。';
    }catch(error){if(version===this.prepareVersion){this.batch=null;this.$('#compost-status').textContent=error.message||'暂时无法检查文件，请重新选择。';}}
    finally{if(version===this.prepareVersion){this.preparing=false;this.updateFeedUI();}}
  }
  readyItems(){return (this.batch?.items||[]).filter(item=>!item.error&&!['failed','rejected','success'].includes(item.status));}
  updateFeedUI(){
    const ready=this.readyItems(),locked=this.busy||this.preparing;
    this.$('#choose-compost-files').disabled=locked;
    this.$('#choose-compost-files').textContent=this.preparing?'正在检查文件…':this.feedItems.length?'重新选择文件…':'选择不需要的文件…';
    this.$('#confirm-compost').disabled=locked||!this.batch?.batchId||!ready.length;
    this.$('#confirm-compost').textContent=this.busy?'正在移入废纸篓…':ready.length?`确认回收 ${ready.length} 个文件 · +${ready.length} 份饲料`:'确认回收 · 移入废纸篓';
    this.$('#give-food').disabled=locked||this.resources.food<1;
    this.$('#give-food').textContent=this.resources.food>0?`喂团团 1 份 · 篮子里有 ${this.resources.food} 份`:'还没有饲料 · 先完成文件回收';
    this.$('#compost-empty').hidden=this.feedItems.length>0||this.preparing;
    this.$('#compost-list').hidden=!this.feedItems.length;
    const practice=document.querySelector('[data-feed-practice]');if(practice){practice.hidden=this.feedItems.length>0;practice.disabled=locked;}
    const phase=this.busy?'confirm':this.feedPhase,steps=['choose','confirm','feed'],current=steps.indexOf(phase);
    for(const [i,name] of steps.entries()){const node=this.$(`#compost-step-${name}`);if(!node)continue;node.classList.toggle('active',i===current);node.classList.toggle('is-active',i===current);node.classList.toggle('complete',i<current);node.classList.toggle('is-complete',i<current);if(i===current)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');}
  }
  previewFeeding(){
    if(this.busy||this.preparing||this.batch)return;
    this.closePanels();this.command('food',{source:'preview'});
    this.announce('投喂演示：小动物会靠近点心。没有处理文件，也没有改变饱食度。',6500);
  }
  renderBatch(items){
    this.feedItems=items;const list=this.$('#compost-list');list.replaceChildren();
    for(const item of items){
      const row=document.createElement('div');row.className=`compost-item ${item.status||''}`;const name=document.createElement('span');name.textContent=item.name;
      const note=document.createElement('small');note.textContent=item.status==='success'?'已移入废纸篓 · +1 份饲料':item.error||item.path||'等待确认';
      row.append(name,note);list.append(row);
    }
  }
  async confirmCompost(){
    if(!this.batch||this.busy||this.preparing||!this.readyItems().length)return;this.busy=true;this.updateFeedUI();
    this.$('#compost-status').textContent='正在按已确认的清单移入系统废纸篓。关闭面板不会撤销这次回收。';
    try{
      const result=await this.native.confirmTrash(this.batch.batchId);this.renderBatch(result.items||[]);
      const count=Math.max(0,Math.min(30,Number(result.rewards)||0));
      if(count){this.resources.food+=count;this.changed();this.updateResources();this.command('compost',{count});}
      this.$('#compost-status').textContent=count?`完成！${count} 个文件已移入系统废纸篓，获得 ${count} 份饲料。现在点“喂团团 1 份”。`:result.duplicate?'这批文件已经处理，不会重复发放奖励。':'未成功回收文件，没有发放饲料。请查看逐项结果。';
      this.batch=null;this.feedPhase=count||this.resources.food>0?'feed':'choose';
    }catch(error){this.batch=null;this.feedPhase='choose';this.$('#compost-status').textContent=error.message||'回收失败，未发放饲料。请重新选择文件。';}
    finally{this.busy=false;this.updateFeedUI();if(this.feedPhase==='feed'&&this.$('#feed-dialog').open)this.$('#compost-step-feed').scrollIntoView?.({block:'nearest',behavior:'smooth'});}
  }
  giveFood(point={}){
    if(this.resources.food<1){this.handleCommand({type:'feed'});this.announce('先选择一个不需要的文件，确认回收后获得饲料；也可以先看投喂动画。',5500);return false;}
    const result=this.companion.awardMeal(1,'compost');
    if(result?.consumed>0){this.resources.food-=result.consumed;this.command('food',{source:'compost',...(Number.isFinite(point.x)&&Number.isFinite(point.y)?{x:point.x,y:point.y}:{})});this.changed();this.updateResources();this.closePanels();this.announce(`${result.message||'团团吃到了你准备的点心。'} 篮子里还剩 ${this.resources.food} 份。`,6000);return true;}
    this.announce(result?.message||'团团已经吃饱了，点心先留在篮子里。');return false;
  }
  waterGarden(){
    if(this.resources.water<1){this.announce('水壶还是空的，完成一段专注就能收集水滴。');return;}
    this.resources.water--;this.command('rain',{source:'focus-water'});this.changed();this.updateResources();this.closePanels();this.announce('这一滴专注的时间，变成了花园的小雨。');
  }
  updatePet(state=this.companion.getState?.()){
    if(!state)return;const satiety=Math.max(0,Math.min(100,Number(state.satiety)||0));
    const name=this.$('#feed-pet-name'),stage=this.$('#feed-pet-stage'),value=this.$('#feed-pet-satiety'),bar=this.$('#feed-pet-progress');
    if(name)name.textContent=state.name||'团团';if(stage)stage.textContent=`${state.stage||'幼崽'} · 陪伴第 ${Math.floor(state.ageDays||0)+1} 天`;
    if(value)value.textContent=Math.round(satiety);if(bar)bar.style.width=`${satiety}%`;
  }
  updateResources(){this.$('#food-count').textContent=this.resources.food;this.$('#water-count').textContent=this.resources.water;this.updateFeedUI();this.updatePet();}
  updateFocus(state){
    const secs=Math.max(0,Math.ceil(state.remainingSeconds||0));const clock=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
    this.$('#focus-clock').textContent=clock;this.$('#floating-focus-time').textContent=`专注 ${clock}${state.status==='paused'?' · 已暂停':''}`;
    this.$('#floating-focus').hidden=!['running','paused'].includes(state.status);
    const active=['running','paused'].includes(state.status);this.$('#focus-start').hidden=active;this.$('#focus-pause').hidden=!active;this.$('#focus-cancel').hidden=!active;
    this.$('#focus-pause').textContent=state.status==='paused'?'继续':'暂停';this.$('#focus-minutes').disabled=active;
    this.$('#focus-state').textContent={idle:'准备开始',running:'不必赶路，时间正在安静地流淌',paused:'暂停一下，想继续时再回来',completed:'这一段专注完成了 · 已收集 3 滴水',cancelled:'已取消，不会影响花园'}[state.status]||'准备开始';
  }
}
