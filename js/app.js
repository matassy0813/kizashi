// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 画面の組み立て ============
const TABS = ['mine','dash','alerts','phases','tasks','raid','meetings','org','governance','report','settings'];
const VIEWS = {mine: renderMine, dash: renderDash, alerts: renderAlerts, phases: renderPhases, tasks: renderTasks, raid: renderRaid, meetings: renderMeetings, org: renderOrg, governance: renderGovernance, report: renderReport, settings: renderSettings};
// SF Symbols 風の線アイコン（24x24）
const ICONS = {
  mine: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21c.6-3.8 3.7-6 7.5-6s6.9 2.2 7.5 6',
  dash: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  alerts: 'M12 3l9.5 17h-19zM12 10v4M12 17.5v.5',
  phases: 'M5 21V4M5 4h11l-2 4 2 4H5',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 5.5l1 1 2-2M4 11.5l1 1 2-2M4 17.5l1 1 2-2',
  raid: 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4',
  meetings: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M8 14h3M8 17h6',
  org: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  governance: 'M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h6',
  report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
};
const icon = k => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

function render(animate){
  const ae = document.activeElement, fk = ae && ae.dataset ? ae.dataset.fk : null, sel = fk && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  const scrollY = window.scrollY;
  const lang = LANG(); document.documentElement.lang = lang;
  if (!me()) { renderLoginScreen(); return; }
  document.body.classList.remove('locked');
  const role = myRole(), tabs = ROLE_TABS[role];
  if (!tabs.includes(ui.tab)) ui.tab = ROLE_HOME[role];
  const b = d2n(baseDate()), alerts = computeAlerts(lang).filter(scopeAlert), m = metrics(scopedTasks(), b), rag = computeRag(m, alerts);
  const ctx = {b, m, alerts, rag, sev: sevMap(alerts), lang};
  document.title = `${state.project.name} | Kizashi`;
  $('#pjName').textContent = state.project.name || 'PMO';
  $('#pjSwitch').title = t('ws.open');
  $('#pjSub').textContent = [codeChain({co: state.project.companyCode, team: state.project.teamCode, pj: state.project.code}), state.project.client, state.project.pm && `PM: ${state.project.pm}`, state.project.start && `${ymd(state.project.start)}〜${ymd(state.project.end)}`].filter(Boolean).join('　·　');
  $('#scopeSel').innerHTML = `<option value="">${t('scope.all')}</option>${state.phases.map(p => `<option value="${p.id}" ${p.id === ui.scope ? 'selected' : ''}>${esc(p.code)} ${esc(p.name)}</option>`).join('')}`;
  $('#scopeLbl').textContent = t('scope.label');
  $('#baseLbl').textContent = t('hdr.baseDate');
  $('#baseDate').value = state.project.baseDate || '';
  $('#baseDate').title = t('hdr.baseHint');
  $('#langSeg').innerHTML = ['ja','en'].map(l => `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l === 'ja' ? '日本語' : 'EN'}</button>`).join('');
  $('#hdrRag').innerHTML = ragBadge(rag);
  const cnt = {alerts: alerts.filter(a => a.sev === 'H').length, meetings: alerts.filter(a => ['noAgenda','noMinutes','actionOverdue'].includes(a.type)).length, governance: alerts.filter(a => a.type === 'govNotAgreed').length};
  // ログイン中の本人（切り替えはできない。別の人はログアウトしてから自分で入る）
  const mp = me();
  $('#meBox').innerHTML = `<span class="avatar xs">${esc(mp.name.slice(0, 1))}</span><span class="me-name">${esc(mp.name)}<small>${t('roleShort.' + (mp.access || 'member'))}</small></span><button class="btn ghost" data-logout>${t('login.logout')}</button>`;
  $('#tabs').innerHTML = TABS.filter(k => tabs.includes(k)).map(k => `<button data-tab="${k}" class="${ui.tab === k ? 'on' : ''}" title="${t('tabd.' + k)}">${icon(k)}<span class="lbl">${t('tab.' + k)}</span>${cnt[k] ? `<span class="cnt ${k === 'alerts' ? '' : 'warn'}">${cnt[k]}</span>` : ''}</button>`).join('');
  // 今どこで何をしているか：パンくず＋大見出し＋説明
  const crumb = [ui.scope ? `${(phaseOf(ui.scope) || {}).code || ''} ${phaseName(ui.scope)}` : t('scope.all'), t('tab.' + ui.tab)];
  const mt = ui.tab === 'meetings' && state.meetings.find(x => x.id === ui.meetingId); if (mt) crumb.push(`${esc(mt.title)}（${md(mt.date)}）`);
  const per = ui.tab === 'org' && state.org.find(x => x.id === ui.orgSel); if (per) crumb.push(esc(per.name));
  const head = $('#pageHead'), view = $('#view');
  head.classList.toggle('animate', !!animate); view.classList.toggle('animate', !!animate);
  head.innerHTML = `<div class="crumb">${crumb.map(esc).join('<span class="sep">›</span>')}</div><h1 class="large-title">${t('tab.' + ui.tab)}</h1><p class="lead">${t('tabd.' + ui.tab)}</p>`;
  (VIEWS[ui.tab] || renderDash)(view, ctx);
  applyPermissions(view);
  if (animate) countUp(view);
  // 直前に変更した項目の行・カードを一瞬光らせ、「今反映された」ことを見せる
  if (flashFk) { const el = document.querySelector(`[data-fk="${CSS.escape(flashFk)}"]`); const box = el && el.closest('tr, .kcard, .form-grid label, .lbl-block, .card'); if (box) { box.classList.remove('just-saved'); void box.offsetWidth; box.classList.add('just-saved'); } flashFk = ''; }
  if (fk) { const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) { el.focus({preventScroll: true}); if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch(e) {} } }
  if (!animate) window.scrollTo(0, scrollY);
}
// 数値を 0 から数え上げる（画面切替時だけ。動きで「今更新された」ことを伝える）
function countUp(root){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 600;
    if (isNaN(to)) return;
    const step = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dec); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
// 権限のない入力・ボタンを画面から外す（できないことは最初から見せない）
const NEED = {addTask:'tasks', impCsv:'governance', addRaid:'raid', addMtg:'meetings', addSeries:'meetings', newType:'meetings', addPhase:'phases', addGov:'governance', addCr:'crs', addMt:'meetingTypes',
  addPerson:'org', addChild:'org', addAgenda:'agenda', addDecision:'decisions', addAction:'actions', loadStd:'agenda', pullRef:'agenda', toRaid:'raid', markDone:'decisions', rSnap:'report',
  resetSample:'admin', clearAll:'admin', delProject:'admin'};
function applyPermissions(root){
  root.querySelectorAll('[data-col]').forEach(el => { if (!can(el.dataset.col, el.dataset.key, el.dataset.f)) { el.disabled = true; el.classList.add('ro'); } });
  root.querySelectorAll('[data-del]').forEach(el => { if (!canDelete(el.dataset.del, el.dataset.key)) el.remove(); });
  Object.entries(NEED).forEach(([id, col]) => { const el = root.querySelector('#' + id); if (el && !canCreate(col)) el.style.display = 'none'; });
  root.querySelectorAll('[data-move-phase]').forEach(el => { if (!canCreate('phases')) el.remove(); });
  root.querySelectorAll('[data-regen],[data-add-owner]').forEach(el => { if (!canCreate(el.dataset.regen ? 'governance' : 'org')) el.remove(); });
  if (myRole() !== 'pm' && myRole() !== 'pmo' && ui.tab !== 'mine') { const n = root.querySelector('.ro-note'); if (!n && root.querySelector('.ro')) root.insertAdjacentHTML('afterbegin', `<div class="ro-note">${t('perm.note', t('role.' + myRole()))}</div>`); }
}
let renderTimer = null, flashFk = '';
// 文字を入力している最中も自動で保存する（画面の作り直しは確定時。入力中のカーソルは動かさない）
let typeTimer = null;
document.addEventListener('input', e => {
  const el = e.target, col = el.dataset && el.dataset.col, f = el.dataset && el.dataset.f;
  if (!col || !(el.tagName === 'TEXTAREA' || el.type === 'text')) return;
  const obj = target(col, el.dataset.key); if (!obj || !can(col, el.dataset.key, f)) return;
  obj[f] = el.value;
  clearTimeout(typeTimer); typeTimer = setTimeout(() => save(), 350);
});
// 折り返し表示の欄は Enter で確定（Shift+Enter は改行）
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.classList && e.target.classList.contains('cellwrap')) { e.preventDefault(); e.target.blur(); } });
const scheduleRender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => render(false), 0); };
const go = patch => { Object.assign(ui, patch); save(); render(true); window.scrollTo({top: 0}); };

// 保存状況の表示
let savedTimer = null;
function onSaved(){
  const el = $('#saveInd'); if (!el) return;
  el.classList.add('flash'); el.innerHTML = `<span class="dot"></span>${t('save.saved')}`;
  clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove('flash'), 900);
}

// ============ 入力の保存（data-col / data-key / data-f） ============
function target(col, key){
  if (col === 'project') return state.project;
  if (col === 'settings') return state.settings;
  if (col === 'naming') return state.naming;
  if (col === 'report') return state.report;
  if (['tasks','raid','crs'].includes(col)) return state[col][+key];
  if (['phases','meetings','governance','meetingTypes','org','flows','charts'].includes(col)) return (state[col] || []).find(x => x.id === key);
  if (col === 'fsteps') { const [fid, sid] = String(key).split(':'), f = (state.flows || []).find(x => x.id === fid); return f ? f.steps.find(s => s.id === sid) : null; }
  const [mid, i] = String(key).split(':'), m = state.meetings.find(x => x.id === mid);
  return m && m[col] ? m[col][+i] : null;
}
document.addEventListener('change', e => {
  const el = e.target, col = el.dataset.col, f = el.dataset.f; if (!col) return;
  const obj = target(col, el.dataset.key); if (!obj) return;
  if (!can(col, el.dataset.key, f)) { toast(t('perm.denied')); scheduleRender(); return; }
  if (col === 'tasks' && f === 'status' && v === 'closed' && needsApproval(obj) && !canApprove(obj)) { toast(t('tk.needApprover')); scheduleRender(); return; }
  if (col === 'tasks' && f === 'status' && v === 'closed' && needsApproval(obj)) { obj.approvedBy = myName(); obj.approvedAt = todayStr(); }
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') { const n = parseFloat(v); v = isNaN(n) ? 0 : n; }
  if (col === 'org' && f === 'name' && obj.name && obj.name !== v) renameOwner(obj.name, v); // 体制図の名前変更を担当欄にも反映
  obj[f] = v;
  if (col === 'tasks') afterTaskChange(obj, f);
  if (col === 'org' && f === 'access') { const got = applyRoleDefaults(obj); toast(got.length ? t('role.autoPhase', obj.name, got.join('、')) : t('role.assigned', obj.name, t('role.' + v))); }
  if (col === 'raid' && f === 'type' && v !== 'risk') obj.prob = '';
  if (col === 'governance' && f === 'status' && v === 'agreed' && !obj.agreedDate) obj.agreedDate = todayStr();
  if (col === 'crs' && f === 'status' && ['approved','rejected'].includes(v) && !obj.decided) obj.decided = todayStr();
  if (col === 'meetings' && f === 'typeId') { const mt = state.meetingTypes.find(x => x.id === v); if (mt && !obj.purpose) obj.purpose = mt.purpose; }
  flashFk = el.dataset.fk || '';
  save(); scheduleRender();
});
function renameOwner(from, to){
  state.tasks.forEach(x => { if (x.owner === from) x.owner = to; });
  state.raid.forEach(x => { if (x.owner === from) x.owner = to; });
  state.crs.forEach(x => { if (x.owner === from) x.owner = to; });
  state.meetings.forEach(m => { if (m.organizer === from) m.organizer = to; m.agenda.forEach(a => { if (a.owner === from) a.owner = to; }); m.actions.forEach(a => { if (a.owner === from) a.owner = to; }); });
  if (state.project.pm === from) state.project.pm = to;
}
document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]'); if (tb) { go({tab: tb.dataset.tab}); return; }
  const sc = e.target.closest('[data-scope]'); if (sc) { go({scope: sc.dataset.scope}); return; }
  const wz = e.target.closest('[data-wizard]'); if (wz) { openWizard(); return; }
  if (e.target.closest('[data-logout]')) { logout(); return; }
  const ho = e.target.closest('[data-help-open]'); if (ho) { openHelp(ho.dataset.helpOpen); return; }
  const om = e.target.closest('[data-open-mtg]'); if (om && !e.target.closest('select')) { const sw = ui.tab !== 'meetings'; ui.meetingId = om.dataset.openMtg; ui.tab = 'meetings'; render(sw); const d = $('.mtg-detail'); if (d && window.innerWidth < 900) d.scrollIntoView({behavior: 'smooth'}); return; }
  const lg = e.target.closest('[data-lang]'); if (lg) { state.project.lang = lg.dataset.lang; ui.reportLang = ''; save(); render(true); return; }
  const mp = e.target.closest('[data-move-phase]'); if (mp) { const i = state.phases.findIndex(p => p.id === mp.dataset.movePhase), j = i + +mp.dataset.dir; if (j >= 0 && j < state.phases.length) { [state.phases[i], state.phases[j]] = [state.phases[j], state.phases[i]]; save(); render(); } return; }
  const del = e.target.closest('[data-del]'); if (del) {
    const col = del.dataset.del, key = del.dataset.key, name = del.dataset.name;
    if (!canDelete(col, key)) { toast(t('perm.denied')); return; }
    if (name && !confirm(t('msg.deleteConfirm', name))) return;
    if (['tasks','raid','crs'].includes(col)) state[col].splice(+key, 1);
    else if (col === 'phases') {
      const n = tasksOf(key).length;
      if (n && !confirm(t('msg.deletePhase', n))) return;
      state.phases = state.phases.filter(p => p.id !== key);
      [...state.tasks, ...state.raid, ...state.meetings, ...state.crs].forEach(x => { if (x.phaseId === key) x.phaseId = ''; });
      if (ui.scope === key) ui.scope = '';
    }
    else if (col === 'org') { const p = state.org.find(x => x.id === key); state.org.forEach(x => { if (x.parentId === key) x.parentId = p ? p.parentId : ''; }); state.org = state.org.filter(x => x.id !== key); ui.orgSel = ''; }
    else if (['meetings','governance','meetingTypes'].includes(col)) { state[col] = state[col].filter(x => x.id !== key); if (col === 'meetings' && ui.meetingId === key) ui.meetingId = ''; }
    else { const [mid, i] = key.split(':'), m = state.meetings.find(x => x.id === mid); if (m) m[col].splice(+i, 1); }
    save(); render();
  }
});
// 左メニューの開閉（アイコンだけにして、メインの画面を広く使える）。この PC に記憶する
const NAV_KEY = 'kizashi-nav-collapsed';
const applyNav = c => { document.body.classList.toggle('nav-collapsed', c); $('#navToggle').setAttribute('aria-pressed', c ? 'true' : 'false'); $('#navToggle').title = c ? t('nav.open') : t('nav.close'); };
try { applyNav(localStorage.getItem(NAV_KEY) === '1'); } catch(e) {}
$('#navToggle').addEventListener('click', () => { const c = !document.body.classList.contains('nav-collapsed'); applyNav(c); try { localStorage.setItem(NAV_KEY, c ? '1' : '0'); } catch(e) {} });
$('#brandHome').innerHTML = brandMark(); // 画面左上のロゴ（押すとダッシュボードへ）
$('#brandHome').addEventListener('click', () => { if (me()) go({tab: ROLE_HOME[myRole()] || 'dash'}); });
$('#pjSwitch').addEventListener('click', e => openProjectSwitcher(e.currentTarget));
$('#helpBtn').addEventListener('click', () => { const el = $('#helpPanel'); if (el && el.classList.contains('open')) closeHelp(); else openHelp(); });
$('#scopeSel').addEventListener('change', e => { ui.meetingId = ''; go({scope: e.target.value}); });
$('#baseDate').addEventListener('change', e => { state.project.baseDate = e.target.value; save(); render(true); });

load(); render(true);
ui.bootMs = Math.round(performance.now()); // ページを開いてから最初の画面が出るまで
