// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ノードと辺のエディタ（体制図・フローで共用する独立部品） ============
// 呼び出し側は「ノード」「辺」「コールバック」を渡すだけ。データの保存は呼び出し側が行う。
//  - 表示モード：ノードのクリック、カーソルを合わせたときの関連ハイライト
//  - 編集モード：ノードのドラッグ移動、ハンドルから別ノードへドラッグして接続、辺のクリック、空き領域のダブルクリック
function dgPath(e, a, b){
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  if (e.style === 'rail') return `M${ax + 14} ${ay + a.h}V${by + b.h / 2}H${bx}`;
  if (e.kind === 'report') { const x1 = ax + a.w / 2, y1 = ay + a.h, x2 = bx + b.w / 2, y2 = by - 3, dy = Math.max(18, (y2 - y1) / 2); return `M${x1} ${y1}C${x1} ${y1 + dy},${x2} ${y2 - dy},${x2} ${y2}`; }
  if (e.kind === 'peer') {
    const [L, R] = ax <= bx ? [a, b] : [b, a];
    const x1 = L.x + L.w, y1 = L.y + L.h / 2, x2 = R.x, y2 = R.y + R.h / 2, k = Math.max(30, Math.abs(x2 - x1) / 3);
    return `M${x1} ${y1}C${x1 + k} ${y1},${x2 - k} ${y2},${x2} ${y2}`;
  }
  // flow：右端 → 左端。戻る向きの線（差し戻しなど）は下を回る
  const x1 = ax + a.w, y1 = ay + a.h / 2, x2 = bx - 3, y2 = by + b.h / 2;
  if (x2 > x1 + 10) { const k = Math.max(30, (x2 - x1) / 2); return `M${x1} ${y1}C${x1 + k} ${y1},${x2 - k} ${y2},${x2} ${y2}`; }
  const yb = Math.max(ay + a.h, by + b.h) + 34;
  return `M${x1} ${y1}C${x1 + 40} ${y1},${x1 + 40} ${yb},${x1} ${yb}L${bx} ${yb}C${bx - 40} ${yb},${bx - 40} ${y2},${x2} ${y2}`;
}
function diagram(host, spec){
  const nodes = Object.fromEntries(spec.nodes.map(n => [n.id, {...n}]));
  const edges = spec.edges.filter(e => nodes[e.from] && nodes[e.to]);
  const marker = e => e.kind === 'peer' ? '' : `marker-end="url(#dg-arrow-${e.kind === 'flow' ? 'flow' : 'rep'})"`;
  const handle = (n, h) => { const p = h.at === 'bottom' ? [n.w / 2, n.h] : [n.w, n.h / 2]; return `<circle class="dg-handle ${h.kind}" data-handle="${h.kind}" cx="${p[0]}" cy="${p[1]}" r="7"><title>${esc(h.title || '')}</title></circle>`; };
  host.innerHTML = `<div class="dg-wrap ${spec.edit ? 'editing' : ''}"><svg class="dg ${spec.cls || ''}" viewBox="0 0 ${spec.W} ${spec.H}" style="width:100%;max-width:${spec.W}px;min-width:${Math.min(spec.W, spec.minW || 560)}px" role="img" aria-label="${esc(spec.label || '')}">
    <defs><marker id="dg-arrow-rep" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" class="dg-head rep"/></marker>
      <marker id="dg-arrow-flow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" class="dg-head flow"/></marker></defs>
    <g class="dg-under">${spec.under || ''}</g>
    <g class="dg-edges">${edges.map(e => `<g class="dg-edge ${e.kind} ${e.cls || ''}" data-edge="${esc(e.id)}" data-a="${esc(e.from)}" data-b="${esc(e.to)}"><path class="hit" d=""/><path class="line" d="" ${marker(e)}/>${e.label ? `<g class="dg-elabel"><rect rx="8" height="18"/><text text-anchor="middle">${esc(e.label)}</text></g>` : ''}</g>`).join('')}</g>
    <g class="dg-nodes">${Object.values(nodes).map(n => `<g class="dg-node ${n.cls || ''}" data-node="${esc(n.id)}" transform="translate(${n.x},${n.y})" style="--d:${n.delay || 0}ms"><g class="dg-body">${n.body}</g>${spec.edit ? (spec.handles || []).map(h => handle(n, h)).join('') : ''}</g>`).join('')}</g>
    <path class="dg-temp" d=""/>
  </svg></div>`;
  const svg = host.querySelector('svg');
  const pt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const drawEdge = g => {
    const e = edges.find(x => x.id === g.dataset.edge); if (!e) return;
    const d = dgPath(e, nodes[e.from], nodes[e.to]);
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    const lab = g.querySelector('.dg-elabel'); if (lab) {
      const line = g.querySelector('.line'), m = line.getPointAtLength(line.getTotalLength() / 2), txt = lab.querySelector('text'), w = Math.max(28, (e.label.length * 11) + 14);
      txt.setAttribute('x', m.x); txt.setAttribute('y', m.y + 4); const r = lab.querySelector('rect'); r.setAttribute('x', m.x - w / 2); r.setAttribute('y', m.y - 9); r.setAttribute('width', w);
    }
  };
  const drawAll = id => svg.querySelectorAll('.dg-edge').forEach(g => { if (!id || g.dataset.a === id || g.dataset.b === id) drawEdge(g); });
  drawAll();
  // 関連のハイライト（表示モード）
  const focus = id => {
    if (!spec.related) return;
    const rel = id ? spec.related(id) : null;
    svg.classList.toggle('hl', !!rel);
    svg.querySelectorAll('.dg-node').forEach(n => n.classList.toggle('rel', !!rel && rel.has(n.dataset.node)));
    svg.querySelectorAll('.dg-edge').forEach(g => g.classList.toggle('rel', !!rel && rel.has(g.dataset.a) && rel.has(g.dataset.b)));
  };
  let drag = null, conn = null;
  svg.querySelectorAll('.dg-node').forEach(g => {
    const id = g.dataset.node;
    g.addEventListener('mouseenter', () => { if (!drag && !conn) focus(id); });
    g.addEventListener('mouseleave', () => { if (!drag && !conn) focus(spec.selected || ''); });
    g.addEventListener('pointerdown', e => {
      const pc = e.target.closest('[data-person]');
      if (e.target.closest('[data-handle]')) return;
      if (pc && !spec.edit) return;
      const p = pt(e), n = nodes[id];
      drag = {id, g, ox: n.x, oy: n.y, px: p.x, py: p.y, moved: false, person: pc ? pc.dataset.person : ''};
      if (spec.edit) { svg.setPointerCapture(e.pointerId); g.classList.add('dragging'); }
    });
  });
  svg.querySelectorAll('[data-person]').forEach(el => el.addEventListener('click', e => { if (!spec.edit && spec.onPerson) { e.stopPropagation(); spec.onPerson(el.dataset.person); } }));
  svg.querySelectorAll('[data-handle]').forEach(h => h.addEventListener('pointerdown', e => {
    e.stopPropagation(); const g = h.closest('[data-node]'), n = nodes[g.dataset.node];
    conn = {from: g.dataset.node, kind: h.dataset.handle, x: n.x + +h.getAttribute('cx'), y: n.y + +h.getAttribute('cy')};
    svg.setPointerCapture(e.pointerId); svg.classList.add('connecting');
  }));
  svg.addEventListener('pointermove', e => {
    const p = pt(e);
    if (drag && spec.edit) {
      const dx = p.x - drag.px, dy = p.y - drag.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const n = nodes[drag.id]; n.x = Math.max(0, drag.ox + dx); n.y = Math.max(0, drag.oy + dy);
      drag.g.setAttribute('transform', `translate(${n.x},${n.y})`); drawAll(drag.id);
    } else if (conn) {
      svg.querySelector('.dg-temp').setAttribute('d', `M${conn.x} ${conn.y}L${p.x} ${p.y}`);
      svg.querySelectorAll('.dg-node').forEach(g => g.classList.toggle('drop', g.dataset.node !== conn.from && !!document.elementFromPoint(e.clientX, e.clientY)?.closest(`[data-node="${CSS.escape(g.dataset.node)}"]`)));
    }
  });
  svg.addEventListener('pointerup', e => {
    if (conn) {
      const hit = document.elementFromPoint(e.clientX, e.clientY), tg = hit && hit.closest('[data-node]');
      svg.querySelector('.dg-temp').setAttribute('d', ''); svg.classList.remove('connecting'); svg.querySelectorAll('.drop').forEach(x => x.classList.remove('drop'));
      const from = conn.from, kind = conn.kind; conn = null;
      if (tg && svg.contains(tg) && tg.dataset.node !== from && spec.onConnect) spec.onConnect(from, tg.dataset.node, kind);
      return;
    }
    if (!drag) return;
    const d = drag; drag = null; d.g.classList.remove('dragging');
    if (d.moved && spec.edit) { const n = nodes[d.id]; spec.onMove && spec.onMove(d.id, Math.round(n.x), Math.round(n.y)); }
    else if (d.person && spec.onPerson) spec.onPerson(d.person);
    else spec.onNode && spec.onNode(d.id);
  });
  svg.querySelectorAll('.dg-edge').forEach(g => g.addEventListener('click', e => { if (spec.edit && spec.onEdge) { e.stopPropagation(); spec.onEdge(edges.find(x => x.id === g.dataset.edge), e.clientX, e.clientY); } }));
  svg.addEventListener('dblclick', e => { if (spec.edit && spec.onCanvas && !e.target.closest('[data-node],[data-edge]')) { const p = pt(e); spec.onCanvas(Math.round(p.x), Math.round(p.y)); } });
  focus(spec.selected || '');
  return {svg, nodes};
}
// 辺の小さなメニュー（ラベル変更・削除）
function dgPopover(x, y, html, bind){
  document.querySelectorAll('.dg-pop').forEach(p => p.remove());
  const m = document.createElement('div'); m.className = 'dg-pop'; m.style.left = Math.min(x, innerWidth - 260) + 'px'; m.style.top = Math.min(y + 8, innerHeight - 140) + 'px';
  m.innerHTML = html; document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = ev => { if (!m.contains(ev.target)) close(); };
  setTimeout(() => document.addEventListener('pointerdown', out, true));
  bind(m, close);
  const f = m.querySelector('input'); if (f) f.focus();
}
