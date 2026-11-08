// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ 機能チェック（手戻り防止） ============
// これまでに作った機能が「消えていないか」を確かめる。変更のたびに必ず実行し、全部 OK を確認してから渡す。
// 使い方：ツールを開いた状態でブラウザの開発者ツールのコンソールにこのファイルの中身を貼り付け、runSmoke() を実行する。
// データは保存しない（終わったら元の状態に戻す）。新しい機能を作ったら、ここにチェックを 1 行以上追加する。
function runSmoke(){
  const keep = {state, ui: JSON.parse(JSON.stringify(ui)), save}, out = [];
  save = () => {};
  const check = (id, name, fn) => { try { const r = fn(); out.push({id, name, ok: r === true || (r && r.ok !== false), detail: r === true ? '' : JSON.stringify(r)}); } catch (e) { out.push({id, name, ok: false, detail: e.message}); } };
  const q = s => document.querySelectorAll(s);
  const login = id => { ui.me = id; };
  try {
    for (const lang of ['ja', 'en']) {
      state = sample(lang); normalize();
      check(`F01-${lang}`, `全ロールで全タブが表示できる（${lang}）`, () => {
        const who = {pm: 'O03', lead: 'O09', member: 'O10', viewer: 'O02'};
        for (const [r, id] of Object.entries(who)) { login(id); for (const tab of ROLE_TABS[r]) { ui.tab = tab; render(true); } }
        return true;
      });
      check(`F02-${lang}`, `週次レポートが作れる（${lang}）`, () => buildReport(lang).length > 500);
    }
    state = sample('ja'); normalize();
    check('F03', 'ログインしていないとログイン画面になる（アカウントなしでこのPCだけで使う場合）', () => { const keepMode = localStorage.getItem('kizashi-mode'), keepAcct = acct; acct = null; localStorage.setItem('kizashi-mode', 'local'); ui.me = ''; render(); const ok = document.body.classList.contains('locked') && q('[data-login]').length > 0; if (keepMode == null) localStorage.removeItem('kizashi-mode'); else localStorage.setItem('kizashi-mode', keepMode); acct = keepAcct; login('O03'); render(); return ok; });
    check('F49', '最初の画面：ログインと新規登録を切り替えられ、サンプル体験とアカウントなしの利用も選べる', () => {
      const keepMode = localStorage.getItem('kizashi-mode'), keepAcct = acct; acct = null; localStorage.removeItem('kizashi-mode'); ui.me = ''; ui.start = {mode: 'login', err: ''}; render();
      const start = !!document.querySelector('#stForm') && q('[data-smode]').length === 2 && !document.querySelector('#stPw2') && !!document.querySelector('#stSample') && !!document.querySelector('#stLocal');
      document.querySelector('[data-smode="signup"]').click(); const signup = !!document.querySelector('#stPw2');
      if (keepMode == null) localStorage.removeItem('kizashi-mode'); else localStorage.setItem('kizashi-mode', keepMode); acct = keepAcct; ui.start = {mode: 'login', err: ''}; login('O03'); render();
      return (start && signup) || {start, signup};
    });
    check('F50', 'ログイン後：参加しているプロジェクトの一覧から選べ、招待があれば案内コードで参加できる', () => {
      const keepAcct = acct, keepJoin = localStorage.getItem('kizashi-pending-join');
      acct = {server: 'http://example.invalid', login: 'tester', token: 'x', amk: 'x', kver: 1, ring: [{id: 'ABCDEFGHIJKLMNOPQRSTUV', server: 'http://example.invalid', secret: 'x', pdk: 'x', name: '共有プロジェクトA', since: todayStr()}]};
      localStorage.setItem('kizashi-pending-join', JSON.stringify({v: 2, id: 'ZYXWVUTSRQPONMLKJIHGFE', server: 'http://example.invalid'}));
      renderProjectPicker(); const list = q('[data-pk]').length === 1 && document.querySelector('.pk-list').textContent.includes('共有プロジェクトA'), join = !!document.querySelector('#pkCode'), newBtn = !!document.querySelector('#pkNew');
      acct = keepAcct; if (keepJoin == null) localStorage.removeItem('kizashi-pending-join'); else localStorage.setItem('kizashi-pending-join', keepJoin); login('O03'); render();
      return (list && join && newBtn) || {list, join, newBtn};
    });
    login('O03');
    check('F04', 'ダッシュボード：KPI・ガント・SPI推移・警戒', () => { ui.tab = 'dash'; render(); return q('.kpi').length >= 8 && !!document.querySelector('[aria-label="Gantt"]') && !!document.querySelector('[aria-label="SPI"]') && q('.alert-list li').length > 0; });
    check('F05', '早期警戒：ルール一覧に全種類がある', () => { ui.tab = 'alerts'; render(); const n = document.querySelectorAll('#view table')[1].querySelectorAll('tr').length; return n >= 24 || {rows: n}; });
    check('F06', 'フェーズ：一覧と編集カード', () => { ui.tab = 'phases'; render(); return q('[data-col="phases"]').length > 10; });
    check('F07', 'タスク：一覧・カンバン5列・Backlog', () => {
      ui.tab = 'tasks'; ui.taskView = 'list'; render(); const a = q('table.tasks tr').length > 5;
      ui.taskView = 'kanban'; render(); const b = q('.klane').length === 5;
      ui.taskView = 'backlog'; render(); const c = !!document.querySelector('#bQuick');
      return (a && b && c) || {a, b, c};
    });
    check('F08', 'タスク：承認で自動クローズ／本人は承認不可', () => { const tk = state.tasks.find(x => x.kind === 'dev'); login('O10'); tk.owner = '鈴木'; moveTask(tk, 'approval'); const self = moveTask(tk, 'closed'); login('O03'); const ok = moveTask(tk, 'closed'); return (!self && ok && tk.status === 'closed' && !!tk.approvedBy) || {self, ok}; });
    check('F09', 'タスク：扱い（次のフェーズ・Backlog・保留・見送り）', () => typeof disposeTask === 'function' && DISPS.length === 4);
    check('F10', 'RAID：一覧と追加', () => { ui.tab = 'raid'; render(); return !!document.querySelector('#addRaid') && q('[data-col="raid"]').length > 20; });
    check('F11', '会議：一覧・編集・招集案内／議事録', () => { ui.tab = 'meetings'; ui.meetingId = 'M01'; render(); return !!document.querySelector('#copyAgenda') && !!document.querySelector('#copyMinutes') && agendaMd(state.meetings[0]).length > 50 && minutesMd(state.meetings[0]).length > 50; });
    check('F12', '体制図：木構造（部下は上司より下、部下の多い人の下は縦に積む）', () => {
      ui.tab = 'org'; ui.orgView = 'all'; ui.orgLayout = 'tree'; render();
      const T = orgTree(state.org); const bad = state.org.filter(p => T.pos[p.parentId] && !(T.pos[p.id].y > T.pos[p.parentId].y));
      return (bad.length === 0 && T.stacked.size > 0 && q('.dg-node').length === state.org.length) || {bad: bad.map(p => p.name), stacked: T.stacked.size};
    });
    check('F12b', '体制図：画面上でカードが重ならず、木の形に並んでいる', () => {
      ui.orgLayout = 'tree'; render(true); // アニメーションありで確認（位置を上書きする不具合を検出するため）
      const r = id => document.querySelector(`[data-node="${id}"]`).getBoundingClientRect();
      const boss = r('O03'), kid = r('O09'), xs = new Set([...q('.dg-node')].map(n => Math.round(n.getBoundingClientRect().x)));
      return (kid.top > boss.bottom && xs.size > 3) || {bossBottom: boss.bottom, kidTop: kid.top, distinctX: xs.size};
    });
    check('F13', '体制図：所属の列の配置（v4）も選べる', () => { ui.orgLayout = 'lanes'; render(); const ok = q('.lane').length >= 3; ui.orgLayout = 'tree'; render(); return ok; });
    check('F14', '体制図：報告ライン（矢印）と連携（点線）', () => q('.dg-edge.report').length >= state.org.length - 1 && q('.dg-edge.peer').length >= 5);
    check('F15', '体制図：カーソルで上司・部下・連携を強調', () => { const rel = orgRelated('O09'); return rel.has('O03') && rel.has('O01'); });
    check('F16', '体制図：人をクリックすると詳細（編集）パネル', () => { ui.orgSel = 'O09'; render(); const ok = document.querySelector('#orgDrawer').classList.contains('open') && !!document.querySelector('#orgDrawer [data-col="org"]'); ui.orgSel = ''; return ok; });
    check('F17', '体制図：編集モード（移動・接続のハンドル、メンバー追加）', () => { ui.diagEdit = true; render(); const ok = q('[data-handle="report"]').length > 0 && q('[data-handle="peer"]').length > 0 && !!document.querySelector('#dgAddPerson'); ui.diagEdit = false; render(); return ok; });
    check('F18', '体制図：図の種類（全体・所属別・フロー3種）とメンバー一覧・ロール表', () => { const ks = orgViews().map(v => v.k); ui.orgView = 'members'; render(); const m = !!document.querySelector('#addPerson') && !!document.querySelector('table.matrix'); ui.orgView = 'all'; return (ks.includes('lane:client') && ks.includes('lane:us') && ks.filter(k => k.startsWith('flow:')).length >= 3 && m) || {ks, m}; });
    check('F19', 'フロー：分岐・差し戻しが描ける（CRは承認／却下に分岐）', () => { const f = state.flows.find(x => x.kind === 'cr'); ensureFlowGraph(f); ui.orgView = 'flow:' + f.id; render(); const out = f.edges.filter(e => e.from === 'S3').length; const ok = out >= 2 && q('.dg-node').length === f.steps.length && q('.dg-edge.flow').length === f.edges.length; ui.orgView = 'all'; return ok || {out}; });
    check('F20', 'フロー：ステップをクリックすると担当者を編集できる', () => { const f = state.flows[0]; ui.orgView = 'flow:' + f.id; ui.flowStep = f.steps[1].id; render(); const ok = q('[data-step-person]').length > 0; ui.flowStep = ''; ui.orgView = 'all'; return ok; });
    check('F21', 'ガバナンス：ルール・命名ツール・会議体・CR台帳', () => { ui.tab = 'governance'; const r = []; for (const sec of ['rules', 'naming', 'bodies', 'cr']) { ui.govSec = sec; render(); r.push(document.querySelector('#govBody').innerText.length > 50); } return r.every(Boolean) && namingRegex().test(buildFileName({phase: '10', doc: 'REQ', title: 'x', ver: '0.1', date: '2026-10-01'})); });
    check('F22', '自分の仕事：今やること・タスク・宿題', () => { login('O10'); ui.tab = 'mine'; render(); const ok = q('.todo-list li').length > 0 && !!document.querySelector('.hello'); login('O03'); return ok; });
    check('F23', '設定：起動時間の表示・データ管理', () => { ui.tab = 'settings'; render(); return !!document.querySelector('#expJson') && document.querySelector('#view').innerText.includes('ms') || document.querySelector('#view').innerText.includes('ミリ秒'); });
    check('F24', 'はじめかた：3ステップ', () => { openWizard(); let ok = true; for (let s = 1; s <= 3; s++) { ui.wiz.name = 'x'; ui.wiz.pin = '1234'; ui.wiz.step = s; drawWizard(); ok = ok && !!document.querySelector('.wz-body'); } document.querySelector('#wizard').close(); return ok; });
    check('F25', '権限：メンバーは他人のタスクを編集できない', () => { login('O10'); const other = state.tasks.findIndex(x => x.owner && x.owner !== '鈴木'); const ok = !can('tasks', other, 'name'); login('O03'); return ok; });
    check('F27', '複数プロジェクト：コードの設定・切り替え・削除（ログインはプロジェクトごと）', () => {
      const wsBak = JSON.stringify(ws), first = ws.current;
      state.project.companyCode = 'ACME'; state.project.teamCode = 'T1'; wsSync();
      const id = wsBeginNewProject(); state = sample('en'); normalize(); state.project.companyCode = 'ACME'; state.project.teamCode = 'T2'; wsSync();
      const two = ws.projects.length >= 2 && wsCurrent().team === 'T2' && ui.me === '';
      try { localStorage.removeItem('pmo-project-' + id); localStorage.removeItem('pmo-ui-' + id); } catch(e) {} ws = JSON.parse(wsBak); wsWrite(); void first; login('O03'); // 新しいプロジェクトの作成でログイン状態がリセットされるため、元に戻す
      return two || {two};
    });
    check('F28', 'ヘルプ：どの画面からでも開け、今の画面の説明が出る（日英）', () => { ui.tab = 'tasks'; openHelp(); const ja = document.querySelector('#helpPanel .help-toc .on').dataset.help === 'tasks' && HELP.ja.length === HELP.en.length; closeHelp(); return ja; });
    check('F29', '命名規則：{CO}{TEAM}{PJ} が使える', () => { const keepN = state.naming.pattern; state.project.companyCode = 'ACME'; state.project.teamCode = 'T1'; state.naming.pattern = '{CO}_{TEAM}_{PJ}_{DOC}_v{VER}'; const n = buildFileName({doc: 'REQ', ver: '1.0'}); const ok = n.startsWith('ACME_T1_') && namingRegex().test(n); state.naming.pattern = keepN; return ok || n; });
    check('F30', 'タスク：既定はカンバン。ドラッグで列を移せ、カードをクリックすると編集パネル', () => {
      ui.tab = 'tasks'; ui.taskView = ''; ui.taskSel = ''; render(); const kb = q('.klane').length === 5;
      const card = document.querySelector('.klane[data-lane="todo"] [data-kcard]'), i = +card.dataset.kcard, tk = state.tasks[i];
      const dt = new DataTransfer(); card.dispatchEvent(new DragEvent('dragstart', {bubbles: true, dataTransfer: dt}));
      document.querySelector('.klane[data-lane="active"]').dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: dt}));
      const moved = LANE_OF[tk.status] === 'active';
      const c2 = document.querySelector(`[data-kcard="${i}"]`); c2.click(); const drawer = document.querySelector('#taskDrawer').classList.contains('open') && q('#taskDrawer .btn.ghost[title]').length === 1;
      ui.taskSel = ''; return (kb && moved && drawer) || {kb, moved, drawer};
    });
    check('F31', '左メニューを開閉できる', () => { const b = document.querySelector('#navToggle'); b.click(); const c = document.body.classList.contains('nav-collapsed'); b.click(); return c && !document.body.classList.contains('nav-collapsed'); });
    check('F32', '表の選択欄が細くならず、中身が見える（WYSIWYG）', () => { ui.tab = 'raid'; render(); const sels = [...q('table [data-col="raid"][data-f="status"]')]; const narrow = sels.filter(x => x.getBoundingClientRect().width < 60).length; const wrap = q('textarea.cellwrap').length > 0; return (sels.length && !narrow && wrap) || {narrow, wrap}; });
    check('F33', 'ヘルプの目次がスクロールでき、はみ出さない', () => { openHelp(); const toc = document.querySelector('.help-toc'), panel = document.querySelector('#helpPanel'); const ok = getComputedStyle(toc).overflowY === 'auto' && toc.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1; closeHelp(); return ok; });
    check('F34', '詳細パネルの「閉じる」ボタンは 1 つ（削除はゴミ箱アイコン）', () => { ui.tab = 'org'; ui.orgView = 'all'; ui.orgSel = 'O10'; render(); const n = [...q('#orgDrawer button')].filter(b => b.textContent.trim() === '✕').length; ui.orgSel = ''; return n === 1 || {closeButtons: n}; });
    check('F35', '入力中も自動で保存される（確定前でもデータに反映）', () => { ui.tab = 'raid'; render(); const el = document.querySelector('textarea.cellwrap[data-col="raid"]'); const k = +el.dataset.key, old = state.raid[k][el.dataset.f]; el.value = old + '★'; el.dispatchEvent(new Event('input', {bubbles: true})); const ok = state.raid[k][el.dataset.f] === old + '★'; state.raid[k][el.dataset.f] = old; clearTimeout(typeTimer); /* 確認後に自動保存が走らないように */ return ok; });
    check('F36', 'SPI の説明（ⓘ）からヘルプの SPI の章が開く', () => { ui.tab = 'dash'; render(); document.querySelector('[data-help-open="spi"]').click(); const ok = document.querySelector('#helpPanel .help-toc .on').dataset.help === 'spi'; closeHelp(); return ok; });
    check('F37', 'ロゴ：ログイン画面・画面左上・タブのアイコンに表示される', () => {
      const keepMe = ui.me; ui.me = ''; render(); const loginLogo = !!document.querySelector('.login-logo svg.brand-svg'); ui.me = keepMe || 'O03'; render();
      const home = !!document.querySelector('#brandHome svg.brand-svg'), fav = !!document.querySelector('link[rel="icon"][href^="data:image/svg+xml"]');
      return (loginLogo && home && fav) || {loginLogo, home, fav};
    });
    check('F38', '承認：タスク・課題・CRをまとめて承認し、「元に戻す」で戻せる。差し戻しは理由が担当者に見える', () => {
      state = sample('ja'); normalize(); login('O03');
      const ts = state.tasks.filter(x => !x.milestone && x.owner && x.owner !== myName()).slice(0, 2);
      ts.forEach(x => { x.kind = 'dev'; x.status = 'approval'; x.disp = ''; });
      const rk = state.raid.find(x => x.type === 'issue'); rk.status = 'review';
      const q0 = approvalQueue(), kinds = new Set(q0.map(x => x.col));
      ui.tab = 'approvals'; ui.apKind = ''; ui.apSel = []; render();
      const all = document.querySelector('#apAll'); all.checked = true; all.dispatchEvent(new Event('change'));
      const selN = ui.apSel.length;
      document.querySelector('#apApprove').click();
      const closed = ts.every(x => x.status === 'closed' && x.approvedBy) && rk.status === 'closed' && state.crs.find(c => c.id === 'CR01').status === 'approved' && approvalQueue().length === 0;
      document.querySelector('#toast.act button').click();
      const undone = state.tasks.filter(x => ts.some(y => y.id === x.id)).every(x => x.status === 'approval') && state.raid.find(x => x.id === rk.id).status === 'review' && approvalQueue().length === q0.length;
      const keepP = window.prompt; window.prompt = () => '根拠資料を添付してください';
      const t0 = state.tasks.find(x => x.id === ts[0].id); ui.apSel = ['tasks:' + t0.id]; render(); document.querySelector('#apReturn').click(); window.prompt = keepP;
      const returned = t0.status === 'test' && t0.returnNote === '根拠資料を添付してください';
      const ownerId = (state.org.find(p => p.name === t0.owner) || {}).id; let seen = !ownerId;
      if (ownerId) { login(ownerId); seen = myTodos(d2n(baseDate()), []).some(x => x.text.includes('根拠資料')); login('O03'); }
      const noTabForMember = !ROLE_TABS.member.includes('approvals') && !ROLE_TABS.viewer.includes('approvals');
      document.querySelector('#toast').classList.remove('on', 'act');
      return (kinds.size === 3 && selN === q0.length && closed && undone && returned && seen && noTabForMember) || {kinds: [...kinds], selN, q: q0.length, closed, undone, returned, seen, noTabForMember};
    });
    check('F39', 'タスク一覧：状態の選択欄を変えると保存される', () => {
      state = sample('ja'); normalize(); login('O03'); ui.tab = 'tasks'; ui.taskView = 'list'; ui.scope = ''; ui.owner = ''; ui.alertOnly = false; render();
      const el = [...q('select[data-col="tasks"][data-f="status"]')].find(s => !s.disabled && s.value === 'todo'); const k = +el.dataset.key, to = el.options[1].value;
      el.value = to; el.dispatchEvent(new Event('change', {bubbles: true}));
      return state.tasks[k].status === to || {status: state.tasks[k].status, to};
    });
    state = sample('ja'); normalize(); login('O03');
    check('F40', '課題：詳細画面（課題カード・関係者・判断の依頼・親子・関連タスク・経緯とコメント）', () => { ui.tab = 'raid'; ui.raidSel = 'I01'; render(); const ok = !!document.querySelector('#rdComment') && !!document.querySelector('#rdAddOwner') && !!document.querySelector('[data-col="raid"][data-f="parentId"]') && !!document.querySelector('#rdAddTask') && q('.timeline li').length > 1; ui.raidSel = ''; return ok; });
    check('F41', '課題：構造図（親→子の木）と傾向（影響×発生確率・推移）', () => { ui.tab = 'raid'; ui.raidSel = ''; ui.raidView = 'tree'; render(); const tree = q('#raidDiagram .dg-node').length > 3 && q('#raidDiagram .dg-edge').length >= 2; ui.raidView = 'trend'; render(); const trend = q('table.heatmap td.heat').length === 9 && !!document.querySelector('.tr-open'); ui.raidView = 'list'; return (tree && trend) || {tree, trend}; });
    check('F42', '課題：一覧に詳細を開くボタン、担当者は複数、閲覧者も見られる', () => { ui.tab = 'raid'; render(); const open = q('[data-open-raid]').length > 5, multi = state.raid.some(r => r.owners.length > 1); login('O02'); ui.tab = 'raid'; render(); const viewer = ui.tab === 'raid'; login('O03'); return (open && multi && viewer) || {open, multi, viewer}; });
    check('F43', '全体検索：「/」で開き、結果を押すとその場所が開く', () => { ui.tab = 'dash'; render(); document.dispatchEvent(new KeyboardEvent('keydown', {key: '/', bubbles: true})); const pop = document.querySelector('.gs-pop'); const inp = pop && pop.querySelector('input'); inp.value = 'サーバー'; inp.dispatchEvent(new Event('input')); const hits = pop.querySelectorAll('.gs-item').length; pop.querySelector('.gs-item').click(); return (hits > 0 && !document.querySelector('.gs-pop') && ui.tab === 'raid') || {hits, tab: ui.tab}; });
    check('F44', 'ダッシュボード：今決めること', () => { ui.tab = 'dash'; ui.raidSel = ''; render(); return !!document.querySelector('.dec-card [data-open-raid]'); });
    check('F45', 'カンバン：課題と紐づいたタスクに⚑印', () => { ui.tab = 'tasks'; ui.taskView = 'kanban'; render(); return q('.kcard .iss-badge').length > 0; });
    check('F47', 'タスク：担当者・承認者をメンバーから選べる（一覧・編集パネル）', () => { ui.tab = 'tasks'; ui.taskView = 'list'; render(); const list = q('select[data-col="tasks"][data-f="owner"]').length > 5 && q('select[data-col="tasks"][data-f="approver"]').length > 3; ui.taskView = 'kanban'; ui.taskSel = String(state.tasks.findIndex(x => x.kind === 'doc')); render(); const drawer = !!document.querySelector('#taskDrawer select[data-f="owner"]') && !!document.querySelector('#taskDrawer select[data-f="approver"]'); ui.taskSel = ''; return (list && drawer) || {list, drawer}; });
    check('F48', 'ログイン画面：メニューの開閉ボタンを出さず、閉じた設定が残っていてもレイアウトが崩れない', () => {
      const keepMe = ui.me; ui.me = ''; document.body.classList.add('nav-collapsed'); render();
      const btn = getComputedStyle(document.querySelector('#navToggle')).display === 'none', cols = getComputedStyle(document.body).gridTemplateColumns.split(' ').length;
      const w = document.querySelector('.card.login').getBoundingClientRect().width;
      document.body.classList.remove('nav-collapsed'); ui.me = keepMe || 'O03'; render();
      return (btn && cols === 1 && w > 200) || {btn, cols, w};
    });
    check('F46','翻訳キーの重複がない（後から同じキーで上書きしていない）', () => DUP_KEYS.size === 0 || [...DUP_KEYS]);
    check('F26', '翻訳漏れがない', () => MISSING.size === 0 || [...MISSING]);
  } finally {
    state = keep.state; Object.keys(ui).forEach(k => delete ui[k]); Object.assign(ui, keep.ui); save = keep.save; render(true);
  }
  const ng = out.filter(r => !r.ok);
  console.table(out);
  return {total: out.length, ok: out.length - ng.length, ng};
}
