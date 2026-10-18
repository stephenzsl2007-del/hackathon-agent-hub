'use strict';
(() => {
  const room = new URLSearchParams(location.search).get('room') || '';
  const status = document.querySelector('#status');
  const response = document.querySelector('#response');
  const buttons = [...document.querySelectorAll('[data-action]')];
  const replies = { wind: '风已经出发了。看看花草有没有轻轻摇动。', rain: '一片小雨云来了，花苞正在喝水。', seed: '你留下一粒种子，它会成为小岛的一部分。', food: '小动物闻到香味了，等它慢慢跑过来。', tide: '潮水正在回应你的轻触。', fireflies: '你送来的微光，正在夜色里漂浮。' };
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
    status.innerHTML = `<i></i>${value ? '已连接小岛' : '正在重新连接'}`;
    buttons.forEach(button => button.disabled = !value);
    if (!value) stopHold();
  }
  async function send(action) {
    if (!connected || pending) return;
    pending = true;
    try {
      const result = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, room, value: action === 'wind' ? 0.8 : 0.7 }) });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error || '连接暂时走丢了');
      show(replies[action], true);
      if (navigator.vibrate) navigator.vibrate(15);
    } catch (error) { show(error.message || '连接暂时走丢了，请稍后再试。'); }
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
    updateConnection(true);
    const data = JSON.parse(event.data);
    document.querySelector('#room').textContent = `小岛 ${data.roomCode}`;
    show('已经连接。选一个动作，抬头看看电脑里的小岛。');
  });
  events.addEventListener('audience', event => {
    const { count } = JSON.parse(event.data);
    status.innerHTML = `<i></i>${count > 1 ? `${count} 人一起照顾小岛` : '已连接小岛'}`;
  });
  events.addEventListener('error', () => { updateConnection(false); show('小岛暂时离线，正在自动重连。请保持电脑开启。'); });
})();
