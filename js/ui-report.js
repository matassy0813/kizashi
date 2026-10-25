// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 週次レポート（日英どちらでも出力） ============
function buildReport(lang){
  const L_ = (k, ...a) => tl(lang, k, ...a), lb = (g, v) => lbl(g, v, lang);
  const b = d2n(baseDate()), alerts = computeAlerts(lang).filter(scopeAlert), tasks = scopedTasks(), m = metrics(tasks, b), rag = computeRag(m, alerts);
  const P = state.project, S = state.settings, prev = prevSnapshot(), ph = ui.scope ? phaseOf(ui.scope) : null;
  const cnt = s => alerts.filter(a => a.sev === s).length;
  const sevTxt = s => (s === 'H' ? '🔴 ' : s === 'M' ? '🟡 ' : '') + lb('level', s);
  const L = [];
  let n = 0; const H2 = k => { n++; L.push('', `## ${n}. ${L_(k)}`); };
  L.push(`# ${L_('rp.title')}：${P.name}${ph ? `（${ph.code} ${ph.name}）` : ''}`);
  L.push(`- ${L_('rp.asOf')}：${ymd(baseDate())}（${L_('rp.period')} ${ymd(n2d(b - 6))}〜${ymd(baseDate())}）`);
  L.push(`- ${L_('rp.client')}：${P.client || '—'}　／　PM：${P.pm || '—'}　／　${L_('rp.pjPeriod')}：${ymd(P.start)}〜${ymd(P.end)}`);
  H2('rp.s.status'); L[L.length - 1] += `：${RAG_EMOJI[rag]} ${L_('rag.' + rag)}`;
  L.push(`| ${L_('rp.metric')} | ${L_('rp.value')} |`, '|---|---|');
  L.push(`| ${L_('kpi.progress')} | ${m.actual}% / ${m.planned}%（${L_('kpi.variance', (m.actual - m.planned > 0 ? '+' : '') + (m.actual - m.planned))}） |`);
  L.push(`| SPI | ${m.spi.toFixed(2)}${prev ? `（${L_('rp.prev')} ${prev.spi.toFixed(2)} ${m.spi < prev.spi ? '↓' : m.spi > prev.spi ? '↑' : '→'}）` : ''} |`);
  L.push(`| ${L_('rp.overdueTasks')} | ${alerts.filter(a => a.type === 'overdue').length} |`);
  L.push(`| ${L_('kpi.alerts')} | ${cnt('H')} / ${cnt('M')} / ${cnt('L')} |`);
  const openRaid = state.raid.filter(r => inScope(r) && r.status !== 'closed' && r.type !== 'decision');
  L.push(`| ${L_('kpi.raid')} | ${openRaid.filter(r => r.type === 'risk' || r.type === 'issue').length}（${L_('raidCat.contract')} ${openRaid.filter(r => r.category === 'contract').length}） |`);
  const gs = govStats(); if (!ph) L.push(`| ${L_('kpi.gov')} | ${gs.agreed} / ${gs.total} |`);

  H2('rp.s.summary');
  const sm = [];
  sm.push(L_('rp.sum1', m.planned, m.actual, m.spi.toFixed(2), m.spi >= S.spiAmber ? L_('rp.onTrack') : m.spi >= S.spiRed ? `**${L_('rp.slightlyBehind')}**` : `**${L_('rp.wellBehind')}**`));
  if (prev) sm.push(L_('rp.sum2', md(prev.date), prev.spi.toFixed(2), m.spi < prev.spi ? `**${L_('rp.worse')}**` : m.spi > prev.spi ? L_('rp.better') : L_('rp.flat')));
  if (!ph) {
    const worst = state.phases.map(p => ({p, m: metrics(tasksOf(p.id), b)})).filter(x => tasksOf(x.p.id).some(t => !isDone(t))).map(x => ({...x, gap: x.m.planned - x.m.actual})).sort((x, y) => y.gap - x.gap)[0];
    if (worst && worst.gap >= 10) sm.push(L_('rp.sum3', worst.p.name, worst.m.planned, worst.m.actual, worst.gap));
  }
  const ms = tasks.filter(t => t.milestone && !isDone(t) && d2n(t.end) >= b).sort((x, y) => d2n(x.end) - d2n(y.end))[0];
  if (ms) { const risk = alerts.find(a => a.ref === ms.id && a.type === 'msRisk'); sm.push(L_('rp.sum4', ms.name, ymd(ms.end), d2n(ms.end) - b, risk ? `**${L_('rp.msAtRisk')}**` : L_('rp.msOk'))); }
  const contract = alerts.filter(a => a.type === 'contractOverrun');
  if (contract.length) sm.push(`**${L_('rp.sumContract', contract.map(a => a.target).join(', '))}**`);
  if (cnt('H')) sm.push(L_('rp.sum5', cnt('H')));
  const scopeT = state.tasks.filter(x => !ui.scope || x.phaseId === ui.scope || (x.carriedFrom || []).includes(ui.scope));
  const carried = scopeT.filter(x => x.carryCount && !isDone(x)).length, onHold = scopeT.filter(x => x.disp === 'hold').length, backlog = state.tasks.filter(x => x.disp === 'backlog').length, wait = scopeT.filter(x => x.status === 'approval' && activeTask(x)).length;
  if (carried || onHold || backlog || wait) sm.push(L_('rp.sumDisp', carried, onHold, backlog, wait));
  sm.forEach(s => L.push(`- ${s}`));
  const topics = lines(state.report.topics);
  if (topics.length) { L.push('', `**${L_('rp.topics')}**`); topics.forEach(x => L.push(`- ${x.replace(/^[-・*]\s*/, '')}`)); }

  if (ph) {
    H2('rp.s.phase');
    const {s, e} = phaseRange(ph);
    L.push(`| ${L_('rp.metric')} | ${L_('rp.value')} |`, '|---|---|');
    L.push(`| ${L_('ph.period')} | ${ymd(s)}〜${ymd(e)} |`, `| ${L_('ph.contractType')} | ${lb('contract', ph.contract)} |`, `| ${L_('ph.contractRef')} | ${cell(ph.contractRef || '—')} |`, `| ${L_('ph.contractEnd')} | ${ymd(ph.contractEnd)} |`, `| ${L_('ph.gate')} | ${lb('gate', ph.gate)} |`);
    L.push(`| ${L_('ph.deliverables')} | ${cell(lines(ph.deliverables).join(' / ') || '—')} |`, `| ${L_('ph.exitCriteria')} | ${cell(lines(ph.exitCriteria).join(' / ') || '—')} |`);
    L.push('', `| ${L_('col.task')} | ${L_('col.owner')} | ${L_('col.end')} | ${L_('lg.plan')} | ${L_('lg.actual')} | ${L_('col.status')} |`, '|---|---|---|---|---|---|');
    tasks.forEach(t => L.push(`| ${t.milestone ? '◆ ' : ''}${cell(t.name)} | ${cell(t.owner)} | ${md(t.end)} | ${plannedPct(t, b)}% | ${t.progress}% | ${lb('taskStatus', t.status)} |`));
  } else {
    H2('rp.s.phases');
    L.push(`| ${L_('col.phase')} | ${L_('ph.period')} | ${L_('ph.contractType')} | ${L_('lg.plan')} | ${L_('lg.actual')} | ${L_('rp.diff')} | ${L_('ph.gate')} | ${L_('rp.state')} |`, '|---|---|---|---|---|---|---|---|');
    state.phases.forEach(p => { const ts = tasksOf(p.id), pm = metrics(ts, b), {s, e} = phaseRange(p), gap = pm.actual - pm.planned;
      const st = ts.length && ts.every(isDone) ? L_('rp.st.done') : pm.planned === 0 ? L_('rp.st.notStarted') : gap <= -20 ? '🔴 ' + L_('rp.st.late') : gap <= -10 ? '🟡 ' + L_('rp.st.watch') : '🟢 ' + L_('rp.st.ok');
      L.push(`| ${cell(p.code + ' ' + p.name)} | ${md(s)}〜${md(e)} | ${lb('contract', p.contract)} | ${pm.planned}% | ${pm.actual}% | ${gap > 0 ? '+' : ''}${gap}pt | ${lb('gate', p.gate)} | ${st} |`); });
  }

  H2('rp.s.alerts');
  const main = alerts.filter(a => a.sev !== 'L');
  if (main.length) {
    L.push(`| ${L_('col.sev')} | ${L_('col.alertType')} | ${L_('col.target')} | ${L_('col.owner')} | ${L_('col.detail')} |`, '|---|---|---|---|---|');
    main.slice(0, 15).forEach(a => L.push(`| ${sevTxt(a.sev)} | ${L_('at.' + a.type)} | ${cell(a.target)} | ${cell(a.owner)} | ${cell(a.detail)} |`));
    const low = alerts.length - main.length; if (low) L.push('', L_('rp.lowMore', low));
  } else L.push(L_('empty.alerts'));

  H2('rp.s.raid');
  const raidSorted = openRaid.sort((x, y) => (x.category === 'contract' ? -1 : 0) - (y.category === 'contract' ? -1 : 0) || (SEV_ORDER[x.impact] ?? 3) - (SEV_ORDER[y.impact] ?? 3));
  if (raidSorted.length) {
    L.push(`| ID | ${L_('col.type')} | ${L_('col.phase')} | ${L_('col.category')} | ${L_('col.title')} | ${L_('col.impact')} | ${L_('col.owner')} | ${L_('col.due')} | ${L_('col.mitigation')} |`, '|---|---|---|---|---|---|---|---|---|');
    raidSorted.slice(0, 12).forEach(r => L.push(`| ${cell(r.id)} | ${lb('raidType', r.type)} | ${cell(r.phaseId ? phaseName(r.phaseId, lang) : L_('common.common'))} | ${lb('raidCat', r.category)} | ${cell(r.title)} | ${lb('level', r.impact)} | ${cell(r.owner)} | ${md(r.due)}${r.due && d2n(r.due) < b ? ' ⚠' : ''} | ${cell(r.mitigation || L_('rp.notFilled'))} |`));
  } else L.push(L_('empty.raid'));

  H2('rp.s.cr');
  const crs = state.crs.filter(c => inScope(c) && !['done','rejected'].includes(c.status) || (inScope(c) && c.decided && d2n(c.decided) > b - 7));
  if (crs.length) {
    L.push(`| ID | ${L_('col.title')} | ${L_('cr.scope')} | ${L_('cr.schedule')} | ${L_('cr.cost')} | ${L_('col.status')} | ${L_('col.raised')} |`, '|---|---|---|---|---|---|---|');
    crs.forEach(c => L.push(`| ${cell(c.id)} | ${cell(c.title)} | ${cell(c.scope)} | ${c.schedule || 0} | ${cell(c.cost)} | ${lb('crStatus', c.status)} | ${md(c.raised)} |`));
  } else L.push(L_('empty.crs'));

  H2('rp.s.meetings');
  const held = state.meetings.filter(x => inScope(x) && x.status === 'done' && d2n(x.date) > b - 7 && d2n(x.date) <= b);
  if (held.length) held.forEach(x => { L.push(`**${md(x.date)} ${x.title}**`); x.decisions.forEach(d => L.push(`- ${L_('rp.decision')}：${d.text}`)); if (!x.decisions.length) L.push(`- ${L_('rp.noDecision')}`); });
  else L.push(L_('rp.noMeetings'));
  const open = state.meetings.filter(x => inScope(x) && x.status !== 'cancelled').flatMap(x => x.actions.filter(a => a.status !== 'done').map(a => ({...a, mt: x}))).sort((x, y) => (x.due || '9') < (y.due || '9') ? -1 : 1);
  if (open.length) {
    L.push('', `**${L_('rp.openActions')}**`, '', `| ${L_('col.action')} | ${L_('col.owner')} | ${L_('col.due')} | ${L_('col.meeting')} |`, '|---|---|---|---|');
    open.slice(0, 12).forEach(a => L.push(`| ${cell(a.text)} | ${cell(a.owner || '—')} | ${md(a.due)}${a.due && d2n(a.due) < b ? ' ⚠' : ''} | ${cell(md(a.mt.date) + ' ' + a.mt.title)} |`));
  }

  H2('rp.s.upcoming'); L[L.length - 1] = L[L.length - 1].replace('{0}', S.lookahead);
  const up = tasks.filter(t => !isDone(t) && ((d2n(t.start) > b && d2n(t.start) <= b + S.lookahead) || (d2n(t.end) >= b && d2n(t.end) <= b + S.lookahead))).map(t => ({d: d2n(t.start) > b ? t.start : t.end, k: t.milestone ? '◆ MS' : d2n(t.start) > b ? L_('rp.startPlan') : L_('rp.endPlan'), name: t.name, owner: t.owner}));
  state.meetings.filter(x => inScope(x) && x.status === 'planned' && d2n(x.date) >= b && d2n(x.date) <= b + S.lookahead).forEach(x => up.push({d: x.date, k: L_('col.meeting'), name: x.title, owner: x.organizer}));
  if (up.length) { L.push(`| ${L_('rp.date')} | ${L_('rp.kind')} | ${L_('rp.item')} | ${L_('col.owner')} |`, '|---|---|---|---|'); up.sort((x, y) => x.d < y.d ? -1 : 1).forEach(u => L.push(`| ${md(u.d)} | ${u.k} | ${cell(u.name)} | ${cell(u.owner)} |`)); }
  else L.push(L_('rp.noUpcoming'));

  H2('rp.s.requests');
  const req = lines(state.report.requests);
  if (req.length) req.forEach(x => L.push(`- ${x.replace(/^[-・*]\s*/, '')}`));
  else {
    const auto = alerts.filter(a => a.sev === 'H' && ['noMitigation','msRisk','raidOverdue','contractOverrun','gateOverdue'].includes(a.type));
    const crWait = state.crs.filter(c => inScope(c) && c.status === 'pending');
    if (auto.length || crWait.length) { L.push(L_('rp.autoReq')); auto.forEach(a => L.push(`- ${a.target}：${a.detail}`)); crWait.forEach(c => L.push(`- ${L_('rp.crDecision', c.id, c.title)}`)); }
    else L.push(L_('common.none'));
  }
  return L.join('\n');
}
function renderReport(v, ctx){
  const rl = ui.reportLang || LANG();
  const mdText = buildReport(rl);
  v.innerHTML = `
  <div class="card no-print" style="margin-bottom:14px">
    <h2>${t('rp.make')}<span class="hint">${t('rp.makeHint')}</span></h2>
    <div class="grid two">
      <label class="lbl-block">${t('rp.topicsF')}${fld('report', 0, 'topics', state.report.topics, {type:'textarea', rows:3, ph: t('rp.topicsPh')})}</label>
      <label class="lbl-block">${t('rp.requestsF')}${fld('report', 0, 'requests', state.report.requests, {type:'textarea', rows:3, ph: t('rp.requestsPh')})}</label>
    </div>
    <div class="bar" style="margin:12px 0 0">
      <div class="seg"><button class="${rl === 'ja' ? 'on' : ''}" data-rl="ja">日本語</button><button class="${rl === 'en' ? 'on' : ''}" data-rl="en">English</button></div>
      <button class="btn primary" id="rCopy">${t('rp.copy')}</button>
      <button class="btn" id="rDl">${t('rp.dl')}</button>
      <button class="btn" id="rPrint">${t('rp.print')}</button>
      <span class="sp"></span>
      <button class="btn" id="rSnap" title="${t('rp.snapHint')}">${t('rp.snap')}</button>
    </div>
    <div class="muted" style="font-size:12px;margin-top:6px">${ui.scope ? t('rp.scopePhase', phaseName(ui.scope)) : t('rp.scopeAll')}</div>
  </div>
  <div class="report" id="reportPreview">${mdToHtml(mdText)}</div>`;
  v.querySelectorAll('[data-rl]').forEach(el => el.onclick = () => { ui.reportLang = el.dataset.rl; render(); });
  $('#rCopy').onclick = () => copyText(mdText);
  $('#rDl').onclick = () => download(`${tl(rl, 'rp.fileName')}_${safeName(state.project.code)}${ui.scope ? '_' + (phaseOf(ui.scope) || {}).code : ''}_${baseDate()}.md`, mdText, 'text/markdown');
  $('#rPrint').onclick = () => window.print();
  $('#rSnap').onclick = () => {
    const d = baseDate(); state.snapshots = state.snapshots.filter(s => !(s.date === d && (s.scope || '') === ui.scope));
    state.snapshots.push({date: d, scope: ui.scope, planned: ctx.m.planned, actual: ctx.m.actual, spi: ctx.m.spi, high: ctx.alerts.filter(a => a.sev === 'H').length});
    save(); toast(t('rp.snapDone', ymd(d)));
  };
}

// ============ 設定・データ ============
function renderSettings(v){
  const P = state.project, S = state.settings;
  const pf = (k, l, type) => `<label>${l}${fld('project', 0, k, P[k], {type})}</label>`;
  const sf = (k, step) => `<label>${t('set.' + k)}${fld('settings', 0, k, S[k], {type:'number', step})}</label>`;
  v.innerHTML = `
  <div class="card"><h2>${t('set.project')}</h2><div class="form-grid">
    ${pf('name', t('set.name'))}${pf('companyCode', t('ws.co'))}${pf('teamCode', t('ws.team'))}${pf('code', t('nm.pjCode'))}${pf('client', t('rp.client'))}${pf('pm', 'PM')}${pf('start', t('ph.start'), 'date')}${pf('end', t('ph.end'), 'date')}${pf('baseDate', t('set.baseDate'), 'date')}
  </div></div>
  <div class="card" style="margin-top:14px"><h2>${t('set.thresholds')}<span class="hint">${t('set.thHint')}</span></h2><div class="form-grid">
    ${sf('lagWarn')}${sf('lagHigh')}${sf('extendDays')}${sf('staleDays')}${sf('lookahead')}${sf('overloadCount')}${sf('issueAgeDays')}${sf('meetingLead')}${sf('crStallDays')}${sf('spiAmber', 0.01)}${sf('spiRed', 0.01)}
  </div></div>
  <div class="card" style="margin-top:14px"><h2>${t('set.data')}</h2>
    <p class="muted" style="margin-top:0">${t('set.dataHint')}</p>
    <p class="muted small">${t('set.boot', ui.bootMs || '—')}</p>
    <div class="bar">
      <button class="btn primary" id="expJson">${t('set.backup')}</button>
      <button class="btn" id="impJson">${t('set.restore')}</button>
      <input type="file" id="jsonFile" accept=".json,application/json" hidden>
      <button class="btn" id="impAsProject" title="${t('ws.importHint')}">${t('ws.import')}</button><input type="file" id="jsonFile2" accept=".json,application/json" hidden>
      <span class="sp"></span>
      <button class="btn" id="resetSample">${t('set.sample')}</button>
      <button class="btn danger" id="clearAll">${t('set.blank')}</button>
      <button class="btn danger" id="delProject">${t('ws.deleteThis')}</button>
    </div>
  </div>`;
  $('#expJson').onclick = () => download(`PMO_${safeName(P.code || P.name)}_${todayStr()}.json`, JSON.stringify(state, null, 2), 'application/json');
  $('#impJson').onclick = () => $('#jsonFile').click();
  $('#jsonFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.tasks) throw 0; if (!confirm(t('set.restoreConfirm'))) return; state = d.version === 2 ? d : migrateV1(d); normalize(); save(); render(); toast(t('set.restored')); } catch(err) { alert(t('set.restoreFail')); } }; r.readAsText(f); e.target.value = ''; };
  $('#impAsProject').onclick = () => $('#jsonFile2').click();
  $('#jsonFile2').onchange = e => { const f = e.target.files[0]; if (f) readJsonFile(f, importProjectData); e.target.value = ''; };
  $('#delProject').onclick = () => deleteProject(ws.current);
  $('#resetSample').onclick = () => { if (confirm(t('set.sampleConfirm'))) { state = sample(LANG()); ui.scope = ''; ui.meetingId = ''; normalize(); save(); render(); } };
  $('#clearAll').onclick = () => openWizard();
}
