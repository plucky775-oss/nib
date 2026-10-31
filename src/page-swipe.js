/** Own paper gestures from first contact; never move/zoom the browser viewport. */
export function mountPageSwipe({canvas, surface = canvas, getPageId, canStart,
  canSwipe = () => false, canPan = canSwipe, getAction = () => null, beforeStart = () => {}, navigate, viewport,
  onProgress = () => {}, root = document,
  nativeInput = () => false,
  nativeTouch = 'ontouchstart' in (root.defaultView || {})}) {
  let gesture = null, blocked = false, busy = false, disposed = false;
  const pens = new Set(), pointers = new Map(), options = {capture: true, passive: false};
  const onSurface = t => t.target === surface || !!surface.contains?.(t.target);
  const onCanvas = t => t.target === canvas || !!canvas.contains?.(t.target);
  const valid = t => Number.isFinite(t.clientX) && Number.isFinite(t.clientY) && t.touchType !== 'stylus' && !(t.radiusX > 40 && t.radiusY > 40);
  const point = t => ({x: t.clientX, y: t.clientY});
  const gap = ts => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
  const center = ts => ({x: (ts[0].clientX + ts[1].clientX) / 2, y: (ts[0].clientY + ts[1].clientY) / 2});
  const allowed = () => {try {return !disposed && !busy && !pens.size && !root.hidden && canStart() === true;} catch {return false;}};
  const suppress = e => {if (e.cancelable) e.preventDefault();};
  const stopPointer = e => {suppress(e); e.stopImmediatePropagation?.();};
  function cancel() {if (gesture) blocked = true; gesture = null; onProgress(null);}
  function context() {
    if (!gesture || !allowed() || getPageId() !== gesture.pageId || viewport?.revision() !== gesture.revision) return false;
    const r = surface.getBoundingClientRect();
    return Math.abs(r.left - gesture.rect.left) <= 1 && Math.abs(r.top - gesture.rect.top) <= 1 && Math.abs(r.width - gesture.rect.width) <= 1 && Math.abs(r.height - gesture.rect.height) <= 1;
  }
  function start(ts) {
    if (blocked) return;
    if (!allowed() || ts.length > 2 || ts.some(t => !valid(t) || !onSurface(t))) {cancel(); blocked = true; return;}
    if (ts.length === 2) {
      if (gesture?.kind === 'view' || ts[0].identifier === ts[1].identifier || gap(ts) < 8 || !viewport) {cancel(); blocked = true; return;}
      beforeStart(); // discard uncommitted finger ink and restore object previews
      if (!allowed()) {blocked = true; return;}
      blocked = false;
      gesture = {kind: 'view', ids: ts.map(t => t.identifier), gap: gap(ts), view: viewport.begin(center(ts)), pageId: getPageId(), rect: surface.getBoundingClientRect(), revision: viewport.revision()};
      onProgress(null); return;
    }
    if (ts.length !== 1 || gesture || !onCanvas(ts[0])) return;
    const pageAllowed = canSwipe(ts[0]), panAllowed = !!viewport && canPan(ts[0]);
    if (!pageAllowed && !panAllowed) return;
    const rect = surface.getBoundingClientRect();
    gesture = {kind: 'single', axis: null, pageAllowed, panAllowed, view: panAllowed ? viewport.begin(point(ts[0])) : null, id: ts[0].identifier, start: point(ts[0]), current: point(ts[0]), pageId: getPageId(), rect, revision: viewport?.revision(), threshold: Math.max(120, Math.min(220, rect.width * .28)), ready: false, action: null};
  }
  function move(ts) {
    if (!gesture) return;
    if (!context() || ts.some(t => !valid(t))) {cancel(); return;}
    if (gesture.kind === 'view') {
      if (ts.length !== 2 || ts.some(t => !gesture.ids.includes(t.identifier))) {cancel(); return;}
      if (!viewport.move(gesture.view, center(ts), gap(ts) / gesture.gap)) cancel();
      return;
    }
    const g = gesture;
    if (ts.length !== 1 || ts[0].identifier !== g.id) {cancel(); return;}
    g.current = point(ts[0]);
    const dx = g.current.x - g.start.x, dy = g.current.y - g.start.y;
    // Lock to the first clear direction so scrolling can never turn a page.
    if (!g.axis) {
      if (Math.abs(dy) >= 10 && Math.abs(dy) >= Math.abs(dx) * 1.2) g.axis = 'vertical';
      else if (Math.abs(dx) >= 10 && Math.abs(dx) >= Math.abs(dy) * 1.2) g.axis = 'horizontal';
      else return;
    }
    if (g.axis === 'vertical') {
      onProgress(null);
      if (!g.panAllowed || !viewport.move(g.view, {x: g.start.x, y: g.current.y}, 1)) cancel();
      return;
    }
    if (!g.pageAllowed) {cancel(); return;}
    // A horizontal gesture may be cancelled, but never becomes a vertical pan.
    if (Math.abs(dy) > 24 && Math.abs(dy) >= Math.abs(dx)) {cancel(); return;}
    const direction = Math.sign(dx);
    g.action = direction ? getAction(direction) : null;
    g.ready = !!g.action && Math.abs(dx) >= g.threshold && Math.abs(dx) >= Math.abs(dy) * 2;
    onProgress(g.action && Math.abs(dx) > 24 ? {action: g.action, direction, ready: g.ready, progress: Math.min(1, Math.abs(dx) / g.threshold)} : null);
  }
  function end(remaining, changed) {
    const g = gesture;
    if (g?.kind === 'single' && !remaining.length) {
      const last = changed.find(t => t.identifier === g.id);
      if (last) move([last]); else cancel();
      const action = gesture?.axis === 'horizontal' && gesture.ready === true && context() ? gesture.action : null;
      gesture = null; onProgress(null);
      if (action) {
        busy = true;
        try {Promise.resolve(navigate(action)).catch(() => {}).finally(() => {busy = false;});} catch {busy = false;}
      }
    } else if (g) cancel();
    // No 2 -> 1 promotion: release every finger before starting another action.
    if (!remaining.length) {gesture = null; blocked = false; onProgress(null);}
  }
  function touchStart(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    const ts = Array.from(e.touches || []);
    if (ts.some(onSurface) || gesture || blocked) suppress(e);
    if (ts.some(onSurface) || gesture) start(ts);
  }
  function touchMove(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    const ts = Array.from(e.touches || []);
    if (ts.some(onSurface) || gesture || blocked) suppress(e);
    move(ts);
  }
  function touchEnd(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}if (gesture || blocked) suppress(e); end(Array.from(e.touches || []), Array.from(e.changedTouches || []));}
  function touchCancel(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}cancel(); blocked = !!e.touches?.length;}
  const asTouch = e => ({identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY, target: e.target, radiusX: e.width / 2, radiusY: e.height / 2});
  function pointerDown(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    if (e.pointerType === 'pen') {pens.add(e.pointerId); cancel(); return;}
    if (e.pointerType !== 'touch') return;
    if (nativeTouch) {if (gesture?.kind === 'view' || blocked) stopPointer(e); return;}
    pointers.set(e.pointerId, asTouch(e));
    if (Array.from(pointers.values()).some(onSurface)) start([...pointers.values()]);
    if (gesture || blocked) stopPointer(e);
  }
  function pointerMove(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    if (e.pointerType !== 'touch') return;
    if (!nativeTouch && pointers.has(e.pointerId)) {pointers.set(e.pointerId, {...asTouch(e), target: pointers.get(e.pointerId).target}); move([...pointers.values()]);}
    if (gesture || blocked) stopPointer(e);
  }
  function pointerEnd(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    pens.delete(e.pointerId);
    if (e.pointerType !== 'touch') return;
    const owned = !!gesture || blocked;
    if (!nativeTouch && pointers.has(e.pointerId)) {const last = {...asTouch(e), target: pointers.get(e.pointerId).target}; pointers.delete(e.pointerId); end([...pointers.values()], [last]);}
    if (owned) stopPointer(e);
  }
  function pointerCancel(e) {
    if(nativeInput()){cancel();blocked=false;pointers.clear();pens.clear();return;}
    pens.delete(e.pointerId);
    // On TouchEvent devices only touchcancel owns cancellation.
    if (!nativeTouch && e.pointerType === 'touch') {pointers.delete(e.pointerId); cancel(); blocked = pointers.size > 0;}
  }
  function hidden() {if (root.hidden) {cancel(); pens.clear(); pointers.clear(); blocked = false;}}
  const handlers = [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerEnd], ['pointercancel', pointerCancel], ['visibilitychange', hidden]];
  if (nativeTouch) handlers.push(['touchstart', touchStart], ['touchmove', touchMove], ['touchend', touchEnd], ['touchcancel', touchCancel]);
  for (const [name, fn] of handlers) root.addEventListener(name, fn, options);
  return {cancel, hasGesture: () => !!gesture, blocksNativeScroll: () => !!gesture || blocked,
    dispose() {cancel(); disposed = true; for (const [name, fn] of handlers) root.removeEventListener(name, fn, options);},
  };
}
