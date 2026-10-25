// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ガバナンス（フェーズ共通ルール） ============
const GOV_SECTIONS = ['rules','naming','bodies','cr'];
function renderGovernance(v, {b}){
  const gs = govStats(), ps = d2n(state.project.start);
  const sec = ui.govSec || 'rules';
  v.innerHTML = `
  <div class="card" style="margin-bottom:14px">
    <div class="bar" style="margin:0"><h2 style="margin:0">${t('gov.title')}</h2><span class="hint muted">${t('gov.hint')}</span></div>
    <div class="readiness"><div class="track big"><div class="ac" style="width:${gs.total ? gs.agreed / gs.total * 100 : 0}%;background:var(--green)"></div><div class="ac2" style="left:${gs.total ? gs.agreed / gs.total * 100 : 0}%;width:${gs.total ? gs.draft / gs.total * 100 : 0}%"></div></div>
      <div class="muted" style="font-size:12px">${t('gov.readiness', gs.agreed, gs.total, gs.draft)}</div></div>
  </div>
  <div class="seg" style="margin-bottom:14px">${GOV_SECTIONS.map(k => `<button class="${sec === k ? 'on' : ''}" data-gsec="${k}">${t('gs.' + k)}</button>`).join('')}</div>
  <div id="govBody"></div>`;
  v.querySelectorAll('[data-gsec]').forEach(el => el.onclick = () => { ui.govSec = el.dataset.gsec; render(); });
  const body = $('#govBody');
  if (sec === 'rules') govRules(body, b, ps);
  else if (sec === 'naming') govNaming(body);
  else if (sec === 'bodies') govBodies(body);
  else govCrs(body, b);
}
function govRules(body, b, ps){
  body.innerHTML = `
  <div class="bar"><span class="sp"></span><button class="btn" id="expGov">${t('gov.export')}</button><button class="btn primary" id="addGov">＋ ${t('gov.add')}</button></div>
  <div class="gov-list">${state.governance.map(g => {
    const f = (k, o) => fld('governance', g.id, k, g[k], o);
    const due = isNaN(ps) ? null : n2d(ps + (+g.targetDays || 0));
    const late = g.status !== 'agreed' && due && d2n(due) < b;
    return `<details class="card gov ${g.status}" ${ui.govOpen === g.id ? 'open' : ''} data-gov="${g.id}">
      <summary><span class="gstat ${g.status}">${lbl('govStatus', g.status)}</span><b>${esc(g.title)}</b><span class="tag">${lbl('govCat', g.category)}</span>
        <span class="muted" style="font-size:12px;margin-left:auto">${g.status === 'agreed' ? t('gov.agreedOn', ymd(g.agreedDate)) : due ? `<span class="${late ? 'red' : ''}">${t('gov.dueBy', ymd(due))}</span>` : ''}</span></summary>
      <div class="form-grid" style="margin-top:10px">
        <label>${t('gov.itemTitle')}${f('title')}</label>
        <label>${t('col.category')}${f('category', {type:'select', opts: enumOpts('govCat')})}</label>
        <label>${t('col.owner')}${f('owner')}</label>
        <label>${t('col.status')}${f('status', {type:'select', opts: enumOpts('govStatus')})}</label>
        <label>${t('gov.agreedDate')}${f('agreedDate', {type:'date'})}</label>
        <label>${t('gov.targetDays')}${f('targetDays', {type:'number'})}</label>
      </div>
      <label class="lbl-block" style="margin-top:10px">${t('gov.content')}${f('content', {type:'textarea', rows: Math.min(18, Math.max(5, lines(g.content).length + 2)), cls:'mono'})}</label>
      <div class="bar" style="margin-top:8px">
        ${g.category === 'structure' ? `<button class="btn" data-regen="${g.id}">${t('gov.regenTree')}</button>` : ''}
        ${g.category === 'naming' ? `<button class="btn" data-gsec="naming">${t('gov.openNaming')}</button>` : ''}
        ${g.category === 'comm' ? `<button class="btn" data-gsec="bodies">${t('gov.openBodies')}</button>` : ''}
        ${g.category === 'cr' ? `<button class="btn" data-gsec="cr">${t('gov.openCr')}</button>` : ''}
        <button class="btn" data-copy-gov="${g.id}">${t('gov.copy')}</button>
        <span class="sp"></span>${delBtn('governance', g.id, g.title)}</div>
    </details>`; }).join('')}</div>`;
  body.querySelectorAll('details[data-gov]').forEach(d => d.addEventListener('toggle', () => { if (d.open) ui.govOpen = d.dataset.gov; else if (ui.govOpen === d.dataset.gov) ui.govOpen = ''; }));
  body.querySelectorAll('[data-gsec]').forEach(el => el.onclick = () => { ui.govSec = el.dataset.gsec; render(); });
  body.querySelectorAll('[data-regen]').forEach(el => el.onclick = () => { const g = state.governance.find(x => x.id === el.dataset.regen); if (confirm(t('gov.regenConfirm'))) { g.content = folderTree(LANG()); save(); render(); } });
  body.querySelectorAll('[data-copy-gov]').forEach(el => el.onclick = () => { const g = state.governance.find(x => x.id === el.dataset.copyGov); copyText(`## ${g.title}\n\n${g.content}`); });
  $('#addGov').onclick = () => { const id = nextId('G', state.governance); state.governance.push({id, category: 'other', title: t('gov.newName'), targetDays: 14, content: '', owner: state.project.pm || '', status: 'notset', agreedDate: ''}); ui.govOpen = id; save(); render(); };
  $('#expGov').onclick = () => download(`${t('gov.fileName')}_${safeName(state.project.code)}.md`, govMd(), 'text/markdown');
}
function govMd(){
  const L = [`# ${t('gov.docTitle')}: ${state.project.name}`, `- ${t('kpi.asOf', ymd(todayStr()))}`, ''];
  state.governance.forEach(g => { L.push(`## ${g.title}（${lbl('govStatus', g.status)}${g.agreedDate ? ' ' + ymd(g.agreedDate) : ''}）`, '', g.content || '—', ''); });
  L.push(`## ${t('gs.bodies')}`, `| ${t('mt.name')} | ${t('mt.cadence')} | ${t('mtg.duration')} | ${t('mtg.attendees')} | ${t('mtg.purpose')} |`, '|---|---|---|---|---|');
  state.meetingTypes.forEach(m => L.push(`| ${cell(m.name)} | ${cell(m.cadence)} | ${m.duration} | ${cell(m.attendees)} | ${cell(m.purpose)} |`));
  return L.join('\n');
}
function govNaming(body){
  const N = state.naming, dts = docTypes();
  const g = ui.nameGen || (ui.nameGen = {phase: (state.phases[0] || {}).code || '00', doc: (dts[0] || {}).code || 'DOC', title: '', ver: '0.1', date: todayStr(), ext: 'xlsx'});
  const name = buildFileName(g);
  body.innerHTML = `
  <div class="grid two">
    <div class="card"><h2>${t('nm.generator')}<span class="hint">${t('nm.genHint')}</span></h2>
      <div class="form-grid">
        <label>${t('col.phase')}<select data-ng="phase"><option value="00" ${g.phase === '00' ? 'selected' : ''}>00 ${t('common.common')} / PMO</option>${state.phases.map(p => `<option value="${esc(p.code)}" ${p.code === g.phase ? 'selected' : ''}>${esc(p.code)} ${esc(p.name)}</option>`).join('')}</select></label>
        <label>${t('nm.doc')}<select data-ng="doc">${dts.map(d => `<option value="${esc(d.code)}" ${d.code === g.doc ? 'selected' : ''}>${esc(d.code)} ${esc(d.name)}</option>`).join('')}</select></label>
        <label>${t('nm.titleF')}<input data-ng="title" value="${esc(g.title)}" placeholder="${t('nm.titlePh')}"></label>
        <label>${t('nm.ver')}<input data-ng="ver" value="${esc(g.ver)}"></label>
        <label>${t('nm.date')}<input type="date" data-ng="date" value="${esc(g.date)}"></label>
        <label>${t('nm.ext')}<input data-ng="ext" value="${esc(g.ext)}"></label>
      </div>
      <div class="filename"><code id="fnOut">${esc(name)}</code><button class="btn primary" id="fnCopy">${t('btn.copy')}</button></div>
    </div>
    <div class="card"><h2>${t('nm.checker')}<span class="hint">${t('nm.checkHint')}</span></h2>
      <textarea id="fnCheck" rows="6" class="mono" placeholder="${esc(name)}">${esc(ui.fnCheck || '')}</textarea>
      <div id="fnResult" style="margin-top:8px"></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px"><h2>${t('nm.settings')}</h2>
    <div class="form-grid">
      <label>${t('nm.pattern')}${fld('naming', 0, 'pattern', N.pattern, {cls:'mono'})}<small class="muted">{CO} {TEAM} {PJ} {PHASE} {DOC} {TITLE} {VER} {DATE}</small></label>
      <label>${t('nm.pjCode')}${fld('project', 0, 'code', state.project.code)}</label>
    </div>
    <label class="lbl-block" style="margin-top:10px">${t('nm.docTypes')}${fld('naming', 0, 'docTypes', N.docTypes, {type:'textarea', rows:8, cls:'mono'})}</label>
  </div>`;
  const upd = () => { $('#fnOut').textContent = buildFileName(g); };
  body.querySelectorAll('[data-ng]').forEach(el => el.addEventListener('input', () => { g[el.dataset.ng] = el.value; upd(); }));
  $('#fnCopy').onclick = () => copyText(buildFileName(g));
  const check = () => {
    ui.fnCheck = $('#fnCheck').value; const rx = namingRegex();
    $('#fnResult').innerHTML = lines(ui.fnCheck).map(n => rx.test(n) ? `<div class="green">✔ ${esc(n)}</div>` : `<div class="red">✘ ${esc(n)}</div>`).join('') || `<span class="muted">${t('nm.checkEmpty')}</span>`;
  };
  $('#fnCheck').addEventListener('input', check); check();
}
function govBodies(body){
  body.innerHTML = `<div class="card"><h2>${t('gs.bodies')}<span class="hint">${t('mt.hint')}</span></h2>
    <div class="scroll-x"><table>
      <tr><th>${t('mt.name')}</th><th>${t('mt.cadence')}</th><th>${t('mtg.duration')}</th><th>${t('mtg.attendees')}</th><th>${t('mtg.purpose')}</th><th>${t('mt.agenda')}</th><th></th></tr>
      ${state.meetingTypes.map(m => { const f = (k, o) => fld('meetingTypes', m.id, k, m[k], o); return `<tr style="vertical-align:top">
        <td>${f('name')}</td><td>${f('cadence', {cls:'w-s'})}</td><td>${f('duration', {type:'number', cls:'w-xs'})}</td><td>${f('attendees', {type:'textarea', rows:3})}</td><td>${f('purpose', {type:'textarea', rows:3})}</td><td style="min-width:240px">${f('agenda', {type:'textarea', rows:5})}</td><td>${delBtn('meetingTypes', m.id, m.name)}</td></tr>`; }).join('')}
    </table></div>
    <div class="bar" style="margin-top:8px"><button class="btn primary" id="addMt">＋ ${t('btn.add')}</button></div></div>`;
  $('#addMt').onclick = () => { state.meetingTypes.push({id: nextId('MT', state.meetingTypes), name: t('mt.newName'), cadence: t('mt.weekly'), duration: 60, attendees: '', purpose: '', agenda: ''}); save(); render(); };
}
function govCrs(body, b){
  const crRule = state.governance.find(g => g.category === 'cr');
  const rows = state.crs.map((c, i) => ({c, i})).filter(({c}) => inScope(c));
  const f = (i, k, o) => fld('crs', i, k, state.crs[i][k], o);
  body.innerHTML = `
  ${crRule ? `<details class="card" style="margin-bottom:14px"><summary><b>${esc(crRule.title)}</b> <span class="gstat ${crRule.status}">${lbl('govStatus', crRule.status)}</span></summary><pre class="rule">${esc(crRule.content)}</pre></details>` : ''}
  <div class="card"><h2>${t('cr.title')}<span class="hint">${t('cr.hint')}</span></h2>
    <div class="scroll-x"><table>
      <tr><th>ID</th><th>${t('col.phase')}</th><th>${t('col.title')}</th><th>${t('cr.requester')}</th><th>${t('col.owner')}</th><th>${t('cr.scope')}</th><th class="num">${t('cr.schedule')}</th><th>${t('cr.cost')}</th><th>${t('col.status')}</th><th>${t('col.raised')}</th><th>${t('cr.decided')}</th><th>${t('cr.note')}</th><th></th></tr>
      ${rows.map(({c, i}) => { const stalled = ['analysis','pending'].includes(c.status) && c.raised && b - d2n(c.raised) >= state.settings.crStallDays; return `<tr>
        <td>${f(i, 'id', {cls:'w-s'})}</td><td>${f(i, 'phaseId', {type:'select', opts: phaseOpts(), blank: t('common.common')})}</td><td>${f(i, 'title', {cls:'w-name'})}</td>
        <td>${f(i, 'requester', {cls:'w-s'})}</td><td>${f(i, 'owner', {cls:'w-s'})}</td><td>${f(i, 'scope', {cls:'w-name'})}</td><td>${f(i, 'schedule', {type:'number', cls:'w-xs'})}</td><td>${f(i, 'cost', {cls:'w-s'})}</td>
        <td class="${stalled ? 'cell-late' : ''}">${f(i, 'status', {type:'select', opts: enumOpts('crStatus')})}</td><td>${f(i, 'raised', {type:'date'})}</td><td>${f(i, 'decided', {type:'date'})}</td><td>${f(i, 'note', {cls:'w-name'})}</td><td>${delBtn('crs', i, c.title)}</td></tr>`; }).join('')}
    </table></div>
    ${rows.length ? '' : `<div class="empty">${t('empty.crs')}</div>`}
    <div class="bar" style="margin-top:8px"><button class="btn primary" id="addCr">＋ ${t('cr.add')}</button></div>
  </div>`;
  $('#addCr').onclick = () => { state.crs.push({id: nextId('CR', state.crs), phaseId: ui.scope, title: '', requester: '', owner: state.project.pm || '', scope: '', schedule: 0, cost: '', status: 'draft', raised: todayStr(), decided: '', note: ''}); save(); render(); };
}
