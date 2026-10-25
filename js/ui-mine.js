// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 自分の仕事（ロールを付けられた人が最初に開く画面） ============
// 名前で突き合わせて「今やること」を自動で並べるので、本人の初期設定は要らない
function myTodos(b, alerts){
  const nm = myName(), S = state.settings, r = myRole(), out = [];
  const add = (sev, text, nav) => out.push({sev, text, nav});
  // 承認待ちで自分が承認できるもの
  state.tasks.filter(x => x.status === 'approval' && activeTask(x) && canApprove(x)).forEach(x => add('M', t('mine.todo.approve', x.name, x.owner || '—'), 'tasks'));
  state.tasks.filter(x => x.owner === nm && !isDone(x) && !x.milestone && activeTask(x) && x.disp !== 'hold').forEach(x => {
    const e = d2n(x.end), s = d2n(x.start);
    if (e < b) add('H', t('mine.todo.overdue', x.name, md(x.end)), 'tasks');
    else if (['active','check'].includes(LANE_OF[x.status]) && x.updated && b - d2n(x.updated) >= S.staleDays) add('M', t('mine.todo.update', x.name, b - d2n(x.updated)), 'tasks');
    else if (s > b && s <= b + 7) add('L', t('mine.todo.start', x.name, md(x.start)), 'tasks');
  });
  state.meetings.filter(m => m.status !== 'cancelled').forEach(m => {
    m.actions.forEach(a => { if (a.owner === nm && a.status !== 'done' && a.due && d2n(a.due) <= b + 7) add(d2n(a.due) < b ? 'H' : 'M', t('mine.todo.action', a.text, md(a.due)), `mtg:${m.id}`); });
    if (m.status === 'planned' && d2n(m.date) >= b && d2n(m.date) <= b + 7) m.agenda.forEach(a => { if (a.owner === nm) add('L', t('mine.todo.agenda', md(m.date), m.title, a.topic), `mtg:${m.id}`); });
    if (m.status === 'planned' && m.organizer === nm && d2n(m.date) < b) add('M', t('mine.todo.minutes', m.title, md(m.date)), `mtg:${m.id}`);
  });
  state.raid.filter(x => x.owner === nm && x.status !== 'closed' && x.type !== 'decision' && x.due && d2n(x.due) < b).forEach(x => add('M', t('mine.todo.raid', x.title, md(x.due)), 'raid'));
  if (r === 'lead') { const n = alerts.filter(a => a.sev === 'H' && leadPhases().includes(a.phaseId)).length; if (n) add('H', t('mine.todo.phaseAlerts', n), 'alerts'); }
  if (r === 'pm' || r === 'pmo') {
    const h = alerts.filter(a => a.sev === 'H').length; if (h) add('H', t('mine.todo.allAlerts', h), 'alerts');
    const cr = state.crs.filter(c => c.status === 'pending').length; if (cr) add('M', t('mine.todo.cr', cr), 'governance');
    const g = state.governance.filter(x => x.status !== 'agreed').length; if (g) add('L', t('mine.todo.gov', g), 'governance');
    const known = new Set(state.org.map(p => p.name)), missing = new Set(state.tasks.map(x => x.owner).filter(n => n && !known.has(n))).size;
    if (missing) add('L', t('mine.todo.org', missing), 'org');
  }
  return out.sort((x, y) => SEV_ORDER[x.sev] - SEV_ORDER[y.sev]);
}
function renderMine(v, {b, alerts}){
  const p = me(), nm = myName(), r = myRole();
  const todos = myTodos(b, alerts);
  const tasks = state.tasks.map((x, i) => ({x, i})).filter(({x}) => x.owner === nm && !isDone(x) && !x.milestone && activeTask(x)).sort((a, c) => d2n(a.x.end) - d2n(c.x.end));
  const acts = state.meetings.filter(m => m.status !== 'cancelled').flatMap(m => m.actions.map((a, i) => ({a, i, m}))).filter(({a}) => a.owner === nm && a.status !== 'done');
  const mtgs = state.meetings.filter(m => m.status === 'planned' && d2n(m.date) >= b && d2n(m.date) <= b + 14 && (m.organizer === nm || m.agenda.some(a => a.owner === nm) || String(m.attendees || '').includes(nm))).sort((x, y) => x.date < y.date ? -1 : 1);
  const raid = state.raid.filter(x => x.owner === nm && x.status !== 'closed' && x.type !== 'decision');
  v.innerHTML = `
  <div class="card hello">
    <div class="avatar">${esc((nm || 'PM').slice(0, 1))}</div>
    <div style="flex:1;min-width:0"><div class="hello-name">${t('mine.hello', esc(nm || 'PM'))}</div>
      <div class="muted small">${t('role.' + r)} · ${t('mine.roleCan')} ${t('roleDesc.' + r)}</div></div>
    <div class="hello-count"><b data-count="${todos.length}">${todos.length}</b><span class="muted small">${t('mine.todoCount')}</span></div>
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card"><h2>${t('mine.todo')}<span class="hint">${t('mine.todoHint')}</span></h2>
      ${todos.length ? `<ul class="todo-list">${todos.map(x => `<li ${x.nav.startsWith('mtg:') ? `data-open-mtg="${x.nav.slice(4)}"` : `data-tab="${x.nav}"`}>${sevBadge(x.sev)}<span>${esc(x.text)}</span><span class="go">›</span></li>`).join('')}</ul>` : `<div class="empty">${t('mine.allClear')}</div>`}
    </div>
    <div class="card"><h2>${t('mine.meetings')}</h2>
      ${mtgs.length ? `<ul class="alert-list">${mtgs.map(m => `<li><div class="date-chip">${md(m.date)}<small>${esc(m.time || '')}</small></div><div style="flex:1"><div class="t"><span class="link" data-open-mtg="${m.id}">${esc(m.title)}</span></div><div class="d">${m.organizer === nm ? t('mine.organizer') : m.agenda.filter(a => a.owner === nm).map(a => esc(a.topic)).join(' / ') || t('mine.attendee')}</div></div></li>`).join('')}</ul>` : `<div class="empty">${t('empty.upcoming')}</div>`}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h2>${t('mine.tasks')}<span class="hint">${t('mine.tasksHint')}</span></h2>
    ${tasks.length ? `<div class="scroll-x"><table><tr><th>${t('col.task')}</th><th>${t('col.phase')}</th><th>${t('col.end')}</th><th class="num">${t('col.planPct')}</th><th>${t('col.progress')}</th><th>${t('col.status')}</th></tr>
      ${tasks.map(({x, i}) => `<tr><td>${esc(x.name)}</td><td>${phaseTag(x.phaseId)}</td><td class="${d2n(x.end) < b ? 'red' : ''}">${md(x.end)}</td><td class="num muted">${plannedPct(x, b)}</td>
        <td><div class="prog">${fld('tasks', i, 'progress', x.progress, {type: 'range', cls: 'range'})}<span>${x.progress}%</span></div></td><td>${fld('tasks', i, 'status', x.status, {type: 'select', opts: flowOpts(x)})}${x.status === 'approval' ? `<div class="muted small">${t('tk.waitApprove')}</div>` : ''}</td></tr>`).join('')}
    </table></div>` : `<div class="empty">${t('empty.tasks')}</div>`}
  </div>
  <div class="grid two" style="margin-top:16px">
    <div class="card"><h2>${t('mine.actions')}</h2>
      ${acts.length ? `<div class="scroll-x"><table><tr><th>${t('col.action')}</th><th>${t('col.due')}</th><th>${t('col.status')}</th></tr>${acts.map(({a, i, m}) => `<tr><td>${esc(a.text)}<div class="muted small">${md(m.date)} ${esc(m.title)}</div></td><td class="${a.due && d2n(a.due) < b ? 'red' : ''}">${md(a.due)}</td><td>${fld('actions', `${m.id}:${i}`, 'status', a.status, {type: 'select', opts: enumOpts('actStatus')})}</td></tr>`).join('')}</table></div>` : `<div class="empty">${t('empty.actions')}</div>`}
    </div>
    <div class="card"><h2>${t('mine.raid')}</h2>
      ${raid.length ? `<div class="scroll-x"><table><tr><th>ID</th><th>${t('col.title')}</th><th>${t('col.due')}</th><th>${t('col.status')}</th></tr>${raid.map(x => { const i = state.raid.indexOf(x); return `<tr><td>${esc(x.id)}</td><td>${esc(x.title)}</td><td class="${x.due && d2n(x.due) < b ? 'red' : ''}">${md(x.due)}</td><td>${fld('raid', i, 'status', x.status, {type: 'select', opts: enumOpts('raidStatus')})}</td></tr>`; }).join('')}</table></div>` : `<div class="empty">${t('empty.raid')}</div>`}
      ${canCreate('raid') ? `<div class="bar" style="margin-top:10px"><button class="btn" data-tab="raid">＋ ${t('mine.raise')}</button></div>` : ''}
    </div>
  </div>`;
}
// 本人に送る案内文（ロールを付けたら、これを送るだけで使い始められる）
function inviteText(p, code){
  const b = d2n(baseDate()), nm = p.name, r = p.access || 'member';
  const tasks = state.tasks.filter(x => x.owner === nm && !isDone(x) && !x.milestone).length;
  const acts = state.meetings.flatMap(m => m.actions).filter(a => a.owner === nm && a.status !== 'done').length;
  const next = state.meetings.filter(m => m.status === 'planned' && d2n(m.date) >= b && (m.organizer === nm || m.agenda.some(a => a.owner === nm) || String(m.attendees || '').includes(nm))).sort((x, y) => x.date < y.date ? -1 : 1)[0];
  const phases = r === 'lead' ? state.phases.filter(ph => ph.owner === nm).map(ph => ph.name) : [];
  const L = [t('inv.title', state.project.name, nm), '', `${t('inv.role')}：${t('role.' + r)}${phases.length ? `（${t('inv.phases')}：${phases.join('、')}）` : ''}`, `${t('inv.can')}：${t('roleDesc.' + r)}`, '', t('inv.first')];
  L.push(`1. ${t('inv.step1')}`);
  L.push(`2. ${code ? t('inv.step2code', nm, code) : t('inv.step2pin', nm)}`);
  if (r === 'viewer') L.push(`3. ${t('inv.stepView')}`);
  else L.push(`3. ${t('inv.step3', tasks, acts)}`);
  if (next) L.push(`4. ${t('inv.step4', ymd(next.date), next.time || '', next.title)}`);
  if (code) L.push('', t('inv.codeNote'));
  L.push('', t('inv.footer', state.project.pm || 'PM'));
  return L.join('\n');
}
