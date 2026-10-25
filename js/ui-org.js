// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 体制図（PJ組織グラフ） ============
// 縦＝階層（報告ラインの深さ）、横＝所属（顧客／自社／ベンダー）の列。
// 人ごとの「抱えているもの」（タスク・アクション・RAID・警戒）を名前で突き合わせて表示する
function personLoad(name, b, alerts){
  if (!name) return {tasks: [], acts: [], raid: [], high: 0};
  const tasks = state.tasks.filter(x => x.owner === name && !isDone(x) && activeTask(x) && x.disp !== 'hold' && !x.milestone && d2n(x.start) <= b + state.settings.lookahead);
  const acts = state.meetings.filter(m => m.status !== 'cancelled').flatMap(m => m.actions.filter(a => a.owner === name && a.status !== 'done').map(a => ({...a, meeting: m})));
  const raid = state.raid.filter(r => r.owner === name && r.status !== 'closed' && r.type !== 'decision');
  return {tasks, acts, raid, high: alerts.filter(a => a.owner === name && a.sev === 'H').length};
}
const ORG_LANES = ['client','us','vendor','other'];
const orgColor = o => ({client: 'var(--green)', us: 'var(--accent)', vendor: 'var(--amber)'}[o] || 'var(--muted)');
const laneOf = p => ORG_LANES.includes(p.org) ? p.org : 'other';
function orgDepth(people){
  const byId = Object.fromEntries(people.map(p => [p.id, p])), memo = {};
  const d = (p, seen) => {
    if (memo[p.id] != null) return memo[p.id];
    const par = byId[p.parentId];
    if (!par || seen.has(p.id)) return (memo[p.id] = 0);
    seen.add(p.id); return (memo[p.id] = d(par, seen) + 1);
  };
  people.forEach(p => d(p, new Set()));
  return memo;
}
function orgGraph(avail, people){
  const NW = 152, NH = 66, GX = 12, RG = 12, GY = 46, PAD = 12, LG = 14, GUT = 74, TOP = 44;
  const depth = orgDepth(people), maxD = Math.max(0, ...Object.values(depth));
  const lanes = ORG_LANES.filter(o => people.some(p => laneOf(p) === o));
  const cells = {}; lanes.forEach(l => { cells[l] = {}; for (let d = 0; d <= maxD; d++) cells[l][d] = []; });
  people.forEach(p => cells[laneOf(p)][depth[p.id]].push(p));
  // 1行に並べる人数：画面幅に収まるよう 4→2 で調整（多い階層は折り返す）
  const maxIn = l => Math.max(1, ...Object.values(cells[l]).map(a => a.length));
  const widthFor = cols => GUT + lanes.reduce((s, l) => s + cols[l] * (NW + GX) - GX + PAD * 2, 0) + LG * (lanes.length - 1);
  let laneCols = null;
  for (let wrap = 4; wrap >= 2; wrap--) { laneCols = Object.fromEntries(lanes.map(l => [l, Math.min(wrap, maxIn(l))])); if (widthFor(laneCols) <= avail) break; }
  const laneX = {}, laneW = {}; let x = GUT;
  lanes.forEach(l => { laneX[l] = x; laneW[l] = laneCols[l] * (NW + GX) - GX + PAD * 2; x += laneW[l] + LG; });
  const W = x - LG + 8;
  const rows = d => Math.max(1, ...lanes.map(l => Math.ceil(cells[l][d].length / laneCols[l])));
  const bandY = {}; let y = TOP;
  for (let d = 0; d <= maxD; d++) { bandY[d] = y; y += rows(d) * (NH + RG) - RG + GY; }
  const H = y - GY + 20;
  // 並び順：上の階層の親に近い順（線の交差を減らす）
  const pos = {};
  for (let d = 0; d <= maxD; d++) lanes.forEach(l => {
    const list = cells[l][d].map((p, i) => ({p, k: pos[p.parentId] ? pos[p.parentId].x : 1e6 + i})).sort((a, b) => a.k - b.k).map(o => o.p);
    const cols = laneCols[l];
    list.forEach((p, i) => {
      const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, list.length - r * cols);
      pos[p.id] = {x: laneX[l] + PAD + (cols - inRow) * (NW + GX) / 2 + c * (NW + GX), y: bandY[d] + r * (NH + RG), d};
    });
  });
  return {pos, lanes, laneX, laneW, bandY, maxD, NW, NH, W, H};
}
// 横の関係（連携相手・カウンターパート）。どちらか一方に記録されていればつながりとみなす
const peersOf = id => { const p = state.org.find(x => x.id === id) || {}; return [...new Set([...(p.peers || []), ...state.org.filter(x => (x.peers || []).includes(id)).map(x => x.id)])].filter(x => x !== id && state.org.some(o => o.id === x)); };
// カーソルを合わせた人の上司・部下・連携相手
function orgRelated(id){
  const set = new Set([id]);
  let p = state.org.find(x => x.id === id), guard = 0;
  while (p && p.parentId && guard++ < 50) { set.add(p.parentId); p = state.org.find(x => x.id === p.parentId); }
  const down = pid => state.org.filter(x => x.parentId === pid).forEach(x => { if (!set.has(x.id)) { set.add(x.id); down(x.id); } });
  down(id);
  peersOf(id).forEach(x => set.add(x));
  return set;
}
// 木構造の配置（v3 の木構造を復元）：部下は上司の真下に並べ、部下のいない人が 3 人以上並ぶときは縦に積む
function orgTree(people){
  const NW = 156, NH = 66, GX = 18, GY = 58, IND = 26;
  const ids = new Set(people.map(p => p.id)), kids = {};
  people.forEach(p => { const k = p.parentId && ids.has(p.parentId) && p.parentId !== p.id ? p.parentId : ''; (kids[k] = kids[k] || []).push(p); });
  const stack = p => { const c = kids[p.id] || []; return c.length >= 3 && c.every(x => !(kids[x.id] || []).length); };
  const memo = {};
  const width = (p, seen = new Set()) => {
    if (memo[p.id] != null) return memo[p.id];
    if (seen.has(p.id)) return NW + GX; seen.add(p.id);
    const c = kids[p.id] || [];
    return (memo[p.id] = stack(p) ? NW + IND + GX : c.length ? Math.max(NW + GX, c.reduce((s, x) => s + width(x, seen), 0)) : NW + GX);
  };
  const pos = {}, stacked = new Set(), groups = [];
  const place = (p, x0, y, d, seen) => {
    if (seen.has(p.id)) return; seen.add(p.id);
    const w = width(p), c = kids[p.id] || [];
    pos[p.id] = {x: x0 + (stack(p) ? 0 : w / 2 - NW / 2), y, d};
    if (stack(p)) c.forEach((ch, k) => { seen.add(ch.id); stacked.add(ch.id); pos[ch.id] = {x: pos[p.id].x + IND, y: y + NH + 24 + k * (NH + 12), d: d + 1}; });
    else { let cx = x0; c.forEach(ch => { place(ch, cx, y + NH + GY, d + 1, seen); cx += width(ch); }); }
  };
  // 最上位の人を所属の順（顧客 → 自社 → ベンダー）に並べ、木ごとにまとまりを作る
  const roots = (kids[''] || []).sort((a, b) => ORG_LANES.indexOf(laneOf(a)) - ORG_LANES.indexOf(laneOf(b)));
  let x = 84; const seen = new Set();
  roots.forEach(r => { const before = new Set(seen); place(r, x, 52, 0, seen); groups.push({root: r, members: [...seen].filter(id => !before.has(id))}); x += width(r) + 16; });
  return {pos, stacked, groups, NW, NH};
}
// 組織図（全体・顧客・自社・カスタム）を描く。people に含まれる人だけを対象にする。
// layout：tree（木構造・既定）／lanes（所属の列）。どちらでも編集モードでノードと線を編集できる
function orgGraphView(v, {b, alerts}, people, caption, viewKey){
  const mode = ui.orgLayout || 'tree', edit = !!ui.diagEdit && canCreate('org');
  const avail = Math.max(600, (v.clientWidth || 1000) - 40);
  const auto = mode === 'lanes' ? orgGraph(avail, people) : orgTree(people);
  const NW = auto.NW, NH = auto.NH, key = `${viewKey || 'all'}:${mode}`;
  state.layouts = state.layouts || {};
  const over = state.layouts[key] || {};
  const P = id => over[id] || auto.pos[id];
  const inSet = new Set(people.map(p => p.id));
  const inPhase = ui.scope ? new Set(state.tasks.filter(x => x.phaseId === ui.scope).map(x => x.owner)) : null;
  let W = 0, H = 0;
  people.forEach(p => { const q = P(p.id); if (q) { W = Math.max(W, q.x + NW + 30); H = Math.max(H, q.y + NH + 30); } });
  W = Math.max(W, 640); H = Math.max(H, 200);
  // 背景：所属の列（lanes）または木ごとのまとまり（tree）、階層の見出し
  let under = '';
  if (mode === 'lanes') {
    auto.lanes.forEach(l => { under += `<rect x="${auto.laneX[l]}" y="0" width="${auto.laneW[l]}" height="${Math.max(H, auto.H)}" rx="16" class="lane lane-${l}"/><text x="${auto.laneX[l] + auto.laneW[l] / 2}" y="26" text-anchor="middle" class="lane-name" fill="${orgColor(l)}">${esc(t('orgType.' + l))}</text>`; });
  } else {
    auto.groups.forEach(gp => {
      const ps = gp.members.map(P).filter(Boolean); if (!ps.length) return;
      const x0 = Math.min(...ps.map(q => q.x)) - 12, y0 = Math.min(...ps.map(q => q.y)) - 36, x1 = Math.max(...ps.map(q => q.x)) + NW + 12, y1 = Math.max(...ps.map(q => q.y)) + NH + 14;
      under += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="18" class="lane lane-${laneOf(gp.root)}"/><text x="${x0 + 14}" y="${y0 + 22}" class="lane-name" fill="${orgColor(laneOf(gp.root))}">${esc(t('orgType.' + laneOf(gp.root)))}</text>`;
    });
  }
  const depthY = {}; people.forEach(p => { const q = P(p.id); if (!q || over[p.id]) return; const d = auto.pos[p.id] ? auto.pos[p.id].d : 0; depthY[d] = Math.min(depthY[d] ?? 1e9, q.y); });
  Object.entries(depthY).forEach(([d, y]) => { under += `<text x="10" y="${y + NH / 2 - 3}" class="level-name">${esc(t('org.level', +d + 1))}</text><text x="10" y="${y + NH / 2 + 12}" class="level-sub">${esc(t('org.levelName.' + Math.min(+d, 3)))}</text>`; });
  // ノード（人のカード）
  const nodes = people.map(p => {
    const q = P(p.id); if (!q) return null;
    const ld = personLoad(p.name, b, alerts), cap = state.settings.overloadCount, ratio = Math.min(1, ld.tasks.length / Math.max(1, cap));
    const cls = 'org-node' + (inPhase && !inPhase.has(p.name) ? ' dim' : '') + (p.id === ui.orgSel ? ' on' : '') + (p.id === myId() ? ' me' : '');
    return {id: p.id, x: q.x, y: q.y, w: NW, h: NH, cls, delay: (q.d || 0) * 80, body: `
      <rect width="${NW}" height="${NH}" rx="14" class="org-card"/>
      <circle cx="22" cy="24" r="13" fill="${orgColor(p.org)}"/><text x="22" y="28.5" text-anchor="middle" class="org-ini">${esc((p.name || '?').slice(0, 1))}</text>
      <text x="42" y="21" class="org-name">${esc((p.name || '—').slice(0, 7))}</text>
      <text x="42" y="37" class="org-role">${esc((p.role || '').slice(0, 9))}</text>
      <text x="${NW - 10}" y="21" text-anchor="end" class="org-access ${p.access}">${esc(t('roleShort.' + (p.access || 'member')))}</text>
      <rect x="10" y="${NH - 15}" width="${NW - 20}" height="5" rx="2.5" class="load-bg"/><rect x="10" y="${NH - 15}" width="${(NW - 20) * ratio}" height="5" rx="2.5" class="load-fg ${ld.tasks.length >= cap ? 'heavy' : ''}"/>
      <title>${esc(p.name)}：${esc(t('org.loadShort', ld.tasks.length, ld.acts.length, ld.raid.length))}</title>
      ${ld.high ? `<circle cx="${NW - 4}" cy="4" r="9" class="org-alert"/><text x="${NW - 4}" y="8" text-anchor="middle" class="org-alert-n">${ld.high}</text>` : ''}`};
  }).filter(Boolean);
  // 辺：報告ライン（縦の関係）と連携（横の関係）
  const edges = [];
  people.forEach(p => { if (inSet.has(p.parentId)) edges.push({id: 'r:' + p.id, from: p.parentId, to: p.id, kind: 'report', style: auto.stacked && auto.stacked.has(p.id) && !over[p.id] && !over[p.parentId] ? 'rail' : ''}); });
  const seenPeer = new Set();
  people.forEach(p => peersOf(p.id).forEach(q => { const k = [p.id, q].sort().join('|'); if (!inSet.has(q) || seenPeer.has(k)) return; seenPeer.add(k); edges.push({id: 'p:' + k, from: p.id, to: q, kind: 'peer'}); }));
  const hasOver = Object.keys(over).length > 0;
  v.innerHTML = `<div class="card org-canvas">
    <div class="bar">
      <div class="seg">${['tree','lanes'].map(k => `<button class="${mode === k ? 'on' : ''}" data-olayout="${k}">${t('org.layout.' + k)}</button>`).join('')}</div>
      <div class="legend" style="margin:0">
        <span><svg width="28" height="10" style="overflow:visible"><path d="M1 5H22" class="dg-legend rep"/></svg>${t('org.lgReport')}</span>
        <span><svg width="28" height="10"><path d="M1 5H27" class="dg-legend peer"/></svg>${t('org.lgPeer')}</span>
        <span><svg width="28" height="10"><rect x="1" y="3" width="26" height="5" rx="2.5" class="load-fg"/></svg>${t('org.lgLoad', state.settings.overloadCount)}</span>
        <span><i class="dot-red"></i>${t('org.highAlerts')}</span>
      </div>
      <span class="sp"></span>${caption || ''}
      ${canCreate('org') ? `<button class="btn ${edit ? 'primary' : ''}" id="dgEdit">${edit ? '✓ ' + t('dg.editOn') : '✎ ' + t('dg.edit')}</button>` : ''}
      ${edit ? `<button class="btn" id="dgAddPerson">＋ ${t('dg.addMember')}</button>${hasOver ? `<button class="btn" id="dgAuto">${t('dg.autoLayout')}</button>` : ''}` : ''}
    </div>
    <div class="muted small" style="margin-bottom:8px">${edit ? t('dg.hintOrg') : (inPhase ? t('org.phaseHint', phaseName(ui.scope)) + '　' : '') + t('org.hoverHint')}</div>
    <div id="orgDiagram"></div>
  </div>`;
  if (!people.length) { $('#orgDiagram').innerHTML = `<div class="empty">${t('org.empty')}</div>`; }
  else diagram($('#orgDiagram'), {
    W, H, nodes, edges, under, edit, selected: ui.orgSel, label: t('tab.org'), cls: 'org-svg' + ($('#view').classList.contains('animate') ? ' anim' : ''),
    handles: [{kind: 'report', at: 'bottom', title: t('dg.handleReport')}, {kind: 'peer', at: 'right', title: t('dg.handlePeer')}],
    related: orgRelated,
    onNode: id => { ui.orgSel = id; ui.flowStep = ''; ui.chartEditing = ''; render(); },
    onMove: (id, x, y) => { state.layouts[key] = {...(state.layouts[key] || {}), [id]: {x, y, d: (P(id) || {}).d || 0}}; save(); render(); },
    onConnect: (from, to, kind) => {
      const a = state.org.find(p => p.id === from), c = state.org.find(p => p.id === to);
      if (kind === 'report') {
        // 線を引いた先の人が、元の人の上司（またはその上）なら循環になるので断る
        let x = a, guard = 0; while (x && guard++ < 60) { if (x.id === c.id) { toast(t('dg.cycle')); return; } x = state.org.find(p => p.id === x.parentId); }
        c.parentId = a.id; toast(t('dg.reportSet', c.name, a.name));
      } else {
        if (peersOf(a.id).includes(c.id)) { toast(t('dg.peerExists')); return; }
        a.peers = (a.peers || []).concat(c.id); toast(t('dg.peerAdded', a.name, c.name));
      }
      save(); render();
    },
    onEdge: (e, cx, cy) => {
      const a = state.org.find(p => p.id === e.from), c = state.org.find(p => p.id === e.to);
      dgPopover(cx, cy, `<div class="small muted">${esc(a.name)} → ${esc(c.name)}</div><button class="btn danger sm" data-x>${e.kind === 'report' ? t('dg.removeReport') : t('dg.removePeer')}</button>`, (m, close) => {
        m.querySelector('[data-x]').onclick = () => {
          if (e.kind === 'report') c.parentId = ''; else { a.peers = (a.peers || []).filter(x => x !== c.id); c.peers = (c.peers || []).filter(x => x !== a.id); }
          close(); save(); render();
        };
      });
    },
    onCanvas: (x, y) => addMemberAt(key, x, y),
  });
  v.querySelectorAll('[data-olayout]').forEach(el => el.onclick = () => { ui.orgLayout = el.dataset.olayout; render(true); });
  const de = $('#dgEdit'); if (de) de.onclick = () => { ui.diagEdit = !ui.diagEdit; render(); };
  const ap = $('#dgAddPerson'); if (ap) ap.onclick = () => addMemberAt(null);
  const au = $('#dgAuto'); if (au) au.onclick = () => { delete state.layouts[key]; save(); render(true); };
}
// 図の上からメンバーを追加（メンバー一覧からの追加と同じデータになる）
function addMemberAt(key, x, y){
  const parent = state.org.find(p => p.id === ui.orgSel) || state.org.find(p => p.access === 'pm');
  const n = {id: nextId('O', state.org), name: t('org.newName'), role: '', access: 'member', org: parent ? parent.org : 'us', parentId: parent ? parent.id : '', note: '', peers: []};
  state.org.push(n); (state.charts || []).forEach(c => { if (ui.orgView === 'chart:' + c.id) c.members.push(n.id); });
  if (key && x != null) { state.layouts[key] = {...(state.layouts[key] || {}), [n.id]: {x, y}}; }
  ui.orgSel = n.id; save(); render();
}
// 人の詳細パネル（どの図からでも開ける）の操作
function bindPersonDrawer(root, sel){
  const blank = (name, org, parentId) => ({id: nextId('O', state.org), name, role: '', access: 'member', org, parentId, note: '', peers: []});
  const addChild = root.querySelector('#addChild'); if (addChild) addChild.onclick = () => { const n = blank(t('org.newName'), sel.org, sel.id); state.org.push(n); ui.orgSel = n.id; save(); render(); };
  // 案内コードは本人の初回ログインにだけ使える。本人が自分でパスコードを決めた時点で無効になる
  const inv = root.querySelector('#copyInvite'); if (inv) inv.onclick = async () => {
    let code = '';
    if (!sel.pin) { code = newInviteCode(); sel.invite = await makeSecret(code); save(); }
    copyText(inviteText(sel, code)); render();
  };
  root.querySelectorAll('[data-phase-owner]').forEach(el => el.onchange = () => {
    if (!canCreate('phases')) return;
    const ph = phaseOf(el.dataset.phaseOwner); ph.owner = el.checked ? sel.name : (ph.owner === sel.name ? state.project.pm || '' : ph.owner); save(); render();
  });
  // 連携相手：記録は片方に持たせ、外すときは両方から外す
  root.querySelectorAll('[data-peer]').forEach(el => el.onchange = () => {
    if (!canCreate('org')) return;
    const q = el.dataset.peer, other = state.org.find(x => x.id === q);
    sel.peers = (sel.peers || []).filter(x => x !== q); if (other) other.peers = (other.peers || []).filter(x => x !== sel.id);
    if (el.checked) sel.peers.push(q);
    save(); render();
  });
}
function personPanel(p, b, alerts){
  const f = (k, o) => fld('org', p.id, k, p[k], o);
  const ld = personLoad(p.name, b, alerts);
  const desc = new Set(); const walk = id => state.org.filter(x => x.parentId === id).forEach(x => { if (!desc.has(x.id)) { desc.add(x.id); walk(x.id); } }); walk(p.id);
  const parents = state.org.filter(x => x.id !== p.id && !desc.has(x.id)).map(x => [x.id, `${x.name}${x.role ? '（' + x.role + '）' : ''}`]);
  const row = (k, label, due, late) => `<li><span class="tag">${k}</span><span style="flex:1">${esc(label)}</span><span class="${late ? 'red' : 'muted'} small">${md(due)}</span></li>`;
  const peerCands = state.org.filter(x => x.id !== p.id && laneOf(x) !== laneOf(p));
  return `<div class="card">
    <div class="bar" style="margin-bottom:6px"><span class="avatar sm" style="background:${orgColor(p.org)}">${esc((p.name || '?').slice(0, 1))}</span><h2 style="margin:0">${esc(p.name)}</h2><span class="sp"></span>${delBtn('org', p.id, p.name)}<button class="btn ghost" id="drawerClose" title="${t('org.close')}">✕</button></div>
    <div class="form-grid one">
      <label>${t('org.name')}${f('name')}</label>
      <label>${t('org.access')}${f('access', {type: 'select', opts: ROLES.map(r => [r, t('role.' + r)])})}<small class="muted">${t('roleDesc.' + (p.access || 'member'))}</small></label>
      ${p.access === 'lead' ? `<div class="lbl-block">${t('org.leadPhases')}<div class="phase-checks">${state.phases.map(ph => `<label class="chk"><input type="checkbox" data-phase-owner="${ph.id}" ${ph.owner === p.name ? 'checked' : ''} ${canCreate('phases') ? '' : 'disabled'}> ${esc(ph.code)} ${esc(ph.name)}</label>`).join('')}</div></div>` : ''}
      <label>${t('org.role')}${f('role', {ph: t('org.rolePh')})}</label>
      <label>${t('org.type')}${f('org', {type: 'select', opts: ORG_LANES.map(o => [o, t('orgType.' + o)])})}</label>
      <label>${t('org.parent')}${f('parentId', {type: 'select', opts: parents, blank: t('org.top')})}</label>
      <div class="lbl-block">${t('org.peers')}<div class="phase-checks peers">${peerCands.map(x => `<label class="chk"><input type="checkbox" data-peer="${x.id}" ${peersOf(p.id).includes(x.id) ? 'checked' : ''} ${canCreate('org') ? '' : 'disabled'}> ${esc(x.name)} <span class="muted small">${esc(x.role || t('orgType.' + laneOf(x)))}</span></label>`).join('') || `<span class="muted small">${t('org.peersNone')}</span>`}</div></div>
      <label>${t('org.note')}${f('note', {type: 'textarea', rows: 2, ph: t('org.notePh')})}</label>
    </div>
    <div class="bar" style="margin-top:10px"><button class="btn" id="addChild">＋ ${t('org.addChild')}</button>
      ${myRole() === 'pm' && p.id !== myId() ? `<button class="btn primary" id="copyInvite" title="${t('org.inviteHint')}">${p.pin ? t('org.inviteAgain') : t('org.invite')}</button>` : ''}</div>
    <div class="login-state ${loginStatus(p)}">${t('org.login.' + loginStatus(p))}</div>
    <h3>${t('org.holding')}</h3>
    ${ld.tasks.length + ld.acts.length + ld.raid.length ? `<ul class="hold-list">
      ${ld.tasks.map(x => row(t('org.kTask'), x.name, x.end, d2n(x.end) < b)).join('')}
      ${ld.acts.map(a => row(t('org.kAction'), a.text, a.due, a.due && d2n(a.due) < b)).join('')}
      ${ld.raid.map(r => row(lbl('raidType', r.type), r.title, r.due, r.due && d2n(r.due) < b)).join('')}
    </ul>` : `<div class="empty">${t('org.nothing')}</div>`}
  </div>`;
}

// ロールとできることの一覧（ロールを選ぶだけで権限が決まることを見せる）
function roleMatrix(){
  const mark = v => v === 'y' ? '<span class="mk y">●</span>' : v === 'p' ? '<span class="mk p">◐</span>' : '<span class="mk n">—</span>';
  const mr = myRole();
  return `<div class="card" style="margin-top:16px"><h2>${t('org.matrix')}<span class="hint">${t('org.matrixHint')}</span></h2>
    <div class="scroll-x"><table class="matrix"><tr><th></th>${ROLES.map(r => `<th class="c ${r === mr ? 'me' : ''}">${t('role.' + r)}</th>`).join('')}</tr>
    ${ROLE_MATRIX.map(([k, ...v]) => `<tr><td>${t('cap.' + k)}</td>${v.map((x, i) => `<td class="c ${ROLES[i] === mr ? 'me' : ''}">${mark(x)}</td>`).join('')}</tr>`).join('')}
    </table></div><div class="legend"><span>● ${t('cap.y')}</span><span>◐ ${t('cap.p')}</span><span>— ${t('cap.n')}</span></div></div>`;
}
