// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ユーティリティ ============
const KEY = 'pmo-dashboard-v1';
const UI_KEY = 'pmo-dashboard-ui';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const d2n = s => { if (!s) return NaN; const [y,m,d] = String(s).split('-').map(Number); return Date.UTC(y, m-1, d) / 864e5; };
const n2d = n => { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; };
const md = s => { if (!s) return '—'; const [, m, d] = s.split('-'); return `${+m}/${+d}`; };
const ymd = s => s ? s.replace(/-/g, '/') : '—';
const lines = s => String(s || '').split(/\n/).map(x => x.trim()).filter(Boolean);

// ============ 列挙値（保存は言語に依存しないキー） ============
const ENUM = {
  taskStatus: ['todo','doing','discuss','decided','impl','test','draft','review','approval','closed'],
  raidType:   ['risk','issue','assumption','decision'],
  raidStatus: ['open','wip','closed'],
  level:      ['H','M','L'],
  raidCat:    ['contract','scope','schedule','resource','technical','vendor','other'],
  crStatus:   ['draft','analysis','pending','approved','rejected','done'],
  govStatus:  ['notset','draft','agreed'],
  govCat:     ['structure','naming','approval','cr','comm','raci','escalation','quality','docs','tools','security','raidrule','other'],
  contract:   ['tm','fixed','other'],
  gate:       ['notyet','review','approved'],
  mtgStatus:  ['planned','done','cancelled'],
  actStatus:  ['open','done'],
};
const SEV_ORDER = {H:0, M:1, L:2};
const RAG_EMOJI = {R:'🔴', A:'🟡', G:'🟢'};
const DEFAULT_SETTINGS = { lagWarn:20, lagHigh:40, staleDays:7, extendDays:5, overloadCount:4, lookahead:14, issueAgeDays:14, meetingLead:3, crStallDays:10, spiAmber:0.95, spiRed:0.85 };

// ============ 状態 ============
let state;
const ui = { tab:'dash', scope:'', owner:'', alertOnly:false, raidType:'', raidCat:'', mtgFilter:'upcoming', meetingId:'', reportLang:'', orgSel:'', me:'', orgView:'all', flowStep:'', chartEditing:'', orgLayout:'tree', diagEdit:false };
const LANG = () => (state && state.project.lang) || 'ja';
const baseDate = () => state.project.baseDate || todayStr();

function load(){
  wsInit(); const cur = wsCurrent(); // 複数プロジェクトのうち、今開いているもの（既存データは 1 つ目として引き継ぐ）
  try { const s = localStorage.getItem(cur.key); if (s) state = JSON.parse(s); } catch(e) {}
  try { Object.assign(ui, JSON.parse(localStorage.getItem(uiKeyOf(cur)) || '{}')); } catch(e) {}
  if (!state || !state.tasks) state = sample(/^ja/i.test(navigator.language || 'ja') ? 'ja' : 'en');
  if (state.version !== 2) state = migrateV1(state);
  normalize();
  wsSync();
}
function normalize(){
  state.settings = {...DEFAULT_SETTINGS, ...(state.settings || {})};
  // プロジェクトの識別子（共有したデータを同じプロジェクトとして更新するため）と会社・チームコード
  if (!state.project.uid) state.project.uid = 'pj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  if (state.project.companyCode == null) state.project.companyCode = '';
  if (state.project.teamCode == null) state.project.teamCode = '';
  for (const k of ['phases','tasks','raid','meetings','meetingTypes','governance','crs','snapshots','org','flows','charts']) state[k] = state[k] || [];
  state.report = state.report || {topics:'', requests:''};
  state.naming = state.naming || defaultNaming(LANG());
  state.tasks.forEach(t => {
    if (!TASK_KINDS.includes(t.kind)) t.kind = 'general';
    if (!t.priority) t.priority = 'M';
    if (t.disp === undefined) t.disp = '';
    if (t.status === 'done') t.status = 'closed';
    if (t.status === 'hold') { t.status = +t.progress > 0 ? 'doing' : 'todo'; t.disp = 'hold'; }
    if (!flowOf(t).includes(t.status)) { const lane = LANE_OF[t.status] || 'todo'; t.status = flowOf(t).find(s => LANE_OF[s] === lane) || (lane === 'todo' ? 'todo' : flowOf(t)[1]); }
  });
  state.meetings.forEach(m => { m.agenda = m.agenda || []; m.decisions = m.decisions || []; m.actions = m.actions || []; });
  if (ui.scope && !state.phases.some(p => p.id === ui.scope)) ui.scope = '';
  // ロール未設定の旧データ：PM 本人は pm、それ以外は member
  state.org.forEach(p => { if (!p.access) p.access = p.name === state.project.pm ? 'pm' : 'member'; });
  // PM が体制図にいないデータ（旧版の「はじめかた」で作成）は、PM を先頭に補う
  if (!state.org.some(p => p.access === 'pm')) state.org.unshift({id: nextId('O', state.org), name: state.project.pm || 'PM', role: 'PM', access: 'pm', org: 'us', parentId: '', note: ''});
}
function save(){
  const cur = wsCurrent();
  try { localStorage.setItem(cur.key, JSON.stringify(state)); } catch(e) {}
  if (typeof onSaved === 'function') onSaved();
  try { localStorage.setItem(uiKeyOf(cur), JSON.stringify({tab:ui.tab, scope:ui.scope, mtgFilter:ui.mtgFilter, me:ui.me})); } catch(e) {}
  wsSync();
}
// v1（日本語の値・フェーズ名文字列）→ v2
function migrateV1(old){
  const fresh = sample(old.project?.lang || 'ja');
  const sMap = {'未着手':'todo','進行中':'doing','完了':'done','保留':'hold'};
  const tMap = {'リスク':'risk','課題':'issue','前提':'assumption','決定事項':'decision'};
  const rMap = {'オープン':'open','対応中':'wip','クローズ':'closed'};
  const lMap = {'高':'H','中':'M','低':'L'};
  const phases = [], pid = {};
  (old.tasks || []).forEach(t => { const n = t.phase || '—'; if (!pid[n]) { const id = 'P' + (phases.length + 1); pid[n] = id; phases.push(newPhase(id, n, pad((phases.length + 1) * 10))); } });
  return {
    version: 2,
    project: {...fresh.project, ...old.project, code: old.project?.code || 'PJ', lang: old.project?.lang || 'ja'},
    settings: {...DEFAULT_SETTINGS, ...(old.settings || {})},
    phases,
    tasks: (old.tasks || []).map(t => ({...t, phaseId: pid[t.phase || '—'], status: sMap[t.status] || t.status || 'todo', phase: undefined})),
    raid: (old.raid || []).map(r => ({...r, type: tMap[r.type] || r.type, status: rMap[r.status] || r.status, impact: lMap[r.impact] || r.impact || '', prob: lMap[r.prob] || r.prob || '', phaseId: '', category: 'other'})),
    meetings: [], meetingTypes: fresh.meetingTypes, governance: fresh.governance, naming: fresh.naming, crs: [],
    snapshots: (old.snapshots || []).map(s => ({...s, scope: ''})),
    report: old.report || {topics:'', requests:''},
  };
}
function newPhase(id, name, code){ return {id, code, name, start:'', end:'', owner:'', contract:'tm', contractRef:'', contractEnd:'', deliverables:'', exitCriteria:'', gate:'notyet'}; }
function nextId(prefix, arr){
  const n = Math.max(0, ...arr.map(x => parseInt(String(x.id || '').replace(/\D/g, '')) || 0)) + 1;
  return prefix + pad(n);
}

// ============ フェーズ・スコープ ============
const phaseOf = id => state.phases.find(p => p.id === id);
const phaseName = (id, lang) => { const p = phaseOf(id); return p ? p.name : tl(lang || LANG(), 'common.common'); };
const phaseIdx = id => { const i = state.phases.findIndex(p => p.id === id); return i < 0 ? 999 : i; };
const tasksOf = pid => state.tasks.filter(t => t.phaseId === pid);
function phaseRange(p){
  const ts = tasksOf(p.id);
  const s = p.start || ts.map(t => t.start).filter(Boolean).sort()[0] || '';
  const e = p.end || ts.map(t => t.end).filter(Boolean).sort().pop() || '';
  return {s, e};
}
// フェーズスコープ：選択フェーズ＋フェーズ共通（phaseId なし）
const inScope = x => !ui.scope || !x.phaseId || x.phaseId === ui.scope;
const orderedTasks = list => list.map((t, i) => ({t, i})).sort((a, b) => phaseIdx(a.t.phaseId) - phaseIdx(b.t.phaseId) || a.i - b.i).map(x => x.t);
const scopedTasks = () => orderedTasks(ui.scope ? state.tasks.filter(t => t.phaseId === ui.scope) : state.tasks);

// ============ 計算 ============
const dur = t => Math.max(1, d2n(t.end) - d2n(t.start) + 1);
// ---- タスクの種類と流れ（種類を選ぶと流れが決まる。流れは 3〜5 段階） ----
const TASK_KINDS = ['general','study','dev','doc'];
const TASK_FLOW = {
  general: ['todo','doing','closed'],
  study:   ['todo','discuss','decided','closed'],
  dev:     ['todo','impl','test','approval','closed'],
  doc:     ['todo','draft','review','approval','closed'],
};
// ステータスから進捗％を自動で決める（手入力しなくても遅れの判定が働く）
const TASK_PCT = {todo: 0, doing: 50, discuss: 40, decided: 90, impl: 30, test: 70, draft: 40, review: 70, approval: 90, closed: 100};
// カンバンの共通の列（種類が違っても 1 枚のボードに並べる）
const KANBAN_LANES = ['todo','active','check','approval','closed'];
const LANE_OF = {todo: 'todo', doing: 'active', discuss: 'active', impl: 'active', draft: 'active', decided: 'check', test: 'check', review: 'check', approval: 'approval', closed: 'closed'};
const DISPS = ['next','backlog','hold','dropped'];
const flowOf = t => TASK_FLOW[t.kind] || TASK_FLOW.general;
const needsApproval = t => flowOf(t).includes('approval');
const isDone = t => t.status === 'closed' || t.status === 'done' || t.disp === 'dropped';
// Backlog（時期未定）と見送りは、スケジュール・進捗・警戒の計算から外す
const activeTask = t => !['backlog','dropped'].includes(t.disp || '');
function plannedPct(t, b){
  const s = d2n(t.start), e = d2n(t.end);
  if (isNaN(s) || isNaN(e)) return 0;
  if (b < s) return 0;
  if (b >= e) return 100;
  return Math.round((b - s + 1) / (e - s + 1) * 100);
}
function metrics(tasks, b){
  let pv = 0, ev = 0, bac = 0;
  tasks.filter(activeTask).forEach(t => { if (isNaN(d2n(t.start)) || isNaN(d2n(t.end))) return; const w = dur(t); bac += w; pv += w * plannedPct(t, b) / 100; ev += w * (+t.progress || 0) / 100; });
  return { planned: bac ? Math.round(pv / bac * 100) : 0, actual: bac ? Math.round(ev / bac * 100) : 0, spi: pv > 0 ? Math.round(ev / pv * 100) / 100 : 1 };
}
function meetingStats(b){
  const S = state.settings, ms = state.meetings.filter(m => inScope(m) && m.status !== 'cancelled');
  const past = ms.filter(m => d2n(m.date) < b || m.status === 'done');
  const upcoming = ms.filter(m => m.status === 'planned' && d2n(m.date) >= b && d2n(m.date) <= b + S.lookahead);
  const acts = ms.flatMap(m => m.actions.map(a => ({...a, meeting: m})));
  const open = acts.filter(a => a.status !== 'done');
  return {
    upcoming, past,
    recorded: past.filter(m => m.status === 'done').length,
    withAgenda: upcoming.filter(m => m.agenda.length).length,
    acts, open, overdue: open.filter(a => a.due && d2n(a.due) < b),
  };
}
function govStats(){
  const g = state.governance;
  return { total: g.length, agreed: g.filter(x => x.status === 'agreed').length, draft: g.filter(x => x.status === 'draft').length };
}

// ============ 早期警戒ルール ============
function computeAlerts(lang){
  const L = (k, ...a) => tl(lang, k, ...a);
  const S = state.settings, b = d2n(baseDate()), out = [];
  const add = (sev, type, target, owner, detail, ref, phaseId) => out.push({sev, type, target, owner: owner || '', detail, ref: ref || '', phaseId: phaseId || ''});

  // タスク
  state.tasks.forEach(t => {
    if (isDone(t) || !activeTask(t)) return;
    if (t.carryCount >= 2) add('M','carriedRepeat',t.name,t.owner,L('ad.carriedRepeat', t.carryCount),t.id,t.phaseId);
    if (t.disp === 'hold') { if (t.holdUntil && d2n(t.holdUntil) < b) add('M','holdOverdue',t.name,t.owner,L('ad.holdOverdue', md(t.holdUntil), b - d2n(t.holdUntil), t.dispNote || '—'),t.id,t.phaseId); return; }
    if (t.status === 'approval' && t.updated && b - d2n(t.updated) >= S.staleDays) add('M','approvalStalled',t.name,t.owner,L('ad.approvalStalled', b - d2n(t.updated)),t.id,t.phaseId);
    const s = d2n(t.start), e = d2n(t.end), be = d2n(t.baselineEnd), p = +t.progress || 0;
    if (isNaN(s) || isNaN(e)) return;
    if (e < b) add('H','overdue',t.name,t.owner,L('ad.overdue', md(t.end), b-e, p),t.id,t.phaseId);
    else {
      const pl = plannedPct(t, b), gap = pl - p;
      if (b >= s && gap >= S.lagWarn) add(gap >= S.lagHigh ? 'H' : 'M','lag',t.name,t.owner,L('ad.lag', pl, p, gap),t.id,t.phaseId);
      if (b > s && p === 0) add('M','notStarted',t.name,t.owner,L('ad.notStarted', md(t.start), b-s),t.id,t.phaseId);
    }
    if (!isNaN(be) && e - be >= S.extendDays) add('M','extended',t.name,t.owner,L('ad.extended', md(t.baselineEnd), md(t.end), e-be),t.id,t.phaseId);
    if (['active','check'].includes(LANE_OF[t.status]) && t.updated) { const st = b - d2n(t.updated); if (st >= S.staleDays) add('L','stale',t.name,t.owner,L('ad.stale', st),t.id,t.phaseId); }
  });
  // マイルストーン
  state.tasks.filter(t => t.milestone && !isDone(t) && activeTask(t)).forEach(m => {
    const e = d2n(m.end);
    if (e < b || e > b + S.lookahead) return;
    const bad = out.filter(a => a.phaseId === m.phaseId && a.ref !== m.id && ['overdue','lag','notStarted'].includes(a.type));
    if (bad.length) add('H','msRisk',m.name,m.owner,L('ad.msRisk', md(m.end), e-b, bad.length),m.id,m.phaseId);
  });
  // 負荷集中
  const load = {};
  state.tasks.forEach(t => { if (isDone(t) || !activeTask(t) || t.disp === 'hold' || t.milestone || !t.owner) return; if (d2n(t.start) <= b + S.lookahead && d2n(t.end) >= b) (load[t.owner] = load[t.owner] || []).push(t); });
  Object.entries(load).forEach(([o, ts]) => { if (ts.length >= S.overloadCount) add('M','overload',L('ad.overloadT', o),o,L('ad.overload', S.lookahead, ts.length, ts.map(x => x.id).join(', ')),'',''); });
  // フェーズ（ゲート・契約）
  state.phases.forEach(p => {
    const ts = tasksOf(p.id); if (!ts.length) return;
    const {e} = phaseRange(p), en = d2n(e), unfinished = ts.filter(t => !isDone(t) && activeTask(t));
    if (!isNaN(en)) {
      if (p.gate !== 'approved' && en < b) add('H','gateOverdue',p.name,p.owner,L('ad.gateOverdue', md(e), b-en),p.id,p.id);
      else if (p.gate === 'notyet' && en >= b && en <= b + S.lookahead && unfinished.length) add('M','gateNotReady',p.name,p.owner,L('ad.gateNotReady', md(e), en-b),p.id,p.id);
    }
    if (p.contractEnd) {
      const ce = d2n(p.contractEnd), late = unfinished.filter(t => d2n(t.end) > ce);
      if (late.length) add('H','contractOverrun',p.name,p.owner,L('ad.contractOverrun', md(p.contractEnd), late.length, md(late.map(t => t.end).sort().pop())),p.id,p.id);
      else if (ce < b && unfinished.length) add('H','contractOverrun',p.name,p.owner,L('ad.contractExpired', md(p.contractEnd), unfinished.length),p.id,p.id);
    }
  });
  // RAID
  state.raid.forEach(r => {
    if (r.status === 'closed' || r.type === 'decision') return;
    if (r.type === 'risk' && r.impact === 'H' && !String(r.mitigation || '').trim()) add('H','noMitigation',r.title,r.owner,L('ad.noMitigation'),r.id,r.phaseId);
    if (r.due && d2n(r.due) < b) add(r.impact === 'H' ? 'H' : 'M','raidOverdue',r.title,r.owner,L('ad.raidOverdue', lbl('raidType', r.type, lang), md(r.due), b - d2n(r.due)),r.id,r.phaseId);
    if (r.type === 'issue' && r.raised && b - d2n(r.raised) >= S.issueAgeDays) add('M','issueAged',r.title,r.owner,L('ad.issueAged', b - d2n(r.raised)),r.id,r.phaseId);
  });
  // 会議
  state.meetings.forEach(m => {
    const dn = d2n(m.date);
    if (m.status === 'planned') {
      if (dn >= b && dn <= b + S.meetingLead && !m.agenda.length) add('M','noAgenda',m.title,m.organizer,L('ad.noAgenda', md(m.date), dn-b),m.id,m.phaseId);
      if (dn >= b && dn <= b + S.lookahead && !String(m.purpose || '').trim()) add('L','noPurpose',m.title,m.organizer,L('ad.noPurpose', md(m.date)),m.id,m.phaseId);
      if (dn < b) add('M','noMinutes',m.title,m.organizer,L('ad.noMinutes', md(m.date), b-dn),m.id,m.phaseId);
    }
    if (m.status === 'cancelled') return;
    m.actions.forEach(a => {
      if (a.status === 'done') return;
      if (a.due && d2n(a.due) < b) { const late = b - d2n(a.due); add(late > 7 ? 'H' : 'M','actionOverdue',a.text,a.owner,L('ad.actionOverdue', md(a.due), late, m.title),m.id,m.phaseId); }
      else if (!a.owner || !a.due) add('L','actionIncomplete',a.text,a.owner,L('ad.actionIncomplete', m.title),m.id,m.phaseId);
    });
  });
  // ガバナンス（序盤に決めるべきルール）
  const ps = d2n(state.project.start);
  if (!isNaN(ps)) state.governance.forEach(g => {
    if (g.status === 'agreed') return;
    const due = ps + (+g.targetDays || 0);
    if (b > due) add('M','govNotAgreed',g.title,g.owner,L('ad.govNotAgreed', g.targetDays, b-due, lbl('govStatus', g.status, lang)),g.id,'');
  });
  // 変更要求
  state.crs.forEach(c => {
    if ((c.status === 'analysis' || c.status === 'pending') && c.raised && b - d2n(c.raised) >= S.crStallDays)
      add('M','crStalled',`${c.id} ${c.title}`,c.owner,L('ad.crStalled', lbl('crStatus', c.status, lang), b - d2n(c.raised)),c.id,c.phaseId);
  });
  return out.sort((a, c) => SEV_ORDER[a.sev] - SEV_ORDER[c.sev]);
}
const scopeAlert = a => !ui.scope || !a.phaseId || a.phaseId === ui.scope;
function computeRag(m, alerts){
  const S = state.settings, high = alerts.filter(a => a.sev === 'H').length;
  if (m.spi < S.spiRed || high >= 3) return 'R';
  if (m.spi < S.spiAmber || high >= 1) return 'A';
  return 'G';
}
function sevMap(alerts){ const m = {}; alerts.forEach(a => { if (a.ref && (!m[a.ref] || SEV_ORDER[a.sev] < SEV_ORDER[m[a.ref]])) m[a.ref] = a.sev; }); return m; }
function snapshotsInScope(){ return state.snapshots.filter(s => (s.scope || '') === ui.scope).sort((x, y) => x.date < y.date ? -1 : 1); }
function prevSnapshot(){ const b = baseDate(); return snapshotsInScope().filter(s => s.date < b).pop(); }

// ============ 命名規則 ============
function buildFileName(o){
  const N = state.naming;
  return N.pattern
    .replace(/\{CO\}/g, state.project.companyCode || 'CO')
    .replace(/\{TEAM\}/g, state.project.teamCode || 'TEAM')
    .replace(/\{PJ\}/g, state.project.code || 'PJ')
    .replace(/\{PHASE\}/g, o.phase || '00')
    .replace(/\{DOC\}/g, o.doc || 'DOC')
    .replace(/\{TITLE\}/g, String(o.title || 'Title').trim().replace(/[\s_\\/:*?"<>|]+/g, '-'))
    .replace(/\{VER\}/g, o.ver || '0.1')
    .replace(/\{DATE\}/g, (o.date || todayStr()).replace(/-/g, '')) + (o.ext ? '.' + o.ext.replace(/^\./, '') : '');
}
function namingRegex(){
  const N = state.naming, rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const docs = docTypes().map(d => rx(d.code)).join('|') || '[A-Z]+';
  const phases = ['00', ...state.phases.map(p => p.code)].filter(Boolean).map(rx).join('|');
  let r = rx(N.pattern);
  r = r.replace(/\\\{CO\\\}/g, rx(state.project.companyCode || 'CO')).replace(/\\\{TEAM\\\}/g, rx(state.project.teamCode || 'TEAM')).replace(/\\\{PJ\\\}/g, rx(state.project.code || 'PJ')).replace(/\\\{PHASE\\\}/g, `(?:${phases})`).replace(/\\\{DOC\\\}/g, `(?:${docs})`)
       .replace(/\\\{TITLE\\\}/g, '[^_\\s]+').replace(/\\\{VER\\\}/g, '\\d+\\.\\d+').replace(/\\\{DATE\\\}/g, '\\d{8}');
  return new RegExp('^' + r + '(?:\\.[A-Za-z0-9]+)?$');
}
const docTypes = () => lines(state.naming.docTypes).map(l => { const [code, ...rest] = l.split('='); return {code: code.trim(), name: rest.join('=').trim()}; }).filter(d => d.code);

// ============ ロールと権限 ============
// ロールを選ぶだけで「見える画面」「できること」「最初の画面」が決まる（個別設定は不要）
const ROLES = ['pm','pmo','lead','member','viewer'];
const ROLE_TABS = {
  pm:     ['mine','dash','alerts','phases','tasks','raid','meetings','org','governance','report','settings'],
  pmo:    ['mine','dash','alerts','phases','tasks','raid','meetings','org','governance','report','settings'],
  lead:   ['mine','dash','alerts','phases','tasks','raid','meetings','org','governance','report','settings'],
  member: ['mine','dash','tasks','raid','meetings','org','governance','settings'],
  viewer: ['dash','phases','org','report','settings'],
};
const ROLE_HOME = {pm: 'dash', pmo: 'dash', lead: 'mine', member: 'mine', viewer: 'dash'};
// 権限の一覧表（y=できる / p=一部 / n=できない）。体制図の「ロールとできること」と案内文に使う
const ROLE_MATRIX = [
  ['view',     'y','y','y','y','y'],
  ['myTask',   'y','y','y','y','n'],
  ['wbs',      'y','y','p','n','n'],
  ['raise',    'y','y','y','y','n'],
  ['meeting',  'y','y','p','p','n'],
  ['phase',    'y','y','p','n','n'],
  ['cr',       'y','y','p','n','n'],
  ['gov',      'y','y','n','n','n'],
  ['org',      'y','y','n','n','n'],
  ['role',     'y','n','n','n','n'],
  ['data',     'y','n','n','n','n'],
];
// ログインした本人の ID。ログインしていなければ空（別の人に自動で切り替えることはしない）
function myId(){ return state.org.some(p => p.id === ui.me) ? ui.me : ''; }
const me = () => state.org.find(p => p.id === myId());
const myRole = () => { const p = me(); return p ? (p.access || 'member') : 'none'; };
const myName = () => (me() || {}).name || state.project.pm || '';
const leadPhases = () => state.phases.filter(p => p.owner && p.owner === myName()).map(p => p.id);
// col/key/f は入力欄の data-col / data-key / data-f。f='*' は「その項目を丸ごと編集・削除できるか」
function can(col, key, f){
  const r = myRole();
  if (r === 'none') return false;
  if (r === 'pm') return true;
  if (col === 'org' && f === 'access') return false;
  if (r === 'pmo') return true;
  if (r === 'viewer') return false;
  const nm = myName(), obj = typeof target === 'function' ? target(col, key) : null;
  const mine = o => !!o && (o.owner === nm || o.organizer === nm);
  const inMyPhase = o => !!o && !!o.phaseId && leadPhases().includes(o.phaseId);
  const lead = r === 'lead';
  const mtg = ['agenda','decisions','actions'].includes(col) ? state.meetings.find(m => m.id === String(key).split(':')[0]) : null;
  switch (col) {
    case 'tasks': return lead ? mine(obj) || inMyPhase(obj) : mine(obj) && ['progress','status','name','kind','priority'].includes(f);
    case 'raid': return lead ? mine(obj) || inMyPhase(obj) : mine(obj) && ['status','mitigation'].includes(f);
    case 'meetings': return lead && (mine(obj) || inMyPhase(obj));
    case 'agenda': return lead && (mine(mtg) || inMyPhase(mtg)) || (!!obj && obj.owner === nm && f === 'outcome');
    case 'decisions': return lead && (mine(mtg) || inMyPhase(mtg));
    case 'actions': return lead && (mine(mtg) || inMyPhase(mtg)) || (!!obj && obj.owner === nm && f === 'status');
    case 'phases': return lead && !!obj && obj.owner === nm && ['deliverables','exitCriteria'].includes(f);
    case 'crs': return lead && mine(obj) && f !== 'status';
    case 'org': return !!obj && obj.id === myId() && f === 'note';
    case 'report': return lead;
    default: return false;
  }
}
function canCreate(col){
  const r = myRole();
  if (r === 'none') return false;
  if (r === 'pm') return true;
  if (col === 'admin') return false;
  if (r === 'pmo') return true;
  if (r === 'viewer') return false;
  if (['agenda','decisions','actions'].includes(col)) return can('meetings', ui.meetingId, '*');
  if (r === 'lead') return ['tasks','raid','meetings','crs','report'].includes(col);
  return col === 'raid' || col === 'tasks'; // メンバーも課題・リスクの起票と、自分のタスクの作成ができる
}
function canDelete(col, key){
  const r = myRole();
  if (r === 'pm' || r === 'pmo') return true;
  if (r !== 'lead') return false;
  if (['agenda','decisions','actions'].includes(col)) return can('meetings', String(key).split(':')[0], '*');
  return ['tasks','raid','meetings','crs'].includes(col) && can(col, key, '*');
}
// 権限ロールは org の access（role は肩書きの自由入力）。ロールを付けた直後に必要な初期設定を自動で済ませる（リードの担当フェーズ）
function applyRoleDefaults(p){
  if (p.access !== 'lead' || state.phases.some(ph => ph.owner === p.name)) return [];
  const got = [];
  state.phases.forEach(ph => {
    const ts = tasksOf(ph.id).filter(x => !x.milestone), mine = ts.filter(x => x.owner === p.name).length;
    if (ts.length && mine * 2 >= ts.length) { ph.owner = p.name; got.push(ph.name); }
  });
  return got;
}

// 承認できるのは PM・PMO・担当フェーズのリード。自分のタスクを自分で承認することはできない
function canApprove(t){
  const r = myRole(), nm = myName();
  // 自分のタスク：ほかに承認できる人がいない（PM が 1 人で回している）ときだけ PM 本人が承認できる
  if (!t || t.owner === nm) return r === 'pm' && !state.org.some(p => ['pm','pmo','lead'].includes(p.access) && p.name !== nm);
  if (r === 'pm' || r === 'pmo') return true;
  return r === 'lead' && !!t.phaseId && leadPhases().includes(t.phaseId);
}
// 「次のフェーズへ」「Backlog」などの扱いを決められるのは PM・PMO・担当フェーズのリード（スコープの判断になるため）
function canDispose(t){
  const r = myRole();
  if (r === 'pm' || r === 'pmo') return true;
  return r === 'lead' && (!t.phaseId || leadPhases().includes(t.phaseId) || t.owner === myName());
}
