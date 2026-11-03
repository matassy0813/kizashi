// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ リスク・課題（RAID）：一覧・構造図・傾向・詳細 ============
// 誰が見ても「何が起きていて、誰が持ち、何を決めればよいか」が分かることを目標にする。
//  - 一覧：これまでどおり表で編集（フェーズ・カテゴリで絞り込み）
//  - 構造図：親課題と子課題を木で表示（編集モードで線を引いて親子を付け替える）
//  - 傾向：リスクの影響×発生確率、未解決件数の推移、担当者ごとの件数
//  - 詳細：課題カード（起きていること／影響／次の一手）、関係者、判断の依頼、親子、関連タスク、経緯とコメント
const raidIdx = id => state.raid.findIndex(r => r.id === id);
const raidById = id => state.raid.find(r => r.id === id);
const raidKids = id => state.raid.filter(r => r.parentId === id);
const nameOpts = (cur) => { const ns = state.org.map(p => p.name).filter(Boolean); if (cur && !ns.includes(cur)) ns.push(cur); return ns.map(n => [n, n]); };
// 親にできる課題（自分と自分の子孫は除く。循環を防ぐ）
function raidParentOpts(r){
  const bad = new Set([r.id]); let grow = true;
  while (grow) { grow = false; state.raid.forEach(x => { if (x.parentId && bad.has(x.parentId) && !bad.has(x.id)) { bad.add(x.id); grow = true; } }); }
  return state.raid.filter(x => !bad.has(x.id) && x.type !== 'decision').map(x => [x.id, `${x.id} ${x.title || ''}`]);
}
const ownersText = r => raidOwners(r).join('、') || '—';
const openRaid$ = id => go({tab: 'raid', raidSel: id});

function renderRaid(v, ctx){
  if (ui.raidSel && raidById(ui.raidSel)) return renderRaidDetail(v, ctx, raidById(ui.raidSel));
  ui.raidSel = '';
  const view = ui.raidView || 'list';
  const decN = state.raid.filter(r => inScope(r) && r.needDecision && r.status !== 'closed').length;
  v.innerHTML = `<div class="bar">
      <div class="seg">${['list','tree','trend'].map(k => `<button class="${view === k ? 'on' : ''}" data-rview="${k}">${t('rd.view.' + k)}</button>`).join('')}</div>
      <select id="fRaid"><option value="">${t('flt.allTypes')}</option>${enumOpts('raidType').map(([k, l]) => `<option value="${k}" ${k === ui.raidType ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="fCat"><option value="">${t('flt.allCats')}</option>${enumOpts('raidCat').map(([k, l]) => `<option value="${k}" ${k === ui.raidCat ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="chk"><input type="checkbox" id="fOpen" ${ui.raidOpen ? 'checked' : ''}> ${t('rd.openOnly')}</label>
      <label class="chk"><input type="checkbox" id="fDec" ${ui.raidDec ? 'checked' : ''}> ${t('rd.decOnly')}${decN ? ` <b class="cnt-inline">${decN}</b>` : ''}</label>
      <span class="sp"></span>
      <button class="btn primary" id="addRaid">＋ ${t('btn.add')}</button>
    </div><div id="raidBody"></div>`;
  const rows = state.raid.map((r, i) => ({r, i})).filter(({r}) => inScope(r) && (!ui.raidType || r.type === ui.raidType) && (!ui.raidCat || r.category === ui.raidCat) && (!ui.raidOpen || r.status !== 'closed') && (!ui.raidDec || (r.needDecision && r.status !== 'closed')));
  const body = $('#raidBody');
  if (view === 'tree') renderRaidTree(body, ctx, rows.map(x => x.r)); else if (view === 'trend') renderRaidTrend(body, ctx, rows.map(x => x.r)); else renderRaidList(body, ctx, rows);
  v.querySelectorAll('[data-rview]').forEach(el => el.onclick = () => { ui.raidView = el.dataset.rview; render(true); });
  $('#fRaid').onchange = e => { ui.raidType = e.target.value; render(); };
  $('#fCat').onchange = e => { ui.raidCat = e.target.value; render(); };
  $('#fOpen').onchange = e => { ui.raidOpen = e.target.checked; render(); };
  $('#fDec').onchange = e => { ui.raidDec = e.target.checked; render(); };
  $('#addRaid').onclick = () => { const r = newRaid({type: ui.raidType || 'risk', category: ui.raidCat || 'other'}); save(); if (view !== 'list') openRaid$(r.id); else render(); };
}
// 新しい課題・リスク。作成者は自動で入る（担当者は作成者を仮に入れる：メンバーは自分の起票を自分で更新できる）
function newRaid(extra){
  const type = (extra && extra.type) || 'risk', pre = {risk:'R', issue:'I', assumption:'A', decision:'D'}[type];
  const r = {id: nextId(pre, state.raid.filter(x => x.type === type)), type, phaseId: ui.scope, category: 'other', title: '', owner: '', owners: [], reporter: myName(), approver: '', parentId: '',
    impact: 'M', prob: type === 'risk' ? 'M' : '', status: 'open', raised: todayStr(), due: '', mitigation: '', detail: '', impactText: '', ask: '', needDecision: false, decider: '', decideBy: '', taskIds: [], log: [], updated: todayStr(), ...extra};
  if (r.type !== 'risk') r.prob = '';
  if (!r.owners.length && myRole() === 'member') r.owners = [myName()];
  r.owner = r.owners[0] || '';
  raidLog(r, {kind: 'create'});
  state.raid.push(r); return r;
}

// ---- 一覧（これまでの表。ID を押すと詳細を開く） ----
function renderRaidList(el, {b}, rows){
  rows.sort((a, c) => phaseIdx(a.r.phaseId) - phaseIdx(c.r.phaseId) || a.i - c.i);
  const f = (i, k, o) => fld('raid', i, k, state.raid[i][k], o);
  el.innerHTML = `<div class="card">
    <div class="muted small" style="margin-bottom:8px">${t('raid.hint')}　${t('rd.listHint')}</div>
    <div class="scroll-x"><table>
      <tr><th>ID</th><th>${t('col.type')}</th><th>${t('col.phase')}</th><th>${t('col.category')}</th><th>${t('col.title')}</th><th>${t('col.owner')}</th><th>${t('col.impact')}</th><th>${t('col.prob')}</th><th>${t('col.status')}</th><th>${t('col.raised')}</th><th>${t('col.due')}</th><th>${t('col.mitigation')}</th><th></th></tr>
      ${rows.map(({r, i}) => { const late = r.status !== 'closed' && r.due && d2n(r.due) < b, extra = raidOwners(r).length - 1, kids = raidKids(r.id).length; return `<tr class="${r.category === 'contract' && r.status !== 'closed' ? 'row-contract' : ''}">
        <td><button class="link-btn" data-open-raid="${esc(r.id)}" title="${t('rd.open')}">${esc(r.id)}</button></td>
        <td>${f(i, 'type', {type:'select', opts: enumOpts('raidType')})}</td>
        <td>${f(i, 'phaseId', {type:'select', opts: phaseOpts(), blank: t('common.common')})}</td>
        <td>${f(i, 'category', {type:'select', opts: enumOpts('raidCat')})}</td>
        <td>${f(i, 'title', {cls:'w-name'})}<div class="rd-sub">${r.parentId ? `<span class="muted small">↳ ${t('rd.childOf')} <button class="link-btn" data-open-raid="${esc(r.parentId)}">${esc(r.parentId)}</button></span>` : ''}${kids ? `<span class="muted small">⑂ ${t('rd.kidsN', kids)}</span>` : ''}${r.needDecision && r.status !== 'closed' ? `<span class="dec-flag">${t('rd.needDecision')}</span>` : ''}${(r.log || []).some(x => x.kind === 'comment') ? `<span class="muted small">💬 ${(r.log || []).filter(x => x.kind === 'comment').length}</span>` : ''}</div></td>
        <td>${f(i, 'owner', {cls:'w-s'})}${extra > 0 ? `<div class="muted small" title="${esc(ownersText(r))}">＋${extra}${t('rd.personSuffix')}</div>` : ''}</td>
        <td>${f(i, 'impact', {type:'select', opts: enumOpts('level'), blank: true})}</td>
        <td>${r.type === 'risk' ? f(i, 'prob', {type:'select', opts: enumOpts('level'), blank: true}) : '<span class="muted">—</span>'}</td>
        <td>${f(i, 'status', {type:'select', opts: enumOpts('raidStatus')})}${r.status === 'closed' && r.approvedBy ? `<div class="muted small">${t('ap.approvedBy', esc(r.approvedBy), md(r.approvedAt))}</div>` : r.status === 'closed' ? '' : returnedNote(r)}</td>
        <td>${f(i, 'raised', {type:'date'})}</td>
        <td class="${late ? 'cell-late' : ''}">${f(i, 'due', {type:'date'})}</td>
        <td>${f(i, 'mitigation', {cls:'w-name'})}</td>
        <td><div class="tname"><button class="btn sm" data-open-raid="${esc(r.id)}">${t('rd.open')} ›</button>${delBtn('raid', i, r.title || r.id)}</div></td>
      </tr>`; }).join('')}
    </table></div>
    ${rows.length ? '' : `<div class="empty">${t('empty.raidAll')}</div>`}
  </div>`;
}

// ---- 構造図（親課題 → 子課題の木。組織図と同じ部品で描く） ----
const ISS_W = 230;
// 文字幅からカードの高さを見積もる（タイトルを省略せず、カードの中で折り返して全部見せる）
const textW = (s, wide, narrow) => [...String(s || '')].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? wide : narrow), 0);
function issMetaText(r){
  const kids = raidKids(r.id);
  return [`${t('rd.ownersShort')} ${ownersText(r)}`, r.approver ? `${t('rd.approverShort')} ${r.approver}` : '', r.due ? md(r.due) : '', kids.length ? t('rd.kidsDone', kids.filter(k => k.status === 'closed').length, kids.length) : ''].filter(Boolean).join(' · ');
}
function issHeight(r){
  const inner = ISS_W - 24, lines = (s, wide, narrow) => Math.max(1, Math.ceil(textW(s, wide, narrow) / inner));
  return 44 + lines(r.title || r.id, 13, 7.2) * 18 + lines(issMetaText(r), 11, 6.2) * 16 + (r.needDecision && r.status !== 'closed' ? 22 : 0);
}
function raidTreeLayout(items, avail){
  const GX = 22, GY = 46, ids = new Set(items.map(r => r.id)), kids = {};
  items.forEach(r => { const k = r.parentId && ids.has(r.parentId) ? r.parentId : ''; (kids[k] = kids[k] || []).push(r); });
  const depth = {}, memo = {};
  const width = r => memo[r.id] != null ? memo[r.id] : (memo[r.id] = Math.max(ISS_W + GX, (kids[r.id] || []).reduce((s, c) => s + width(c), 0)));
  const mark = (r, d) => { depth[r.id] = d; (kids[r.id] || []).forEach(c => mark(c, d + 1)); };
  const roots = kids[''] || [], trees = roots.filter(r => (kids[r.id] || []).length), loose = roots.filter(r => !(kids[r.id] || []).length);
  trees.forEach(r => mark(r, 0));
  const maxH = {}; items.forEach(r => { if (depth[r.id] != null) maxH[depth[r.id]] = Math.max(maxH[depth[r.id]] || 0, issHeight(r)); });
  const rowY = [40]; Object.keys(maxH).sort((a, c) => a - c).forEach(d => { rowY[+d + 1] = rowY[+d] + maxH[d] + GY; });
  const pos = {};
  let x = 20;
  const place = (r, x0) => { const w = width(r); pos[r.id] = {x: x0 + w / 2 - ISS_W / 2, y: rowY[depth[r.id]]}; let cx = x0; (kids[r.id] || []).forEach(c => { place(c, cx); cx += width(c); }); };
  trees.forEach(r => { place(r, x); x += width(r) + 26; });
  // 親子のない課題は、下に並べる（横に長くならないよう折り返す）
  const top = trees.length ? rowY[rowY.length - 1] + 30 : 40, perRow = Math.max(1, Math.floor(Math.max(avail, x) / (ISS_W + GX)));
  let y = top, rowMax = 0;
  loose.forEach((r, k) => { if (k && k % perRow === 0) { y += rowMax + 20; rowMax = 0; } pos[r.id] = {x: 20 + (k % perRow) * (ISS_W + GX), y}; rowMax = Math.max(rowMax, issHeight(r)); });
  return {pos, looseTop: loose.length ? top : 0, hasTrees: trees.length > 0};
}
function renderRaidTree(el, {alerts}, items){
  items = items.filter(r => r.type !== 'decision' || r.parentId || raidKids(r.id).length);
  const edit = !!ui.raidTreeEdit && ['pm','pmo','lead'].includes(myRole());
  const avail = Math.max(600, (el.clientWidth || 1000) - 40), auto = raidTreeLayout(items, avail), key = 'raid:tree';
  state.layouts = state.layouts || {};
  const over = state.layouts[key] || {}, P = id => over[id] || auto.pos[id];
  const sev = sevMap(alerts);
  let W = 640, H = 200;
  items.forEach(r => { const q = P(r.id); if (q) { W = Math.max(W, q.x + ISS_W + 30); H = Math.max(H, q.y + issHeight(r) + 30); } });
  const under = auto.looseTop ? `<text x="20" y="${auto.looseTop - 10}" class="level-name">${esc(t('rd.loose'))}</text>` : '';
  const nodes = items.map(r => {
    const q = P(r.id); if (!q) return null; const h = issHeight(r);
    return {id: r.id, x: q.x, y: q.y, w: ISS_W, h, cls: 'iss-node st-' + r.status + (sev[r.id] ? ' sev-' + sev[r.id] : '') + (r.id === ui.raidHi ? ' on' : ''), body: `
      <rect width="${ISS_W}" height="${h}" rx="12" class="iss-card"/>
      <rect width="5" height="${h}" rx="2.5" class="iss-bar imp-${r.impact || 'none'}"/>
      <foreignObject x="0" y="0" width="${ISS_W}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" class="iss-fo">
        <div class="iss-top"><b>${esc(r.id)}</b><span class="tag">${esc(lbl('raidType', r.type))}</span><span class="iss-st">${esc(lbl('raidStatus', r.status))}</span></div>
        <div class="iss-title">${esc(r.title || '—')}</div>
        <div class="iss-meta">${esc(issMetaText(r))}${r.needDecision && r.status !== 'closed' ? `<div><span class="dec-flag">${esc(t('rd.needDecision'))}</span></div>` : ''}</div>
      </div></foreignObject>`};
  }).filter(Boolean);
  const inSet = new Set(items.map(r => r.id));
  const edges = items.filter(r => r.parentId && inSet.has(r.parentId)).map(r => ({id: 'p:' + r.id, from: r.parentId, to: r.id, kind: 'report'}));
  el.innerHTML = `<div class="card org-canvas">
    <div class="bar">
      <div class="legend" style="margin:0"><span><svg width="28" height="10" style="overflow:visible"><path d="M1 5H22" class="dg-legend rep"/></svg>${t('rd.lgParent')}</span><span><i class="imp-dot H"></i>${t('rd.lgImpact')}</span><span><i class="dot-red"></i>${t('rd.lgAlert')}</span></div>
      <span class="sp"></span>
      ${['pm','pmo','lead'].includes(myRole()) ? `<button class="btn ${edit ? 'primary' : ''}" id="rtEdit">${edit ? '✓ ' + t('dg.editOn') : '✎ ' + t('dg.edit')}</button>` : ''}
      ${edit && Object.keys(over).length ? `<button class="btn" id="rtAuto">${t('dg.autoLayout')}</button>` : ''}
    </div>
    <div class="muted small" style="margin-bottom:8px">${edit ? t('rd.treeEditHint') : t('rd.treeHint')}</div>
    <div id="raidDiagram"></div></div>`;
  if (!items.length) { $('#raidDiagram').innerHTML = `<div class="empty">${t('empty.raidAll')}</div>`; }
  else diagram($('#raidDiagram'), {
    W, H, nodes, edges, under, edit, label: t('rd.view.tree'), cls: 'iss-svg' + ($('#view').classList.contains('animate') ? ' anim' : ''),
    handles: [{kind: 'report', at: 'bottom', title: t('rd.handle')}],
    related: id => { const s = new Set([id]); let p = raidById(id); while (p && p.parentId && !s.has(p.parentId)) { s.add(p.parentId); p = raidById(p.parentId); } const down = x => raidKids(x).forEach(k => { if (!s.has(k.id)) { s.add(k.id); down(k.id); } }); down(id); return s; },
    onNode: id => openRaid$(id),
    onMove: (id, x, y) => { state.layouts[key] = {...(state.layouts[key] || {}), [id]: {x, y}}; save(); render(); },
    onConnect: (from, to) => setRaidParent(raidById(to), from),
    onEdge: (e, cx, cy) => {
      const c = raidById(e.to);
      dgPopover(cx, cy, `<div class="small muted">${esc(e.from)} → ${esc(e.to)}</div><button class="btn danger sm" data-x>${t('rd.unlink')}</button>`, (m, close) => { m.querySelector('[data-x]').onclick = () => { close(); setRaidParent(c, ''); }; });
    },
  });
  const te = $('#rtEdit'); if (te) te.onclick = () => { ui.raidTreeEdit = !ui.raidTreeEdit; render(); };
  const ra = $('#rtAuto'); if (ra) ra.onclick = () => { delete state.layouts[key]; save(); render(true); };
}
// 親課題を付け替える（循環になるもの・権限のないものは断る）。経緯に残す
function setRaidParent(r, pid){
  if (!r) return false;
  const i = raidIdx(r.id);
  if (!can('raid', i, 'parentId')) { toast(t('perm.denied')); return false; }
  if (pid) { let x = raidById(pid), g = 0; while (x && g++ < 99) { if (x.id === r.id) { toast(t('rd.cycle')); return false; } x = raidById(x.parentId); } }
  const from = r.parentId || ''; if (from === pid) return false;
  r.parentId = pid; raidLog(r, {kind: 'change', f: 'parentId', from, to: pid});
  save(); render(); toast(pid ? t('rd.parentSet', r.id, pid) : t('rd.parentCleared', r.id));
  return true;
}

// ---- 傾向（影響×発生確率、未解決件数の推移、担当者ごと） ----
function raidOpenAt(r, d){ return d2n(r.raised) <= d && (r.status !== 'closed' || (r.closedAt && d2n(r.closedAt) > d)); }
function renderRaidTrend(el, {b}, items){
  const act = items.filter(r => r.type === 'risk' || r.type === 'issue');
  const risks = act.filter(r => r.type === 'risk' && r.status !== 'closed');
  const L3 = ['H','M','L'], P3 = ['L','M','H'];
  const heat = (i, p) => { const n = risks.filter(r => (r.impact || 'M') === i && (r.prob || 'M') === p); const score = (2 - L3.indexOf(i)) + P3.indexOf(p); return `<td class="heat h${score}"><b>${n.length || ''}</b><div>${n.map(r => `<button class="chip" data-open-raid="${esc(r.id)}" title="${esc(r.title)}">${esc(r.id)}</button>`).join('')}</div></td>`; };
  // 直近 8 週の未解決件数（週末時点）と、週ごとの新規起票
  const weeks = [...Array(8)].map((_, k) => b - (7 - k) * 7);
  const series = weeks.map(d => ({d, open: act.filter(r => r.raised && raidOpenAt(r, d)).length, added: act.filter(r => r.raised && d2n(r.raised) > d - 7 && d2n(r.raised) <= d).length}));
  const mx = Math.max(1, ...series.map(s => Math.max(s.open, s.added))), W = 560, H = 180, X = k => 40 + k * ((W - 60) / 7), Y = n => H - 28 - n / mx * (H - 50);
  const chart = `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="${esc(t('rd.trendTitle'))}">
    ${series.map((s, k) => `<rect x="${X(k) - 9}" y="${Y(s.added)}" width="18" height="${H - 28 - Y(s.added)}" rx="3" class="tr-added"><title>${md(n2d(s.d))}：${t('rd.added')} ${s.added}</title></rect>`).join('')}
    <polyline points="${series.map((s, k) => `${X(k)},${Y(s.open)}`).join(' ')}" class="tr-open"/>
    ${series.map((s, k) => `<circle cx="${X(k)}" cy="${Y(s.open)}" r="4" class="tr-dot"><title>${md(n2d(s.d))}：${t('rd.openN')} ${s.open}</title></circle><text x="${X(k)}" y="${Y(s.open) - 9}" text-anchor="middle" class="tr-n">${s.open}</text><text x="${X(k)}" y="${H - 8}" text-anchor="middle" class="tr-x">${md(n2d(s.d))}</text>`).join('')}
  </svg>`;
  const byOwner = {}; act.filter(r => r.status !== 'closed').forEach(r => raidOwners(r).concat(raidOwners(r).length ? [] : ['—']).forEach(o => { const x = byOwner[o] = byOwner[o] || {n: 0, h: 0, late: 0}; x.n++; if (r.impact === 'H') x.h++; if (r.due && d2n(r.due) < b) x.late++; }));
  const byCat = {}; act.filter(r => r.status !== 'closed').forEach(r => { byCat[r.category] = (byCat[r.category] || 0) + 1; });
  const catMax = Math.max(1, ...Object.values(byCat));
  el.innerHTML = `<div class="grid two">
    <div class="card"><h2>${t('rd.heatTitle')}<span class="hint">${t('rd.heatHint')}</span></h2>
      <div class="scroll-x"><table class="heatmap"><tr><th></th>${P3.map(p => `<th>${t('col.prob')}：${lbl('level', p)}</th>`).join('')}</tr>
        ${L3.map(i => `<tr><th>${t('col.impact')}：${lbl('level', i)}</th>${P3.map(p => heat(i, p)).join('')}</tr>`).join('')}</table></div></div>
    <div class="card"><h2>${t('rd.trendTitle')}<span class="hint">${t('rd.trendHint')}</span></h2>${chart}
      <div class="legend"><span><i style="background:var(--accent)"></i>${t('rd.openN')}</span><span><i style="background:var(--plan)"></i>${t('rd.added')}</span></div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>${t('rd.byOwner')}</h2>${Object.keys(byOwner).length ? `<div class="scroll-x"><table><tr><th>${t('col.owner')}</th><th class="num">${t('rd.openN')}</th><th class="num">${t('rd.highN')}</th><th class="num">${t('rd.lateN')}</th></tr>
      ${Object.entries(byOwner).sort((a, c) => c[1].n - a[1].n).map(([o, x]) => `<tr><td>${esc(o)}</td><td class="num">${x.n}</td><td class="num ${x.h ? 'red' : 'muted'}">${x.h}</td><td class="num ${x.late ? 'red' : 'muted'}">${x.late}</td></tr>`).join('')}</table></div>` : `<div class="empty">${t('empty.raid')}</div>`}</div>
    <div class="card"><h2>${t('rd.byCat')}</h2>${Object.keys(byCat).length ? Object.entries(byCat).sort((a, c) => c[1] - a[1]).map(([c, n]) => `<div class="cat-bar"><span>${esc(lbl('raidCat', c))}</span><div><i style="width:${n / catMax * 100}%"></i></div><b>${n}</b></div>`).join('') : `<div class="empty">${t('empty.raid')}</div>`}</div>
  </div>`;
}

// ---- 詳細（課題ごとの画面） ----
const LOG_LABEL = {status: 'col.status', owner: 'col.owner', owners: 'rd.owners', approver: 'rd.approver', reporter: 'rd.reporter', due: 'col.due', impact: 'col.impact', prob: 'col.prob', type: 'col.type', category: 'col.category', phaseId: 'col.phase', parentId: 'rd.parent',
  title: 'col.title', needDecision: 'rd.needDecision', decider: 'rd.decider', decideBy: 'rd.decideBy', detail: 'rd.detail', impactText: 'rd.impactText', mitigation: 'col.mitigation', ask: 'rd.ask', taskIds: 'rd.tasks', raised: 'col.raised'};
const LOG_LONG = new Set(['detail','impactText','mitigation','ask','title']);
function logValue(f, v){
  if (v === '' || v == null || (Array.isArray(v) && !v.length)) return '—';
  if (f === 'status') return lbl('raidStatus', v); if (f === 'impact' || f === 'prob') return lbl('level', v);
  if (f === 'type') return lbl('raidType', v); if (f === 'category') return lbl('raidCat', v); if (f === 'phaseId') return phaseName(v);
  if (f === 'needDecision') return v ? t('common.yes') : t('common.no');
  if (f === 'due' || f === 'decideBy' || f === 'raised') return ymd(v);
  return Array.isArray(v) ? v.join('、') : String(v);
}
function logLine(e){
  if (e.kind === 'create') return t('rd.logCreate', esc(e.by || '—'));
  if (e.kind === 'approve') return t('rd.logApprove', esc(e.by || '—'));
  if (e.kind === 'return') return t('rd.logReturn', esc(e.by || '—'), esc(e.text || '—'));
  if (e.kind === 'request') return t('rd.logRequest', esc(e.by || '—'));
  const name = t(LOG_LABEL[e.f] || 'col.detail');
  if (LOG_LONG.has(e.f)) return t('rd.logEdit', esc(e.by || '—'), esc(name));
  return t('rd.logChange', esc(e.by || '—'), esc(name), esc(logValue(e.f, e.from)), esc(logValue(e.f, e.to)));
}
function renderRaidDetail(v, {b, alerts}, r){
  const i = raidIdx(r.id), f = (k, o) => fld('raid', i, k, r[k], o);
  const kids = raidKids(r.id), parent = raidById(r.parentId), myAl = alerts.filter(a => a.ref === r.id);
  const canSt = can('raid', i, 'status'), canComment = can('raid', i, 'comment');
  const approveBox = r.status === 'review' && canApproveRaid(r) ? `<button class="btn" data-rd-return>↩ ${t('ap.returnOne')}</button><button class="btn primary" data-rd-approve>✓ ${t('rd.approveClose')}</button>`
    : r.status === 'review' ? `<span class="muted small">${t('rd.waiting', esc(r.approver || t('rd.approverAny')))}</span>`
    : (['open','wip'].includes(r.status) && canSt && ['issue','risk'].includes(r.type)) ? `<button class="btn" data-rd-request>${t('rd.request')}</button>` : '';
  const linked = (r.taskIds || []).map(id => state.tasks.find(x => x.id === id)).filter(Boolean);
  const log = (r.log || []).slice().reverse();
  const canOwners = can('raid', i, 'owners'), canTasks = can('raid', i, 'taskIds');
  v.innerHTML = `<div class="bar"><button class="btn ghost" data-rd-back>‹ ${t('rd.back')}</button><span class="sp"></span>${approveBox}${canDelete('raid', i) ? `<button class="btn danger" data-del="raid" data-key="${i}" data-name="${esc(r.title || r.id)}">${TRASH} ${t('btn.delete')}</button>` : ''}</div>
  <div class="card rd-head">
    <div class="rd-chips"><span class="rd-id">${esc(r.id)}</span>${f('type', {type: 'select', opts: enumOpts('raidType')})}${f('status', {type: 'select', opts: enumOpts('raidStatus')})}
      <span class="muted small">${t('col.impact')}</span>${f('impact', {type: 'select', opts: enumOpts('level'), blank: true})}${r.type === 'risk' ? `<span class="muted small">${t('col.prob')}</span>${f('prob', {type: 'select', opts: enumOpts('level'), blank: true})}` : ''}
      ${r.needDecision && r.status !== 'closed' ? `<span class="dec-flag">${t('rd.needDecision')}</span>` : ''}</div>
    ${f('title', {type: 'textarea', rows: 2, cls: 'rd-title', ph: t('rd.titlePh')})}
    ${myAl.length ? `<div class="rd-alerts">${myAl.map(a => `<div>${sevBadge(a.sev)} ${esc(t('at.' + a.type))}：${esc(a.detail)}</div>`).join('')}</div>` : ''}
    ${r.status !== 'closed' ? returnedNote(r) : r.approvedBy ? `<div class="muted small">${t('ap.approvedBy', esc(r.approvedBy), md(r.approvedAt))}</div>` : ''}
  </div>
  <div class="rd-grid">
    <div class="rd-main">
      <div class="card"><h2>${t('rd.cardTitle')}<span class="hint">${t('rd.cardHint')}</span></h2>
        <div class="form-grid one">
          <label>${t('rd.detail')}${f('detail', {type: 'textarea', rows: 3, ph: t('rd.detailPh')})}</label>
          <label>${t('rd.impactText')}${f('impactText', {type: 'textarea', rows: 2, ph: t('rd.impactPh')})}</label>
          <label>${t('rd.mitigationLbl')}${f('mitigation', {type: 'textarea', rows: 2, ph: t('rd.mitigationPh')})}</label>
        </div></div>
      <div class="card ${r.needDecision ? 'dec-card' : ''}"><h2>${t('rd.decisionTitle')}<span class="hint">${t('rd.decisionHint')}</span></h2>
        <div class="form-grid">
          <label class="chk">${f('needDecision', {type: 'checkbox'})} ${t('rd.needDecisionQ')}</label>
          <label>${t('rd.decider')}${f('decider', {type: 'select', opts: nameOpts(r.decider), blank: true})}</label>
          <label>${t('rd.decideBy')}${f('decideBy', {type: 'date'})}</label>
        </div>
        <div class="form-grid one" style="margin-top:8px"><label>${t('rd.ask')}${f('ask', {type: 'textarea', rows: 2, ph: t('rd.askPh')})}</label></div></div>
      <div class="card"><h2>${t('rd.history')}<span class="hint">${t('rd.historyHint')}</span></h2>
        ${canComment ? `<div class="rd-comment"><textarea id="rdComment" rows="2" placeholder="${t('rd.commentPh')}"></textarea><button class="btn primary" id="rdSend">${t('rd.send')}</button></div>` : ''}
        <ul class="timeline">${log.map((e, k) => `<li class="${e.kind === 'comment' ? 'cm' : 'ch'}"><div class="tl-meta">${esc(e.at || '')}</div>${e.kind === 'comment'
          ? `<div class="cm-bubble"><b>${esc(e.by || '—')}</b><div>${esc(e.text).replace(/\n/g, '<br>')}</div>${e.by === myName() || myRole() === 'pm' ? `<button class="btn ghost sm" data-rd-delc="${(r.log.length - 1) - k}" title="${t('btn.delete')}">✕</button>` : ''}</div>`
          : `<div class="tl-text">${logLine(e)}</div>`}</li>`).join('') || `<li class="muted small">${t('rd.noHistory')}</li>`}</ul></div>
    </div>
    <div class="rd-side">
      <div class="card"><h2>${t('rd.people')}</h2>
        <div class="form-grid one">
          <div class="lbl-block">${t('rd.reporter')}<div class="rd-person">${esc(r.reporter || '—')}</div></div>
          <label>${t('rd.approver')}${f('approver', {type: 'select', opts: nameOpts(r.approver), blank: t('rd.approverAny')})}</label>
          <div class="lbl-block">${t('rd.owners')}<div class="chips">${raidOwners(r).map((o, k) => `<span class="chip on">${k === 0 ? '★ ' : ''}${esc(o)}${canOwners ? `<button data-rd-rmown="${esc(o)}" aria-label="${t('btn.delete')}">✕</button>` : ''}</span>`).join('') || '<span class="muted small">—</span>'}
            ${canOwners ? `<select id="rdAddOwner"><option value="">＋ ${t('rd.addOwner')}</option>${nameOpts().filter(([n]) => !raidOwners(r).includes(n)).map(([n]) => `<option>${esc(n)}</option>`).join('')}</select>` : ''}</div>
            <small class="muted">${t('rd.ownersHint')}</small></div>
        </div></div>
      <div class="card"><h2>${t('rd.attrs')}</h2>
        <div class="form-grid one">
          <label>${t('col.phase')}${f('phaseId', {type: 'select', opts: phaseOpts(), blank: t('common.common')})}</label>
          <label>${t('col.category')}${f('category', {type: 'select', opts: enumOpts('raidCat')})}</label>
          <label>${t('col.raised')}${f('raised', {type: 'date'})}</label>
          <label>${t('col.due')}${f('due', {type: 'date'})}</label>
        </div></div>
      <div class="card"><h2>${t('rd.family')}</h2>
        <div class="form-grid one"><label>${t('rd.parent')}${f('parentId', {type: 'select', opts: raidParentOpts(r), blank: t('rd.noParent')})}</label></div>
        ${parent ? `<div class="muted small" style="margin:6px 0">${t('rd.parentIs')} <button class="link-btn" data-open-raid="${esc(parent.id)}">${esc(parent.id)} ${esc(parent.title)}</button></div>` : ''}
        <div class="lbl-block" style="margin-top:8px">${t('rd.kids')}${kids.length ? `<span class="muted small"> ${t('rd.kidsDone', kids.filter(k => k.status === 'closed').length, kids.length)}</span>` : ''}
          <ul class="mini-list">${kids.map(k => `<li><button class="link-btn" data-open-raid="${esc(k.id)}">${esc(k.id)}</button> ${esc(k.title || '—')} <span class="tag">${esc(lbl('raidStatus', k.status))}</span> <span class="muted small">${esc(ownersText(k))}</span></li>`).join('') || `<li class="muted small">${t('rd.noKids')}</li>`}</ul>
          ${canCreate('raid') ? `<button class="btn sm" data-rd-addkid>＋ ${t('rd.addKid')}</button>` : ''}</div>
      </div>
      <div class="card"><h2>${t('rd.tasks')}<span class="hint">${t('rd.tasksHint')}</span></h2>
        <ul class="mini-list">${linked.map(x => `<li><button class="link-btn" data-open-task="${esc(x.id)}">${esc(x.id)}</button> ${x.milestone ? '◆ ' : ''}${esc(x.name)} <span class="muted small">${md(x.end)} · ${esc(lbl('taskStatus', x.status))}</span>${!isDone(x) && d2n(x.end) < b ? ` <span class="red small">${t('rd.taskLate')}</span>` : ''}${canTasks ? ` <button class="btn ghost sm" data-rd-rmtask="${esc(x.id)}" aria-label="${t('btn.delete')}">✕</button>` : ''}</li>`).join('') || `<li class="muted small">${t('rd.noTasks')}</li>`}</ul>
        ${canTasks ? `<select id="rdAddTask"><option value="">＋ ${t('rd.addTask')}</option>${state.tasks.filter(x => !(r.taskIds || []).includes(x.id) && x.disp !== 'dropped').map(x => `<option value="${esc(x.id)}">${esc(x.id)} ${x.milestone ? '◆ ' : ''}${esc(x.name)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
  </div>`;
  const back = () => { ui.raidSel = ''; render(true); };
  v.querySelector('[data-rd-back]').onclick = back;
  const ask = () => { const w = prompt(t('ap.returnWhy')); return w === null ? null : w.trim(); };
  const ap = v.querySelector('[data-rd-approve]'); if (ap) ap.onclick = () => resolveApprovals([{col: 'raid', o: r}], 'approve');
  const rt = v.querySelector('[data-rd-return]'); if (rt) rt.onclick = () => { const w = ask(); if (w !== null) resolveApprovals([{col: 'raid', o: r}], 'return', w); };
  const rq = v.querySelector('[data-rd-request]'); if (rq) rq.onclick = () => { r.status = 'review'; r.reviewAt = todayStr(); raidLog(r, {kind: 'request'}); save(); render(); toast(t('rd.requested', r.approver || t('rd.approverAny'))); };
  const send = $('#rdSend'); if (send) send.onclick = () => { const tx = $('#rdComment').value.trim(); if (!tx) return; raidLog(r, {kind: 'comment', text: tx}); save(); render(); toast(t('rd.commented')); };
  const cm = $('#rdComment'); if (cm) cm.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send.click(); } };
  v.querySelectorAll('[data-rd-delc]').forEach(el => el.onclick = () => { if (!confirm(t('rd.delComment'))) return; r.log.splice(+el.dataset.rdDelc, 1); save(); render(); });
  const setOwners = list => { const from = raidOwners(r).slice(); r.owners = [...new Set(list.filter(Boolean))]; r.owner = r.owners[0] || ''; raidLog(r, {kind: 'change', f: 'owners', from, to: r.owners.slice()}); save(); render(); };
  const ao = $('#rdAddOwner'); if (ao) ao.onchange = () => { if (ao.value) setOwners([...raidOwners(r), ao.value]); };
  v.querySelectorAll('[data-rd-rmown]').forEach(el => el.onclick = () => setOwners(raidOwners(r).filter(o => o !== el.dataset.rdRmown)));
  const setTasks = list => { const from = (r.taskIds || []).slice(); r.taskIds = [...new Set(list)]; raidLog(r, {kind: 'change', f: 'taskIds', from, to: r.taskIds.slice()}); save(); render(); };
  const at = $('#rdAddTask'); if (at) at.onchange = () => { if (at.value) setTasks([...(r.taskIds || []), at.value]); };
  v.querySelectorAll('[data-rd-rmtask]').forEach(el => el.onclick = () => setTasks((r.taskIds || []).filter(x => x !== el.dataset.rdRmtask)));
  const ak = v.querySelector('[data-rd-addkid]'); if (ak) ak.onclick = () => { const k = newRaid({type: r.type === 'risk' ? 'risk' : 'issue', parentId: r.id, phaseId: r.phaseId, category: r.category, approver: r.approver}); save(); openRaid$(k.id); };
}
