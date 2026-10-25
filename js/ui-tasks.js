// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ タスク（一覧・カンバン・Backlog） ============
// ステータスは種類ごとの流れで進み、最後はクローズ。承認が要る種類は承認者が承認すると自動でクローズする。
// 「次のフェーズへ」「Backlog」「保留」「見送り」はステータスとは別の「扱い」として持つ。
const flowOpts = t => flowOf(t).map(s => [s, lbl('taskStatus', s)]);
const prioOpts = () => ['H','M','L'].map(v => [v, lbl('level', v)]);
const prioDot = p => `<span class="prio ${p || 'M'}" title="${t('tk.priority')}：${lbl('level', p || 'M')}"></span>`;
const PRIO_ORDER = {H: 0, M: 1, L: 2};

function newTask(extra){
  const bd = baseDate(), last = state.tasks.filter(x => x.phaseId).pop();
  const r = myRole(), ph = ui.scope || (r === 'lead' && leadPhases()[0]) || (last ? last.phaseId : (state.phases[0] || {}).id || '');
  const t0 = {id: nextId('T', state.tasks), phaseId: ph, name: t('tk.newName'), owner: r === 'member' ? myName() : (ui.owner || ''), start: bd, end: n2d(d2n(bd) + 6), baselineEnd: n2d(d2n(bd) + 6),
    progress: 0, status: 'todo', kind: 'general', priority: 'M', disp: '', milestone: false, updated: todayStr(), ...extra};
  state.tasks.push(t0); return t0;
}
function afterTaskChange(tk, f){
  if (f === 'kind') { // 種類を変えたら、同じ列（進み具合）のステータスに置き換える
    const lane = LANE_OF[tk.status] || 'todo', fl = flowOf(tk);
    tk.status = fl.find(s => LANE_OF[s] === lane) || fl[Math.min(fl.length - 2, KANBAN_LANES.indexOf(lane))] || 'todo';
    tk.progress = TASK_PCT[tk.status];
  }
  if (f === 'status') tk.progress = TASK_PCT[tk.status] ?? tk.progress;
  if (f === 'progress') {
    const v = Math.max(0, Math.min(100, parseInt(tk.progress) || 0)); tk.progress = v;
    if (v > 0 && tk.status === 'todo') tk.status = flowOf(tk)[1];
    if (v >= 100 && tk.kind === 'general') tk.status = 'closed';
  }
  if (f === 'end' && !tk.baselineEnd) tk.baselineEnd = tk.end;
  if (['progress','status','end','kind'].includes(f)) tk.updated = todayStr();
}
// 列（またはステータス）を変える。承認が要るものは承認者だけがクローズできる
function moveTask(tk, status){
  if (!flowOf(tk).includes(status)) { toast(t('tk.noLane')); return false; }
  if (status === 'closed' && needsApproval(tk) && !canApprove(tk)) { toast(t('tk.needApprover')); return false; }
  if (status === 'closed' && needsApproval(tk)) { tk.approvedBy = myName(); tk.approvedAt = todayStr(); }
  tk.status = status; afterTaskChange(tk, 'status'); return true;
}
function approveTask(tk){ if (moveTask(tk, 'closed')) { save(); render(); toast(t('tk.approved', tk.name)); } }

// ---- 扱い：次のフェーズへ／Backlog／保留／見送り ----
function disposeTask(tk, d){
  if (!canDispose(tk)) { toast(t('perm.denied')); return; }
  if (d === 'next') {
    const i = state.phases.findIndex(p => p.id === tk.phaseId), next = state.phases[i + 1];
    if (!next) { toast(t('tk.noNextPhase')); return; }
    const cur = phaseOf(tk.phaseId);
    // フェーズごとに契約が違う場合は、範囲の移動になるので CR の要否を確認する
    if (cur && (cur.contract !== next.contract || (cur.contractRef || '') !== (next.contractRef || ''))) {
      if (!confirm(t('tk.carryContract', cur.name, lbl('contract', cur.contract), cur.contractRef || '—', next.name, lbl('contract', next.contract), next.contractRef || '—'))) return;
      if (confirm(t('tk.carryCr'))) state.crs.push({id: nextId('CR', state.crs), phaseId: next.id, title: t('tk.carryCrTitle', tk.name, next.name), requester: myName(), owner: state.project.pm || myName(), scope: t('tk.carryCrScope', cur.name, next.name), schedule: 0, cost: '', status: 'draft', raised: todayStr(), decided: '', note: ''});
    }
    tk.carriedFrom = (tk.carriedFrom || []).concat(tk.phaseId); tk.carryCount = (tk.carryCount || 0) + 1;
    tk.phaseId = next.id; tk.disp = '';
    const ps = phaseRange(next).s, dur = Math.max(1, d2n(tk.end) - d2n(tk.start) + 1);
    if (ps && d2n(tk.start) < d2n(ps)) { tk.start = ps; tk.end = n2d(d2n(ps) + dur - 1); }
    tk.updated = todayStr();
    toast(t('tk.carried', tk.name, next.name));
  } else if (d === 'backlog') { tk.disp = 'backlog'; tk.updated = todayStr(); toast(t('tk.toBacklog', tk.name)); }
  else if (d === 'hold') {
    const why = prompt(t('tk.holdWhy'), tk.dispNote || ''); if (why === null) return;
    const until = prompt(t('tk.holdUntil'), tk.holdUntil || n2d(d2n(baseDate()) + 7)); if (until === null) return;
    tk.disp = 'hold'; tk.dispNote = why; tk.holdUntil = normDate(until) || ''; tk.updated = todayStr();
  } else if (d === 'dropped') {
    const why = prompt(t('tk.dropWhy')); if (!why) return;
    tk.disp = 'dropped'; tk.dispNote = why; tk.status = 'closed'; tk.updated = todayStr();
    state.raid.push({id: nextId('D', state.raid.filter(r => r.type === 'decision')), type: 'decision', phaseId: tk.phaseId, category: 'scope', title: t('tk.dropDecision', tk.name, why), owner: myName(), impact: '', prob: '', status: 'closed', raised: todayStr(), due: '', mitigation: ''});
    toast(t('tk.dropped', tk.name));
  } else if (d === 'resume') { tk.disp = ''; tk.updated = todayStr(); }
  save(); render();
}
function dispMenu(tk, i){
  if (!canDispose(tk) || tk.milestone) return tk.disp ? `<span class="disp ${tk.disp}">${t('disp.' + tk.disp)}</span>` : '';
  const opts = tk.disp ? [['resume', t('disp.resume')]] : [];
  if (!isDone(tk)) DISPS.forEach(d => { if (d !== tk.disp) opts.push([d, t('disp.do.' + d)]); });
  return `${tk.disp ? `<span class="disp ${tk.disp}" title="${esc(tk.dispNote || '')}${tk.holdUntil ? ' ～' + md(tk.holdUntil) : ''}">${t('disp.' + tk.disp)}</span>` : ''}
    ${opts.length ? `<select class="disp-sel" data-disp="${i}"><option value="">${t('disp.menu')}</option>${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` : ''}`;
}
const carryBadge = tk => tk.carryCount ? `<span class="carry" title="${t('tk.carriedFrom', (tk.carriedFrom || []).map(id => phaseName(id)).join(' → '))}">↻${tk.carryCount}</span>` : '';

function renderTasks(v, ctx){
  const view = ui.taskView || 'kanban'; // 既定はカンバン（ドラッグでステータスを変える）
  const backlogN = state.tasks.filter(x => x.disp === 'backlog').length;
  const owners = [...new Set(state.tasks.map(x => x.owner).filter(Boolean))];
  v.innerHTML = `<div class="bar">
    <div class="seg">${['list','kanban','backlog'].map(k => `<button class="${view === k ? 'on' : ''}" data-tview="${k}">${t('tk.view.' + k)}${k === 'backlog' && backlogN ? ` <b>${backlogN}</b>` : ''}</button>`).join('')}</div>
    <select id="fOwner"><option value="">${t('flt.allOwners')}</option>${owners.map(o => `<option ${o === ui.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
    ${view === 'list' ? `<label class="chk"><input type="checkbox" id="fAlert" ${ui.alertOnly ? 'checked' : ''}> ${t('flt.alertOnly')}</label>` : ''}
    <span class="sp"></span>
    <button class="btn primary" id="addTask">＋ ${t('tk.add')}</button>
    ${view === 'list' ? `<button class="btn" id="impCsv">${t('tk.import')}</button><button class="btn" id="tplCsv">${t('tk.template')}</button><button class="btn" id="expCsv">${t('tk.export')}</button><input type="file" id="csvFile" accept=".csv,text/csv" hidden>` : ''}
  </div><div id="taskBody"></div><aside class="org-drawer" id="taskDrawer"></aside>`;
  const body = $('#taskBody');
  if (view === 'kanban') renderKanban(body, ctx); else if (view === 'backlog') renderBacklog(body, ctx); else renderTaskList(body, ctx);
  drawTaskDrawer(v);
  v.querySelectorAll('[data-tview]').forEach(el => el.onclick = () => { ui.taskView = el.dataset.tview; ui.taskSel = ''; render(true); });
  $('#fOwner').onchange = e => { ui.owner = e.target.value; render(); };
  const fa = $('#fAlert'); if (fa) fa.onchange = e => { ui.alertOnly = e.target.checked; render(); };
  $('#addTask').onclick = () => { newTask(view === 'backlog' ? {disp: 'backlog', phaseId: ''} : {}); save(); render(); };
  if (view === 'list') {
    const head = () => TASK_COLS.map(([k]) => t('csv.' + k));
    $('#tplCsv').onclick = () => download(t('tk.templateFile'), '﻿' + toCsv([head(), ['T01', (state.phases[0] || {}).name || 'Phase', 'Task A', 'Owner', '2026/10/01', '2026/10/15', '2026/10/15', '50', lbl('taskStatus', 'doing'), '', '2026/10/10'], ['T02', (state.phases[0] || {}).name || 'Phase', 'Milestone', 'PM', '2026/10/31', '2026/10/31', '2026/10/31', '0', lbl('taskStatus', 'todo'), '○', '']]), 'text/csv');
    $('#expCsv').onclick = () => download(`WBS_${baseDate()}.csv`, '﻿' + toCsv([head(), ...state.tasks.map(tk => TASK_COLS.map(([k]) => k === 'milestone' ? (tk.milestone ? '○' : '') : k === 'phase' ? phaseName(tk.phaseId) : k === 'status' ? lbl('taskStatus', tk.status) : (['start','end','baselineEnd','updated'].includes(k) ? (tk[k] || '').replace(/-/g, '/') : tk[k])))]), 'text/csv');
    $('#impCsv').onclick = () => $('#csvFile').click();
    $('#csvFile').onchange = e => { const file = e.target.files[0]; if (file) importCsv(file); e.target.value = ''; };
  }
  v.querySelectorAll('[data-disp]').forEach(el => el.onchange = () => { const tk = state.tasks[+el.dataset.disp]; if (el.value) disposeTask(tk, el.value); });
  v.querySelectorAll('[data-approve]').forEach(el => el.onclick = e => { e.stopPropagation(); approveTask(state.tasks[+el.dataset.approve]); });
}

// ---- 一覧 ----
function renderTaskList(el, {b, alerts}){
  const alertBy = {}; alerts.forEach(a => { if (a.ref) (alertBy[a.ref] = alertBy[a.ref] || []).push(a); });
  const rows = state.tasks.map((tk, i) => ({tk, i})).filter(({tk}) => tk.disp !== 'backlog' && (!ui.scope || tk.phaseId === ui.scope) && (!ui.owner || tk.owner === ui.owner) && (!ui.alertOnly || alertBy[tk.id]))
    .sort((a, c) => phaseIdx(a.tk.phaseId) - phaseIdx(c.tk.phaseId) || a.i - c.i);
  const f = (i, k, o) => fld('tasks', i, k, state.tasks[i][k], o);
  el.innerHTML = `<div class="card">
    <div class="muted small" style="margin-bottom:8px">${t('tk.hint2')}</div>
    <div class="scroll-x"><table class="tasks">
      <tr><th>ID</th><th>${t('col.phase')}</th><th>${t('col.task')}</th><th>${t('tk.kind')}</th><th>${t('tk.priority')}</th><th>${t('col.owner')}</th><th>${t('col.start')}</th><th>${t('col.end')}</th><th>${t('col.baseline')}</th><th>${t('col.status')}</th><th class="num">${t('col.progress')}</th><th class="num">${t('col.planPct')}</th><th>${t('tk.disp')}</th><th>${t('col.alerts')}</th><th></th></tr>
      ${rows.map(({tk, i}) => `<tr class="${isDone(tk) ? 'closed' : ''} ${tk.disp === 'hold' ? 'held' : ''}">
        <td>${f(i, 'id', {cls: 'w-xs'})}</td>
        <td>${f(i, 'phaseId', {type: 'select', opts: phaseOpts(), blank: true})}</td>
        <td><div class="tname">${tk.milestone ? '<span class="ms">◆</span>' : ''}${f(i, 'name', {cls: 'w-name'})}${carryBadge(tk)}</div></td>
        <td>${tk.milestone ? '<span class="muted small">MS</span>' : f(i, 'kind', {type: 'select', opts: TASK_KINDS.map(k => [k, t('kind.' + k)])})}</td>
        <td><div class="tname">${prioDot(tk.priority)}${f(i, 'priority', {type: 'select', opts: prioOpts()})}</div></td>
        <td>${f(i, 'owner', {cls: 'w-s'})}</td>
        <td>${f(i, 'start', {type: 'date'})}</td><td>${f(i, 'end', {type: 'date'})}</td><td>${f(i, 'baselineEnd', {type: 'date'})}</td>
        <td><div class="tname">${f(i, 'status', {type: 'select', opts: flowOpts(tk), cls: 'st-sel st-' + LANE_OF[tk.status]})}${tk.status === 'approval' && canApprove(tk) ? `<button class="btn primary sm" data-approve="${i}">${t('tk.approve')}</button>` : ''}</div>${tk.approvedBy && tk.status === 'closed' ? `<div class="muted small">${t('tk.approvedBy', esc(tk.approvedBy), md(tk.approvedAt))}</div>` : ''}</td>
        <td>${f(i, 'progress', {type: 'number', cls: 'w-xs'})}</td>
        <td class="num muted">${plannedPct(tk, b)}</td>
        <td>${dispMenu(tk, i)}</td>
        <td>${(alertBy[tk.id] || []).map(a => `<span class="sev ${a.sev}" title="${esc(a.detail)}">${esc(t('at.' + a.type))}</span>`).join(' ')}</td>
        <td>${delBtn('tasks', i, tk.name)}</td>
      </tr>`).join('')}
    </table></div>
    ${rows.length ? '' : `<div class="empty">${t('empty.tasks')}</div>`}
  </div>`;
}

// ---- カンバン（種類が違っても共通の 5 列に並べる。カードをドラッグして列を移す） ----
function renderKanban(el, {b, alerts}){
  const sev = sevMap(alerts);
  const list = state.tasks.map((tk, i) => ({tk, i})).filter(({tk}) => !tk.milestone && activeTask(tk) && (!ui.scope || tk.phaseId === ui.scope) && (!ui.owner || tk.owner === ui.owner));
  const byLane = Object.fromEntries(KANBAN_LANES.map(l => [l, []]));
  list.forEach(o => byLane[LANE_OF[o.tk.status] || 'todo'].push(o));
  Object.values(byLane).forEach(a => a.sort((x, y) => PRIO_ORDER[x.tk.priority] - PRIO_ORDER[y.tk.priority] || d2n(x.tk.end) - d2n(y.tk.end)));
  const closed = byLane.closed.sort((x, y) => (y.tk.updated || '') < (x.tk.updated || '') ? -1 : 1);
  const shownClosed = closed.slice(0, 8);
  const person = name => state.org.find(p => p.name === name);
  const card = ({tk, i}) => {
    const p = person(tk.owner), late = !isDone(tk) && d2n(tk.end) < b, fl = flowOf(tk), next = fl[fl.indexOf(tk.status) + 1];
    const canMove = can('tasks', i, 'status');
    const nextBtn = next && canMove ? (next === 'closed' && needsApproval(tk) ? (canApprove(tk) ? `<button class="btn primary sm" data-approve="${i}">${t('tk.approve')}</button>` : `<span class="muted small">${t('tk.waitApprove')}</span>`) : `<button class="btn sm" data-next="${i}">${lbl('taskStatus', next)} →</button>`) : '';
    return `<div class="kcard ${sev[tk.id] ? 'sev-' + sev[tk.id] : ''} ${tk.disp === 'hold' ? 'held' : ''}" draggable="${canMove}" data-kcard="${i}">
      <div class="kc-top">${prioDot(tk.priority)}<span class="tag k-${tk.kind}">${t('kind.' + tk.kind)}</span><span class="kc-st">${lbl('taskStatus', tk.status)}</span>${carryBadge(tk)}</div>
      <div class="kc-name">${esc(tk.name)}</div>
      ${tk.disp === 'hold' ? `<div class="kc-hold">⏸ ${esc(tk.dispNote || t('disp.hold'))}${tk.holdUntil ? ` ～${md(tk.holdUntil)}` : ''}</div>` : ''}
      <div class="kc-foot">${p ? `<span class="avatar xs" style="background:${orgColor(p.org)}">${esc(p.name.slice(0, 1))}</span>` : ''}<span class="small">${esc(tk.owner || '—')}</span><span class="sp"></span><span class="small ${late ? 'red' : 'muted'}">${md(tk.end)}</span></div>
      ${nextBtn ? `<div class="kc-act">${nextBtn}</div>` : ''}
    </div>`;
  };
  el.innerHTML = `<div class="kanban">${KANBAN_LANES.map(l => `<section class="klane" data-lane="${l}">
      <header><span class="kdot ${l}"></span>${t('lane.' + l)}<span class="kcount">${byLane[l].length}</span></header>
      <div class="klist">
        ${l === 'todo' && canCreate('tasks') ? `<input class="kquick" id="kQuick" placeholder="${t('tk.quickAdd')}">` : ''}
        ${(l === 'closed' ? shownClosed : byLane[l]).map(card).join('') || `<div class="kempty">${t('lane.empty')}</div>`}
        ${l === 'closed' && closed.length > shownClosed.length ? `<div class="muted small" style="text-align:center">${t('lane.more', closed.length - shownClosed.length)}</div>` : ''}
      </div></section>`).join('')}</div>
    <div class="muted small" style="margin-top:8px">${t('tk.kanbanHint')}</div>`;
  // ドラッグで列を移す
  el.querySelectorAll('[data-kcard]').forEach(c => {
    c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', c.dataset.kcard); c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  el.querySelectorAll('[data-lane]').forEach(lane => {
    lane.addEventListener('dragover', e => { e.preventDefault(); lane.classList.add('over'); });
    lane.addEventListener('dragleave', () => lane.classList.remove('over'));
    lane.addEventListener('drop', e => {
      e.preventDefault(); lane.classList.remove('over');
      const tk = state.tasks[+e.dataTransfer.getData('text/plain')]; if (!tk) return;
      const target = flowOf(tk).find(s => LANE_OF[s] === lane.dataset.lane);
      if (!target) { toast(t('tk.noLane')); return; }
      if (target === tk.status) return;
      if (moveTask(tk, target)) { save(); render(); }
    });
  });
  // カードをクリック → 右のパネルで編集（ボタン以外の場所）
  el.querySelectorAll('[data-kcard]').forEach(c => c.addEventListener('click', e => { if (e.target.closest('button, input, select, textarea')) return; ui.taskSel = c.dataset.kcard; render(); }));
  el.querySelectorAll('[data-next]').forEach(btn => btn.onclick = () => { const tk = state.tasks[+btn.dataset.next], fl = flowOf(tk); if (moveTask(tk, fl[fl.indexOf(tk.status) + 1])) { save(); render(); } });
  const q = $('#kQuick'); if (q) q.onkeydown = e => { if (e.key === 'Enter' && q.value.trim()) { newTask({name: q.value.trim()}); save(); render(); setTimeout(() => { const n = $('#kQuick'); if (n) n.focus(); }); } };
}

// ---- Backlog（時期未定。優先度順に並べ、決まったらフェーズに割り当てる） ----
function renderBacklog(el){
  const rows = state.tasks.map((tk, i) => ({tk, i})).filter(({tk}) => tk.disp === 'backlog' && (!ui.owner || tk.owner === ui.owner))
    .sort((a, c) => PRIO_ORDER[a.tk.priority] - PRIO_ORDER[c.tk.priority] || a.i - c.i);
  const f = (i, k, o) => fld('tasks', i, k, state.tasks[i][k], o);
  el.innerHTML = `<div class="card">
    <div class="bar"><h2 style="margin:0">${t('tk.view.backlog')}</h2><span class="hint">${t('tk.backlogHint')}</span></div>
    ${canCreate('tasks') ? `<input class="kquick" id="bQuick" placeholder="${t('tk.quickBacklog')}" style="margin-bottom:10px">` : ''}
    ${rows.length ? `<div class="scroll-x"><table>
      <tr><th>${t('tk.priority')}</th><th>${t('col.task')}</th><th>${t('tk.kind')}</th><th>${t('col.owner')}</th><th>${t('tk.from')}</th><th>${t('tk.assign')}</th><th></th></tr>
      ${rows.map(({tk, i}) => `<tr>
        <td><div class="tname">${prioDot(tk.priority)}${f(i, 'priority', {type: 'select', opts: prioOpts()})}</div></td>
        <td>${f(i, 'name', {cls: 'w-name'})}</td>
        <td>${f(i, 'kind', {type: 'select', opts: TASK_KINDS.map(k => [k, t('kind.' + k)])})}</td>
        <td>${f(i, 'owner', {cls: 'w-s'})}</td>
        <td class="muted small">${tk.phaseId ? esc(phaseName(tk.phaseId)) : '—'}</td>
        <td>${canDispose(tk) ? `<select data-assign="${i}"><option value="">${t('tk.assignPick')}</option>${state.phases.map(p => `<option value="${p.id}">${esc(p.code)} ${esc(p.name)}</option>`).join('')}</select>` : ''}</td>
        <td>${delBtn('tasks', i, tk.name)}</td></tr>`).join('')}
    </table></div>` : `<div class="empty">${t('tk.backlogEmpty')}</div>`}
  </div>`;
  el.querySelectorAll('[data-assign]').forEach(s => s.onchange = () => {
    const tk = state.tasks[+s.dataset.assign], ph = phaseOf(s.value); if (!ph) return;
    const st = d2n(phaseRange(ph).s) > d2n(baseDate()) ? phaseRange(ph).s : baseDate();
    tk.phaseId = ph.id; tk.disp = ''; tk.start = st; tk.end = n2d(d2n(st) + 6); tk.baselineEnd = tk.end; tk.updated = todayStr();
    save(); render(); toast(t('tk.assigned', tk.name, ph.name));
  });
  const q = $('#bQuick'); if (q) q.onkeydown = e => { if (e.key === 'Enter' && q.value.trim()) { newTask({name: q.value.trim(), disp: 'backlog', phaseId: ''}); save(); render(); setTimeout(() => { const n = $('#bQuick'); if (n) n.focus(); }); } };
}

// ---- タスクの編集パネル（カンバンのカードから開く。閉じるボタンは 1 つだけ） ----
function drawTaskDrawer(v){
  const d = v.querySelector('#taskDrawer'), i = ui.taskSel === '' || ui.taskSel == null ? -1 : +ui.taskSel, tk = state.tasks[i];
  if (!d) return;
  if (!tk) { d.classList.remove('open'); d.innerHTML = ''; return; }
  const f = (k, o) => fld('tasks', i, k, tk[k], o);
  d.innerHTML = `<div class="card">
    <div class="bar" style="margin-bottom:6px">${prioDot(tk.priority)}<h2 style="margin:0;flex:1">${esc(tk.name)}</h2><button class="btn ghost" id="taskClose" title="${t('org.close')}" aria-label="${t('org.close')}">✕</button></div>
    <div class="form-grid one">
      <label>${t('col.task')}${f('name', {type: 'textarea', rows: 2})}</label>
      <label>${t('col.status')}<div class="tname">${f('status', {type: 'select', opts: flowOpts(tk), cls: 'st-sel st-' + LANE_OF[tk.status]})}${tk.status === 'approval' && canApprove(tk) ? `<button class="btn primary sm" data-approve="${i}">${t('tk.approve')}</button>` : ''}</div>
        <small class="muted">${flowOf(tk).map(s => s === tk.status ? `<b>${lbl('taskStatus', s)}</b>` : lbl('taskStatus', s)).join(' → ')}</small></label>
      <label>${t('tk.kind')}${f('kind', {type: 'select', opts: TASK_KINDS.map(k => [k, t('kind.' + k)])})}</label>
      <label>${t('tk.priority')}${f('priority', {type: 'select', opts: prioOpts()})}</label>
      <label>${t('col.owner')}${f('owner')}</label>
      <label>${t('col.phase')}${f('phaseId', {type: 'select', opts: phaseOpts(), blank: true})}</label>
      <label>${t('col.start')}${f('start', {type: 'date'})}</label>
      <label>${t('col.end')}${f('end', {type: 'date'})}</label>
      <label>${t('col.progress')}${f('progress', {type: 'number'})}</label>
      <div class="lbl-block">${t('tk.disp')}<div>${dispMenu(tk, i)}</div>${tk.carryCount ? `<small class="muted">${t('tk.carriedFrom', (tk.carriedFrom || []).map(id => phaseName(id)).join(' → '))}</small>` : ''}</div>
      ${tk.approvedBy && tk.status === 'closed' ? `<div class="muted small">${t('tk.approvedBy', esc(tk.approvedBy), md(tk.approvedAt))}</div>` : ''}
    </div>
    ${canDelete('tasks', i) ? `<div class="bar" style="margin-top:14px"><span class="sp"></span><button class="btn danger" data-del="tasks" data-key="${i}" data-name="${esc(tk.name)}">${TRASH} ${t('btn.delete')}</button></div>` : ''}
  </div>`;
  d.classList.add('open');
  d.querySelector('#taskClose').onclick = () => { ui.taskSel = ''; render(); };
}
