/** Native island movement. A press remains a pending tap until the pointer moves 5 CSS px. */
export function installIslandDrag({ canvas, world, bridge, getState, onInteractionStart = () => {}, onDragState = () => {} }) {
  if (!canvas) throw new TypeError('installIslandDrag requires a canvas');
  const doc = canvas.ownerDocument || globalThis.document;
  const view = doc?.defaultView || globalThis.window;
  const listeners = [];
  let gesture = null, destroyed = false, moving = false, ownsMotion = false, nativeSessionOpen = false;
  const nativeCursor = Boolean(bridge?.nativeDrag && bridge?.beginDrag);
  let nativeEndRequested = false;
  let queuedX = 0, queuedY = 0, lastPublished = '', suppressClickUntil = 0;
  let lastError = null;
  function trace(event, data = {}) {
    if (!bridge?.dragDebugEnabled) return;
    try { Promise.resolve(bridge.reportDragDebug?.({ event, phase: gesture?.phase || 'idle', active: isActive(), ...data })).catch(() => {}); } catch {}
  }
  const eventDetails = event => ({ screenX:event.screenX, screenY:event.screenY, clientX:event.clientX, clientY:event.clientY, pointerId:event.pointerId, button:event.button, buttons:event.buttons, altKey:Boolean(event.altKey), ctrlKey:Boolean(event.ctrlKey), metaKey:Boolean(event.metaKey) });

  const position = event => ({
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY,
  });
  const hasQueuedMove = () => Boolean(queuedX || queuedY);
  const isActive = () => Boolean(gesture || (ownsMotion && (moving || hasQueuedMove())));
  function publish() {
    if (destroyed) return;
    const phase = gesture?.phase || (isActive() ? 'settling' : 'idle');
    const key = `${phase}:${Boolean(lastError)}`;
    if (key === lastPublished) return;
    lastPublished = key;
    onDragState({ phase, active: isActive(), dragging: phase === 'dragging', error: lastError });
  }
  function swallow(event) { event.preventDefault?.(); event.stopImmediatePropagation?.(); }
  function release(session) {
    try { if (session?.capture?.hasPointerCapture?.(session.pointerId)) session.capture.releasePointerCapture(session.pointerId); } catch { /* Capture may already have been released by the OS. */ }
  }
  function cancel(reason = 'explicit') {
    trace('cancel', { reason });
    const old = gesture;
    gesture = null; queuedX = 0; queuedY = 0; ownsMotion = false;
    if (nativeCursor && nativeSessionOpen) nativeEndRequested = true;
    release(old); publish();
    if (nativeSessionOpen && !moving) void drain();
  }
  async function drain() {
    if (moving || destroyed) return;
    moving = true;
    try {
      while (true) {
        // Windows follows the OS cursor directly, so renderer coordinates never
        // feed the moved window's position back into the next movement delta.
        if (nativeCursor && nativeSessionOpen && (nativeEndRequested || !gesture || destroyed)) {
          nativeSessionOpen = false; nativeEndRequested = false;
          trace('native-finish'); await bridge.finishMove?.();
          continue;
        }
        if (!hasQueuedMove() || destroyed) {
          if (nativeSessionOpen && !gesture) {
            nativeSessionOpen = false;
            trace('native-finish'); await bridge.finishMove?.();
            continue;
          }
          break;
        }
        // Native moveGarden clamps the actual bounds to the current workarea.
        // Split unusually large multi-display deltas to stay inside its IPC limits.
        const dx = Math.max(-1000, Math.min(1000, queuedX));
        const dy = Math.max(-1000, Math.min(1000, queuedY));
        queuedX -= dx; queuedY -= dy;
        nativeSessionOpen = true;
        trace('native-call', { dx, dy });
        if (nativeCursor) {
          queuedX = 0; queuedY = 0;
          await bridge.beginDrag({ dx, dy });
        } else await bridge.moveGarden({ dx, dy, dragging: true });
      }
    } catch {
      lastError = '暂时无法移动花园，请从小叶子菜单恢复位置。';
      cancel('error');
      if (nativeSessionOpen) {
        nativeSessionOpen = false;
        try { await bridge.finishMove?.(); } catch { /* A closed window needs no further recovery. */ }
      }
    } finally {
      moving = false;
      if (!gesture && !hasQueuedMove()) ownsMotion = false;
      publish();
    }
  }
  function queueMove(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
    if (nativeCursor && nativeSessionOpen && !nativeEndRequested) return;
    queuedX += dx; queuedY += dy;
    // Only one native call can be in flight. Later deltas accumulate and are
    // sent after it resolves, so delayed IPC cannot reorder the window movement.
    void drain();
  }
  function handleFor(event) { return event.target?.closest?.('#island-drag-handle') || null; }
  function onCanvas(event) { return event.target === canvas || Boolean(canvas.contains?.(event.target)); }
  function down(event) {
    if (destroyed || !bridge?.moveGarden) return;
    const handle = handleFor(event);
    trace('down', { ...eventDetails(event), target: handle ? 'handle' : onCanvas(event) ? 'canvas' : 'other', ...(getState?.() || {}) });
    if (!handle && !onCanvas(event)) return;
    if (gesture) {
      // A fresh primary press means a previous release was missed. Recover
      // here without letting secondary pointers steal an in-progress gesture.
      if (event.button === 0 && event.isPrimary !== false) cancel('new-down');
      else { swallow(event); return; }
    }
    const state = getState?.() || {};
    if (!state.desktopMode || state.hasOpenDialog || event.button !== 0 || event.isPrimary === false || event.ctrlKey || event.metaKey) { trace('rejected', { reason:'state' }); return; }
    const forced = Boolean(handle || event.altKey || state.moveMode);
    if (!forced && state.tool !== 'explore') { trace('rejected', { reason:'tool' }); return; }
    if (!forced) {
      const hit = Boolean(world?.hitTest?.(event.clientX, event.clientY)), weather = Boolean(world?.isWeatherHandleAt?.(event.clientX, event.clientY));
      if (!hit || weather) { trace('rejected', { reason:weather?'weather':'miss', hit, weather }); return; }
    }
    // If the world cannot safely replay a deferred tap, leave ordinary clicks
    // untouched. A drag handle/Option still supports movement in that case.
    if (!forced && typeof world?.tapInteraction !== 'function') return;
    const point = position(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    swallow(event);
    lastError = null; ownsMotion = true;
    gesture = {
      pointerId: event.pointerId, phase: 'pending', forced, capture: handle || canvas,
      origin: point, last: point,
      tap: { clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType || 'mouse', button: 0 },
    };
    try { gesture.capture.setPointerCapture?.(event.pointerId); } catch { /* Document-level cleanup remains available. */ }
    trace('capture', { captured:Boolean(gesture.capture.hasPointerCapture?.(event.pointerId)) });
    // This is the real native switch, not CSS pointer-events. Capture listeners
    // plus isActive() also prevent the app's hover logic from enabling passthrough.
    try { Promise.resolve(bridge.setIgnoreMouse?.(false)).catch(() => {}); } catch { /* A lost bridge must not strand pointer capture. */ }
    onInteractionStart(); publish();
  }
  function advance(event) {
    if (!gesture) return;
    const point = position(event);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    if (gesture.phase === 'pending') {
      if (Math.hypot(point.x - gesture.origin.x, point.y - gesture.origin.y) < 5) return;
      gesture.phase = 'dragging';
      suppressClickUntil = Date.now() + 500;
      publish();
    }
    const dx = point.x - gesture.last.x, dy = point.y - gesture.last.y;
    gesture.last = point;
    queueMove(dx, dy);
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    swallow(event);
    // Electron's forward:true events can report buttons=0 throughout a real
    // captured drag. Capture plus our primary down is authoritative until an
    // actual up/cancel/lostcapture/blur; otherwise the island only jumps on up.
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      const captured = Boolean(gesture.capture.hasPointerCapture?.(gesture.pointerId));
      trace('move', { ...eventDetails(event), captured, reason:captured?'forwarded-move':'uncaptured-hover' });
      if (!captured) return;
    } else trace('move', eventDetails(event));
    advance(event);
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    trace('up', eventDetails(event));
    swallow(event);
    advance(event);
    const old = gesture;
    gesture = null;
    if (nativeCursor && nativeSessionOpen) nativeEndRequested = true;
    suppressClickUntil = Date.now() + 500;
    release(old);
    try { if (old.phase === 'pending' && !old.forced) world.tapInteraction(old.tap); }
    finally {
      if (nativeSessionOpen && !moving) void drain();
      if (!moving && !hasQueuedMove()) ownsMotion = false;
      publish();
    }
  }
  function abortPointer(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    trace(event.type, eventDetails(event)); swallow(event); cancel(event.type);
  }
  function click(event) {
    if (Date.now() > suppressClickUntil || (!onCanvas(event) && !handleFor(event))) return;
    swallow(event);
  }
  function key(event) { if (event.key === 'Escape') cancel('escape'); }
  function hidden() { if (doc.hidden) cancel('hidden'); }
  function listen(target, type, listener) {
    target?.addEventListener?.(type, listener, true);
    listeners.push(() => target?.removeEventListener?.(type, listener, true));
  }
  listen(doc, 'pointerdown', down); listen(doc, 'pointermove', move); listen(doc, 'pointerup', up);
  listen(doc, 'pointercancel', abortPointer); listen(doc, 'lostpointercapture', abortPointer);
  listen(doc, 'click', click); listen(doc, 'keydown', key); listen(doc, 'visibilitychange', hidden);
  listen(view, 'blur', () => { trace('blur'); cancel('blur'); });
  return {
    isActive,
    cancel,
    destroy() { cancel(); destroyed = true; listeners.splice(0).forEach(remove => remove()); },
  };
}
