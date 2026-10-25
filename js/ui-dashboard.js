// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ダッシュボード ============
function renderDash(v, {b, m, alerts, rag, sev}){
  const S = state.settings, prev = prevSnapshot();
  const spiDelta = prev ? Math.round((m.spi - prev.spi) * 100) / 100 : null;
  const cnt = s => alerts.filter(a => a.sev === s).length;
  const openRaid = state.raid.filter(r => inScope(r) && r.status !== 'closed' && (r.type === 'risk' || r.type === 'issue'));
  const nextMs = scopedTasks().filter(t => t.milestone && !isDone(t) && d2n(t.end) >= b).sort((x, y) => d2n(x.end) - d2n(y.end))[0];
  const spiCls = m.spi < S.spiRed ? 'red' : m.spi < S.spiAmber ? 'amber' : 'green';
  const ms = meetingStats(b), gs = govStats();
  const pct = (a, n) => n ? Math.round(a / n * 100) : 100;
  const phaseCard = ui.scope ? phaseSummary(phaseOf(ui.scope), b, alerts) : '';
  v.innerHTML = `
  ${state.isSample ? `<div class="card banner" style="margin-bottom:14px">${t('dash.sample')} <button class="btn primary" data-wizard>${t('dash.start')}</button></div>` : ''}
  ${phaseCard}
  <div class="grid kpis">
    <div class="card kpi"><div class="lbl">${t('kpi.status')}</div><div class="val">${ragBadge(rag)}</div><div class="note">${t('kpi.asOf', ymd(baseDate()))}</div></div>
    <div class="card kpi"><div class="lbl">${t('kpi.progress')}</div><div class="val"><span data-count="${m.actual}">${m.actual}</span><small>%</small> <small>/ ${m.planned}%</small></div><div class="note ${m.actual < m.planned ? 'amber' : ''}">${t('kpi.variance', (m.actual - m.planned > 0 ? '+' : '') + (m.actual - m.planned))}</div></div>
    <div class="card kpi"><div class="lbl">${t('kpi.spi')}<button class="info" data-help-open="spi" title="${t('kpi.spiWhat')}" aria-label="${t('kpi.spiWhat')}">i</button></div><div class="val ${spiCls}"><span data-count="${m.spi}" data-dec="2">${m.spi.toFixed(2)}</span></div><div class="note">${spiDelta === null ? t('kpi.noPrev') : t('kpi.vsPrev', (spiDelta >= 0 ? '+' : '') + spiDelta.toFixed(2)) + (spiDelta < 0 ? ' ↓' : spiDelta > 0 ? ' ↑' : ' →')}</div></div>
    <div class="card kpi"><div class="lbl">${t('kpi.alerts')}</div><div class="val"><span class="red" data-count="${cnt('H')}">${cnt('H')}</span> <small>/ ${cnt('M')} / ${cnt('L')}</small></div><div class="note">${t('kpi.overdueN', alerts.filter(a => a.type === 'overdue').length)}</div></div>
    <div class="card kpi"><div class="lbl">${t('kpi.raid')}</div><div class="val"><span data-count="${openRaid.length}">${openRaid.length}</span></div><div class="note">${t('kpi.raidNote', openRaid.filter(r => r.impact === 'H').length, openRaid.filter(r => r.category === 'contract').length)}</div></div>
    <div class="card kpi"><div class="lbl">${t('kpi.nextMs')}</div><div class="val" style="font-size:16px">${nextMs ? esc(nextMs.name) : '—'}</div><div class="note ${nextMs && sev[nextMs.id] ? 'red' : ''}">${nextMs ? t('kpi.msNote', ymd(nextMs.end), d2n(nextMs.end) - b) + (sev[nextMs.id] ? ' ⚠ ' + t('kpi.msRisk') : '') : ''}</div></div>
    <div class="card kpi clickable" data-tab="meetings"><div class="lbl">${t('kpi.meetings')}</div><div class="val ${ms.overdue.length ? 'amber' : ''}"><span data-count="${pct(ms.recorded, ms.past.length)}">${pct(ms.recorded, ms.past.length)}</span><small>%</small></div><div class="note">${t('kpi.mtgNote', pct(ms.withAgenda, ms.upcoming.length), ms.overdue.length)}</div></div>
    <div class="card kpi clickable" data-tab="governance"><div class="lbl">${t('kpi.gov')}</div><div class="val ${gs.agreed < gs.total ? 'amber' : 'green'}"><span data-count="${gs.agreed}">${gs.agreed}</span><small> / ${gs.total}</small></div><div class="note">${t('kpi.govNote', gs.draft, gs.total - gs.agreed - gs.draft)}</div></div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>${ui.scope ? t('dash.taskProgress') : t('dash.phaseProgress')}<span class="hint">${t('dash.phaseHint')}</span></h2>${ui.scope ? taskBars(b, sev) : phaseBars(b)}
      <div class="legend"><span><i style="background:var(--plan)"></i>${t('lg.plan')}</span><span><i style="background:var(--accent)"></i>${t('lg.actual')}</span><span><i style="background:var(--amber)"></i>${t('lg.behind10')}</span><span><i style="background:var(--red)"></i>${t('lg.behind20')}</span></div></div>
    <div class="card"><h2>${t('dash.alerts')}<span class="hint">${t('dash.alertsHint')}</span></h2>${alertList(alerts.slice(0, 7))}
      ${alerts.length > 7 ? `<button class="btn ghost" data-tab="alerts">${t('dash.showAll', alerts.length)} →</button>` : ''}</div>
  </div>
  <div class="card" style="margin-top:14px"><h2>${t('dash.gantt')}<span class="hint">${t('dash.ganttHint')}</span></h2>${gantt(b, sev)}</div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>${t('dash.upcomingMtg')}</h2>${upcomingMeetings(ms.upcoming.slice(0, 5), b, sev)}</div>
    <div class="card"><h2>${t('dash.raid')}</h2>${raidMini(openRaid)}</div>
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>${t('dash.trend')}<span class="hint">${t('dash.trendHint')}</span></h2>${trendChart(m)}</div>
    <div class="card"><h2>${t('dash.openActions')}</h2>${actionMini(ms.open, b)}</div>
  </div>`;
}
function phaseSummary(p, b, alerts){
  if (!p) return '';
  const {s, e} = phaseRange(p), ce = p.contractEnd;
  const pa = alerts.filter(a => a.phaseId === p.id && ['gateOverdue','gateNotReady','contractOverrun'].includes(a.type));
  return `<div class="card phase-head" style="margin-bottom:14px">
    <div class="ph-title"><span class="code">${esc(p.code)}</span><h2 style="margin:0">${esc(p.name)}</h2><span class="tag">${lbl('contract', p.contract)}</span><span class="gate ${p.gate}">${t('ph.gate')}：${lbl('gate', p.gate)}</span></div>
    <div class="ph-meta">
      <div><span class="muted">${t('ph.period')}</span> ${ymd(s)} 〜 ${ymd(e)}</div>
      <div><span class="muted">${t('ph.contract')}</span> ${esc(p.contractRef || '—')}${ce ? `（${t('ph.contractEndShort')} ${ymd(ce)}）` : ''}</div>
      <div><span class="muted">${t('ph.owner')}</span> ${esc(p.owner || '—')}</div>
    </div>
    ${pa.length ? `<div style="margin-top:8px">${pa.map(a => `<div class="red" style="font-size:13px">⚠ ${esc(t('at.' + a.type))}：${esc(a.detail)}</div>`).join('')}</div>` : ''}
  </div>`;
}
function bar(name, sub, m, done){
  const gap = m.planned - m.actual;
  const col = gap >= 20 ? 'var(--red)' : gap >= 10 ? 'var(--amber)' : done ? 'var(--done)' : 'var(--accent)';
  return `<div class="phase-row"><div class="nm">${name}<small>${sub}</small></div>
    <div class="track"><div class="pl" style="width:${m.planned}%"></div><div class="ac" style="width:${m.actual}%;background:${col}"></div></div>
    <div class="fig">${t('lg.actual')} <b>${m.actual}%</b> / ${t('lg.plan')} ${m.planned}%${gap > 0 ? ` <span class="${gap >= 20 ? 'red' : gap >= 10 ? 'amber' : 'muted'}">(-${gap})</span>` : ''}</div></div>`;
}
function phaseBars(b){
  if (!state.phases.length) return `<div class="empty">${t('empty.phases')}</div>`;
  return state.phases.map(p => {
    const ts = tasksOf(p.id), {s, e} = phaseRange(p);
    return bar(`<span class="link" data-scope="${p.id}">${esc(p.code)} ${esc(p.name)}</span>`, `${md(s)}〜${md(e)}　<span class="gate ${p.gate}">${lbl('gate', p.gate)}</span>`, metrics(ts, b), ts.length && ts.every(isDone));
  }).join('');
}
function taskBars(b, sev){
  const ts = scopedTasks().filter(t => !t.milestone);
  if (!ts.length) return `<div class="empty">${t('empty.tasks')}</div>`;
  return ts.map(x => bar(esc(x.name), `${esc(x.owner)} ${md(x.start)}〜${md(x.end)}`, {planned: plannedPct(x, b), actual: +x.progress || 0}, isDone(x))).join('');
}
function alertList(list){
  if (!list.length) return `<div class="empty">${t('empty.alerts')}</div>`;
  return `<ul class="alert-list">${list.map(a => `<li>${sevBadge(a.sev)}<div><div class="t">${esc(t('at.' + a.type))}：${esc(a.target)}</div><div class="d">${esc(a.detail)}${a.owner ? `　${t('col.owner')}：${esc(a.owner)}` : ''}${!ui.scope && a.phaseId ? `　[${esc(phaseName(a.phaseId))}]` : ''}</div></div></li>`).join('')}</ul>`;
}
function raidMini(list){
  if (!list.length) return `<div class="empty">${t('empty.raid')}</div>`;
  const sorted = [...list].sort((x, y) => (SEV_ORDER[x.impact] ?? 3) - (SEV_ORDER[y.impact] ?? 3));
  const b = d2n(baseDate());
  return `<div class="scroll-x"><table><tr><th>ID</th><th>${t('col.type')}</th><th>${t('col.category')}</th><th>${t('col.title')}</th><th>${t('col.impact')}</th><th>${t('col.owner')}</th><th>${t('col.due')}</th></tr>${sorted.slice(0, 6).map(r => `<tr><td>${esc(r.id)}</td><td>${lbl('raidType', r.type)}</td><td>${lbl('raidCat', r.category)}</td><td>${esc(r.title)}</td><td>${lvBadge(r.impact)}</td><td>${esc(r.owner)}</td><td class="${r.due && d2n(r.due) < b ? 'red' : ''}">${md(r.due)}</td></tr>`).join('')}</table></div>`;
}
function upcomingMeetings(list, b, sev){
  if (!list.length) return `<div class="empty">${t('empty.upcoming')}</div>`;
  return `<ul class="alert-list">${list.map(m => `<li><div class="date-chip">${md(m.date)}<small>${esc(m.time || '')}</small></div><div style="flex:1"><div class="t"><span class="link" data-open-mtg="${m.id}">${esc(m.title)}</span></div><div class="d">${t('mtg.agendaN', m.agenda.length)}${m.purpose ? '' : `　<span class="amber">${t('mtg.noPurpose')}</span>`}${m.agenda.length ? '' : `　<span class="red">${t('mtg.noAgenda')}</span>`}</div></div></li>`).join('')}</ul>`;
}
function actionMini(open, b){
  if (!open.length) return `<div class="empty">${t('empty.actions')}</div>`;
  const sorted = [...open].sort((x, y) => (x.due || '9') < (y.due || '9') ? -1 : 1);
  return `<div class="scroll-x"><table><tr><th>${t('col.action')}</th><th>${t('col.owner')}</th><th>${t('col.due')}</th><th>${t('col.meeting')}</th></tr>${sorted.slice(0, 6).map(a => `<tr><td>${esc(a.text)}</td><td>${esc(a.owner || '—')}</td><td class="${a.due && d2n(a.due) < b ? 'red' : ''}">${md(a.due)}</td><td class="muted">${md(a.meeting.date)} ${esc(a.meeting.title)}</td></tr>`).join('')}</table></div>`;
}
function gantt(b, sev){
  const ts = scopedTasks().filter(x => x.start && x.end && activeTask(x));
  if (!ts.length) return `<div class="empty">${t('empty.tasks')}</div>`;
  let min = Math.min(...ts.map(x => d2n(x.start)), b), max = Math.max(...ts.map(x => Math.max(d2n(x.end), d2n(x.baselineEnd) || 0)), b);
  min -= 3; max += 4;
  const L = 250, W = 1100, R = W - L - 12, rh = 22, top = 30, H = top + ts.length * rh + 6;
  const x = n => L + (n - min) / (max - min) * R;
  let g = '', lastPhase = null, band = false;
  ts.forEach((tk, i) => { if (tk.phaseId !== lastPhase) { band = !band; lastPhase = tk.phaseId; } if (band) g += `<rect x="0" y="${top + i * rh}" width="${W}" height="${rh}" class="g-band"/>`; });
  const d0 = new Date(min * 864e5);
  for (let y = d0.getUTCFullYear(), mo = d0.getUTCMonth() + 1; ; mo++) {
    const n = Date.UTC(y, mo, 1) / 864e5; if (n > max) break;
    g += `<line x1="${x(n)}" y1="${top - 8}" x2="${x(n)}" y2="${H}" class="g-grid"/><text x="${x(n) + 4}" y="${top - 12}" class="g-tick">${t('month', new Date(n * 864e5).getUTCMonth() + 1)}</text>`;
  }
  // 契約終了日
  const cEnds = (ui.scope ? [phaseOf(ui.scope)] : state.phases).filter(p => p && p.contractEnd);
  cEnds.forEach(p => { const cx = x(d2n(p.contractEnd) + 1); if (cx > L && cx < W) {
    const rows = ts.map((tk, i) => tk.phaseId === p.id ? i : -1).filter(i => i >= 0);
    if (rows.length) g += `<line x1="${cx}" x2="${cx}" y1="${top + rows[0] * rh}" y2="${top + (rows[rows.length - 1] + 1) * rh}" class="g-contract"><title>${esc(p.name)} ${t('ph.contractEndShort')} ${ymd(p.contractEnd)}</title></line>`;
  }});
  lastPhase = null;
  ts.forEach((tk, i) => {
    const y = top + i * rh, s = d2n(tk.start), e = d2n(tk.end), be = d2n(tk.baselineEnd), cy = y + rh / 2;
    const cls = isDone(tk) ? 'done' : (sev[tk.id] === 'L' ? '' : sev[tk.id] || '');
    const ph = phaseOf(tk.phaseId), phaseLbl = tk.phaseId !== lastPhase ? (ph ? ph.code + ' ' + ph.name : '') : ''; lastPhase = tk.phaseId;
    const nm = tk.name.length > 20 ? tk.name.slice(0, 19) + '…' : tk.name;
    g += `<text x="6" y="${cy + 4}" class="g-phase">${esc(phaseLbl.length > 9 ? phaseLbl.slice(0, 9) + '…' : phaseLbl)}</text><text x="78" y="${cy + 4}" class="g-label">${esc(nm)}</text>`;
    if (tk.milestone) {
      const cx = x(e + 0.5);
      g += `<path d="M${cx} ${cy - 7} L${cx + 7} ${cy} L${cx} ${cy + 7} L${cx - 7} ${cy} Z" class="g-ms ${cls}"><title>${esc(tk.name)} ${ymd(tk.end)}</title></path>`;
    } else {
      if (!isNaN(be) && be !== e) g += `<rect x="${x(s)}" y="${y + 4}" width="${Math.max(2, x(be + 1) - x(s))}" height="${rh - 8}" rx="3" class="g-base"/>`;
      const w = Math.max(2, x(e + 1) - x(s));
      g += `<rect x="${x(s)}" y="${y + 6}" width="${w}" height="${rh - 12}" rx="3" class="g-track"/>`;
      g += `<rect x="${x(s)}" y="${y + 6}" width="${w * Math.min(100, +tk.progress || 0) / 100}" height="${rh - 12}" rx="3" class="g-fill ${cls}"><title>${esc(tk.name)}：${ymd(tk.start)}〜${ymd(tk.end)} / ${tk.progress}%</title></rect>`;
      if (cls === 'H' || cls === 'M') g += `<rect x="${x(s)}" y="${y + 6}" width="${w}" height="${rh - 12}" rx="3" fill="none" stroke="var(--${cls === 'H' ? 'red' : 'amber'})" stroke-width="1.2"/>`;
    }
  });
  g += `<line x1="${x(b + 0.5)}" y1="${top - 4}" x2="${x(b + 0.5)}" y2="${H}" class="g-today"/><text x="${x(b + 0.5) + 4}" y="${top - 2}" class="g-todaylbl">${t('g.base')}</text>`;
  return `<div class="scroll-x"><svg viewBox="0 0 ${W} ${H}" style="min-width:760px;width:100%;display:block" role="img" aria-label="Gantt">${g}</svg></div>
    <div class="legend"><span><i style="background:var(--plan)"></i>${t('lg.plan')}</span><span><i style="border:1px dashed var(--muted)"></i>${t('lg.baseline')}</span><span><i style="background:var(--violet)"></i>${t('lg.contractEnd')}</span><span><i style="background:var(--red)"></i>${t('g.base')}</span></div>`;
}
function trendChart(m){
  const b = baseDate();
  const pts = snapshotsInScope().filter(s => s.date <= b).slice(-11).map(s => ({date: s.date, spi: s.spi}));
  if (!pts.length || pts[pts.length - 1].date !== b) pts.push({date: b, spi: m.spi, cur: true});
  const W = 520, H = 200, L = 36, Rr = 14, T = 14, B = 28, S = state.settings;
  const lo = Math.min(0.7, ...pts.map(p => p.spi)), hi = Math.max(1.15, ...pts.map(p => p.spi));
  const x = i => pts.length === 1 ? (L + W - Rr) / 2 : L + i / (pts.length - 1) * (W - L - Rr);
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const ref = (v, cls) => `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="${cls}"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" class="c-lbl">${v.toFixed(2)}</text>`;
  let g = ref(1, 'c-ref') + ref(S.spiAmber, 'c-amber') + ref(S.spiRed, 'c-red');
  g += `<polyline points="${pts.map((p, i) => `${x(i)},${y(p.spi)}`).join(' ')}" class="c-line"/>`;
  pts.forEach((p, i) => { g += `<circle cx="${x(i)}" cy="${y(p.spi)}" r="${p.cur ? 5 : 3.5}" class="c-dot"/><text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="c-lbl">${md(p.date)}${p.cur ? t('g.now') : ''}</text>`; });
  const lp = pts[pts.length - 1]; g += `<text x="${x(pts.length - 1)}" y="${y(lp.spi) - 9}" text-anchor="middle" class="c-val">${lp.spi.toFixed(2)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block" role="img" aria-label="SPI">${g}</svg>`;
}

// ============ 早期警戒タブ ============
function renderAlerts(v, {alerts}){
  const S = state.settings;
  const groups = [
    ['grp.schedule', ['overdue','lag','notStarted','extended','stale','msRisk','overload','approvalStalled','holdOverdue','carriedRepeat']],
    ['grp.phase', ['gateOverdue','gateNotReady','contractOverrun']],
    ['grp.raid', ['noMitigation','raidOverdue','issueAged','crStalled']],
    ['grp.meeting', ['noAgenda','noPurpose','noMinutes','actionOverdue','actionIncomplete']],
    ['grp.gov', ['govNotAgreed']],
  ];
  const rule = k => t('rule.' + k, S.lagWarn, S.lagHigh, S.extendDays, S.staleDays, S.lookahead, S.overloadCount, S.issueAgeDays, S.meetingLead, S.crStallDays);
  v.innerHTML = `<div class="card"><h2>${t('al.title')}<span class="hint">${t('al.hint', alerts.length)}</span></h2>
    ${alerts.length ? `<div class="scroll-x"><table><tr><th>${t('col.sev')}</th><th>${t('col.alertType')}</th><th>${t('col.target')}</th><th>${t('col.phase')}</th><th>${t('col.owner')}</th><th>${t('col.detail')}</th></tr>${alerts.map(a => `<tr><td>${sevBadge(a.sev)}</td><td style="white-space:nowrap">${esc(t('at.' + a.type))}</td><td>${esc(a.target)}</td><td>${a.phaseId ? esc(phaseName(a.phaseId)) : `<span class="muted">${t('common.common')}</span>`}</td><td>${esc(a.owner)}</td><td>${esc(a.detail)}</td></tr>`).join('')}</table></div>` : `<div class="empty">${t('empty.alerts')}</div>`}
  </div>
  <div class="card" style="margin-top:14px"><h2>${t('al.rules')}</h2><div class="scroll-x"><table>
    <tr><th>${t('col.group')}</th><th>${t('col.alertType')}</th><th>${t('col.condition')}</th></tr>
    ${groups.map(([g, ks]) => ks.map((k, i) => `<tr>${i === 0 ? `<td rowspan="${ks.length}" style="font-weight:600;vertical-align:top">${t(g)}</td>` : ''}<td style="white-space:nowrap">${t('at.' + k)}</td><td>${rule(k)}</td></tr>`).join('')).join('')}
    <tr><td style="font-weight:600">${t('kpi.status')}</td><td colspan="2">${t('rule.rag', S.spiRed, S.spiAmber)}</td></tr>
  </table></div></div>`;
}
