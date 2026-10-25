// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ヘルプ（どの画面からでも「？」ですぐ開ける説明書） ============
// 今いる画面の説明を最初に開く。内容は README と同じ考え方で、画面ごとに短くまとめる。
const HELP_FOR_TAB = {mine: 'mine', dash: 'dash', alerts: 'alerts', phases: 'phases', tasks: 'tasks', raid: 'raid', meetings: 'meetings', org: 'org', governance: 'governance', report: 'report', settings: 'data'};
const HELP = {
  ja: [
    ['intro', 'このツールでできること', `**Kizashi（兆し）** は、PMO（プロジェクト管理）の「見える化」「早期警戒」「報告の自動化」を、1つのファイルで行うツールです。遅れの「兆し」を先に見つけるのが名前の由来です。\n- インストール不要。Kizashi.html を開くだけで動きます\n- データはこのPCのブラウザの中だけに保存され、外部には送信されません\n- 日本語と英語を画面右上で切り替えられます（週次報告は画面とは別に言語を選べます）`],
    ['start', 'はじめかた（3ステップ）', `1. 「新しいプロジェクト」→ 名前・期間・自分のパスコードを入力\n2. フェーズの型（システム開発／業務改革・コンサル／アジャイル）を選ぶ\n3. 確認して作成。フェーズ・マイルストーン・ガバナンスの雛形・週次定例・体制図が自動でできます\n\nExcelのWBSがあれば、作成と同時にCSVで取り込めます。`],
    ['codes', '会社・チーム・PJコード', `1つのブラウザで複数のプロジェクトを持てます。画面左上のプロジェクト名を押すと切り替えメニューが開き、**会社コード › チームコード** ごとにまとめて表示されます。\n- コードは「設定・データ」または「はじめかた」で設定します\n- ファイル命名規則で {CO}（会社）{TEAM}（チーム）{PJ}（PJ）を使えます\n- ログインはプロジェクトごとに別です`],
    ['login', 'ログインとロール', `自分の名前を選び、自分で決めたパスコードで入ります。PMも他の人の画面には入れません。\n- **PM**：すべての操作とロールの付与\n- **PMO**：ロール付与とデータ初期化以外の管理\n- **リード**：担当フェーズの管理、承認\n- **メンバー**：自分のタスク・宿題の更新、課題の起票\n- **閲覧者**：見るだけ\n\nPMが体制図で「案内文をコピー」すると、案内コード付きの文面ができます。本人は初回ログインで自分のパスコードを決めます。`],
    ['mine', '自分の仕事', `ログインした人が「今やること」を自動でまとめた画面です。期限切れ・更新忘れ・宿題・会議の準備・承認待ちなどが並びます。タスクの進捗はスライダーで更新できます。`],
    ['dash', 'ダッシュボード', `全体ステータス（Red／Amber／Green）、進捗（実績／計画）、SPI、警戒件数、会議の記録率、ガバナンスの合意状況を一目で確認できます。画面上部の「表示フェーズ」でフェーズごとに切り替えられます。`],
    ['spi', 'SPI（スケジュール効率）とは', `**SPI ＝ 実際に終わった仕事量 ÷ 今日までに終わっている予定の仕事量** です。プロジェクト管理で広く使われる指標（アーンドバリュー法：EVM）の1つで、KPIとして使えます。
- **1.00**：計画どおり　**1.00より上**：前倒し　**1.00より下**：遅れ（0.90なら、予定の90%しか進んでいない）
- **予定の仕事量**：各タスクを「開始日から終了日まで毎日同じペースで進む」とみなし、基準日時点で終わっているはずの割合を出して、タスクの日数で重み付けして合計します
- **実際の仕事量**：各タスクの進捗%に日数を掛けて合計します（進捗%はステータスから自動で入ります）
- **判定**：0.95未満で Amber、0.85未満で Red（「設定・データ」で変更できます）。重要度「高」の警戒の件数も全体ステータスに使います
- Backlog と見送りのタスクは計算に入れません`],
    ['alerts', '早期警戒', `期限超過・進捗遅延・期限延長の常態化・更新停滞・負荷集中・契約期間の超過・会議の結果未記録など、遅れの兆候を自動で判定します。判定ルールと しきい値は同じ画面に表示され、「設定・データ」で変えられます。`],
    ['phases', 'フェーズ', `フェーズごとに契約形態（準委任／請負）、契約終了日、成果物、完了基準、フェーズゲートを管理します。契約終了日を超える計画は警戒します。`],
    ['tasks', 'タスク（ステータス・カンバン・扱い）', `**種類**を選ぶとステータスの流れが決まります。\n- 一般：未着手 → 進行中 → クローズ\n- 検討：未着手 → 議論中 → 方針確定 → クローズ\n- 開発：未着手 → 実装中 → テスト中 → 承認待ち → クローズ\n- 成果物：未着手 → 作成中 → レビュー中 → 承認待ち → クローズ\n\n承認待ちは、PM・PMO・担当リードが「承認」すると自動でクローズします（自分のタスクは承認不可）。\n\n**扱い**：次のフェーズに回す／Backlog（時期未定）／保留／見送り。表示は「一覧」「カンバン」「Backlog」から選べます。`],
    ['raid', 'リスク・課題（RAID）', `リスク・前提・課題・決定事項を、フェーズとカテゴリ（契約・スコープなど）ごとに管理します。影響度「高」のリスクに対策がないと警戒します。`],
    ['meetings', '会議', `「計画 → 結果の記録 → アクション完了」で管理します。目的と担当付きの議題を設定し、会議後に結論・決定事項・アクションを記録します。招集案内と議事録はボタンでコピーできます。`],
    ['org', '体制図とフロー', `図の種類：全体／顧客／自社／ベンダー／CRフロー／承認フロー／エスカレーション／カスタム。\n- 配置は「木構造」と「所属の列」を切り替えられます\n- 人にカーソルを合わせると、上司・部下・連携相手だけが浮かび上がります\n- **編集モード**（PM・PMO）：ドラッグで移動、下の丸から人へドラッグで報告ライン、右の丸から連携線、線をクリックで外す、空き領域のダブルクリックで追加\n- フローは右の丸からドラッグで矢印をつなぎ、分岐（承認／却下）や差し戻しも描けます\n- メンバーの追加・編集は「メンバー一覧」でもできます`],
    ['governance', 'ガバナンス', `フォルダ構成・命名規則・承認ステップ・CRの起票基準・会議体・RACIなど、全フェーズ共通のルールを序盤に決めます。合意目標日を過ぎると警戒します。命名ルールツールで規則どおりのファイル名を作れます。`],
    ['report', '週次レポート', `数値・警戒・リスク・会議の決定事項から週次報告を自動で作ります。日本語／英語を選び、Markdownコピー・.md保存・印刷（PDF）ができます。「今回の数値を記録」で推移グラフに反映されます。`],
    ['data', 'データの保存と共有', `- データはこのPCのブラウザの中だけに保存されます。ブラウザのデータを消すと失われるので、「JSONでバックアップ」を定期的に行ってください\n- チームで共有するときは、PMがJSONを書き出して渡し、受け取った人はログイン画面の「受け取ったデータ（JSON）を読み込む」で読み込みます。同じプロジェクトなら更新、違えば新しいプロジェクトとして追加されます\n- パスコードは暗号化（ハッシュ化）して保存されますが、ローカル版は「誤操作を防ぐ」ための仕組みです。厳密な保護にはクラウド版が必要です`],
    ['faq', 'よくある質問', `**Q. 友だちや同僚に見せたい**\nA. Kizashi.html を渡すだけで動きます。サンプルデータの間は、パスコードなしで誰の立場でも試せます。\n\n**Q. 入力したのに表示が変わらない**\nA. 入力欄からフォーカスを外す（Enter または別の場所をクリック）と保存・反映されます。\n\n**Q. 動作が遅い**\nA. 開発用の index.html ではなく、1ファイル版の Kizashi.html を使ってください。起動時間は「設定・データ」に表示されます。`],
  ],
  en: [
    ['intro', 'What this tool does', `**Kizashi** ("early sign") is a single-file PMO tool for visibility, early warning and automated status reporting — it spots the early signs of delay.\n- No installation: just open Kizashi.html\n- Data stays in this browser on this PC and is never sent anywhere\n- Switch Japanese / English at the top right (the status report language can be chosen separately)`],
    ['start', 'Getting started (3 steps)', `1. "New project" → name, dates and your passcode\n2. Pick a phase template (System delivery / Transformation / Agile)\n3. Confirm. Phases, milestones, governance templates, weekly meetings and an org chart are created for you\n\nYou can import an Excel WBS (CSV) at the same time.`],
    ['codes', 'Company, team and project codes', `Keep several projects in one browser. Click the project name at the top left to open the switcher, grouped by **company › team**.\n- Set codes in Settings or in Get started\n- Naming conventions can use {CO}, {TEAM} and {PJ}\n- Sign-in is separate for each project`],
    ['login', 'Sign-in and roles', `Pick your name and enter your own passcode. Not even the PM can open someone else's screen.\n- **PM**: everything, including roles\n- **PMO**: all management except roles and data reset\n- **Lead**: manage own phases, approve\n- **Member**: update own tasks and actions, raise issues\n- **Viewer**: read-only\n\n"Copy invite" on the org chart creates a message with a one-time invitation code; the person chooses their passcode on first sign-in.`],
    ['mine', 'My work', `Your to-dos gathered automatically: overdue items, stale updates, actions, meeting prep and approvals. Update task progress with the slider.`],
    ['dash', 'Dashboard', `Overall status (Red / Amber / Green), progress vs plan, SPI, alerts, meeting records and governance at a glance. Use "Phase" at the top to scope to one phase.`],
    ['spi', 'What is SPI?', `**SPI = work actually done ÷ work that should be done by today.** It is a standard earned-value (EVM) metric and works as a KPI.
- **1.00** on schedule · **above 1.00** ahead · **below 1.00** behind (0.90 = only 90% of the planned work is done)
- **Planned work**: each task is assumed to progress evenly from start to end; the share due by the as-of date is weighted by the task's length and summed
- **Actual work**: each task's progress % (set automatically from its status) times its length, summed
- **Status**: below 0.95 = Amber, below 0.85 = Red (editable in Settings); the number of high alerts also counts
- Backlog and dropped tasks are excluded`],
    ['alerts', 'Early warning', `Detects overdue and slipping tasks, habitual re-planning, stale updates, overload, contract overrun, unrecorded meetings and more. Rules and thresholds are shown on the screen and editable in Settings.`],
    ['phases', 'Phases', `Track contract type, contract end, deliverables, exit criteria and phase gate per phase. Plans beyond the contract end raise an alert.`],
    ['tasks', 'Tasks (status, kanban, disposition)', `The **type** sets the status flow:\n- General: Not started → In progress → Closed\n- Decision: Not started → Discussing → Decided → Closed\n- Build: Not started → Building → Testing → Awaiting approval → Closed\n- Deliverable: Not started → Drafting → In review → Awaiting approval → Closed\n\nA PM, PMO or phase lead closes approval items with "Approve" (not your own).\n\n**Disposition**: move to next phase / backlog / on hold / drop. Views: List, Kanban, Backlog.`],
    ['raid', 'RAID', `Risks, assumptions, issues and decisions by phase and category (contract, scope…). High-impact risks without a mitigation raise an alert.`],
    ['meetings', 'Meetings', `Plan → record outcomes → close actions. Set a purpose and agenda with owners; record outcomes, decisions and actions afterwards. Copy the invite and minutes with one click.`],
    ['org', 'Org chart and flows', `Charts: everyone / client / our team / vendor / CR flow / approval flow / escalation / custom.\n- Switch between Tree and By-organization layouts\n- Hover a person to highlight their manager, reports and counterparts\n- **Edit mode** (PM, PMO): drag to move; bottom dot → person = reporting line; right dot → counterpart; click a line to remove; double-click empty space to add\n- Flows: drag from the right dot to connect steps, including branches (approve / reject) and loops\n- Members can also be added and edited in the member list`],
    ['governance', 'Governance', `Agree project-wide rules early: folders, naming, approvals, CR criteria, meeting bodies, RACI. Rules past their target date raise an alert. The naming tool builds compliant file names.`],
    ['report', 'Status report', `Generated from figures, alerts, RAID and meeting decisions. Choose Japanese or English; copy as Markdown, save .md, or print to PDF. "Record figures" feeds the trend chart.`],
    ['data', 'Saving and sharing data', `- Data lives only in this browser. Clearing browser data deletes it, so back up regularly with "Back up (JSON)"\n- To share, the PM exports JSON; others load it with "Load shared data (JSON)" on the sign-in screen. The same project is updated; a different one is added\n- Passcodes are stored hashed, but the local version prevents mistakes rather than enforcing security — strict protection needs the cloud version`],
    ['faq', 'FAQ', `**Q. How do I show this to a friend?**\nA. Send Kizashi.html. While sample data is loaded, anyone can sign in as any role without a passcode.\n\n**Q. My edit didn't show up**\nA. Edits are saved when the field loses focus (press Enter or click elsewhere).\n\n**Q. It feels slow**\nA. Use the single-file Kizashi.html rather than the development index.html. Startup time is shown in Settings.`],
  ],
};
function openHelp(section){
  const lang = LANG(), list = HELP[lang] || HELP.ja;
  const cur = section || HELP_FOR_TAB[ui.tab] || 'intro';
  let el = $('#helpPanel');
  if (!el) { el = document.createElement('aside'); el.id = 'helpPanel'; el.className = 'help-panel'; document.body.appendChild(el); }
  el.innerHTML = `<div class="help-head"><b>${t('help.title')}</b><span class="sp"></span><button class="btn ghost" id="helpClose" title="${t('org.close')}">✕</button></div>
    <div class="help-body">
      <div class="help-toc" role="navigation">${list.map(([k, title]) => `<button class="${k === cur ? 'on' : ''}" data-help="${k}">${esc(title)}</button>`).join('')}</div>
      <article class="help-art report">${(() => { const s = list.find(x => x[0] === cur) || list[0]; return `<h2>${esc(s[1])}</h2>${mdToHtml(s[2])}`; })()}
        <p class="muted small" style="margin-top:18px">${t('help.more')}</p></article>
    </div>`;
  void el.offsetWidth; el.classList.add('open'); // すぐに開く（直後の「閉じる」が確実に効くように）
  el.querySelector('#helpClose').onclick = closeHelp;
  el.querySelectorAll('[data-help]').forEach(b => b.onclick = () => openHelp(b.dataset.help));
}
function closeHelp(){ const el = $('#helpPanel'); if (el) el.classList.remove('open'); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeHelp();
  if (e.key === '?' && !e.target.closest('input,textarea,select')) { const el = $('#helpPanel'); if (el && el.classList.contains('open')) closeHelp(); else openHelp(); }
});
