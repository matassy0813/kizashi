// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 体制図：図の切り替え（組織図・フロー・カスタム）とメンバー一覧 ============
// 図は「見て分かる」ための画面、メンバーの追加・編集は「メンバー一覧」に分ける。
// どの図でも、人をクリックすればその人を編集でき、フローのステップをクリックすれば担当を変えられる。

// ---- フローのひな形（ガバナンスのルールを参照し、体制図の人から担当を自動で割り当てる） ----
function pickPeople(){
  const org = state.org, depth = orgDepth(org);
  const pm = org.find(p => p.access === 'pm');
  const clients = org.filter(p => laneOf(p) === 'client').sort((a, b) => depth[a.id] - depth[b.id]);
  const clientTop = clients[0], clientPL = clients.find(p => depth[p.id] === depth[(clientTop || {}).id] + 1) || clientTop;
  const clientLead = clients.find(p => clientPL && p.parentId === clientPL.id) || clientPL;
  const lead = org.find(p => p.access === 'lead') || pm;
  const ids = (...ps) => ps.filter(Boolean).map(p => p.id).filter((x, i, a) => a.indexOf(x) === i);
  return {pm, clientTop, clientPL, clientLead, lead, ids};
}
function flowTemplates(){
  const J = LANG() === 'ja', T = (ja, en) => J ? ja : en, P = pickPeople();
  const st = (id, label, people, note, type) => ({id, label, people, note: note || '', type: type || 'step'});
  const ed = (from, to, label) => ({id: `E${from}${to}`, from, to, label: label || ''});
  return {
    cr: {name: T('CRフロー','CR flow'), gov: 'cr', steps: [
      st('S1', T('起票','Raise'), [], T('依頼者（誰でも起票できる）','Requester (anyone)')),
      st('S2', T('影響分析','Impact analysis'), P.ids(P.pm), T('スコープ・日程・費用・品質への影響','Scope / schedule / cost / quality')),
      st('S3', T('変更管理会議（CCB）で判断','Decision at CCB'), P.ids(P.clientPL, P.pm), T('承認／却下を決める','Approve or reject'), 'decision'),
      st('S4', T('計画へ反映','Update the plan'), P.ids(P.pm), T('WBS・CR台帳を更新','Update WBS and CR log')),
      st('S5', T('関係者へ周知','Communicate'), P.ids(P.pm), T('週次定例・週次報告で共有','Share in weekly meeting / report'), 'end'),
      st('S6', T('依頼者へ回答（却下）','Reply to requester (rejected)'), P.ids(P.pm), T('理由を添えて回答し、台帳をクローズ','Reply with reasons, close the CR'), 'end'),
    ], edges: [ed('S1','S2'), ed('S2','S3'), ed('S3','S4', T('承認','Approved')), ed('S4','S5'), ed('S3','S6', T('却下','Rejected'))]},
    approval: {name: T('成果物の承認フロー','Deliverable approval flow'), gov: 'approval', steps: [
      st('S1', T('作成（v0.x）','Draft (v0.x)'), [], T('担当メンバー','Author')),
      st('S2', T('チーム内レビュー','Peer review'), P.ids(P.lead), T('指摘はレビュー記録へ','Comments in review record')),
      st('S3', T('PMレビュー','PM review'), P.ids(P.pm), T('完了の定義（DoD）を確認','Check Definition of Done')),
      st('S4', T('顧客レビュー','Client review'), P.ids(P.clientLead), T('原則5営業日','5 business days'), 'decision'),
      st('S5', T('承認（v1.0）','Sign-off (v1.0)'), P.ids(P.clientPL), T('承認済フォルダへ格納・決定事項に登録','Store as approved, log decision'), 'end'),
    ], edges: [ed('S1','S2'), ed('S2','S3'), ed('S3','S4'), ed('S4','S5', T('OK','OK')), ed('S4','S1', T('差し戻し','Rework'))]},
    escalation: {name: T('エスカレーション','Escalation path'), gov: 'escalation', steps: [
      st('S1', T('レベル1：担当者間で解決','Level 1: owners'), [], T('2営業日以内','Within 2 business days')),
      st('S2', T('レベル2：PM ↔ 顧客PL','Level 2: PM ↔ client PL'), P.ids(P.pm, P.clientPL), T('週次定例または随時','Weekly meeting or ad hoc')),
      st('S3', T('レベル3：ステアリングコミッティ','Level 3: Steering committee'), P.ids(P.clientTop, P.pm), T('重要度「高」で解決しない場合','High severity, still unresolved'), 'decision'),
      st('S4', T('解決・決定事項に記録','Resolved — log the decision'), P.ids(P.pm), '', 'end'),
    ], edges: [ed('S1','S2', T('2営業日で未解決','Unresolved in 2 days')), ed('S2','S3', T('3営業日で未解決','Unresolved in 3 days')), ed('S1','S4', T('解決','Resolved')), ed('S2','S4', T('解決','Resolved')), ed('S3','S4', T('決定','Decided'))]},
  };
}
function ensureFlows(){
  state.flows = state.flows || []; state.charts = state.charts || [];
  if (!state.flows.length && state.org.length) {
    const tp = flowTemplates();
    ['cr','approval','escalation'].forEach((k, i) => state.flows.push({id: 'F0' + (i + 1), kind: k, ...tp[k]}));
  }
}

// ---- 図の一覧と切り替え ----
function orgViews(){
  const v = [{k: 'all', label: t('ov.all'), icon: '◎'}];
  ORG_LANES.filter(l => state.org.some(p => laneOf(p) === l)).forEach(l => v.push({k: 'lane:' + l, label: t('ov.lane', t('orgType.' + l)), icon: '▦'}));
  state.flows.forEach(f => v.push({k: 'flow:' + f.id, label: f.name, icon: '→'}));
  state.charts.forEach(c => v.push({k: 'chart:' + c.id, label: c.name, icon: '✦'}));
  return v;
}
function renderOrg(v, ctx){
  ensureFlows();
  const views = orgViews();
  if (ui.orgView !== 'members' && !views.some(x => x.k === ui.orgView)) ui.orgView = 'all';
  const cur = ui.orgView || 'all', edit = canCreate('org');
  v.innerHTML = `
  <div class="ov-bar">
    <div class="ov-chips">${views.map(x => `<button class="ov ${x.k === cur ? 'on' : ''}" data-ov="${esc(x.k)}"><span class="ov-i">${x.icon}</span>${esc(x.label)}</button>`).join('')}
      ${edit ? `<button class="ov add" id="ovNew">＋ ${t('ov.new')}</button>` : ''}</div>
    <button class="ov members ${cur === 'members' ? 'on' : ''}" data-ov="members">👥 ${t('ov.members', state.org.length)}</button>
  </div>
  <div id="orgBody"></div>
  <aside class="org-drawer" id="orgDrawer"></aside>
  ${cur === 'members' ? roleMatrix() : ''}`;
  const body = $('#orgBody');
  if (cur === 'members') renderMembers(body, ctx);
  else if (cur.startsWith('flow:')) renderFlow(body, ctx, state.flows.find(f => f.id === cur.slice(5)));
  else if (cur.startsWith('chart:')) { const c = state.charts.find(x => x.id === cur.slice(6)); orgGraphView(body, ctx, state.org.filter(p => c.members.includes(p.id)), edit ? `<button class="btn" id="chartEdit">${t('ov.chartEdit')}</button>` : '', cur); }
  else if (cur.startsWith('lane:')) orgGraphView(body, ctx, state.org.filter(p => laneOf(p) === cur.slice(5)), '', cur);
  else orgGraphView(body, ctx, state.org, '', 'all');
  drawDrawer(ctx);
  v.querySelectorAll('[data-ov]').forEach(el => el.onclick = () => { ui.orgView = el.dataset.ov; ui.flowStep = ''; ui.chartEditing = ''; render(true); });
  const nw = $('#ovNew'); if (nw) nw.onclick = () => newChartMenu(nw);
  const ce = $('#chartEdit'); if (ce) ce.onclick = () => { ui.chartEditing = cur.slice(6); ui.orgSel = ''; ui.flowStep = ''; drawDrawer(ctx); };
  // 図の上の人チップ（フロー内など）をクリック → その人の詳細
  v.querySelectorAll('[data-person]').forEach(el => el.onclick = e => { e.stopPropagation(); ui.orgSel = el.dataset.person; ui.flowStep = ''; ui.chartEditing = ''; drawDrawer(ctx); markSelected(); });
}
function markSelected(){ document.querySelectorAll('[data-org]').forEach(n => n.classList.toggle('on', n.dataset.org === ui.orgSel)); }
function newChartMenu(anchor){
  const m = document.createElement('div'); m.className = 'pop';
  m.innerHTML = `<button data-new="chart">✦ ${t('ov.newChart')}<small>${t('ov.newChartD')}</small></button><button data-new="flow">→ ${t('ov.newFlow')}<small>${t('ov.newFlowD')}</small></button>`;
  anchor.after(m);
  const close = () => { m.remove(); document.removeEventListener('click', out, true); };
  const out = e => { if (!m.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener('click', out, true));
  m.querySelector('[data-new="chart"]').onclick = () => { const id = nextId('C', state.charts); state.charts.push({id, name: t('ov.newChartName'), members: state.org.map(p => p.id)}); ui.orgView = 'chart:' + id; ui.chartEditing = id; ui.orgSel = ''; close(); save(); render(true); };
  m.querySelector('[data-new="flow"]').onclick = () => { const id = nextId('F', state.flows); state.flows.push({id, kind: 'custom', name: t('ov.newFlowName'), gov: '', steps: [{id: 'S1', label: t('flow.step', 1), people: [], note: ''}]}); ui.orgView = 'flow:' + id; ui.flowStep = 'S1'; ui.orgSel = ''; close(); save(); render(true); };
}

// ---- 右側の詳細パネル（人／フローのステップ／カスタム図の設定） ----
function drawDrawer(ctx){
  const d = $('#orgDrawer'); if (!d) return;
  const sel = state.org.find(p => p.id === ui.orgSel);
  const flow = (ui.orgView || '').startsWith('flow:') ? state.flows.find(f => f.id === ui.orgView.slice(5)) : null;
  const step = flow && flow.steps.find(s => s.id === ui.flowStep);
  const chart = state.charts.find(c => c.id === ui.chartEditing);
  if (sel) { d.innerHTML = personPanel(sel, ctx.b, ctx.alerts); bindPersonDrawer(d, sel); }
  else if (step) { d.innerHTML = stepPanel(flow, step); bindStepPanel(d, flow, step); }
  else if (chart) { d.innerHTML = chartPanel(chart); bindChartPanel(d, chart); }
  else d.innerHTML = '';
  d.classList.toggle('open', !!(sel || step || chart));
  applyPermissions(d);
  const close = d.querySelector('#drawerClose'); if (close) close.onclick = () => { ui.orgSel = ''; ui.flowStep = ''; ui.chartEditing = ''; drawDrawer(ctx); markSelected(); document.querySelectorAll('.flow-step').forEach(x => x.classList.remove('on')); };
}

// ---- メンバー一覧（追加・編集はここで行う） ----
function renderMembers(el, {b, alerts}){
  const known = new Set(state.org.map(p => p.name));
  const missing = [...new Set([...state.tasks.map(x => x.owner), ...state.raid.map(r => r.owner), ...state.meetings.flatMap(m => m.actions.map(a => a.owner))].filter(n => n && !known.has(n)))];
  const parents = id => state.org.filter(x => x.id !== id).map(x => [x.id, x.name]);
  const sorted = [...state.org].sort((a, c) => ORG_LANES.indexOf(laneOf(a)) - ORG_LANES.indexOf(laneOf(c)));
  el.innerHTML = `<div class="card">
    <div class="bar"><h2 style="margin:0">${t('ov.members', state.org.length)}</h2><span class="hint">${t('mem.hint')}</span><span class="sp"></span><button class="btn primary" id="addPerson">＋ ${t('org.add')}</button></div>
    <div class="scroll-x"><table>
      <tr><th></th><th>${t('org.name')}</th><th>${t('org.role')}</th><th>${t('org.type')}</th><th>${t('org.parent')}</th><th>${t('org.access')}</th><th>${t('mem.load')}</th><th>${t('mem.login')}</th><th></th></tr>
      ${sorted.map(p => { const ld = personLoad(p.name, b, alerts), f = (k, o) => fld('org', p.id, k, p[k], o); return `<tr>
        <td><span class="avatar xs" style="background:${orgColor(p.org)}">${esc((p.name || '?').slice(0, 1))}</span></td>
        <td>${f('name', {cls: 'w-s'})}</td><td>${f('role', {cls: 'w-s', ph: t('org.rolePh')})}</td>
        <td>${f('org', {type: 'select', opts: ORG_LANES.map(o => [o, t('orgType.' + o)])})}</td>
        <td>${f('parentId', {type: 'select', opts: parents(p.id), blank: t('org.top')})}</td>
        <td>${f('access', {type: 'select', opts: ROLES.map(r => [r, t('roleShort.' + r)])})}</td>
        <td class="small ${ld.tasks.length >= state.settings.overloadCount ? 'red' : 'muted'}">${t('org.loadShort', ld.tasks.length, ld.acts.length, ld.raid.length)}</td>
        <td><span class="login-dot ${loginStatus(p)}" title="${t('org.login.' + loginStatus(p))}"></span></td>
        <td><button class="btn ghost" data-person="${p.id}">${t('mem.detail')}</button></td></tr>`; }).join('')}
    </table></div>
    ${missing.length ? `<div class="missing"><span class="muted small">${t('org.missing')}</span> ${missing.map(n => `<button class="chip" data-add-owner="${esc(n)}">＋ ${esc(n)}</button>`).join('')}</div>` : ''}
  </div>`;
  const blank = (name, org, parentId) => ({id: nextId('O', state.org), name, role: '', access: 'member', org, parentId, note: '', peers: []});
  el.querySelector('#addPerson').onclick = () => { const n = blank(t('org.newName'), 'us', (state.org.find(p => p.access === 'pm') || {}).id || ''); state.org.push(n); state.charts.forEach(c => c.members.push(n.id)); ui.orgSel = n.id; save(); render(); };
  el.querySelectorAll('[data-add-owner]').forEach(b2 => b2.onclick = () => { const pm = state.org.find(p => p.access === 'pm'); const n = blank(b2.dataset.addOwner, 'us', pm ? pm.id : ''); state.org.push(n); save(); render(); });
}

// ---- フロー図（CR・承認・エスカレーション・カスタム）：ノード（ステップ）と矢印で描く。分岐・差し戻しも描ける ----
const FLOW_TYPES = ['step','decision','end'];
function ensureFlowGraph(f){
  f.steps.forEach(s => { if (!FLOW_TYPES.includes(s.type)) s.type = 'step'; s.people = s.people || []; });
  if (!Array.isArray(f.edges)) f.edges = f.steps.slice(1).map((s, i) => ({id: `E${f.steps[i].id}${s.id}`, from: f.steps[i].id, to: s.id, label: ''}));
  f.edges = f.edges.filter(e => f.steps.some(s => s.id === e.from) && f.steps.some(s => s.id === e.to));
}
// 自動配置：ステップの並び順で前向きの矢印をたどり、列（左→右）と行（上→下）を決める
function flowLayout(f){
  const NW = 204, NH = 108, GX = 74, GY = 46, idx = Object.fromEntries(f.steps.map((s, i) => [s.id, i])), col = {};
  f.steps.forEach(s => { col[s.id] = col[s.id] || 0; });
  f.steps.forEach(s => f.edges.filter(e => e.from === s.id && idx[e.to] > idx[e.from]).forEach(e => { col[e.to] = Math.max(col[e.to] || 0, col[s.id] + 1); }));
  const rowsUsed = {}, pos = {};
  f.steps.forEach(s => { const c = col[s.id], r = rowsUsed[c] = (rowsUsed[c] ?? -1) + 1; pos[s.id] = {x: 30 + c * (NW + GX), y: 40 + r * (NH + GY)}; });
  return {pos, NW, NH};
}
function flowNodeSvg(s, i, NW, NH){
  const person = id => state.org.find(p => p.id === id);
  const ps = s.people.map(person).filter(Boolean);
  const head = s.type === 'decision' ? `◇ ${t('flowType.decision')}` : s.type === 'end' ? `■ ${t('flowType.end')}` : t('flow.stepNo', i + 1);
  const lab = String(s.label || ''), l1 = lab.slice(0, 12), l2 = lab.length > 12 ? lab.slice(12, 23) + (lab.length > 23 ? '…' : '') : '';
  const chip = (p, y, more) => `<g class="fchip" data-person="${p.id}"><rect x="12" y="${y}" width="${NW - 24}" height="20" rx="10" class="fchip-bg"/><circle cx="23" cy="${y + 10}" r="7" fill="${orgColor(p.org)}"/><text x="23" y="${y + 13.5}" text-anchor="middle" class="fchip-ini">${esc(p.name.slice(0, 1))}</text><text x="36" y="${y + 14}" class="fchip-name">${esc(p.name.slice(0, 8))}${more ? ` +${more}` : ''}</text><text x="${NW - 20}" y="${y + 14}" text-anchor="end" class="fchip-role">${esc((p.role || t('orgType.' + laneOf(p))).slice(0, 8))}</text></g>`;
  const people = ps.length ? ps.slice(0, 2).map((p, k) => chip(p, 58 + k * 24, k === 1 && ps.length > 2 ? ps.length - 2 : 0)).join('')
    : `<rect x="12" y="58" width="${NW - 24}" height="20" rx="10" class="fchip-empty"/><text x="${NW / 2}" y="72" text-anchor="middle" class="fchip-role">${esc(t('flow.anyone'))}</text>`;
  return `<rect width="${NW}" height="${NH}" rx="${s.type === 'end' ? 24 : 14}" class="fnode ${s.type}"/>
    <text x="14" y="20" class="fhead ${s.type}">${esc(head)}</text>
    <text x="14" y="38" class="flabel">${esc(l1)}</text>${l2 ? `<text x="14" y="53" class="flabel">${esc(l2)}</text>` : ''}
    ${people}<title>${esc(lab)}${s.note ? '：' + esc(s.note) : ''}</title>`;
}
function renderFlow(el, ctx, f){
  ensureFlowGraph(f);
  const gov = f.gov ? state.governance.find(g => g.category === f.gov) : null;
  const canEdit = canCreate('org'), edit = !!ui.diagEdit && canEdit;
  const auto = flowLayout(f), {NW, NH} = auto;
  const P = s => (s.x != null ? {x: s.x, y: s.y} : auto.pos[s.id]);
  let W = 640, H = 220;
  f.steps.forEach(s => { const q = P(s); W = Math.max(W, q.x + NW + 40); H = Math.max(H, q.y + NH + 60); });
  const nodes = f.steps.map((s, i) => ({id: s.id, ...P(s), w: NW, h: NH, cls: 'flow-node' + (s.id === ui.flowStep ? ' on' : ''), delay: i * 70, body: flowNodeSvg(s, i, NW, NH)}));
  const edges = f.edges.map(e => ({id: e.id, from: e.from, to: e.to, kind: 'flow', label: e.label}));
  const hasPos = f.steps.some(s => s.x != null);
  el.innerHTML = `<div class="card flow-card">
    <div class="bar"><h2 style="margin:0">${esc(f.name)}</h2>${gov ? `<span class="tag">${t('flow.basedOn', esc(gov.title))}</span>` : ''}<span class="sp"></span>
      ${canEdit ? `<button class="btn ${edit ? 'primary' : ''}" id="dgEdit">${edit ? '✓ ' + t('dg.editOn') : '✎ ' + t('dg.edit')}</button>` : ''}
      ${edit ? FLOW_TYPES.map(k => `<button class="btn" data-addnode="${k}">＋ ${t('flowType.' + k)}</button>`).join('') + (hasPos ? `<button class="btn" id="flowAuto">${t('dg.autoLayout')}</button>` : '') : ''}
      ${canEdit && f.kind !== 'custom' ? `<button class="btn" id="flowReset">${t('flow.reset')}</button>` : ''}</div>
    <div class="muted small" style="margin-bottom:8px">${edit ? t('dg.hintFlow') : t('flow.hint')}</div>
    <div id="flowDiagram"></div>
  </div>
  ${gov ? `<details class="card" style="margin-top:16px"><summary><b>${t('flow.rule')}：${esc(gov.title)}</b> <span class="gstat ${gov.status}">${lbl('govStatus', gov.status)}</span><span class="sp"></span><button class="btn ghost" data-tab="governance">${t('flow.openGov')} ›</button></summary><pre class="rule">${esc(gov.content)}</pre></details>` : ''}`;
  const addNode = (type, x, y) => {
    const id = 'S' + Date.now().toString(36), from = f.steps.find(s => s.id === ui.flowStep);
    const base = from ? P(from) : null;
    f.steps.push({id, label: t('flowType.' + type), people: [], note: '', type, ...(x != null ? {x, y} : base ? {x: base.x + NW + 74, y: base.y} : {})});
    if (from && x == null) f.edges.push({id: 'E' + from.id + id, from: from.id, to: id, label: ''});
    ui.flowStep = id; save(); render();
  };
  diagram($('#flowDiagram'), {
    W, H, nodes, edges, edit, selected: ui.flowStep, label: f.name, cls: 'flow-svg' + ($('#view').classList.contains('animate') ? ' anim' : ''),
    handles: [{kind: 'flow', at: 'right', title: t('dg.handleFlow')}],
    related: id => new Set([id, ...f.edges.filter(e => e.from === id || e.to === id).flatMap(e => [e.from, e.to])]),
    onNode: id => { ui.flowStep = id; ui.orgSel = ''; ui.chartEditing = ''; render(); },
    onPerson: id => { ui.orgSel = id; ui.flowStep = ''; ui.chartEditing = ''; render(); },
    onMove: (id, x, y) => { const s = f.steps.find(z => z.id === id); s.x = x; s.y = y; save(); render(); },
    onConnect: (from, to) => { if (f.edges.some(e => e.from === from && e.to === to)) { toast(t('dg.edgeExists')); return; } f.edges.push({id: 'E' + from + to + Date.now().toString(36).slice(-3), from, to, label: ''}); save(); render(); },
    onEdge: (e, cx, cy) => {
      const ed = f.edges.find(x => x.id === e.id);
      dgPopover(cx, cy, `<label class="lbl-block">${t('flow.edgeLabel')}<input value="${esc(ed.label || '')}" placeholder="${t('flow.edgeLabelPh')}"></label><div class="bar" style="margin:8px 0 0"><button class="btn primary sm" data-ok>${t('btn.save')}</button><span class="sp"></span><button class="btn danger sm" data-x>${t('flow.removeEdge')}</button></div>`, (m, close) => {
        const inp = m.querySelector('input');
        const ok = () => { ed.label = inp.value.trim(); close(); save(); render(); };
        m.querySelector('[data-ok]').onclick = ok; inp.onkeydown = ev => { if (ev.key === 'Enter') ok(); };
        m.querySelector('[data-x]').onclick = () => { f.edges = f.edges.filter(x => x !== ed); close(); save(); render(); };
      });
    },
    onCanvas: (x, y) => addNode('step', x, y),
  });
  const de = $('#dgEdit'); if (de) de.onclick = () => { ui.diagEdit = !ui.diagEdit; render(); };
  el.querySelectorAll('[data-addnode]').forEach(b2 => b2.onclick = () => addNode(b2.dataset.addnode));
  const au = $('#flowAuto'); if (au) au.onclick = () => { f.steps.forEach(s => { delete s.x; delete s.y; }); save(); render(true); };
  const rs = $('#flowReset'); if (rs) rs.onclick = () => { if (!confirm(t('flow.resetConfirm'))) return; const tp = flowTemplates()[f.kind]; if (tp) { f.steps = tp.steps; f.edges = tp.edges; save(); render(true); toast(t('flow.resetDone')); } };
}
function stepPanel(f, s){
  const i = f.steps.indexOf(s), fs = (k, o) => fld('fsteps', `${f.id}:${s.id}`, k, s[k], o);
  const groups = ORG_LANES.map(l => [l, state.org.filter(p => laneOf(p) === l)]).filter(([, ps]) => ps.length);
  const outs = f.edges.filter(e => e.from === s.id), ins = f.edges.filter(e => e.to === s.id), name = id => (f.steps.find(x => x.id === id) || {}).label || '?';
  return `<div class="card">
    <div class="bar" style="margin-bottom:6px"><span class="flow-no big">${i + 1}</span><h2 style="margin:0">${esc(s.label)}</h2><span class="sp"></span><button class="btn ghost" id="drawerClose">✕</button></div>
    <div class="form-grid one">
      ${f.kind === 'custom' ? `<label>${t('flow.name')}${fld('flows', f.id, 'name', f.name)}</label>` : ''}
      <label>${t('flow.label')}${fs('label')}</label>
      <label>${t('flow.type')}<select data-step-type>${FLOW_TYPES.map(k => `<option value="${k}" ${s.type === k ? 'selected' : ''}>${t('flowType.' + k)}</option>`).join('')}</select></label>
      <div class="lbl-block">${t('flow.who')}<div class="phase-checks peers">${groups.map(([l, ps]) => `<div class="muted small" style="margin-top:4px">${t('orgType.' + l)}</div>${ps.map(p => `<label class="chk"><input type="checkbox" data-step-person="${p.id}" ${s.people.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <span class="muted small">${esc(p.role || '')}</span></label>`).join('')}`).join('')}</div><small class="muted">${t('flow.whoHint')}</small></div>
      <label>${t('flow.note')}${fs('note', {type: 'textarea', rows: 2})}</label>
      <div class="lbl-block">${t('flow.links')}<div class="small">${ins.map(e => `<div>← ${esc(name(e.from))}${e.label ? `（${esc(e.label)}）` : ''}</div>`).join('')}${outs.map(e => `<div>→ ${esc(name(e.to))}${e.label ? `（${esc(e.label)}）` : ''}</div>`).join('') || ''}${!ins.length && !outs.length ? `<span class="muted">${t('flow.noLinks')}</span>` : ''}</div></div>
    </div>
    <div class="bar" style="margin-top:12px"><span class="sp"></span><button class="btn danger" id="stepDel">${t('btn.delete')}</button></div>
    ${f.kind === 'custom' ? `<div class="bar" style="margin-top:8px"><span class="sp"></span><button class="btn danger" id="flowDel">${t('flow.deleteFlow')}</button></div>` : ''}
  </div>`;
}
function bindStepPanel(d, f, s){
  const ok = canCreate('org');
  d.querySelectorAll('[data-step-person]').forEach(el => { el.disabled = !ok; el.onchange = () => { const id = el.dataset.stepPerson; s.people = s.people.filter(x => x !== id); if (el.checked) s.people.push(id); save(); render(); }; });
  const ty = d.querySelector('[data-step-type]'); if (ty) { ty.disabled = !ok; ty.onchange = () => { s.type = ty.value; save(); render(); }; }
  const del = d.querySelector('#stepDel'); if (del) { if (!ok) del.remove(); else del.onclick = () => { f.steps = f.steps.filter(x => x !== s); f.edges = f.edges.filter(e => e.from !== s.id && e.to !== s.id); ui.flowStep = ''; save(); render(); }; }
  const fd = d.querySelector('#flowDel'); if (fd) { if (!ok) fd.remove(); else fd.onclick = () => { if (!confirm(t('msg.deleteConfirm', f.name))) return; state.flows = state.flows.filter(x => x !== f); ui.orgView = 'all'; ui.flowStep = ''; save(); render(true); }; }
}

// ---- カスタムの組織図（見せたい人だけを選んで作る） ----
function chartPanel(c){
  const groups = ORG_LANES.map(l => [l, state.org.filter(p => laneOf(p) === l)]).filter(([, ps]) => ps.length);
  return `<div class="card">
    <div class="bar" style="margin-bottom:6px"><h2 style="margin:0">${t('ov.chartEdit')}</h2><span class="sp"></span><button class="btn ghost" id="drawerClose">✕</button></div>
    <div class="form-grid one">
      <label>${t('flow.name')}${fld('charts', c.id, 'name', c.name)}</label>
      <div class="lbl-block">${t('ov.chartMembers')}<div class="bar" style="margin:4px 0"><button class="btn ghost" id="cmAll">${t('ov.all2')}</button><button class="btn ghost" id="cmNone">${t('ov.none')}</button></div>
        <div class="phase-checks peers" style="max-height:360px">${groups.map(([l, ps]) => `<div class="muted small" style="margin-top:4px">${t('orgType.' + l)}</div>${ps.map(p => `<label class="chk"><input type="checkbox" data-cm="${p.id}" ${c.members.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <span class="muted small">${esc(p.role || '')}</span></label>`).join('')}`).join('')}</div>
        <small class="muted">${t('ov.chartHint')}</small></div>
    </div>
    <div class="bar" style="margin-top:12px"><span class="sp"></span><button class="btn danger" id="chartDel">${t('ov.chartDelete')}</button></div>
  </div>`;
}
function bindChartPanel(d, c){
  d.querySelectorAll('[data-cm]').forEach(el => el.onchange = () => { const id = el.dataset.cm; c.members = c.members.filter(x => x !== id); if (el.checked) c.members.push(id); save(); render(); });
  d.querySelector('#cmAll').onclick = () => { c.members = state.org.map(p => p.id); save(); render(); };
  d.querySelector('#cmNone').onclick = () => { c.members = []; save(); render(); };
  d.querySelector('#chartDel').onclick = () => { if (!confirm(t('msg.deleteConfirm', c.name))) return; state.charts = state.charts.filter(x => x !== c); ui.orgView = 'all'; ui.chartEditing = ''; save(); render(true); };
}
