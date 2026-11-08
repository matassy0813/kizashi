// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ 単体テスト（UT）：想定プロジェクトで、要件どおりに動くかを確かめる ============
// smoke.js（機能が消えていないか）とは別に、要件ごとの「期待する結果」を確かめる。テストケースの一覧は tests/TESTCASES.md。
// 使い方：ツールを開いた状態で、このファイルを読み込んで runUT() を実行する。データは保存しない（終わったら元に戻す）。
//
// 想定プロジェクト：倉庫管理システム（WMS）導入プロジェクト（顧客：みなと物流）
//   体制：PM 青木／PMO 石井／設計リード 上田（P2 担当）／メンバー 江藤・小川／閲覧者 加納（顧客役員）・木村（顧客PL）
//   フェーズ：P1 要件定義（準委任・承認済）→ P2 設計（請負・判定中）→ P3 開発（請負）
function utProject(){
  const b = d2n(todayStr()), o = k => n2d(b + k);
  const P = (id, code, name, owner, contract, ref, ce, gate) => ({...newPhase(id, name, code), owner, contract, contractRef: ref, contractEnd: ce == null ? '' : o(ce), gate});
  const T = (id, ph, name, owner, s, e, p, st, kind, extra) => ({id, phaseId: ph, name, owner, start: o(s), end: o(e), baselineEnd: o(e), progress: p, status: st, kind, priority: 'M', disp: '', milestone: false, updated: o(-1), ...extra});
  const R = (id, type, ph, title, owners, extra) => ({id, type, phaseId: ph, category: 'other', title, owner: owners[0] || '', owners, reporter: owners[0] || '', approver: '', parentId: '', impact: 'M', prob: type === 'risk' ? 'M' : '', status: 'open', raised: o(-5), due: o(10), mitigation: '', detail: '', impactText: '', ask: '', needDecision: false, decider: '', decideBy: '', taskIds: [], log: [], updated: o(-1), ...extra});
  const op = (id, name, role, access, org, parentId) => ({id, name, role, access, org, parentId, note: ''});
  const s = {
    version: 2,
    project: {name: '倉庫管理システム（WMS）導入プロジェクト', code: 'WMS', companyCode: 'MNT', teamCode: 'LOG', client: 'みなと物流', pm: '青木', start: o(-60), end: o(120), baseDate: '', lang: 'ja', uid: 'pj-ut-wms'},
    settings: {...DEFAULT_SETTINGS},
    phases: [P('P1', '10', '要件定義', '青木', 'tm', '準委任 第1期', -20, 'approved'), P('P2', '20', '設計', '上田', 'fixed', '請負 A-201', 30, 'review'), P('P3', '30', '開発', '上田', 'fixed', '請負 A-202', 90, 'notyet')],
    tasks: [
      T('T01', 'P1', '業務要件ヒアリング', '江藤', -55, -30, 100, 'closed', 'study'),
      T('T02', 'P2', '入出荷画面の基本設計', '江藤', -20, 5, 80, 'review', 'doc'),
      T('T03', 'P2', '在庫引当ロジック設計', '小川', -15, 3, 100, 'approval', 'doc'),
      T('T04', 'P2', 'IF仕様書（基幹連携）', '江藤', -10, 8, 100, 'approval', 'doc'),
      T('T05', 'P3', 'ハンディ端末アプリ開発', '小川', 10, 60, 0, 'todo', 'dev'),
      T('T06', 'P2', '設計完了', '上田', 25, 25, 0, 'todo', 'general', {milestone: true}),
      T('T07', 'P2', '帳票レイアウト確認', '江藤', -12, -2, 40, 'doing', 'general'),
    ],
    raid: [
      R('I01', 'issue', 'P2', '基幹システムの在庫IFの項目定義が未確定', ['江藤', '小川'], {reporter: '上田', approver: '上田', impact: 'H', taskIds: ['T04'], detail: '基幹側の担当が決まっておらず、IFの項目が埋まらない', impactText: 'IF仕様書（T04）が完成せず、設計完了が遅れる', mitigation: '顧客PLに担当者のアサインを依頼'}),
      R('I02', 'issue', 'P2', '在庫IFのうち出荷実績の項目を確定する', ['小川'], {parentId: 'I01', reporter: '江藤'}),
      R('I03', 'issue', 'P2', '在庫IFのうち棚卸の項目を確定する', ['江藤'], {parentId: 'I01', reporter: '江藤', status: 'review', approver: '上田'}),
      R('R01', 'risk', 'P3', 'ハンディ端末の調達が遅れ、開発着手が遅れる', ['小川'], {impact: 'H', prob: 'H', mitigation: ''}),
      R('I04', 'issue', 'P2', '帳票の出力方式（PDF／紙）が未決定', [], {reporter: '江藤', due: '', needDecision: true, decider: '加納', decideBy: o(-2), ask: 'PDF化して紙の出力をやめてよいか'}),
    ],
    meetings: [{id: 'M01', typeId: '', title: '週次定例', phaseId: '', date: o(-7), time: '10:00', duration: 60, location: '', organizer: '青木', attendees: '全員', purpose: '進捗確認', status: 'done', agenda: [{topic: '在庫IF', owner: '江藤', minutes: 15, ref: 'I01', outcome: '顧客PLに担当アサインを依頼'}], decisions: [{text: '棚卸項目は来週までに確定'}], actions: [{id: 'A1', text: '基幹側担当者の確認', owner: '江藤', due: o(-1), status: 'open'}], notes: ''}],
    meetingTypes: [], governance: [{id: 'G01', category: 'naming', title: 'ファイル命名規則', targetDays: 14, content: '{PJ}_{DOC}_v{VER}', owner: '石井', status: 'agreed', agreedDate: o(-50)}],
    crs: [{id: 'CR01', phaseId: 'P2', title: '入荷検品にバーコード照合を追加', requester: '木村', owner: '上田', scope: '画面1本追加', schedule: 5, cost: '8人日', status: 'pending', raised: o(-4), decided: '', note: ''}],
    snapshots: [], report: {topics: '', requests: ''}, naming: defaultNaming('ja'),
    org: [op('U01', '加納', '顧客役員', 'viewer', 'client', ''), op('U02', '木村', '顧客PL', 'viewer', 'client', 'U01'), op('U03', '青木', 'PM', 'pm', 'us', 'U01'), op('U04', '石井', 'PMO', 'pmo', 'us', 'U03'),
      op('U05', '上田', '設計リード', 'lead', 'us', 'U03'), op('U06', '江藤', '業務SE', 'member', 'us', 'U05'), op('U07', '小川', '開発', 'member', 'us', 'U05')],
  };
  return s;
}
function runUT(){
  const keep = {state, ui: JSON.parse(JSON.stringify(ui)), save}, out = [];
  save = () => {};
  const keepP = window.prompt, keepC = window.confirm; window.confirm = () => true;
  const as = name => { ui.me = (state.org.find(p => p.name === name) || {}).id || ''; };
  const fresh = () => { state = utProject(); normalize(); ui.scope = ''; ui.raidSel = ''; ui.raidView = 'list'; ui.raidType = ''; ui.raidCat = ''; ui.raidOpen = false; ui.raidDec = false; ui.apKind = ''; ui.apSel = []; };
  const R = id => state.raid.find(r => r.id === id), Tk = id => state.tasks.find(x => x.id === id);
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const tc = (id, req, name, fn) => { fresh(); let ok = false, detail = ''; try { const r = fn(); ok = r === true; if (!ok) detail = JSON.stringify(r); } catch (e) { detail = e.message; } out.push({id, req, name, ok, detail}); };
  const change = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', {bubbles: true})); };
  const b = () => d2n(baseDate());
  try {
    // ---- 課題の関係者（作成者・承認者・担当者は複数） ----
    tc('UT-01', 'REQ-13', '課題を作ると作成者が自動で入る', () => { as('江藤'); const r = newRaid({type: 'issue'}); return r.reporter === '江藤' && r.log[0].kind === 'create' || r; });
    tc('UT-02', 'REQ-13', 'メンバーが起票すると、自分が担当者になり自分で更新できる', () => { as('江藤'); const r = newRaid({type: 'issue'}); const i = state.raid.indexOf(r); return raidOwners(r).includes('江藤') && can('raid', i, 'status') && can('raid', i, 'detail') || {owners: r.owners}; });
    tc('UT-03', 'REQ-13', '担当者は複数持てて、全員の「自分の仕事」に出る', () => { const r = R('I01'); r.due = n2d(b() - 1); const seen = ['江藤', '小川'].map(n => { as(n); return myTodos(b(), []).some(x => x.text.includes(r.title)); }); return seen.every(Boolean) || seen; });
    tc('UT-04', 'REQ-13', '担当者（2人目）も課題を更新できる。担当でないメンバーは状態を変えられない', () => { as('小川'); const a = can('raid', state.raid.indexOf(R('I01')), 'status'); as('小川'); const c = can('raid', state.raid.indexOf(R('I03')), 'status'); return (a && !c) || {a, c}; });
    tc('UT-05', 'REQ-13', '承認者に指名された人が承認でき、PM・PMOも承認できる。ほかのメンバーはできない', () => { const r = R('I03'); const res = {}; for (const n of ['上田', '青木', '石井', '小川']) { as(n); res[n] = canApproveRaid(r); } return (res['上田'] && res['青木'] && res['石井'] && !res['小川']) || res; });
    tc('UT-06', 'REQ-13', '一覧の担当欄を変えると、主担当（担当者の先頭）が入れ替わる', () => { as('青木'); ui.tab = 'raid'; render(); const el = qa('[data-col="raid"][data-f="owner"]').find(x => +x.dataset.key === state.raid.indexOf(R('I01'))); el.value = '上田'; el.dispatchEvent(new Event('change', {bubbles: true})); const r = R('I01'); return (r.owners[0] === '上田' && r.owners.includes('小川') && r.owner === '上田') || r.owners; });
    // ---- 親子（課題のレイヤー）と図 ----
    tc('UT-07', 'REQ-14', '親課題を設定でき、経緯に残る', () => { as('青木'); const ok = setRaidParent(R('R01'), 'I01'); return (ok && R('R01').parentId === 'I01' && R('R01').log.some(e => e.f === 'parentId')) || R('R01'); });
    tc('UT-08', 'REQ-14', '循環する親子（親を自分の子の子にする）は断る', () => { as('青木'); const ok = setRaidParent(R('I01'), 'I02'); return (!ok && R('I01').parentId === '') || R('I01').parentId; });
    tc('UT-09', 'REQ-14', '親の候補に、自分と自分の子孫は出ない', () => { const ids = raidParentOpts(R('I01')).map(x => x[0]); return (!ids.includes('I01') && !ids.includes('I02') && !ids.includes('I03') && ids.includes('R01')) || ids; });
    tc('UT-10', 'REQ-14', '権限のないメンバーは親子を付け替えられない', () => { as('小川'); const ok = setRaidParent(R('I02'), ''); return (!ok && R('I02').parentId === 'I01') || R('I02').parentId; });
    tc('UT-11', 'REQ-14', '構造図：親の下に子が並び、親→子の線が引かれる', () => {
      as('青木'); ui.tab = 'raid'; ui.raidView = 'tree'; render();
      const pos = id => { const g = q(`#raidDiagram [data-node="${id}"]`); const m = g && /translate\(([-\d.]+),([-\d.]+)\)/.exec(g.getAttribute('transform')); return m ? {x: +m[1], y: +m[2]} : null; };
      const p = pos('I01'), c1 = pos('I02'), c2 = pos('I03'), edges = qa('#raidDiagram .dg-edge').length;
      return (p && c1 && c2 && c1.y > p.y && c2.y > p.y && edges === 2) || {p, c1, c2, edges};
    });
    tc('UT-12', 'REQ-14', '構造図：長いタイトルも省略せず、カードの中に収まる', () => {
      R('I02').title = '在庫IFのうち出荷実績の項目を確定する（数量・ロット・賞味期限・出荷先コード・配送便区分を含む）'; as('青木'); ui.tab = 'raid'; ui.raidView = 'tree'; render();
      const g = q('#raidDiagram [data-node="I02"]'), fo = g.querySelector('.iss-fo'), card = g.querySelector('.iss-card');
      const full = g.querySelector('.iss-title').textContent === R('I02').title, fits = fo.scrollHeight <= +card.getAttribute('height') + 1;
      return (full && fits) || {full, fits, need: fo.scrollHeight, h: card.getAttribute('height')};
    });
    tc('UT-13', 'REQ-14', '詳細画面に子の完了数が出て、子課題を追加すると親が入る', () => { as('青木'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); const shown = q('#view').textContent.includes(t('rd.kidsDone', 0, 2)); q('[data-rd-addkid]').click(); const kid = state.raid[state.raid.length - 1]; return (shown && kid.parentId === 'I01' && kid.approver === '上田' && ui.raidSel === kid.id) || {shown, kid: kid.parentId}; });
    tc('UT-14', 'REQ-14', '親をクローズしたのに子が残っていると警戒が出る', () => { R('I01').status = 'closed'; const a = computeAlerts('ja').find(x => x.type === 'childOpen' && x.ref === 'I01'); return !!a || computeAlerts('ja').map(x => x.type); });
    // ---- 詳細画面・コメント・経緯 ----
    tc('UT-15', 'REQ-15', '詳細画面に課題カード・関係者・判断の依頼・親子・関連タスク・経緯が揃う', () => { as('青木'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); const txt = q('#view').textContent; const need = ['rd.cardTitle', 'rd.people', 'rd.decisionTitle', 'rd.family', 'rd.tasks', 'rd.history', 'rd.reporter', 'rd.approver', 'rd.owners'].filter(k => !txt.includes(t(k))); return !need.length || need; });
    tc('UT-16', 'REQ-15', 'コメントを書くと経緯に残り、全体検索でも見つかる', () => { as('小川'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); q('#rdComment').value = '基幹ベンダーの回答は金曜の予定'; q('#rdSend').click(); const c = R('I01').log.filter(e => e.kind === 'comment').pop(); const found = searchAll('金曜の予定').some(x => x.id === 'I01'); return (c && c.by === '小川' && c.text.includes('金曜') && found) || {c, found}; });
    tc('UT-17', 'REQ-15', '閲覧者はコメントも編集もできない（見るだけ）', () => { as('加納'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); const noBox = !q('#rdComment'), ro = qa('#view [data-col="raid"]').every(el => el.disabled); return (noBox && ro) || {noBox, ro}; });
    tc('UT-18', 'REQ-15', '項目を変えると「誰が・何を・どう変えたか」が経緯に残る', () => { as('青木'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); change(q('[data-col="raid"][data-f="impact"]'), 'L'); const e = R('I01').log.filter(x => x.kind === 'change').pop(); return (e && e.f === 'impact' && e.from === 'H' && e.to === 'L' && e.by === '青木' && logLine(e).includes(lbl('level', 'L'))) || e; });
    tc('UT-19', 'REQ-15', '担当者を画面から追加・削除できる', () => { as('青木'); ui.tab = 'raid'; ui.raidSel = 'I02'; render(); change(q('#rdAddOwner'), '江藤'); const a = R('I02').owners.join(); render(); q('[data-rd-rmown="小川"]').click(); const r = R('I02'); return (a === '小川,江藤' && r.owners.join() === '江藤' && r.owner === '江藤') || {a, now: r.owners}; });
    tc('UT-20', 'REQ-15', '担当者が「確認待ち」にして承認を依頼し、承認者が詳細画面から承認するとクローズ', () => { as('江藤'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); q('[data-rd-request]').click(); const req = R('I01').status === 'review'; as('上田'); render(); q('[data-rd-approve]').click(); const r = R('I01'); return (req && r.status === 'closed' && r.approvedBy === '上田' && !!r.closedAt && r.log.some(e => e.kind === 'approve')) || {req, st: r.status}; });
    // ---- まとめて承認 ----
    tc('UT-21', 'REQ-12', '承認画面に、自分が承認できるものだけが出る（タスク・課題・CR）', () => { as('上田'); const lead = approvalQueue().map(x => x.key).sort(); as('青木'); const pm = approvalQueue().map(x => x.key).sort(); return (lead.join() === 'raid:I03,tasks:T03,tasks:T04' && pm.join() === 'crs:CR01,raid:I03,tasks:T03,tasks:T04') || {lead, pm}; });
    tc('UT-22', 'REQ-12', 'まとめて承認すると全件クローズし、承認者と日付が残る', () => { as('青木'); const n = resolveApprovals(approvalQueue(), 'approve'); return (n === 4 && Tk('T03').status === 'closed' && Tk('T04').approvedBy === '青木' && R('I03').status === 'closed' && state.crs[0].status === 'approved') || n; });
    tc('UT-23', 'REQ-12', '「元に戻す」で、まとめて承認する前に戻る', () => { as('青木'); resolveApprovals(approvalQueue(), 'approve'); q('#toast.act button').click(); q('#toast').classList.remove('on', 'act'); return (Tk('T03').status === 'approval' && R('I03').status === 'review' && state.crs[0].status === 'pending') || [Tk('T03').status, R('I03').status]; });
    tc('UT-24', 'REQ-12', '差し戻しは1つ前の段階に戻り、理由が担当者に見える', () => { as('青木'); resolveApprovals(approvalQueue().filter(x => x.col === 'tasks'), 'return', '根拠資料を添付'); q('#toast').classList.remove('on', 'act'); as('小川'); const seen = myTodos(b(), []).some(x => x.text.includes('根拠資料を添付')); return (Tk('T03').status === 'review' && Tk('T03').returnNote === '根拠資料を添付' && seen) || {st: Tk('T03').status, seen}; });
    tc('UT-25', 'REQ-12', '自分のタスクは承認できない（PMが1人で回している場合を除く）', () => { Tk('T03').owner = '青木'; as('青木'); const self = canApprove(Tk('T03')); return !self || self; });
    tc('UT-26', 'REQ-12', '承認者に指名されていないメンバー・閲覧者には承認画面が出ない', () => { as('小川'); const m = tabsFor().includes('approvals'); as('木村'); const v = tabsFor().includes('approvals'); return (!m && !v) || {m, v}; });
    // ---- A〜H：誰が見てもどんな課題か分かる ----
    tc('UT-27', 'REQ-16C', '判断が必要な課題が、ダッシュボードの「今決めること」と週次レポートに出る', () => { as('青木'); ui.tab = 'dash'; render(); const dash = !!q('.dec-card') && q('.dec-card').textContent.includes('PDF化'); const rp = buildReport('ja').includes('PDF化して紙の出力をやめてよいか'); return (dash && rp) || {dash, rp}; });
    tc('UT-28', 'REQ-16C', '決める人の「自分の仕事」に判断の依頼が出て、期限切れは警戒になる', () => { as('加納'); const td = myTodos(b(), []).some(x => x.text.includes('PDF化')); const al = computeAlerts('ja').some(a => a.type === 'decisionOverdue' && a.ref === 'I04'); return (td && al) || {td, al}; });
    tc('UT-29', 'REQ-16D', '閲覧者にも課題の画面が見える', () => { as('木村'); ui.tab = 'raid'; render(); return (ui.tab === 'raid' && qa('#view [data-open-raid]').length > 0) || ui.tab; });
    tc('UT-30', 'REQ-16E', '担当者なし・期限なしの課題を警戒する', () => { const ts = computeAlerts('ja').filter(a => a.ref === 'I04').map(a => a.type); return (ts.includes('raidNoOwner') && ts.includes('raidNoDue')) || ts; });
    tc('UT-31', 'REQ-16E', '長く更新されていない課題を警戒する', () => { R('I02').updated = n2d(b() - state.settings.staleDays * 2 - 1); return computeAlerts('ja').some(a => a.type === 'raidStale' && a.ref === 'I02'); });
    tc('UT-32', 'REQ-16F', '課題に紐づけたタスクのカードに⚑印が付き、タスクの詳細に関係する課題が出る', () => { as('青木'); ui.tab = 'tasks'; ui.taskView = 'kanban'; ui.taskSel = String(state.tasks.indexOf(Tk('T04'))); render(); const badge = !!q(`[data-kcard="${ui.taskSel}"] .iss-badge`), drawer = q('#taskDrawer').textContent.includes(t('rd.linkedIssues')); ui.taskSel = ''; return (badge && drawer) || {badge, drawer}; });
    tc('UT-33', 'REQ-16G', '傾向：リスクが影響×発生確率の表の正しいマスに入り、件数の推移が描ける', () => { as('青木'); ui.tab = 'raid'; ui.raidView = 'trend'; render(); const cells = qa('table.heatmap td.heat'); const hh = cells[2]; const inHH = !!hh && hh.textContent.includes('R01'); const pts = (q('.tr-open') || {getAttribute: () => ''}).getAttribute('points').split(' ').length; return (inHH && pts === 8) || {inHH, pts}; });
    tc('UT-34', 'REQ-16H', '全体検索：タスク・課題・会議・CR・ルールを探せる', () => { as('青木'); const kinds = ['IF仕様書', '棚卸', '週次定例', 'バーコード', '命名規則'].map(w => (searchAll(w)[0] || {}).kind); return kinds.join() === 'tasks,raid,meetings,crs,governance' || kinds; });
    tc('UT-35', 'REQ-16H', '全体検索：自分のロールで見られない画面のものは出ない', () => { as('加納'); const r = searchAll('週次定例'); return r.length === 0 || r; });
    tc('UT-36', 'REQ-16H', '全体検索：結果を選ぶと、その課題の詳細が開く', () => { as('青木'); const s = openSearch(); s.input.value = '棚卸'; s.input.dispatchEvent(new Event('input')); s.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'})); return (ui.tab === 'raid' && ui.raidSel === 'I03' && !q('.gs-pop')) || {tab: ui.tab, sel: ui.raidSel}; });
    tc('UT-37', 'REQ-16A', '課題カードの3項目（起きていること・影響・次の一手）を保存できる', () => { as('江藤'); ui.tab = 'raid'; ui.raidSel = 'I01'; render(); change(q('[data-col="raid"][data-f="impactText"]'), '設計完了が1週間遅れる'); const r = R('I01'); return (r.impactText === '設計完了が1週間遅れる' && r.log.some(e => e.f === 'impactText')) || r.impactText; });
    // ---- タスクの担当者・承認者（メンバーから選ぶ） ----
    tc('UT-42', 'REQ-17', '担当者・承認者はメンバー（体制図）のプルダウンで選ぶ', () => { as('青木'); ui.tab = 'tasks'; ui.taskView = 'list'; render(); const i = state.tasks.indexOf(Tk('T02')); const o = q(`select[data-col="tasks"][data-key="${i}"][data-f="owner"]`), a = q(`select[data-col="tasks"][data-key="${i}"][data-f="approver"]`); const names = s => [...s.options].map(x => x.value).filter(Boolean); const org = state.org.map(p => p.name); return (!!o && !!a && names(o).every(n => org.includes(n)) && names(o).length === org.length && !names(a).includes(Tk('T02').owner)) || {o: !!o, a: !!a}; });
    tc('UT-43', 'REQ-17', '新しいタスクの承認者は、フェーズのリード（いなければPM）が初期値で入る', () => { as('青木'); ui.scope = 'P2'; const tk = newTask({kind: 'doc', owner: '江藤'}); ui.scope = 'P1'; const tk2 = newTask({kind: 'doc', owner: '江藤'}); const tk3 = newTask({kind: 'general'}); ui.scope = ''; return (tk.approver === '上田' && tk2.approver === '青木' && tk3.approver === '') || [tk.approver, tk2.approver, tk3.approver]; });
    tc('UT-44', 'REQ-17', '担当者に割り当てると、その人の「自分の仕事」に新しい割り当てとして出る', () => { as('青木'); ui.tab = 'tasks'; ui.taskView = 'list'; render(); const i = state.tasks.indexOf(Tk('T05')); change(q(`select[data-col="tasks"][data-key="${i}"][data-f="owner"]`), '江藤'); as('江藤'); const td = myTodos(b(), []).some(x => x.text.includes('ハンディ端末アプリ開発') && x.text.includes('青木')); return (Tk('T05').owner === '江藤' && Tk('T05').assignedBy === '青木' && td) || {owner: Tk('T05').owner, td}; });
    tc('UT-45', 'REQ-17', '承認待ちになると、指名された承認者（メンバー）の承認画面に出て承認できる。指名されていないリードには出ない', () => { Tk('T04').approver = '小川'; as('小川'); const tab = tabsFor().includes('approvals'), mine = approvalQueue().some(x => x.key === 'tasks:T04'); as('上田'); const lead = approvalQueue().some(x => x.key === 'tasks:T04'); as('小川'); const n = resolveApprovals(approvalQueue().filter(x => x.key === 'tasks:T04'), 'approve'); q('#toast').classList.remove('on', 'act'); return (tab && mine && !lead && n === 1 && Tk('T04').status === 'closed' && Tk('T04').approvedBy === '小川') || {tab, mine, lead, n}; });
    tc('UT-46', 'REQ-17', '顧客の閲覧者も承認者に指名でき、その人だけが承認できる（PM・PMOも可）', () => { Tk('T03').approver = '加納'; as('加納'); const ok = canApprove(Tk('T03')) && tabsFor().includes('approvals'); as('木村'); const other = canApprove(Tk('T03')); return (ok && !other) || {ok, other}; });
    tc('UT-47', 'REQ-17', '担当者本人は承認者にできない', () => { as('青木'); ui.tab = 'tasks'; ui.taskView = 'list'; render(); const i = state.tasks.indexOf(Tk('T02')); const before = Tk('T02').approver; const a = q(`select[data-col="tasks"][data-key="${i}"][data-f="approver"]`); const opt = document.createElement('option'); opt.value = '江藤'; a.appendChild(opt); change(a, '江藤'); return Tk('T02').approver === before || Tk('T02').approver; });
    tc('UT-48', 'REQ-17', '担当者のいないタスクを警戒する', () => { Tk('T07').owner = ''; return computeAlerts('ja').some(a => a.type === 'taskNoOwner' && a.ref === 'T07'); });
    tc('UT-49', 'REQ-17', '「＋タスクを追加」で、担当者・承認者を選べる編集パネルが開く', () => { as('青木'); ui.tab = 'tasks'; ui.taskView = 'kanban'; ui.taskSel = ''; render(); q('#addTask').click(); const d = q('#taskDrawer'); const ok = d.classList.contains('open') && !!d.querySelector('[data-f="owner"]') && !!d.querySelector('[data-f="approver"], .muted.small'); ui.taskSel = ''; return ok || d.className; });
    // ---- クラウド共有：変更の合わせ込み（サーバーなしで確かめられる部分） ----
    const B0 = () => ({tasks: [{id: 'T01', name: 'A', progress: 0}, {id: 'T02', name: 'B', progress: 0}], raid: [{id: 'I01', title: 'x', log: [{at: '2026-11-01 09:00', by: '青木', kind: 'create'}]}], project: {name: 'P'}});
    const cp = o => JSON.parse(JSON.stringify(o));
    tc('UT-50', 'REQ-18', '片方だけが変えたところは、その変更を採る', () => { const b = B0(), l = cp(b), r = cp(b); r.tasks[0].progress = 50; const m = merge3(b, l, r); return m.tasks[0].progress === 50 || m.tasks[0]; });
    tc('UT-51', 'REQ-18', '二人が別の項目・別の欄を同時に変えても、両方の変更が残る', () => { const b = B0(), l = cp(b), r = cp(b); l.tasks[0].name = 'Aʼ'; r.tasks[0].progress = 30; r.tasks[1].name = 'Bʼ'; const m = merge3(b, l, r); return (m.tasks[0].name === 'Aʼ' && m.tasks[0].progress === 30 && m.tasks[1].name === 'Bʼ') || m.tasks; });
    tc('UT-52', 'REQ-18', '同じ欄を同時に変えたときは、あとから保存した自分の変更を採る', () => { const b = B0(), l = cp(b), r = cp(b); l.tasks[0].name = '自分'; r.tasks[0].name = '相手'; return merge3(b, l, r).tasks[0].name === '自分'; });
    tc('UT-53', 'REQ-18', '相手が消した項目は消える。ただし自分がその間に変えていれば残す', () => { const b = B0(), l = cp(b), r = cp(b); r.tasks = r.tasks.filter(x => x.id !== 'T02'); const m1 = merge3(b, l, r); l.tasks[1].progress = 10; const m2 = merge3(b, l, r); return (!m1.tasks.some(x => x.id === 'T02') && m2.tasks.some(x => x.id === 'T02')) || [m1.tasks.length, m2.tasks.length]; });
    tc('UT-54', 'REQ-18', '二人が同じ番号で別のタスクを作ったら、両方残し、自分の分の番号を付け直す', () => { const b = B0(), l = cp(b), r = cp(b); l.tasks.push({id: 'T03', name: '自分の'}); r.tasks.push({id: 'T03', name: '相手の'}); const m = merge3(b, l, r), ids = m.tasks.map(x => x.id + x.name); return (ids.includes('T03相手の') && ids.includes('T04自分の')) || ids; });
    tc('UT-55', 'REQ-18', '経緯・コメントは、二人の分が両方残り、時刻の順に並ぶ', () => { const b = B0(), l = cp(b), r = cp(b); l.raid[0].log.push({at: '2026-11-03 10:05', by: '青木', kind: 'comment', text: '自分'}); r.raid[0].log.push({at: '2026-11-03 10:01', by: '江藤', kind: 'comment', text: '相手'}); const lg = merge3(b, l, r).raid[0].log.map(e => e.text || e.kind); return lg.join() === 'create,相手,自分' || lg; });
    tc('UT-56', 'REQ-18', '表示言語と基準日は人ごと：共有する内容に入らず、受け取っても自分の設定のまま', () => { const s0 = {project: {name: 'P', lang: 'en', baseDate: '2026-11-01'}, tasks: []}; const sh = sharedOf(s0); const back = withLocal({project: {name: 'P2'}, tasks: []}, s0); return (!('lang' in sh.project) && !('baseDate' in sh.project) && back.project.lang === 'en' && back.project.baseDate === '2026-11-01' && back.project.name === 'P2') || {sh, back}; });
    // ---- これまでの要件（回帰） ----
    tc('UT-38', 'REQ-05', 'PMでも他の人の画面には入れない（ログインは本人だけ）', () => { as('青木'); const before = ui.me; ui.tab = 'mine'; render(); return (myName() === '青木' && ui.me === before && !q('#meBox select')) || myName(); });
    tc('UT-39', 'REQ-07', '承認が必要なタスクは、承認者が承認すると自動でクローズする', () => { as('上田'); const ok = moveTask(Tk('T03'), 'closed'); return (ok && Tk('T03').status === 'closed' && Tk('T03').progress === 100) || Tk('T03').status; });
    tc('UT-40', 'REQ-10', '期限を過ぎた未完了タスクを「期限超過」として警戒する', () => computeAlerts('ja').some(a => a.type === 'overdue' && a.ref === 'T07'));
    tc('UT-41', 'REQ-01', '英語でも新しい画面が表示でき、翻訳漏れがない', () => { state.project.lang = 'en'; as('青木'); for (const [tab, extra] of [['raid', {raidView: 'list'}], ['raid', {raidView: 'tree'}], ['raid', {raidView: 'trend'}], ['raid', {raidSel: 'I01'}], ['approvals', {}], ['dash', {}], ['mine', {}]]) { Object.assign(ui, {raidSel: '', ...extra, tab}); render(); } openSearch().input.value = 'IF'; document.querySelectorAll('.gs-pop').forEach(x => x.remove()); buildReport('en'); return MISSING.size === 0 || [...MISSING]; });
  } finally {
    window.prompt = keepP; window.confirm = keepC; document.querySelectorAll('.gs-pop').forEach(x => x.remove());
    state = keep.state; Object.keys(ui).forEach(k => delete ui[k]); Object.assign(ui, keep.ui); save = keep.save; render(true);
  }
  const ng = out.filter(r => !r.ok);
  console.table(out);
  return {total: out.length, ok: out.length - ng.length, ng, results: out};
}
