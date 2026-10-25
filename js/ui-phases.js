// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ フェーズ管理 ============
function renderPhases(v, {b, alerts}){
  const list = ui.scope ? state.phases.filter(p => p.id === ui.scope) : state.phases;
  v.innerHTML = `
  <div class="bar no-print">
    <span class="muted" style="font-size:12px">${t('ph.hint')}</span>
    <span class="sp"></span>
    <button class="btn primary" id="addPhase">＋ ${t('ph.add')}</button>
  </div>
  <div class="card" style="margin-bottom:14px"><h2>${t('ph.overview')}</h2><div class="scroll-x"><table>
    <tr><th>${t('col.phase')}</th><th>${t('ph.period')}</th><th>${t('ph.contractType')}</th><th>${t('ph.contractEndShort')}</th><th>${t('ph.gate')}</th><th class="num">${t('lg.actual')}/${t('lg.plan')}</th><th class="num">${t('ph.openIssues')}</th><th class="num">${t('ph.contractIssues')}</th><th class="num">${t('ph.crs')}</th><th class="num">${t('ph.alertsH')}</th></tr>
    ${state.phases.map(p => {
      const {s, e} = phaseRange(p), m = metrics(tasksOf(p.id), b);
      const raid = state.raid.filter(r => r.phaseId === p.id && r.status !== 'closed' && (r.type === 'issue' || r.type === 'risk'));
      const high = alerts.filter(a => a.phaseId === p.id && a.sev === 'H').length;
      const crs = state.crs.filter(c => c.phaseId === p.id && !['rejected','done'].includes(c.status)).length;
      return `<tr class="${ui.scope === p.id ? 'sel' : ''}"><td><span class="link" data-scope="${p.id}"><b>${esc(p.code)}</b> ${esc(p.name)}</span></td><td style="white-space:nowrap">${md(s)}〜${md(e)}</td><td>${lbl('contract', p.contract)}</td>
        <td class="${p.contractEnd && d2n(p.contractEnd) < b && tasksOf(p.id).some(x => !isDone(x)) ? 'red' : ''}">${md(p.contractEnd)}</td><td><span class="gate ${p.gate}">${lbl('gate', p.gate)}</span></td>
        <td class="num">${m.actual}% / ${m.planned}%</td><td class="num">${raid.length}</td><td class="num ${raid.some(r => r.category === 'contract') ? 'red' : ''}">${raid.filter(r => r.category === 'contract').length}</td><td class="num">${crs}</td><td class="num ${high ? 'red' : ''}">${high}</td></tr>`;
    }).join('')}
  </table></div></div>
  ${list.map(p => phaseEditor(p, b)).join('')}`;
  $('#addPhase').onclick = () => {
    const id = nextId('P', state.phases).replace(/^P0/, 'P');
    const code = pad((state.phases.length + 1) * 10);
    state.phases.push(newPhase(id, t('ph.newName'), code));
    save(); render();
  };
}
function phaseEditor(p, b){
  const i = state.phases.indexOf(p), {s, e} = phaseRange(p), f = (k, o) => fld('phases', p.id, k, p[k], o);
  return `<div class="card" style="margin-bottom:14px">
    <div class="bar" style="margin-bottom:8px"><h2 style="margin:0">${esc(p.code)} ${esc(p.name)}</h2><span class="gate ${p.gate}">${lbl('gate', p.gate)}</span><span class="sp"></span>
      <button class="btn ghost" data-move-phase="${p.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn ghost" data-move-phase="${p.id}" data-dir="1" ${i === state.phases.length - 1 ? 'disabled' : ''}>↓</button>
      ${delBtn('phases', p.id, p.name)}</div>
    <div class="form-grid">
      <label>${t('ph.code')}${f('code')}</label>
      <label>${t('ph.name')}${f('name')}</label>
      <label>${t('ph.owner')}${f('owner')}</label>
      <label>${t('ph.start')}${f('start', {type:'date', title: t('ph.autoDate')})}<small class="muted">${p.start ? '' : t('ph.autoVal', ymd(s))}</small></label>
      <label>${t('ph.end')}${f('end', {type:'date', title: t('ph.autoDate')})}<small class="muted">${p.end ? '' : t('ph.autoVal', ymd(e))}</small></label>
      <label>${t('ph.gate')}${f('gate', {type:'select', opts: enumOpts('gate')})}</label>
      <label>${t('ph.contractType')}${f('contract', {type:'select', opts: enumOpts('contract')})}</label>
      <label>${t('ph.contractRef')}${f('contractRef')}</label>
      <label>${t('ph.contractEnd')}${f('contractEnd', {type:'date'})}</label>
    </div>
    <div class="grid two" style="margin-top:10px">
      <label class="lbl-block">${t('ph.deliverables')}${f('deliverables', {type:'textarea', rows:3, ph: t('ph.oneLine')})}</label>
      <label class="lbl-block">${t('ph.exitCriteria')}${f('exitCriteria', {type:'textarea', rows:3, ph: t('ph.oneLine')})}</label>
    </div>
  </div>`;
}

// ---- CSV 取込（日英どちらの列名・値でも可） ----
const TASK_COLS = [['id'],['phase'],['name'],['owner'],['start'],['end'],['baselineEnd'],['progress'],['status'],['milestone'],['updated']];
const ALIASES = [
  ['baselineEnd',['当初終了日','当初終了','当初期限','ベースライン終了','baselineend','baseline','baselinefinish','originaldue','originalend']],
  ['updated',['最終更新日','最終更新','更新日','updated','lastupdated']],
  ['milestone',['マイルストーン','ms','milestone']],
  ['progress',['進捗率','進捗','進捗(%)','進捗率(%)','%完了','progress','%complete','percentcomplete']],
  ['status',['ステータス','状態','status']],
  ['owner',['担当者','担当','owner','assignee','resource']],
  ['start',['開始日','開始','予定開始日','予定開始','start','startdate']],
  ['end',['終了日','終了','予定終了日','予定終了','期限','end','enddate','finish','due','duedate']],
  ['phase',['フェーズ','工程','phase','stage']],
  ['name',['タスク名','タスク','作業名','作業項目','name','task','taskname']],
  ['id',['id','no','no.','番号','wbs番号','wbs']],
];
const STATUS_IN = {'未着手':'todo','進行中':'doing','完了':'closed','クローズ':'closed','保留':'hold','not started':'todo','to do':'todo','todo':'todo','in progress':'doing','doing':'doing','done':'closed','closed':'closed','completed':'closed','complete':'closed','on hold':'hold','hold':'hold'};
function mapHeader(h){
  const n = String(h).trim().toLowerCase().replace(/\s/g, '');
  for (const [k, al] of ALIASES) if (al.includes(n)) return k;
  for (const [k, al] of ALIASES) if (al.some(a => a.length > 1 && n.includes(a))) return k;
  return null;
}
function parseCsv(text){
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
function normDate(s){
  s = String(s || '').trim(); if (!s) return '';
  let m = s.match(/^(\d{4})[\/\-\.年](\d{1,2})[\/\-\.月](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // 英語版Excel（M/D/YYYY）
  return m ? `${m[3]}-${pad(m[1])}-${pad(m[2])}` : '';
}
function importCsv(file){
  const read = enc => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file, enc); });
  read('utf-8').then(async txt => {
    if (txt.includes('�')) txt = await read('shift_jis'); // 日本語版ExcelのCSV
    const rows = parseCsv(txt);
    if (rows.length < 2) return alert(t('csv.noRows'));
    const keys = rows[0].map(mapHeader);
    if (!keys.includes('name') || !keys.includes('end')) return alert(t('csv.needCols'));
    const phases = state.phases.map(p => ({...p}));
    const findPhase = name => {
      if (!name) return '';
      let p = phases.find(x => x.name === name || x.code === name || `${x.code} ${x.name}` === name);
      if (!p) { p = newPhase(nextId('P', phases).replace(/^P0/, 'P'), name, pad((phases.length + 1) * 10)); phases.push(p); }
      return p.id;
    };
    const tasks = rows.slice(1).map((r, idx) => {
      const o = {}; keys.forEach((k, j) => { if (k) o[k] = (r[j] || '').trim(); });
      const end = normDate(o.end), start = normDate(o.start) || end;
      let p = parseFloat(String(o.progress || '0').replace('%', '')) || 0; if (p > 0 && p <= 1 && String(o.progress).includes('.')) p *= 100;
      const st = STATUS_IN[String(o.status || '').toLowerCase()] || (p >= 100 ? 'closed' : p > 0 ? 'doing' : 'todo');
      return { id: o.id || `T${pad(idx + 1)}`, phaseId: findPhase(o.phase), name: o.name || '', owner: o.owner || '', start, end,
        baselineEnd: normDate(o.baselineEnd) || end, progress: Math.round(Math.min(100, p)), status: st,
        milestone: ['1','true','yes','y','○','◯','●','★','ms','x'].includes(String(o.milestone || '').trim().toLowerCase()),
        updated: normDate(o.updated) || todayStr() };
    }).filter(x => x.name);
    if (!confirm(t('csv.confirm', tasks.length, state.tasks.length))) return;
    state.phases = phases; state.tasks = tasks; save(); render(); toast(t('csv.done', tasks.length));
  });
}

// ============ RAID ============
function renderRaid(v, {b}){
  const rows = state.raid.map((r, i) => ({r, i})).filter(({r}) => inScope(r) && (!ui.raidType || r.type === ui.raidType) && (!ui.raidCat || r.category === ui.raidCat))
    .sort((a, c) => phaseIdx(a.r.phaseId) - phaseIdx(c.r.phaseId) || a.i - c.i);
  const f = (i, k, o) => fld('raid', i, k, state.raid[i][k], o);
  v.innerHTML = `<div class="card">
    <div class="bar">
      <select id="fRaid"><option value="">${t('flt.allTypes')}</option>${enumOpts('raidType').map(([k, l]) => `<option value="${k}" ${k === ui.raidType ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="fCat"><option value="">${t('flt.allCats')}</option>${enumOpts('raidCat').map(([k, l]) => `<option value="${k}" ${k === ui.raidCat ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="muted" style="font-size:12px">${t('raid.hint')}</span>
      <span class="sp"></span>
      <button class="btn primary" id="addRaid">＋ ${t('btn.add')}</button>
    </div>
    <div class="scroll-x"><table>
      <tr><th>ID</th><th>${t('col.type')}</th><th>${t('col.phase')}</th><th>${t('col.category')}</th><th>${t('col.title')}</th><th>${t('col.owner')}</th><th>${t('col.impact')}</th><th>${t('col.prob')}</th><th>${t('col.status')}</th><th>${t('col.raised')}</th><th>${t('col.due')}</th><th>${t('col.mitigation')}</th><th></th></tr>
      ${rows.map(({r, i}) => { const late = r.status !== 'closed' && r.due && d2n(r.due) < b; return `<tr class="${r.category === 'contract' && r.status !== 'closed' ? 'row-contract' : ''}">
        <td>${f(i, 'id', {cls:'w-s'})}</td>
        <td>${f(i, 'type', {type:'select', opts: enumOpts('raidType')})}</td>
        <td>${f(i, 'phaseId', {type:'select', opts: phaseOpts(), blank: t('common.common')})}</td>
        <td>${f(i, 'category', {type:'select', opts: enumOpts('raidCat')})}</td>
        <td>${f(i, 'title', {cls:'w-name'})}</td>
        <td>${f(i, 'owner', {cls:'w-s'})}</td>
        <td>${f(i, 'impact', {type:'select', opts: enumOpts('level'), blank: true})}</td>
        <td>${r.type === 'risk' ? f(i, 'prob', {type:'select', opts: enumOpts('level'), blank: true}) : '<span class="muted">—</span>'}</td>
        <td>${f(i, 'status', {type:'select', opts: enumOpts('raidStatus')})}</td>
        <td>${f(i, 'raised', {type:'date'})}</td>
        <td class="${late ? 'cell-late' : ''}">${f(i, 'due', {type:'date'})}</td>
        <td>${f(i, 'mitigation', {cls:'w-name'})}</td>
        <td>${delBtn('raid', i, r.title || r.id)}</td>
      </tr>`; }).join('')}
    </table></div>
    ${rows.length ? '' : `<div class="empty">${t('empty.raidAll')}</div>`}
  </div>`;
  $('#fRaid').onchange = e => { ui.raidType = e.target.value; render(); };
  $('#fCat').onchange = e => { ui.raidCat = e.target.value; render(); };
  $('#addRaid').onclick = () => {
    const type = ui.raidType || 'risk', pre = {risk:'R', issue:'I', assumption:'A', decision:'D'}[type];
    state.raid.push({id: nextId(pre, state.raid.filter(r => r.type === type)), type, phaseId: ui.scope, category: ui.raidCat || 'other', title: '', owner: '', impact: 'M', prob: type === 'risk' ? 'M' : '', status: 'open', raised: todayStr(), due: '', mitigation: ''});
    save(); render();
  };
}
