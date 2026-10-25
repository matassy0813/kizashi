// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 会議管理 ============
function renderMeetings(v, {b, alerts}){
  const st = meetingStats(b);
  const pct = (a, n) => n ? Math.round(a / n * 100) + '%' : '—';
  const doneActs = st.acts.filter(a => a.status === 'done').length;
  let list = state.meetings.filter(inScope);
  if (ui.mtgFilter === 'upcoming') list = list.filter(m => d2n(m.date) >= b && m.status === 'planned');
  else if (ui.mtgFilter === 'past') list = list.filter(m => d2n(m.date) < b || m.status !== 'planned');
  list.sort((x, y) => (x.date + x.time < y.date + y.time ? -1 : 1) * (ui.mtgFilter === 'past' ? -1 : 1));
  const cur = state.meetings.find(m => m.id === ui.meetingId);
  const mAlerts = id => alerts.filter(a => a.ref === id && ['noAgenda','noPurpose','noMinutes','actionOverdue','actionIncomplete'].includes(a.type));
  v.innerHTML = `
  <div class="grid kpis">
    <div class="card kpi"><div class="lbl">${t('mk.upcoming', state.settings.lookahead)}</div><div class="val">${st.upcoming.length}</div></div>
    <div class="card kpi"><div class="lbl">${t('mk.agendaRate')}</div><div class="val ${st.withAgenda < st.upcoming.length ? 'amber' : 'green'}">${pct(st.withAgenda, st.upcoming.length)}</div><div class="note">${t('mk.agendaNote')}</div></div>
    <div class="card kpi"><div class="lbl">${t('mk.recordRate')}</div><div class="val ${st.recorded < st.past.length ? 'amber' : 'green'}">${pct(st.recorded, st.past.length)}</div><div class="note">${t('mk.recordNote')}</div></div>
    <div class="card kpi"><div class="lbl">${t('mk.actionRate')}</div><div class="val">${pct(doneActs, st.acts.length)}</div><div class="note ${st.overdue.length ? 'red' : ''}">${t('mk.overdueActs', st.overdue.length)}</div></div>
  </div>
  <div class="mtg-layout" style="margin-top:14px">
    <div class="card mtg-list">
      <div class="bar">
        <div class="seg">${['upcoming','past','all'].map(k => `<button class="${ui.mtgFilter === k ? 'on' : ''}" data-mf="${k}">${t('mf.' + k)}</button>`).join('')}</div>
        <span class="sp"></span>
      </div>
      <div class="bar">
        <select id="newType">${state.meetingTypes.map(mt => `<option value="${mt.id}">${esc(mt.name)}</option>`).join('')}<option value="">${t('mtg.custom')}</option></select>
        <button class="btn primary" id="addMtg">＋ ${t('mtg.add')}</button>
        <button class="btn" id="addSeries" title="${t('mtg.seriesHint')}">${t('mtg.series')}</button>
      </div>
      ${list.length ? `<ul class="mlist">${list.map(m => { const al = mAlerts(m.id); return `<li class="${m.id === ui.meetingId ? 'on' : ''}" data-open-mtg="${m.id}">
        <div class="date-chip ${m.status}">${md(m.date)}<small>${esc(m.time || '')}</small></div>
        <div style="flex:1;min-width:0"><div class="t">${esc(m.title)}</div>
          <div class="d">${phaseTag(m.phaseId)} <span class="st ${m.status}">${lbl('mtgStatus', m.status)}</span> · ${t('mtg.agendaN', m.agenda.length)} · ${t('mtg.actionsN', m.actions.filter(a => a.status !== 'done').length)}</div>
          ${al.length ? `<div>${al.map(a => `<span class="sev ${a.sev}">${t('at.' + a.type)}</span>`).join(' ')}</div>` : ''}</div></li>`; }).join('')}</ul>` : `<div class="empty">${t('empty.meetings')}</div>`}
    </div>
    <div class="mtg-detail">${cur ? meetingEditor(cur, b) : `<div class="card empty">${t('mtg.select')}</div>`}</div>
  </div>
  <div class="card" style="margin-top:14px"><h2>${t('mtg.allActions')}<span class="hint">${t('mtg.allActionsHint')}</span></h2>${actionTable(st.acts, b)}</div>`;

  v.querySelectorAll('[data-mf]').forEach(el => el.onclick = () => { ui.mtgFilter = el.dataset.mf; save(); render(); });
  $('#addMtg').onclick = () => { const m = createMeeting($('#newType').value, baseDate()); ui.meetingId = m.id; save(); render(); };
  $('#addSeries').onclick = () => {
    const typeId = $('#newType').value, mt = state.meetingTypes.find(x => x.id === typeId);
    const n = parseInt(prompt(t('mtg.seriesPrompt', mt ? mt.name : t('mtg.custom')), '8')); if (!n || n < 1) return;
    const first = prompt(t('mtg.seriesFirst'), baseDate()); if (!normDate(first)) return;
    const interval = mt && /隔週|bi-?weekly/i.test(mt.cadence) ? 14 : mt && /月|month/i.test(mt.cadence) ? 28 : 7;
    for (let k = 0; k < Math.min(n, 52); k++) createMeeting(typeId, n2d(d2n(normDate(first)) + k * interval));
    save(); render(); toast(t('mtg.seriesDone', Math.min(n, 52)));
  };
  if (cur) bindMeetingEditor(cur);
}
function createMeeting(typeId, date){
  const mt = state.meetingTypes.find(x => x.id === typeId);
  const m = {id: nextId('M', state.meetings), typeId: typeId || '', title: mt ? mt.name : t('mtg.newName'), phaseId: ui.scope, date, time: '10:00', duration: mt ? +mt.duration || 60 : 60,
    location: '', organizer: state.project.pm || '', attendees: mt ? mt.attendees : '', purpose: mt ? mt.purpose : '',
    agenda: mt ? lines(mt.agenda).map(x => ({topic: x, owner: state.project.pm || '', minutes: Math.max(5, Math.round((+mt.duration || 60) / Math.max(1, lines(mt.agenda).length) / 5) * 5), ref: '', outcome: ''})) : [],
    status: 'planned', notes: '', decisions: [], actions: []};
  state.meetings.push(m);
  return m;
}
function meetingEditor(m, b){
  const f = (k, o) => fld('meetings', m.id, k, m[k], o);
  const total = m.agenda.reduce((s, a) => s + (+a.minutes || 0), 0);
  const over = total > (+m.duration || 0);
  const past = d2n(m.date) <= b;
  const ag = (i, k, o) => fld('agenda', `${m.id}:${i}`, k, m.agenda[i][k], o);
  const dc = (i, k, o) => fld('decisions', `${m.id}:${i}`, k, m.decisions[i][k], o);
  const ac = (i, k, o) => fld('actions', `${m.id}:${i}`, k, m.actions[i][k], o);
  return `<div class="card">
    <div class="bar" style="margin-bottom:6px"><h2 style="margin:0">${esc(m.title)}</h2><span class="st ${m.status}">${lbl('mtgStatus', m.status)}</span><span class="sp"></span>
      <button class="btn" id="copyAgenda">${t('mtg.copyAgenda')}</button>
      <button class="btn" id="copyMinutes">${t('mtg.copyMinutes')}</button>
      ${delBtn('meetings', m.id, m.title)}</div>
    <div class="steps"><span class="${m.purpose && m.agenda.length ? 'ok' : ''}">① ${t('mtg.step1')}</span><span class="${m.status === 'done' ? 'ok' : ''}">② ${t('mtg.step2')}</span><span class="${m.actions.length && m.actions.every(a => a.status === 'done') ? 'ok' : ''}">③ ${t('mtg.step3')}</span></div>

    <h3>${t('mtg.secPlan')}</h3>
    <div class="form-grid">
      <label>${t('mtg.title')}${f('title')}</label>
      <label>${t('mtg.type')}${f('typeId', {type:'select', opts: state.meetingTypes.map(x => [x.id, x.name]), blank: t('mtg.custom')})}</label>
      <label>${t('col.phase')}${f('phaseId', {type:'select', opts: phaseOpts(), blank: t('common.common')})}</label>
      <label>${t('mtg.date')}${f('date', {type:'date'})}</label>
      <label>${t('mtg.time')}${f('time', {type:'time'})}</label>
      <label>${t('mtg.duration')}${f('duration', {type:'number'})}</label>
      <label>${t('mtg.location')}${f('location')}</label>
      <label>${t('mtg.organizer')}${f('organizer')}</label>
      <label>${t('mtg.attendees')}${f('attendees')}</label>
    </div>
    <label class="lbl-block" style="margin-top:10px">${t('mtg.purpose')} <span class="req">${t('mtg.required')}</span>${f('purpose', {type:'textarea', rows:2, ph: t('mtg.purposePh')})}</label>

    <h3>${t('mtg.secAgenda')} <span class="hint ${over ? 'red' : ''}">${t('mtg.timebox', total, m.duration || 0)}${over ? ' ⚠ ' + t('mtg.overTime') : ''}</span></h3>
    <div class="scroll-x"><table>
      <tr><th>#</th><th>${t('mtg.topic')}</th><th>${t('col.owner')}</th><th class="num">${t('mtg.min')}</th><th>${t('mtg.ref')}</th><th>${t('mtg.outcome')}</th><th></th></tr>
      ${m.agenda.map((a, i) => `<tr><td class="muted">${i + 1}</td><td>${ag(i, 'topic', {cls:'w-name'})}</td><td class="${a.owner ? '' : 'cell-late'}">${ag(i, 'owner', {cls:'w-s', ph: t('mtg.ownerReq')})}</td><td>${ag(i, 'minutes', {type:'number', cls:'w-xs'})}</td><td>${ag(i, 'ref', {cls:'w-s', ph:'T07 / R01'})}</td><td>${ag(i, 'outcome', {cls:'w-name', ph: past ? t('mtg.outcomePh') : ''})}</td><td>${delBtn('agenda', `${m.id}:${i}`)}</td></tr>`).join('')}
    </table></div>
    <div class="bar" style="margin-top:6px"><button class="btn" id="addAgenda">＋ ${t('mtg.addAgenda')}</button>
      ${m.typeId ? `<button class="btn ghost" id="loadStd">${t('mtg.loadStd')}</button>` : ''}
      <select id="pullRef"><option value="">${t('mtg.pull')}</option>${pullCandidates(m).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></div>

    <h3>${t('mtg.secResult')}</h3>
    <div class="form-grid"><label>${t('col.status')}${f('status', {type:'select', opts: enumOpts('mtgStatus')})}</label></div>
    <label class="lbl-block" style="margin-top:8px">${t('mtg.decisions')}</label>
    <div class="scroll-x"><table>${m.decisions.map((d, i) => `<tr><td class="muted" style="width:24px">${i + 1}</td><td>${dc(i, 'text', {cls:'w-name'})}</td><td style="width:30px">${delBtn('decisions', `${m.id}:${i}`)}</td></tr>`).join('')}</table></div>
    <div class="bar" style="margin-top:6px"><button class="btn" id="addDecision">＋ ${t('mtg.addDecision')}</button>${m.decisions.length ? `<button class="btn ghost" id="toRaid" title="${t('mtg.toRaidHint')}">${t('mtg.toRaid')}</button>` : ''}</div>
    <label class="lbl-block" style="margin-top:8px">${t('mtg.actions')}</label>
    <div class="scroll-x"><table>
      <tr><th>${t('col.action')}</th><th>${t('col.owner')}</th><th>${t('col.due')}</th><th>${t('col.status')}</th><th></th></tr>
      ${m.actions.map((a, i) => `<tr><td>${ac(i, 'text', {cls:'w-name'})}</td><td class="${a.owner ? '' : 'cell-late'}">${ac(i, 'owner', {cls:'w-s'})}</td><td class="${!a.due || (a.status !== 'done' && d2n(a.due) < b) ? 'cell-late' : ''}">${ac(i, 'due', {type:'date'})}</td><td>${ac(i, 'status', {type:'select', opts: enumOpts('actStatus')})}</td><td>${delBtn('actions', `${m.id}:${i}`)}</td></tr>`).join('')}
    </table></div>
    <div class="bar" style="margin-top:6px"><button class="btn" id="addAction">＋ ${t('mtg.addAction')}</button></div>
    <label class="lbl-block" style="margin-top:8px">${t('mtg.notes')}${f('notes', {type:'textarea', rows:3})}</label>
    ${m.status !== 'done' && past ? `<div class="bar" style="margin-top:10px"><button class="btn primary" id="markDone">${t('mtg.markDone')}</button></div>` : ''}
  </div>`;
}
// 前回会議の未完了アクション・オープン課題などをアジェンダに取り込む候補
function pullCandidates(m){
  const out = [];
  const prev = state.meetings.filter(x => x.id !== m.id && x.typeId === m.typeId && x.date < m.date).sort((a, b) => a.date < b.date ? -1 : 1).pop();
  if (prev) prev.actions.filter(a => a.status !== 'done').forEach((a, i) => out.push([`act:${prev.id}:${prev.actions.indexOf(a)}`, `${t('mtg.prevAction')}: ${a.text}`]));
  state.raid.filter(r => r.status !== 'closed' && r.type !== 'decision' && (!m.phaseId || !r.phaseId || r.phaseId === m.phaseId)).forEach(r => out.push([`raid:${r.id}`, `${r.id} ${r.title}`]));
  state.crs.filter(c => ['analysis','pending'].includes(c.status)).forEach(c => out.push([`cr:${c.id}`, `${c.id} ${c.title}`]));
  return out;
}
function bindMeetingEditor(m){
  const push = (arr, o) => { arr.push(o); save(); render(); };
  $('#addAgenda').onclick = () => push(m.agenda, {topic: '', owner: '', minutes: 10, ref: '', outcome: ''});
  $('#addDecision').onclick = () => push(m.decisions, {text: ''});
  $('#addAction').onclick = () => push(m.actions, {id: 'A' + (m.actions.length + 1), text: '', owner: '', due: n2d(d2n(m.date) + 7), status: 'open'});
  const ls = $('#loadStd'); if (ls) ls.onclick = () => { const mt = state.meetingTypes.find(x => x.id === m.typeId); if (!mt) return; lines(mt.agenda).forEach(x => m.agenda.push({topic: x, owner: m.organizer || '', minutes: 10, ref: '', outcome: ''})); save(); render(); };
  $('#pullRef').onchange = e => {
    const [kind, a, c] = e.target.value.split(':'); if (!kind) return;
    if (kind === 'act') { const pm = state.meetings.find(x => x.id === a), act = pm.actions[+c]; m.agenda.push({topic: `${t('mtg.prevAction')}: ${act.text}`, owner: act.owner, minutes: 5, ref: '', outcome: ''}); }
    else if (kind === 'raid') { const r = state.raid.find(x => x.id === a); m.agenda.push({topic: r.title, owner: r.owner, minutes: 10, ref: r.id, outcome: ''}); }
    else if (kind === 'cr') { const cr = state.crs.find(x => x.id === a); m.agenda.push({topic: `${cr.id} ${cr.title}`, owner: cr.owner, minutes: 10, ref: cr.id, outcome: ''}); }
    save(); render();
  };
  const doneBtn = $('#markDone'); if (doneBtn) doneBtn.onclick = () => {
    const miss = [];
    if (m.agenda.some(a => !String(a.outcome || '').trim())) miss.push(t('mtg.missOutcome'));
    if (m.actions.some(a => !a.owner || !a.due)) miss.push(t('mtg.missAction'));
    if (miss.length && !confirm(t('mtg.confirmDone', miss.join('\n')))) return;
    m.status = 'done'; save(); render(); toast(t('mtg.doneToast'));
  };
  const tr = $('#toRaid'); if (tr) tr.onclick = () => {
    let n = 0;
    m.decisions.filter(d => String(d.text || '').trim() && !d.logged).forEach(d => {
      state.raid.push({id: nextId('D', state.raid.filter(r => r.type === 'decision')), type: 'decision', phaseId: m.phaseId, category: 'other', title: d.text, owner: m.organizer, impact: '', prob: '', status: 'closed', raised: m.date, due: '', mitigation: `${t('col.meeting')}: ${m.title} (${ymd(m.date)})`});
      d.logged = true; n++;
    });
    save(); render(); toast(t('mtg.toRaidDone', n));
  };
  $('#copyAgenda').onclick = () => copyText(agendaMd(m));
  $('#copyMinutes').onclick = () => copyText(minutesMd(m));
}
function actionTable(acts, b){
  if (!acts.length) return `<div class="empty">${t('empty.actions')}</div>`;
  const sorted = [...acts].sort((x, y) => (x.status === 'done') - (y.status === 'done') || ((x.due || '9') < (y.due || '9') ? -1 : 1));
  return `<div class="scroll-x"><table><tr><th>${t('col.action')}</th><th>${t('col.owner')}</th><th>${t('col.due')}</th><th>${t('col.status')}</th><th>${t('col.meeting')}</th></tr>
    ${sorted.map(a => { const i = a.meeting.actions.findIndex(x => x.id === a.id && x.text === a.text); const late = a.status !== 'done' && a.due && d2n(a.due) < b;
      return `<tr class="${a.status === 'done' ? 'muted' : ''}"><td>${esc(a.text)}</td><td>${esc(a.owner || '—')}</td><td class="${late ? 'red' : ''}">${md(a.due)}${late ? ` (+${b - d2n(a.due)})` : ''}</td><td>${fld('actions', `${a.meeting.id}:${i}`, 'status', a.status, {type:'select', opts: enumOpts('actStatus')})}</td><td><span class="link" data-open-mtg="${a.meeting.id}">${md(a.meeting.date)} ${esc(a.meeting.title)}</span></td></tr>`; }).join('')}
  </table></div>`;
}
const timeRange = m => { if (!m.time) return ''; const [h, mi] = m.time.split(':').map(Number), e = h * 60 + mi + (+m.duration || 0); return `${m.time}–${pad(Math.floor(e / 60) % 24)}:${pad(e % 60)}`; };
function agendaMd(m){
  const L = [`# ${m.title}`, `- ${t('mtg.date')}: ${ymd(m.date)} ${timeRange(m)}（${m.duration || 0}${t('mtg.minUnit')}）`, `- ${t('mtg.location')}: ${m.location || '—'}`, `- ${t('mtg.attendees')}: ${m.attendees || '—'}`, `- ${t('mtg.purpose')}: ${m.purpose || '—'}`, '', `## ${t('mtg.secAgenda')}`, `| # | ${t('mtg.topic')} | ${t('col.owner')} | ${t('mtg.min')} | ${t('mtg.ref')} |`, '|---|---|---|---|---|'];
  m.agenda.forEach((a, i) => L.push(`| ${i + 1} | ${cell(a.topic)} | ${cell(a.owner)} | ${a.minutes || ''} | ${cell(a.ref)} |`));
  L.push('', t('mtg.agendaFooter'));
  return L.join('\n');
}
function minutesMd(m){
  const L = [`# ${t('mtg.minutesTitle')}: ${m.title}（${ymd(m.date)}）`, `- ${t('mtg.date')}: ${ymd(m.date)} ${timeRange(m)}`, `- ${t('mtg.attendees')}: ${m.attendees || '—'}`, `- ${t('mtg.purpose')}: ${m.purpose || '—'}`, '', `## ${t('mtg.secAgenda')} / ${t('mtg.outcome')}`, `| # | ${t('mtg.topic')} | ${t('col.owner')} | ${t('mtg.outcome')} |`, '|---|---|---|---|'];
  m.agenda.forEach((a, i) => L.push(`| ${i + 1} | ${cell(a.topic)} | ${cell(a.owner)} | ${cell(a.outcome || '—')} |`));
  L.push('', `## ${t('mtg.decisions')}`);
  if (m.decisions.length) m.decisions.forEach(d => L.push(`- ${d.text}`)); else L.push(t('common.none'));
  L.push('', `## ${t('mtg.actions')}`, `| # | ${t('col.action')} | ${t('col.owner')} | ${t('col.due')} |`, '|---|---|---|---|');
  m.actions.forEach((a, i) => L.push(`| ${i + 1} | ${cell(a.text)} | ${cell(a.owner)} | ${ymd(a.due)} |`));
  if (m.notes) L.push('', `## ${t('mtg.notes')}`, ...lines(m.notes).map(x => `- ${x}`));
  return L.join('\n');
}
