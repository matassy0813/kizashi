// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ はじめかた（3ステップで自分のプロジェクトを始める） ============
// 導入の手間を最小にするため、フェーズ・マイルストーン・定例・体制のひな形まで一度に作る
const PHASE_TPL = {
  si:     {ja: ['要件定義','基本設計','詳細設計','開発','テスト','移行'], en: ['Requirements','Basic design','Detailed design','Build','Test','Cutover']},
  consult:{ja: ['現状分析','将来像設計','実行計画','導入・定着'], en: ['As-is analysis','To-be design','Roadmap','Implementation']},
  agile:  {ja: ['準備','開発スプリント','リリース準備','運用移行'], en: ['Discovery','Sprints','Release prep','Hypercare']},
  custom: {ja: [], en: []},
};
function openWizard(){
  const lang = LANG(), s = todayStr();
  ui.wiz = {step: 1, name: '', code: '', client: '', pm: '', start: s, end: n2d(d2n(s) + 180), tpl: 'si', phases: PHASE_TPL.si[lang].join('\n'), weekly: true};
  drawWizard();
  $('#wizard').showModal();
}
function drawWizard(){
  const w = ui.wiz, d = $('#wizard');
  const inp = (k, type = 'text', ph = '') => `<input type="${type}" data-wz="${k}" value="${esc(w[k])}" placeholder="${esc(ph)}">`;
  const steps = [1, 2, 3].map(n => `<span class="${w.step === n ? 'on' : w.step > n ? 'ok' : ''}">${n}. ${t('wz.s' + n)}</span>`).join('');
  let body = '';
  if (w.step === 1) body = `<p class="muted">${t('wz.s1d')}</p><div class="form-grid">
    <label>${t('set.name')} <span class="req">${t('mtg.required')}</span>${inp('name', 'text', t('wz.namePh'))}</label>
    <label>${t('ws.co')}${inp('co', 'text', 'ACME')}</label>
    <label>${t('ws.team')}${inp('team', 'text', 'PMO-1')}</label>
    <label>${t('nm.pjCode')}${inp('code', 'text', 'ERP')}</label>
    <label>${t('rp.client')}${inp('client')}</label>
    <label>PM（${t('wz.you')}）${inp('pm')}</label>
    <label>${t('login.newPin', MIN_PIN)} <span class="req">${t('mtg.required')}</span><input type="password" data-wz="pin" autocomplete="new-password"></label>
    <label>${t('ph.start')}${inp('start', 'date')}</label>
    <label>${t('ph.end')}${inp('end', 'date')}</label></div>`;
  else if (w.step === 2) body = `<p class="muted">${t('wz.s2d')}</p>
    <div class="tpl-grid">${Object.keys(PHASE_TPL).map(k => `<button class="tpl ${w.tpl === k ? 'on' : ''}" data-tpl="${k}"><b>${t('wz.tpl.' + k)}</b><small>${esc(PHASE_TPL[k][LANG()].join(' → ') || t('wz.tplCustom'))}</small></button>`).join('')}</div>
    <label class="lbl-block" style="margin-top:12px">${t('wz.phaseList')}<textarea data-wz="phases" rows="6">${esc(w.phases)}</textarea></label>
    <label class="chk" style="margin-top:10px"><input type="checkbox" data-wz="weekly" ${w.weekly ? 'checked' : ''}> ${t('wz.weekly')}</label>`;
  else body = `<p class="muted">${t('wz.s3d')}</p>
    <div class="wz-summary">
      <div><span class="muted small">${t('set.name')}</span><b>${esc(w.name)}</b></div>
      <div><span class="muted small">${t('ph.period')}</span><b>${ymd(w.start)} 〜 ${ymd(w.end)}</b></div>
      <div><span class="muted small">${t('tab.phases')}</span><b>${esc(lines(w.phases).join(' → '))}</b></div>
    </div>
    <ul class="wz-will">${['wz.will1','wz.will2','wz.will3','wz.will4'].map(k => `<li>${t(k)}</li>`).join('')}</ul>
    <div class="bar" style="margin-top:12px"><button class="btn" id="wzCsv">${t('wz.csv')}</button><span class="muted small">${t('wz.csvHint')}</span><input type="file" id="wzFile" accept=".csv,text/csv" hidden></div>`;
  d.innerHTML = `<form method="dialog" class="wz">
    <div class="wz-head"><h2>${t('wz.title')}</h2><button class="btn ghost" value="cancel" formnovalidate>✕</button></div>
    <div class="wz-steps">${steps}</div>
    <div class="wz-body">${body}</div>
    <div class="wz-foot">${w.step > 1 ? `<button type="button" class="btn" data-wz-go="-1">${t('wz.back')}</button>` : ''}<span class="sp"></span>
      ${w.step < 3 ? `<button type="button" class="btn primary" data-wz-go="1">${t('wz.next')}</button>` : `<button type="button" class="btn primary" id="wzDone">${t('wz.start')}</button>`}</div>
  </form>`;
  d.querySelectorAll('[data-wz]').forEach(el => el.addEventListener('input', () => { w[el.dataset.wz] = el.type === 'checkbox' ? el.checked : el.value; }));
  d.querySelectorAll('[data-tpl]').forEach(el => el.onclick = e => { e.preventDefault(); w.tpl = el.dataset.tpl; w.phases = PHASE_TPL[w.tpl][LANG()].join('\n'); drawWizard(); });
  d.querySelectorAll('[data-wz-go]').forEach(el => el.onclick = () => {
    const dir = +el.dataset.wzGo;
    if (dir > 0 && w.step === 1 && !w.name.trim()) { d.querySelector('[data-wz="name"]').focus(); toast(t('wz.needName')); return; }
    if (dir > 0 && w.step === 1 && String(w.pin || '').length < MIN_PIN) { d.querySelector('[data-wz="pin"]').focus(); toast(t('login.errShort', MIN_PIN)); return; }
    if (dir > 0 && w.step === 2 && !lines(w.phases).length) { toast(t('wz.needPhase')); return; }
    w.step += dir; drawWizard();
  });
  const done = $('#wzDone'); if (done) done.onclick = async () => { await finishWizard(); d.close(); };
  const csv = $('#wzCsv'); if (csv) { csv.onclick = () => $('#wzFile').click(); $('#wzFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; await finishWizard(); d.close(); importCsv(f); }; }
}
async function finishWizard(){
  const w = ui.wiz, lang = LANG(), names = lines(w.phases);
  wsBeginNewProject(); ui.wiz = w; // 今のプロジェクトは保存して残し、新しいプロジェクトの枠を作る
  ui.scope = '';
  const s = d2n(w.start), e = Math.max(d2n(w.end) || s + 180, s + names.length), span = (e - s + 1) / names.length;
  const pm = w.pm.trim();
  state = { version: 2, project: {name: w.name.trim(), code: (w.code || 'PJ').trim(), companyCode: (w.co || '').trim(), teamCode: (w.team || '').trim(), client: w.client.trim(), pm, start: w.start, end: n2d(e), baseDate: '', lang},
    settings: {...DEFAULT_SETTINGS}, phases: [], tasks: [], raid: [], meetings: [], crs: [], snapshots: [], org: [], report: {topics: '', requests: ''} };
  state.naming = defaultNaming(lang); state.meetingTypes = meetingTypeTemplates(lang);
  names.forEach((n, i) => {
    const ps = n2d(Math.round(s + i * span)), pe = n2d(Math.round(s + (i + 1) * span) - 1), id = 'P' + (i + 1);
    state.phases.push({...newPhase(id, n, pad((i + 1) * 10)), start: ps, end: pe, owner: pm});
    state.tasks.push({id: 'T' + pad(i + 1), phaseId: id, name: t('wz.msName', n), owner: pm, start: pe, end: pe, baselineEnd: pe, progress: 0, status: 'todo', milestone: true, updated: todayStr()});
  });
  state.governance = governanceTemplates(lang);
  state.org.push({id: 'O01', name: pm || 'PM', role: 'PM', access: 'pm', org: 'us', parentId: '', note: ''});
  if (!pm) state.project.pm = 'PM';
  state.org[0].pin = await makeSecret(w.pin);
  ui.me = 'O01';
  if (w.weekly && state.meetingTypes[0]) {
    const first = s + ((8 - new Date(s * 864e5).getUTCDay()) % 7 || 7); // 開始後最初の月曜
    for (let k = 0; k < 8; k++) createMeeting(state.meetingTypes[0].id, n2d(first + k * 7));
  }
  ui.scope = ''; ui.meetingId = ''; ui.orgSel = ''; ui.tab = 'dash';
  normalize(); save(); render(true); toast(t('wz.done'));
}
