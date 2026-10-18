const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const shapes = {
  hand:'M8 3h3v8h1V1h3v10h1V4h3v8h1V8h3v10h-3v3H9v-3H6v-3H3v-4h3v2h2z',
  wind:'M3 7h12V4h5v2h-3v3H3zm-2 5h21v2H1zm3 5h13v5h-5v-2h3v-1H4z',
  rain:'M6 3h10v3h4v3h3v5H2V9h4zm-1 13h2v4H5zm6 1h2v5h-2zm6-1h2v4h-2z',
  seed:'M11 13h3v10h-3zM3 5h6v3h3v6H6v-3H3zm12-3h7v7h-3v4h-5V6h1z',
  carrot:'M14 5h3v3h3v5h-3v3h-3v3h-3v3H6v-6h3v-5h3V8h2zM16 1h3v5h-3zm5 2h3v4h-5V5h2z',
  cat:'M3 3h4v3h10V3h4v15h-3v3H6v-3H3zM5 5v4h3V7H7V5zm12 2v2h2V5h-2zm-10 5v3h3v-3zm7 0v3h3v-3zm-4 5v2h4v-2z',
  tide:'M1 5h5v3h4V5h5v3h4V5h4v3h-3v3h-6V8h-3v3H5V8H1zm0 9h5v3h4v-3h5v3h4v-3h4v3h-3v3h-6v-3h-3v3H5v-3H1z',
  mic:'M9 2h6v2h2v9h-2v2H9v-2H7V4h2zM3 10h2v5h3v3h8v-3h3v-5h2v6h-3v3h-5v3h4v2H7v-2h4v-3H6v-3H3z',
  moon:'M10 1h7v2h-4v3h-3v8h3v3h8v-3h2v6h-3v3H9v-3H5v-4H2V8h3V4h5z',
  sun:'M10 0h3v4h-3zM10 20h3v4h-3zM0 10h4v3H0zm20 0h4v3h-4zM3 3h3v3H3zm15 0h3v3h-3zM3 18h3v3H3zm15 0h3v3h-3zM8 6h8v2h2v8h-2v2H8v-2H6V8h2z',
  sound:'M2 9h4V6h3V3h3v18H9v-3H6v-3H2zm13-2h3v3h2v4h-2v3h-3v-3h2v-4h-2zm5-3h2v3h2v10h-2v3h-2v-4h2V8h-2z',
  muted:'M2 9h4V6h3V3h3v18H9v-3H6v-3H2zm13-2h3v3h3V7h3v3h-3v4h3v3h-3v-3h-3v3h-3v-3h3v-4h-3z',
  phone:'M6 1h12v2h2v19h-2v2H6v-2H4V3h2zm1 3v14h10V4zm3 16v2h4v-2z',
  camera:'M8 3h8v3h6v2h2v13H0V8h2V6h6zm1 7v2H7v5h2v2h6v-2h2v-5h-2v-2zm1 3h4v3h-4z',
  expand:'M1 1h8v3H4v5H1zm14 0h8v8h-3V4h-5zM1 15h3v5h5v3H1zm19 0h3v8h-8v-3h5z',
  spark:'M10 1h3v6h3v3h6v3h-6v3h-3v6h-3v-6H7v-3H1v-3h6V7h3zM3 2h3v3H3zm16 17h3v3h-3z',
  desktop:'M1 3h22v15h-9v3h5v2H5v-2h5v-3H1zm3 3v9h16V6z'
};
function icon(name) { return `<svg class="pixel-icon" viewBox="0 0 24 24" aria-hidden="true" shape-rendering="crispEdges"><path d="${shapes[name] || shapes.spark}"/></svg>`; }
$$('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);});
const hints = {
  explore:'拖动小岛调整位置 · 轻点动物或池塘互动',
  wind:'在小岛上长按送风 · 看草木摇摆，蒲公英随风旅行',
  rain:'点池塘或草地下一阵雨 · 按住持续浇水，拖动改变落点',
  seed:'在草地上点一点，种下小苗 · 再用雨水让它开花',
  food:'点击草地，使用 1 份饲料 · 没有饲料时先打开文件回收',
  tide:'在画面上上下拖动，或拨动滑杆 · 让海水轻轻涨落'
};
let world, mic, companion, focusSession, desktopUI, gardenAudio, currentTool='explore', night=false, saveTimer, noticeTimer, demoTimers=[], demoRunning=false, demoBackup=null, eventStream, inviteUrl='', desktopMode=false, spaceWindTimer, micState='stopped', ignoringMouse=false, dragDepth=0, stateReady=false, saveRevision=0, saveInFlight=null, toolsTimer, desktopState={}, islandDrag=null;
const storageKey='xiyu-state-v2';
const resources={food:0,water:0};const rewardedSessions=new Set();
let appVisible=true,systemSuspended=false,focusPausedForSleep=false;
function syncActivity(){const inactive=!appVisible||systemSuspended;world?.setPaused?.(inactive);Promise.resolve(gardenAudio?.setSuspended?.(inactive)).catch(()=>{});}
function announce(message, duration=3500) {
  const el=$('#world-notice'); el.textContent=message;el.classList.add('show');
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.classList.remove('show'),duration);
}
function dismissNote(){ $('#opening-note').classList.add('dismissed'); }
function selectTool(tool){
  if(demoRunning)stopDemo();
  islandDrag?.cancel();
  currentTool=tool;world?.setTool(tool);
  $$('.tool').forEach(el=>{const selected=el.dataset.tool===tool;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));});
  $('#tool-hint').textContent=hints[tool];$('#tide-panel').hidden=tool!=='tide';$('#seed-panel').hidden=tool!=='seed';if(desktopMode)toggleTools(false);syncToolStrip();dismissNote();
}
function syncToolStrip(){
  const strip=$('#active-tool-strip');if(!strip)return;
  const labels={wind:'送一阵风',rain:'落一场雨',seed:'种一点花',food:'喂给团团',tide:'拨动池水'};
  strip.hidden=!desktopMode||currentTool==='explore'||demoRunning||$$('dialog[open]').length>0;
  $('#active-tool-name').textContent=labels[currentTool]||'漫游';$('#active-tool-hint').textContent=hints[currentTool];
  $('#quick-seed-species').hidden=currentTool!=='seed';$('#quick-tide-range').hidden=currentTool!=='tide';
  $('#board-toggle')?.setAttribute('aria-expanded',String(Boolean($('#board-dialog')?.open)));
}
function toggleBoard(){
  if($('#board-dialog').open)$('#board-dialog').close();else showDialog('#board-dialog');syncToolStrip();
}
async function boardAction(action){
  if(!world)return;
  if(['rain','seed','wind','tide','explore'].includes(action)){desktopUI.closePanels();selectTool(action);return;}
  if(action==='tools'){desktopUI.closePanels();toggleTools(true);return;}
  if(['feed','focus','share','guide','settings'].includes(action)){await desktopUI.handleCommand({type:action});return;}
  desktopUI.closePanels();
  if(action==='mic')toggleMic();else if(action==='night')updateNight(!night);else if(action==='sound')toggleSound();else if(action==='demo')startDemo();
}
function updateNight(value, showNotice=true){
  night=value;world?.setNight(value);gardenAudio?.setNight(value);document.body.classList.toggle('night',value);
  $('#night-button').setAttribute('aria-pressed',String(value));$('#night-button').innerHTML=icon(value?'sun':'moon');
  $('#night-button').title=value?'切换到白天':'切换到夜晚';$('#night-button').setAttribute('aria-label',$('#night-button').title);
  const nightEntry=$('[data-board-action="night"]');if(nightEntry){nightEntry.setAttribute('aria-pressed',String(value));nightEntry.innerHTML=`${icon(value?'sun':'moon')}<span>${value?'回到晴昼':'点亮星夜'}</span>`;}
  $('#season-label').textContent=value?'星夜 · 萤火替你守着花园':'晴昼 · 小岛正在呼吸';
  if(showNotice)announce(value?'天黑了，萤火替你把小岛点亮。':'早安，小岛。又是可以慢慢长大的一天。');
  scheduleSave();
}
function scheduleSave(){
  if(saveTimer || !world || !stateReady)return;
  saveTimer=setTimeout(()=>{saveTimer=null;saveNow();},2200);
}
function snapshot(){return {schemaVersion:2,savedAt:Date.now(),world:demoBackup||world.serialize(),companion:companion?.serialize(),focus:focusSession?.serialize(),resources:{...resources},rewardedSessions:[...rewardedSessions].slice(-120)};}
async function saveNow(){
  if(!stateReady||!world)return;
  if(saveInFlight){scheduleSave();return saveInFlight;}
  saveInFlight=Promise.resolve().then(async()=>{
    try{
      const data=snapshot();
      if(window.desktopWorld?.saveState){const result=await window.desktopWorld.saveState(data,{baseRevision:saveRevision});if(!result.ok)throw new Error(result.error||'保存失败');saveRevision=result.revision;}
      else localStorage.setItem(storageKey,JSON.stringify(data));
      $('#save-label').textContent='小岛的变化，已经悄悄存好';
    }catch(error){$('#save-label').textContent='存档未写入，请留意磁盘空间';announce('暂时无法写入存档，当前小岛仍可继续玩。',6000);console.warn('Save failed',error.message);}
  }).finally(()=>{saveInFlight=null;});return saveInFlight;
}
function updateStats(stats){
  if(!stats)return;
  const flowers=Number(stats.flowers)||0;const visitors=Number(stats.visitors)||0;
  $('#garden-count').textContent=`${flowers} 株植物已长大${visitors?`  ·  ${visitors} 位小小住客`:''}`;
  // Natural growth is checkpointed separately; never write on every frame.
}
function onWorldEvent(event){
  const requests={'request-feed':'feed','request-focus':'focus','request-microphone':'mic','request-food':'meal'};
  if(requests[event.type]){const type=requests[event.type];if(type==='mic')toggleMic();else if(type==='meal')desktopUI?.giveFood({x:event.x,y:event.y});else desktopUI?.handleCommand({type});return;}
  if(event.message)announce(event.message);
  gardenAudio?.chime(event.type||'seed');dismissNote();scheduleSave();
}
function runAction(action, value, source='phone'){
  if(!world)return;
  if(demoRunning)stopDemo();
  const data={source}; if(Number.isFinite(value))data.value=value;
  if(action==='tide' && Number.isFinite(value)){world.setTide(value);$('#tide-range').value=String(value*100);$('#quick-tide-range').value=String(value*100);}
  else if(action==='fireflies'){updateNight(true,false);world.impulse('fireflies',data);}
  else world.impulse(action,data);
  gardenAudio?.chime(action);dismissNote();scheduleSave();
}
function command(action,data={}){
  if(!world)return;
  if(action==='mic'){toggleMic();return;}
  if(action==='night'){updateNight(!night);return;}
  if(action==='sound'){toggleSound();return;}
  if(action==='demo'){startDemo();return;}
  if(action==='dismiss'){islandDrag?.cancel();world.cancelInteraction?.();stopSpaceWind();stopDemo();selectTool('explore');toggleTools(false);desktopUI?.closePanels();return;}
  if(action==='visibility'){appVisible=Boolean(data.visible);if(!appVisible){islandDrag?.cancel();world.cancelInteraction?.();stopSpaceWind();stopDemo();mic?.stop();saveNow();}syncActivity();return;}
  if(action==='suspend'){systemSuspended=true;islandDrag?.cancel();world.cancelInteraction?.();stopSpaceWind();stopDemo();mic?.stop();if(focusSession?.getState().status==='running'){focusSession.pause();focusPausedForSleep=true;}syncActivity();saveNow();return;}
  if(action==='notice'){announce(data.message);return;}
  if(action==='resume'){systemSuspended=false;syncActivity();if(focusPausedForSleep){focusPausedForSleep=false;announce('欢迎回来。休眠时已暂停专注，可以从布告栏继续。',6000);}return;}
  if(action==='prepare-quit'){
    (async()=>{clearTimeout(saveTimer);saveTimer=null;stopSpaceWind();mic?.stop();if(saveInFlight)await saveInFlight;await saveNow();await window.desktopWorld?.ackQuit?.(data.requestId);})();return;
  }
  if(['explore','wind','rain','seed','food','tide'].includes(action)&&data.selectTool){desktopUI?.closePanels();selectTool(action);return;}
  if(action==='keyboard-rain'){world.impulse(action,data);return;}
  if(action==='compost'){world.impulse('compost',data);return;}
  world.impulse(action,data);scheduleSave();
}
function toggleTools(force){
  const visible=typeof force==='boolean'?force:!document.body.classList.contains('tools-open');document.body.classList.toggle('tools-open',visible);clearTimeout(toolsTimer);
  if(visible){ignoringMouse=false;window.desktopWorld?.setIgnoreMouse(false);toolsTimer=setTimeout(()=>document.body.classList.remove('tools-open'),22000);}
}
function stopDemo(notify=false){
  demoTimers.forEach(clearTimeout);demoTimers=[];demoRunning=false;$('#demo-status').hidden=true;syncToolStrip();
  $('#demo-button').disabled=false;$('#demo-button').innerHTML=`${icon('spark')}<span>小小奇迹</span>`;
  if(demoBackup){world.setDemoMode?.(false);world.restore(demoBackup);demoBackup=null;updateNight(Boolean(world.getStats().night),false);scheduleSave();}
  if(notify)announce('把小岛交还给你。');
}
function startDemo(){
  stopDemo();desktopUI?.closePanels();toggleTools(false);dismissNote();selectTool('explore');demoBackup=world.serialize();world.setDemoMode?.(true);demoRunning=true;$('#demo-button').disabled=true;$('#demo-status').hidden=false;
  updateNight(false,false);syncToolStrip();
  const stages=[
    [0,'演示花园 · 第 1 阶段：萌芽',()=>world.impulse('demo-stage',{stage:0})],
    [3500,'演示花园 · 第 2 阶段：幼苗',()=>{world.impulse('demo-stage',{stage:1});world.impulse('rain',{duration:2});}],
    [7000,'演示花园 · 第 3 阶段：长叶',()=>{world.impulse('demo-stage',{stage:2});world.impulse('wind',{value:1});}],
    [10500,'演示花园 · 第 4 阶段：花苞',()=>{world.impulse('demo-stage',{stage:3});world.impulse('food',{});}],
    [14000,'演示花园 · 第 5 阶段：开花',()=>{world.impulse('demo-stage',{stage:4});world.setTide(.85);} ],
    [18000,'演示花园 · 天色渐晚，萤火亮起',()=>{updateNight(true,false);world.impulse('fireflies',{});} ],
    [22000,'演示即将结束，随后回到你的日常花园',()=>world.impulse('fireflies',{})]
  ];
  for(const [at,message,action] of stages)demoTimers.push(setTimeout(()=>{$('#demo-message').textContent=message;action();gardenAudio?.chime('seed');scheduleSave();},at));
  demoTimers.push(setTimeout(()=>{stopDemo();announce('已回到日常花园，演示没有改变你的存档。',4500);},26000));
}
async function toggleMic(){
  if(!mic)return;
  if(mic.active || ['starting','calibrating'].includes(micState)){mic.stop();return;}
  await mic.start();dismissNote();
}
async function toggleSound(){
  if(!gardenAudio)return;
  try{
    const enabled=await gardenAudio.toggle();$('#sound-button').setAttribute('aria-pressed',String(enabled));
    $('#sound-button').innerHTML=icon(enabled?'sound':'muted');$('#sound-button').title=enabled?'关闭环境音':'开启环境音';$('#sound-button').setAttribute('aria-label',$('#sound-button').title);
    const soundEntry=$('[data-board-action="sound"]');if(soundEntry){soundEntry.setAttribute('aria-pressed',String(enabled));soundEntry.innerHTML=`${icon(enabled?'sound':'muted')}<span>${enabled?'关闭环境音':'开启环境音'}</span>`;}
    announce(enabled?'轻轻的风声和音符，陪你待一会儿。':'声音已关，小岛仍在静静生长。');
  }catch{announce('暂时无法开启声音，可以继续与小岛互动。');}
}
async function prepareInvite(){
  try{
    const response=await fetch('/api/info');if(!response.ok)throw new Error('server');
    const info=await response.json();inviteUrl=info.phoneUrl;$('#phone-url').value=inviteUrl;
    const qr=$('#phone-qr');$('#qr-status').hidden=false;qr.hidden=false;
    qr.onload=()=>{$('#qr-status').hidden=true;};
    qr.onerror=()=>{qr.hidden=true;$('#qr-status').hidden=false;$('#qr-status').textContent='复制下方地址，在手机浏览器打开';};
    qr.src=`/api/qr?t=${Date.now()}`;
    $('#connection-label').textContent='小岛已就绪 · 等待朋友送来一阵风';
    if(inviteUrl.includes('127.0.0.1')||inviteUrl.includes('localhost'))$('#network-note').textContent='还没有找到局域网地址。请让电脑连上 Wi-Fi，再重新打开邀请面板。';
    else if(info.addresses?.length>1)$('#network-note').textContent='手机和电脑需在同一 Wi-Fi。若扫码不通，连接同一个手机热点后重新打开此面板。';
  }catch{
    $('#phone-qr').hidden=true;$('#qr-status').hidden=false;$('#qr-status').textContent='请通过项目中的「启动息屿.command」启动，以使用手机互动。';
    $('#connection-label').textContent='互动服务尚未连接';
  }
}
function connectEvents(){
  eventStream=new EventSource('/api/events');
  const handle=ev=>{
    try{
      const data=JSON.parse(ev.data);if(!data.action)return;
      runAction(data.action,data.value,'phone');
      const labels={wind:'一位朋友送来了一阵风',rain:'一位朋友送来了一场雨',seed:'一位朋友在小岛上种下了新芽',food:'一位朋友给小动物带来了食物',tide:'一位朋友拨动了潮水',fireflies:'一位朋友点亮了萤火'};
      if(data.action!=='wind'||!window.lastPhoneWind||Date.now()-window.lastPhoneWind>4000){announce(labels[data.action]||'小岛收到了朋友的心意');window.lastPhoneWind=Date.now();}
      $('#connection-label').textContent='已收到手机互动 · 心意到达小岛';
    }catch{}
  };
  eventStream.onmessage=handle;eventStream.addEventListener('action',handle);
  eventStream.addEventListener('audience',ev=>{try{const {count}=JSON.parse(ev.data);$('#connection-label').textContent=count?`${count} 位朋友正与小岛相连`:'小岛已就绪 · 等待朋友送来一阵风';}catch{}});
  eventStream.onerror=()=>{$('#connection-label').textContent='连接暂时中断，正在自动重连…';};
  eventStream.onopen=()=>{$('#connection-label').textContent='互动服务已连接';};
}
function showDialog(id){
  if(demoRunning)stopDemo();
  islandDrag?.cancel();world?.cancelInteraction?.();const dialog=$(id);$$('dialog[open]').filter(other=>other!==dialog).forEach(other=>other.close());toggleTools(false);
  if(!dialog.open){if(window.desktopWorld&&id!=='#feed-dialog')dialog.show();else dialog.showModal();}
  dismissNote();syncToolStrip();setMousePassthrough(false);if(id==='#share-dialog')prepareInvite();
}
function quietMode(value){document.body.classList.toggle('quiet',value);$('#restore-ui').hidden=!value;}
function setDesktopMode(value){
  desktopMode=value;document.body.classList.toggle('desktop-mode',value);document.documentElement.classList.toggle('desktop-mode',value);world?.setDesktopMode?.(value);$('#desktop-button').innerHTML=`${icon('desktop')}${value?'回到窗口':'放到桌面'}`;
  if(!value){ignoringMouse=false;window.desktopWorld?.setIgnoreMouse(false);}
  syncToolStrip();if(value)announce('直接拖动小岛搬家 · 点木牌打开布告栏',5000);
}
async function init(){
  try{
    const [{World},{MicrophoneWind,GardenAudio},{Companion},{FocusSession},{DesktopUI},{installIslandDrag}]=await Promise.all([import('./world.js'),import('./audio.js'),import('./companion.js'),import('./focus.js'),import('./desktop-ui.js'),import('./island-drag.js')]);
    gardenAudio=new GardenAudio();
    world=new World($('#world'),{onEvent:onWorldEvent,onChange:updateStats,onCommand:command});
    if(window.desktopWorld){desktopMode=true;document.body.classList.add('desktop-mode');world.setDesktopMode(true);}
    else{$('#island-drag-handle').hidden=true;hints.explore='轻点动物或池塘，和小岛打个招呼';$('#world').setAttribute('aria-label','可互动的像素花园。点布告栏选择落雨、播种、投喂或专注。');}
    world.artReady?.then(()=>{
      const catalog=world.getArtStatus?.().plantSpecies||[];const categories={trees:'小树',shrubs:'灌木与水生',flowers:'花卉',garden:'菜园与菌菇'};
      for(const [category,label] of Object.entries(categories)){
        const group=document.createElement('optgroup');group.label=label;
        for(const plant of catalog.filter(item=>item.category===category)){const option=document.createElement('option');option.value=plant.id;option.textContent=plant.name;group.append(option);}
        if(group.children.length)$('#seed-species').append(group);
      }
      $('#seed-detail').textContent=catalog.length?`${catalog.length} 种植物 · 每种 5 个真实阶段`:'素材尚未就绪';
      $('#seed-species').value=world.selectedSpecies||'';$('#quick-seed-species').replaceChildren(...[...$('#seed-species').children].map(option=>option.cloneNode(true)));$('#quick-seed-species').value=world.selectedSpecies||'';
    });
    companion=new Companion({persist:false,onChange:state=>{
      $('#pet-name').textContent=state.name;$('#pet-stage').textContent=state.stage;$('#pet-days').textContent=`陪伴第 ${Math.floor(state.ageDays)+1} 天`;
      $('#satiety-fill').style.width=`${state.satiety}%`;$('#satiety-value').textContent=Math.round(state.satiety);world.setPetState?.(state);desktopUI?.updatePet(state);
    },onFeed:event=>{
      gardenAudio?.chime('food');if(event.message)announce(event.message,5000);
      $('#feed-tip').textContent=event.message||'团团吃到了你准备的点心。';setTimeout(()=>$('#feed-tip').textContent='整理文件，回收后给团团喂一点心。',6500);
    }});
    focusSession=new FocusSession({onChange:state=>desktopUI?.updateFocus(state),onRain:event=>command('keyboard-rain',event),onReward:event=>{
      if(rewardedSessions.has(event.sessionId))return;rewardedSessions.add(event.sessionId);resources.water+=3;desktopUI?.updateResources();saveNow();announce('专注完成，小水壶收集了 3 滴水。',5000);
    }});
    desktopUI=new DesktopUI({command,companion,focus:focusSession,resources,changed:scheduleSave,announce,showDialog,toggleTools,onState:state=>{desktopState=state;if(desktopMode!==(state.desktopMode!==false))setDesktopMode(state.desktopMode!==false);}});
    islandDrag=installIslandDrag({canvas:$('#world'),world,bridge:window.desktopWorld,getState:()=>({tool:currentTool,desktopMode,moveMode:desktopUI?.moveMode,hasOpenDialog:$$('dialog[open]').length>0}),onInteractionStart:()=>{if(demoRunning)stopDemo();dismissNote();toggleTools(false);setMousePassthrough(false);},onDragState:({dragging})=>document.body.classList.toggle('island-dragging',dragging)});
    try{
      let saved=null;
      if(window.desktopWorld?.loadState){const result=await window.desktopWorld.loadState();if(result.error)announce(`存档提示：${result.error}`,6500);saved=result.state;saveRevision=result.revision||0;}
      else saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(saved?.schemaVersion===2){
        if(saved.world){world.restore(saved.world);$('#seed-species').value=world.selectedSpecies||'';$('#quick-seed-species').value=world.selectedSpecies||'';}if(saved.companion)companion.restore(saved.companion);
        resources.food=Math.max(0,Math.min(9999,Number(saved.resources?.food)||0));resources.water=Math.max(0,Math.min(9999,Number(saved.resources?.water)||0));
        for(const id of saved.rewardedSessions||[])rewardedSessions.add(id);if(saved.focus)focusSession.restore(saved.focus);
      }else if(!window.desktopWorld){const older=JSON.parse(localStorage.getItem('xiyu-world-v1')||'null');if(older)world.restore(older);}
      stateReady=true;
      const stats=world.getStats();updateNight(Boolean(stats.night),false);updateStats(stats);desktopUI.updateResources();desktopUI.updateFocus(focusSession.getState());
    }catch(error){announce('存档读取遇到问题，本次先展示花园；原存档不会覆盖。',6500);console.warn('Load failed',error.message);}
    mic=new MicrophoneWind({
      onLevel:level=>{world.setWind(level,'microphone');gardenAudio.setWind(level);$('#mic-level').style.width=`${Math.round(level*100)}%`;},
      onState:({state,message})=>{
        micState=state;
        const active=['starting','calibrating','active'].includes(state);
        $('#mic-status').hidden=!active;
        $('#mic-status-label').textContent={starting:'麦克风连接中',calibrating:'正在校准',active:'麦克风已开启'}[state]||'麦克风';
        $$('[data-board-action=mic]').forEach(button=>{button.setAttribute('aria-pressed',String(active));button.innerHTML=`${icon('mic')}<span>${active?'关闭麦克风':'吹一口气'}</span>`;});$('#mic-button').setAttribute('aria-pressed',String(active));$('#mic-button').disabled=false;
        $('#mic-label').textContent={starting:'正在连接…',calibrating:'安静一秒…',active:'风在听你',stopped:'吹一口气',error:'吹一口气'}[state]||'吹一口气';
        $('#mic-note').hidden=!active;
        if(message)announce(message,5500);
        if(!active){world.setWind(0,'microphone');$('#mic-level').style.width='0%';}
      }
    });
    $('#loading-state').hidden=true;$('#sound-button').innerHTML=icon('muted');
    connectEvents();setTimeout(dismissNote,18000);setInterval(scheduleSave,30000);
    if(window.desktopWorld){
      document.body.classList.add('native-app');
      $('#desktop-button').hidden=false;
      window.desktopWorld.onModeChange?.(mode=>setDesktopMode(typeof mode==='boolean'?mode:mode?.desktopMode??mode?.enabled??false));
      if(window.desktopWorld.getDesktopMode)setDesktopMode(await window.desktopWorld.getDesktopMode());
    }
    window.xiyu={world,companion,focusSession,resources,getStats:()=>world.getStats(),runAction,selectTool,updateNight,stopDemo,setDesktopMode,saveNow};
  }catch(error){
    $('#loading-state').innerHTML='<span class="loading-flower">✿</span><p>小岛还没准备好，请刷新再试。</p>';
    console.error('World startup failed',error);
  }
}

$('#board-toggle').addEventListener('click',toggleBoard);
$('#finish-tool').addEventListener('click',()=>selectTool('explore'));
$$('[data-board-action]').forEach(button=>button.addEventListener('click',()=>boardAction(button.dataset.boardAction)));
$$('dialog').forEach(dialog=>dialog.addEventListener('close',syncToolStrip));
$$('.tool').forEach(el=>el.addEventListener('click',()=>selectTool(el.dataset.tool)));
$('#night-button').addEventListener('click',()=>updateNight(!night));
$('#sound-button').addEventListener('click',toggleSound);
$('#mic-button').addEventListener('click',toggleMic);
$('#mic-stop').addEventListener('click',()=>mic?.stop());
$('#guide-button').addEventListener('click',()=>showDialog('#guide-dialog'));
$('#share-button').addEventListener('click',()=>showDialog('#share-dialog'));
$$('[data-close]').forEach(el=>el.addEventListener('click',()=>document.getElementById(el.dataset.close).close()));
$$('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(inviteUrl);$('#copy-link').textContent='已复制';setTimeout(()=>$('#copy-link').textContent='复制',2000);}catch{$('#phone-url').select();$('#network-note').textContent='请手动复制上方地址，发到手机浏览器打开。';}});
['#tide-range','#quick-tide-range'].forEach(id=>$(id).addEventListener('input',event=>{const value=event.target.value;$('#tide-range').value=value;$('#quick-tide-range').value=value;world?.setTide(Number(value)/100);scheduleSave();}));
['#seed-species','#quick-seed-species'].forEach(id=>$(id).addEventListener('change',event=>{const value=event.target.value;$('#seed-species').value=value;$('#quick-seed-species').value=value;world?.setSelectedSpecies?.(value||null);scheduleSave();if(value==='waterlily')announce('睡莲喜欢池塘，把它种在水面上。');}));
$('#demo-button').addEventListener('click',startDemo);$('#demo-stop').addEventListener('click',()=>stopDemo(true));
$('#quiet-button').addEventListener('click',()=>quietMode(true));$('#restore-ui').addEventListener('click',()=>quietMode(false));
$('#fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{announce('当前窗口不支持全屏，可以按 H 隐藏界面欣赏。');}});
$('#desktop-button').addEventListener('click',async()=>{if(window.desktopWorld){setDesktopMode(await window.desktopWorld.setDesktopMode(true));}});
$('#snapshot-button').addEventListener('click',()=>{
  if(!world)return;
  const source=$('#world'), postcard=document.createElement('canvas');postcard.width=source.width;postcard.height=source.height+Math.max(70,Math.round(source.width*.055));
  const ctx=postcard.getContext('2d');ctx.fillStyle='#f7f4ea';ctx.fillRect(0,0,postcard.width,postcard.height);ctx.drawImage(source,0,0);
  const size=Math.max(16,Math.round(source.width*.013));ctx.fillStyle='#61744f';ctx.font=`${size}px sans-serif`;ctx.fillText('息屿 · 送一口风，等一朵花开。',size*1.6,source.height+size*2.7);
  ctx.fillStyle='#95a087';ctx.font=`${size*.72}px monospace`;ctx.textAlign='right';ctx.fillText(new Date().toLocaleDateString('zh-CN'),postcard.width-size*1.6,source.height+size*2.7);
  const link=document.createElement('a');link.download=`息屿-小岛明信片-${new Date().toISOString().slice(0,10)}.png`;link.href=postcard.toDataURL('image/png');link.click();announce('把这一刻，存成了一张明信片。');
});
$('#world').addEventListener('pointerdown',()=>{dismissNote();if(desktopMode)toggleTools(false);});
function setMousePassthrough(ignore){if(ignoringMouse===ignore)return;ignoringMouse=ignore;window.desktopWorld?.setIgnoreMouse(ignore);}
document.addEventListener('pointermove',event=>{
  if(!desktopMode||!window.desktopWorld)return;
  if(desktopState.mouseMode==='passthrough'&&!desktopState.feeding)return;
  if(islandDrag?.isActive()||desktopUI?.moveMode){setMousePassthrough(false);return;}
  if(dragDepth||world?.mouse.down||$$('dialog').some(el=>el.open&&el.matches(':modal'))){setMousePassthrough(false);return;}
  const ui=event.target.closest('button,input,select,textarea,dialog,.tool-dock,.seed-panel,.tide-panel,.mic-note,.mic-status,.island-launcher,.active-tool-strip,.companion-card,.world-label,.world-topline,.interaction-hint,.file-drop-overlay');
  const hit=world?.hitTest?.(event.clientX,event.clientY)??true;
  setMousePassthrough(!ui&&!hit);
});
document.addEventListener('contextmenu',event=>{if(window.desktopWorld){event.preventDefault();window.desktopWorld.showContextMenu();}});
document.addEventListener('dragenter',event=>{
  if(![...event.dataTransfer.types].includes('Files'))return;
  event.preventDefault();dragDepth++;$('#file-drop-overlay').hidden=false;dismissNote();setMousePassthrough(false);
});
document.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
document.addEventListener('dragleave',event=>{if([...event.dataTransfer.types].includes('Files')){dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#file-drop-overlay').hidden=true;}});
document.addEventListener('drop',event=>{
  event.preventDefault();dragDepth=0;$('#file-drop-overlay').hidden=true;setMousePassthrough(false);
  const files=[...event.dataTransfer.files].slice(0,30);
  if(!files.length){announce('拖入要整理的文件，确认回收后获得点心。');return;}
  desktopUI?.handleFiles(files);
});
document.addEventListener('pointerdown',event=>{if(document.body.classList.contains('tools-open')&&event.target.closest('.bottom-ui,.companion-card'))toggleTools(true);});
document.addEventListener('keydown',event=>{
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.length===1)focusSession?.recordActivity();
  if(event.key==='Escape'){islandDrag?.cancel();world?.cancelInteraction?.();stopSpaceWind();stopDemo();quietMode(false);selectTool('explore');toggleTools(false);desktopUI?.closePanels();return;}
  if(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey)return;
  if(event.key.toLowerCase()==='h'&&desktopMode&&$('#board-dialog').open){event.preventDefault();toggleBoard();return;}
  if($$('dialog').some(dialog=>dialog.open))return;
  const key=event.key.toLowerCase();const toolKeys={'1':'explore','2':'wind','3':'rain','4':'seed','5':'food','6':'tide'};
  if(event.code==='Space' && !(event.target instanceof HTMLButtonElement)){
    event.preventDefault();if(!spaceWindTimer){dismissNote();world?.impulse('wind',{value:.85});spaceWindTimer=setInterval(()=>world?.impulse('wind',{value:.85}),350);}return;
  }
  if(toolKeys[key]){event.preventDefault();selectTool(toolKeys[key]);}
  else if(key==='n')updateNight(!night);else if(key==='m')toggleMic();else if(key==='h'){desktopMode?toggleBoard():quietMode(!document.body.classList.contains('quiet'));}
});
function stopSpaceWind(){clearInterval(spaceWindTimer);spaceWindTimer=null;}
document.addEventListener('keyup',event=>{if(event.code==='Space')stopSpaceWind();});
window.addEventListener('blur',()=>{stopSpaceWind();islandDrag?.cancel();});
window.addEventListener('beforeunload',()=>{islandDrag?.destroy();saveNow();mic?.stop();gardenAudio?.dispose();companion?.destroy();focusSession?.destroy();world?.destroy();eventStream?.close();});
init();
