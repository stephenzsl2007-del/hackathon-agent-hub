'use strict';
(() => {
  const room = new URLSearchParams(location.search).get('room') || '';
  const status = document.querySelector('#status');
  const response = document.querySelector('#response');
  const buttons = [...document.querySelectorAll('[data-action]')];
  const replies = { wind: '小岛收到了风，花草正在轻轻摇动。', rain: '小岛收到了雨，花苞正在喝水。', seed: '小岛已种下你的种子，抬头看看新芽。', food: '小动物闻到互动点心了；团团的饲料由电脑端管理。', tide: '小岛的潮水已经回应你的轻触。', fireflies: '你送来的微光，正在小岛的夜色里漂浮。' };
  let connected = false;
  let holdTimer;
  let activeButton;
  let flashTimer;
  let pending = false;
  let lastPointerAction = 0;
  function show(text, flash = false) {
    response.textContent = text;
    response.classList.toggle('flash', flash);
    clearTimeout(flashTimer);
    if (flash) flashTimer = setTimeout(() => response.classList.remove('flash'), 900);
  }
  function updateConnection(value) {
    connected = value;
    status.classList.toggle('online', value);
    status.innerHTML = `<i></i>${value ? '已连接小岛' : '等待电脑上的花园'}`;
    buttons.forEach(button => button.disabled = !value);
    if (!value) stopHold();
  }
  async function send(action) {
    if (!connected || pending) return;
    pending = true;
    try {
      show('正在等小岛回应…');
      const result = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, room, value: action === 'wind' ? 0.8 : 0.7 }), signal: AbortSignal.timeout(5000) });
      const data = await result.json();
      if (!result.ok || !data.ok) throw new Error(data.error || '连接暂时走丢了');
      show(replies[action], true);
      if (navigator.vibrate) navigator.vibrate(15);
    } catch (error) { show(error.name==='TimeoutError'?'未收到小岛确认，请先在电脑查看结果。':error.message || '连接暂时走丢了，请稍后再试。'); }
    finally { pending = false; }
  }
  function stopHold() {
    clearInterval(holdTimer); holdTimer = null;
    activeButton?.classList.remove('held'); activeButton = null;
  }
  buttons.forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!connected) return;
      event.preventDefault();
      stopHold();
      lastPointerAction = Date.now();
      button.setPointerCapture(event.pointerId);
      activeButton = button; button.classList.add('held');
      send(button.dataset.action);
      if (button.dataset.action === 'wind') holdTimer = setInterval(() => send('wind'), 350);
    });
    button.addEventListener('pointerup', stopHold);
    button.addEventListener('pointercancel', stopHold);
    button.addEventListener('lostpointercapture', stopHold);
    button.addEventListener('click', event => { if (event.detail === 0 && Date.now() - lastPointerAction > 200) send(button.dataset.action); });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHold(); });
  window.addEventListener('blur', stopHold);
  if (!room) {
    status.innerHTML = '<i></i>还没有加入小岛';
    show('请在电脑中点击「一起造风」，扫描二维码加入。');
    return;
  }
  const events = new EventSource(`/api/events?phone=1&room=${encodeURIComponent(room)}`);
  events.addEventListener('ready', event => {
    const data = JSON.parse(event.data);
    updateConnection(data.hostOnline===true);
    document.querySelector('#room').textContent = `小岛 ${data.roomCode}`;
    show(data.hostOnline?'已经连接。选一个动作，抬头看看电脑里的小岛。':'请先打开电脑上的花园；连接后会自动恢复。');
  });
  events.addEventListener('audience', event => {
    const { count,hostOnline } = JSON.parse(event.data);
    updateConnection(hostOnline===true);
    if(hostOnline)status.innerHTML = `<i></i>${count > 1 ? `${count} 人一起照顾小岛` : '已连接小岛'}`;
    else show('电脑上的花园暂时离线，请等它回来。');
  });
  events.addEventListener('error', () => { updateConnection(false); show('小岛暂时离线，正在自动重连。请保持电脑开启。'); });
})();
