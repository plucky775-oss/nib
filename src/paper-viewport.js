// Only the paper is transformed. Its SVG keeps the original 900 x 1200 units.
export function clampPaperView(view, size) {
  const scale = Math.max(0.5, Math.min(4, Number(view.scale) || 1));
  const width = size.paperWidth * scale, height = size.paperHeight * scale;
  return {
    scale,
    x: width <= size.width ? (size.width - width) / 2 : Math.max(size.width - width, Math.min(0, view.x)),
    y: height <= size.height ? 0 : Math.max(size.height - height, Math.min(0, view.y)),
  };
}

export function movePaperView(start, from, to, ratio, size) {
  const scale = Math.max(0.5, Math.min(4, start.scale * ratio));
  const factor = scale / start.scale;
  return clampPaperView({scale, x: to.x - (from.x - start.x) * factor, y: to.y - (from.y - start.y) * factor}, size);
}

export function mountPaperViewport({container, paper, onChange = () => {}, beforeChange = () => {}, win = window}) {
  let view = {scale: 1, x: 0, y: 0}, revision = 0;
  const size = () => ({width: container.clientWidth, height: container.clientHeight, paperWidth: paper.offsetWidth, paperHeight: paper.offsetHeight});
  const local = p => {const r = container.getBoundingClientRect(); return {x: p.x - r.left, y: p.y - r.top};};
  function apply(next) {
    view = clampPaperView(next, size());
    paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    onChange({...view});
  }
  function reset() {beforeChange(); revision++; apply({scale: 1, x: 0, y: 0});}
  function resize() {beforeChange(); revision++; apply(view);}
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(resize) : null;
  observer?.observe(container); win.addEventListener('resize', resize);
  apply(view);
  return {
    reset,
    revision: () => revision,
    snapshot: () => ({...view}),
    begin: center => ({view: {...view}, center: local(center), revision}),
    move(start, center, ratio) {
      if (start.revision !== revision) return false;
      apply(movePaperView(start.view, start.center, local(center), ratio, size())); return true;
    },
    zoomBy(factor) {
      beforeChange(); revision++;
      const s = size(), center = {x: s.width / 2, y: s.height / 2};
      apply(movePaperView(view, center, center, factor, s));
    },
    panBy(dx, dy) {beforeChange(); revision++; apply({...view, x: view.x + dx, y: view.y + dy});},
    dispose() {observer?.disconnect(); win.removeEventListener('resize', resize);},
  };
}
