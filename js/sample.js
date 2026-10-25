// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ガバナンス（フェーズ共通ルール）のテンプレート ============
function defaultNaming(lang){
  const J = lang === 'ja';
  return {
    pattern: '{PJ}_{PHASE}_{DOC}_{TITLE}_v{VER}_{DATE}',
    docTypes: J
      ? 'PLN=計画書\nREQ=要件定義書\nBD=基本設計書\nDD=詳細設計書\nTST=テスト計画・仕様書\nMIG=移行計画書\nMIN=議事録\nRPT=報告書\nCR=変更要求書\nREV=レビュー記録'
      : 'PLN=Plan\nREQ=Requirements\nBD=Basic design\nDD=Detailed design\nTST=Test plan / spec\nMIG=Migration plan\nMIN=Minutes\nRPT=Report\nCR=Change request\nREV=Review record',
  };
}
function folderTree(lang){
  const J = lang === 'ja', code = (state && state.project.code) || 'PJ';
  const ph = (state && state.phases.length) ? state.phases : [];
  const sub = J ? ['01_作業中（WIP）','02_レビュー中','03_承認済（最終版）'] : ['01_WIP','02_In-review','03_Approved (final)'];
  const pmo = J ? ['01_計画・ガバナンス','02_会議・議事録','03_週次報告','04_変更要求（CR）','05_契約・検収'] : ['01_Plan & governance','02_Meetings & minutes','03_Status reports','04_Change requests','05_Contract & acceptance'];
  const out = [`${code}/`, `├─ 00_PMO/`];
  pmo.forEach((s, i) => out.push(`│   ${i === pmo.length - 1 ? '└' : '├'}─ ${s}`));
  ph.forEach(p => { out.push(`├─ ${p.code}_${p.name}/`); sub.forEach((s, i) => out.push(`│   ${i === sub.length - 1 ? '└' : '├'}─ ${s}`)); });
  out.push(`└─ 99_${J ? 'アーカイブ' : 'Archive'}/`);
  out.push('', J ? 'ルール：' : 'Rules:');
  out.push(...(J
    ? ['- 「承認済」のファイルは直接編集しない。改版は「作業中」で新しい版数を作成する','- 個人フォルダ・ローカル・メール添付での共有は禁止（共有リンクを使う）','- フォルダの追加は PMO に申請する']
    : ['- Never edit files in "Approved" directly; create a new version in "WIP"','- No sharing via personal folders, local drives or email attachments (use links)','- Request PMO approval before adding top-level folders']));
  return out.join('\n');
}
function governanceTemplates(lang){
  const J = lang === 'ja';
  const g = (id, category, title, targetDays, content) => ({id, category, title, targetDays, content, owner: '', status: 'notset', agreedDate: ''});
  return [
    g('G01','structure', J ? 'フォルダ構成' : 'Folder structure', 7, folderTree(lang)),
    g('G02','naming', J ? 'ファイル命名規則' : 'File naming convention', 7, J
      ? '形式：{PJ}_{PHASE}_{DOC}_{TITLE}_v{VER}_{DATE}\n例：KIKAN_30_DD_在庫管理_v0.3_20261011.xlsx\n\n- ファイル名は「命名ルールツール」で生成し、手入力しない\n- 版数：ドラフトは v0.x、顧客承認後に v1.0、承認後の改版は v1.1…\n- 日付は最終更新日（YYYYMMDD）\n- スペース・機種依存文字・「最新」「最終」などの語は使わない'
      : 'Format: {PJ}_{PHASE}_{DOC}_{TITLE}_v{VER}_{DATE}\nExample: ERP_30_DD_Inventory_v0.3_20261011.xlsx\n\n- Generate names with the naming tool; do not type them by hand\n- Versions: drafts v0.x, v1.0 on client approval, v1.1… after approval\n- Date = last updated (YYYYMMDD)\n- No spaces, special characters, or words like "final" / "latest"'),
    g('G03','approval', J ? '成果物の承認ステップ' : 'Deliverable approval steps', 14, J
      ? '1. 作成者：ドラフト作成（v0.x）→「作業中」フォルダ\n2. チーム内レビュー：レビュー記録（REV）に指摘を記入し、作成者が対応\n3. PMレビュー：品質基準（DoD）を満たすか確認 →「レビュー中」へ移動\n4. 顧客レビュー：顧客担当者へ提出（レビュー期間は原則5営業日）\n5. 承認：顧客責任者が承認 → v1.0 として「承認済」へ格納し、RAIDの決定事項に登録\n\n- 承認の証跡（メール・議事録）は 00_PMO/01 に保存する'
      : '1. Author: draft (v0.x) in "WIP"\n2. Peer review: comments in review record (REV); author resolves\n3. PM review: check against Definition of Done → move to "In-review"\n4. Client review: submit to client lead (5 business days by default)\n5. Approval: client owner approves → store as v1.0 in "Approved" and log a Decision in RAID\n\n- Keep approval evidence (email / minutes) in 00_PMO/01'),
    g('G04','cr', J ? '変更要求（CR）の起票ルール' : 'Change request (CR) rules', 14, J
      ? 'CRとして起票する基準（いずれかに該当）：\n- 承認済みの要件・設計・スコープの追加／変更／削除\n- マイルストーン日付の変更、またはスケジュール影響が5営業日以上\n- 工数・費用への影響（契約金額・契約期間の変更を伴うもの）\n- 契約上の成果物・受入基準の変更\n\n手順：起票 → 影響分析（スコープ／スケジュール／コスト／品質）→ 変更管理会議（CCB）で判断 → 承認／却下を記録 → 計画へ反映\n\n上記に該当しない軽微な変更は課題として扱い、週次定例で報告する'
      : 'Raise a CR when any of the following applies:\n- Adding / changing / removing approved requirements, design or scope\n- Changing a milestone date, or schedule impact of 5+ business days\n- Effort or cost impact (incl. changes to contract value or term)\n- Changes to contractual deliverables or acceptance criteria\n\nFlow: raise → impact analysis (scope / schedule / cost / quality) → decision at CCB → record approval or rejection → update the plan\n\nMinor changes that do not meet the criteria are handled as issues and reported in the weekly meeting'),
    g('G05','comm', J ? '会議体・コミュニケーションルール' : 'Meeting & communication rules', 7, J
      ? '- 会議体は「会議体の定義」に従う（目的・頻度・参加者・標準アジェンダ）\n- 全会議の必須事項：目的と担当者付きアジェンダを前営業日までに共有する\n- 会議後24時間以内に、議題ごとの結論・決定事項・アクション（担当・期限）を記録する\n- 目的やアジェンダがない会議は開催しない\n- 週次報告は毎週金曜に配信する'
      : '- Meetings follow the "Meeting bodies" definitions (purpose, cadence, attendees, standard agenda)\n- Mandatory: share purpose and an agenda with owners by the previous business day\n- Within 24h after the meeting, record outcomes per agenda item, decisions and actions (owner + due date)\n- No purpose or agenda → no meeting\n- Weekly status report is issued every Friday'),
    g('G06','raci', J ? '役割分担（RACI）' : 'Roles & responsibilities (RACI)', 14, J
      ? '| 項目 | 顧客PO | 顧客情シス | PM | 業務リード | ベンダー |\n|---|---|---|---|---|---|\n| 要件承認 | A | C | R | R | I |\n| 設計承認 | A | C | R | C | C |\n| CR判断 | A | C | R | C | C |\n| 週次報告 | I | I | A/R | C | C |\n\nR=実行責任 A=説明責任 C=協議 I=報告'
      : '| Item | Client PO | Client IT | PM | Business lead | Vendor |\n|---|---|---|---|---|---|\n| Requirements sign-off | A | C | R | R | I |\n| Design sign-off | A | C | R | C | C |\n| CR decision | A | C | R | C | C |\n| Status report | I | I | A/R | C | C |\n\nR=Responsible A=Accountable C=Consulted I=Informed'),
    g('G07','escalation', J ? 'エスカレーションルール' : 'Escalation path', 14, J
      ? 'レベル1：担当者間で2営業日以内に解決を試みる\nレベル2：PM → 顧客プロジェクトリーダー（週次定例または随時）\nレベル3：ステアリングコミッティ（重要度「高」で、レベル2から3営業日以内に解決しない場合）\n\nエスカレーションするときは「事象・影響・選択肢・推奨案・判断期限」を1枚にまとめて提示する'
      : 'Level 1: owners try to resolve within 2 business days\nLevel 2: PM → client project lead (weekly meeting or ad hoc)\nLevel 3: Steering committee (high severity, not resolved within 3 business days at Level 2)\n\nEscalate on one page: issue, impact, options, recommendation, decision deadline'),
    g('G08','quality', J ? '品質基準・完了の定義（DoD）' : 'Quality standard / Definition of Done', 30, J
      ? '成果物の完了条件（全フェーズ共通）：\n- 標準テンプレートを使い、必須項目がすべて埋まっている\n- チーム内レビューが完了し、指摘がすべてクローズしている\n- 関連する要件ID・課題IDとのトレーサビリティが取れている\n- 命名規則どおりのファイル名で、所定のフォルダに格納されている'
      : 'Deliverable is done when (all phases):\n- Built from the standard template with all mandatory sections filled\n- Peer review completed and all comments closed\n- Traceable to related requirement / issue IDs\n- Named per the naming convention and stored in the right folder'),
    g('G09','docs', J ? '標準テンプレート' : 'Standard templates', 30, J
      ? '- 議事録：本ツールの「議事録をコピー」形式\n- 週次報告：本ツールの週次レポート\n- 変更要求書（CR）\n- レビュー記録（REV）\n- 課題・リスク管理表：本ツールのRAID'
      : '- Minutes: "Copy minutes" format of this tool\n- Weekly status: weekly report of this tool\n- Change request form (CR)\n- Review record (REV)\n- RAID log: RAID tab of this tool'),
    g('G10','tools', J ? 'ツール利用ルール' : 'Tooling rules', 7, J
      ? '- タスク・課題・会議・CRは本ツールを正とする（Excelの別管理はしない）\n- チャットでの合意は、必ず議事録または決定事項に転記する\n- ファイル共有は指定の共有ストレージのみを使う'
      : '- This tool is the single source of truth for tasks, RAID, meetings and CRs (no side spreadsheets)\n- Agreements made in chat must be recorded in minutes or the decision log\n- Share files only via the designated shared storage'),
    g('G11','security', J ? '情報セキュリティ' : 'Information security', 7, J
      ? '- 顧客データは持ち出し禁止（許可された環境でのみ扱う）\n- 個人情報を含むファイルはファイル名に [CONF] を付け、閲覧権限を限定する\n- 生成AIなどの外部サービスに顧客情報を入力しない（許可されたものを除く）'
      : '- Client data must not leave approved environments\n- Files containing personal data are tagged [CONF] and access-restricted\n- Do not enter client information into external services (incl. generative AI) unless approved'),
    g('G12','raidrule', J ? 'リスク・課題管理ルール' : 'RAID management rules', 14, J
      ? '- リスク：影響度と発生可能性を評価する。影響度「高」は対応策の記入を必須とする\n- 課題：担当と期限を必須とする\n- 契約に関わる課題はカテゴリ「契約」で起票し、対象フェーズを必ず指定する\n- 週次定例でオープン案件をすべてレビューする'
      : '- Risks: rate impact and probability; high-impact risks require a mitigation\n- Issues: owner and due date are mandatory\n- Contract-related items use category "Contract" and must reference a phase\n- All open items are reviewed in the weekly meeting'),
  ];
}
function meetingTypeTemplates(lang){
  const J = lang === 'ja';
  const mt = (id, name, cadence, duration, attendees, purpose, agenda) => ({id, name, cadence, duration, attendees, purpose, agenda});
  return [
    mt('MT01', J ? '週次定例' : 'Weekly status meeting', J ? '毎週' : 'Weekly', 60, J ? 'PM, 各リード, 顧客PL' : 'PM, leads, client PL',
      J ? '進捗と課題を共有し、対応を決める' : 'Share progress & issues and decide actions',
      J ? '前回アクションの確認\n進捗報告（フェーズ別）\n早期警戒アラートの確認\n課題・リスクの対応方針の決定\n今週のアクション確認' : 'Review previous actions\nProgress by phase\nEarly-warning alerts\nDecide on issues & risks\nConfirm this week\'s actions'),
    mt('MT02', J ? 'ステアリングコミッティ' : 'Steering committee', J ? '月次' : 'Monthly', 60, J ? '顧客役員, 顧客PL, PM' : 'Client executives, client PL, PM',
      J ? '重要事項の意思決定と全体状況の承認' : 'Make key decisions and endorse overall status',
      J ? '全体ステータス報告\nフェーズゲート判定\n判断が必要な重要課題・リスク\nCRの承認判断\n次回までのアクション' : 'Overall status\nPhase gate decision\nKey issues & risks needing a decision\nCR approvals\nActions until next meeting'),
    mt('MT03', J ? '変更管理会議（CCB）' : 'Change control board (CCB)', J ? '隔週' : 'Bi-weekly', 30, J ? '顧客PO, PM, 業務リード' : 'Client PO, PM, business lead',
      J ? '変更要求の承認・却下を判断する' : 'Approve or reject change requests',
      J ? '新規CRの説明\n影響分析の結果\n承認／却下の判断\n計画への反映方針' : 'New CRs\nImpact analysis\nApprove / reject\nPlan update'),
    mt('MT04', J ? '設計レビュー' : 'Design review', J ? '随時' : 'Ad hoc', 90, J ? '作成者, レビュアー, 顧客担当' : 'Author, reviewers, client SME',
      J ? '成果物の承認可否を判断する' : 'Decide whether the deliverable can be approved',
      J ? 'レビュー対象と範囲の確認\n指摘事項の説明\n承認可否の判断\n修正アクションの確認' : 'Scope of review\nFindings\nApproval decision\nRework actions'),
  ];
}

// ============ サンプルデータ（今日基準で生成） ============
function sample(lang){
  const J = lang === 'ja', T = (ja, en) => J ? ja : en;
  const b = d2n(todayStr()), o = k => n2d(b + k);
  const P = (id, code, name, owner, contract, ref, ce, gate, deliv, exit) => ({id, code, name, start:'', end:'', owner, contract, contractRef: ref, contractEnd: ce === null ? '' : o(ce), deliverables: deliv, exitCriteria: exit, gate});
  const t = (id, ph, name, owner, s, e, be, p, st, ms, u) => ({id, phaseId: ph, name, owner, start:o(s), end:o(e), baselineEnd:o(be), progress:p, status:st, milestone:!!ms, updated:o(u)});
  const [sato, tanaka, suzuki, yamamoto, takahashi, ito] = J ? ['佐藤','田中','鈴木','山本','高橋','伊藤'] : ['Sato','Tanaka','Suzuki','Yamamoto','Takahashi','Ito'];
  const s = {
    version: 2,
    project: { name: T('基幹システム刷新プロジェクト（サンプル）','ERP Modernization Program (sample)'), code: T('KIKAN','ERP'), client: T('〇〇製造株式会社','ACME Manufacturing'), pm: yamamoto, start:o(-70), end:o(85), baseDate:'', lang },
    settings: {...DEFAULT_SETTINGS},
    phases: [
      P('P1','10',T('要件定義','Requirements'),sato,'tm',T('業務委託契約 第1期','SOW #1'),-40,'approved',T('要件定義書\n業務フロー','Requirements spec\nBusiness process flows'),T('要件定義書の顧客承認','Client sign-off of requirements')),
      P('P2','20',T('基本設計','Basic design'),tanaka,'tm',T('業務委託契約 第2期','SOW #2'),-10,'approved',T('基本設計書\n外部IF仕様書','Basic design\nInterface spec'),T('ステコミでの基本設計承認','Steering committee sign-off')),
      P('P3','30',T('詳細設計','Detailed design'),tanaka,'fixed',T('請負契約 A-102','Fixed-price contract A-102'),9,'notyet',T('詳細設計書（販売・在庫・会計IF）\nDB設計書\n帳票設計書','Detailed design (Sales / Inventory / GL IF)\nDB design\nReport design'),T('全詳細設計書のレビュー完了と顧客承認\n成果物一覧に基づく検収','All design docs reviewed and approved\nAcceptance based on deliverable list')),
      P('P4','40',T('開発','Build'),suzuki,'fixed',T('請負契約 A-102','Fixed-price contract A-102'),45,'notyet',T('ソースコード\n単体テスト結果','Source code\nUnit test results'),T('単体テスト完了率100%、重大欠陥0件','100% unit tests passed, 0 critical defects')),
      P('P5','50',T('テスト','Test'),ito,'tm',T('業務委託契約 第3期','SOW #3'),75,'notyet',T('結合・総合テスト結果\nUAT結果','SIT / UAT results'),T('UAT合格判定','UAT exit sign-off')),
      P('P6','60',T('移行','Cutover'),takahashi,'tm',T('業務委託契約 第3期','SOW #3'),90,'notyet',T('移行計画書\nリハーサル結果','Cutover plan\nRehearsal results'),T('本番稼働判定（Go/No-Go）','Go / No-Go decision')),
    ],
    tasks: [
      t('T01','P1',T('業務要件ヒアリング','Business requirement workshops'),sato,-70,-55,-55,100,'done',0,-55),
      t('T02','P1',T('要件定義書作成・合意','Requirements spec & sign-off'),sato,-56,-45,-45,100,'done',0,-45),
      t('T03','P2',T('画面・帳票方式設計','Screen & report design'),tanaka,-45,-25,-25,100,'done',0,-25),
      t('T04','P2',T('外部IF設計','Interface design'),suzuki,-45,-18,-25,100,'done',0,-18),
      t('T05','P2',T('基本設計承認（ステコミ）','Basic design sign-off (SteerCo)'),yamamoto,-15,-15,-15,100,'done',1,-15),
      t('T06','P3',T('販売管理モジュール詳細設計','Sales module detailed design'),tanaka,-14,5,5,60,'doing',0,-1),
      t('T07','P3',T('在庫管理モジュール詳細設計','Inventory module detailed design'),suzuki,-14,3,3,30,'doing',0,-9),
      t('T08','P3',T('会計連携IF詳細設計','GL interface detailed design'),suzuki,-10,8,1,40,'doing',0,-2),
      t('T09','P3',T('DB設計','Database design'),takahashi,-20,-2,-2,85,'doing',0,-3),
      t('T10','P3',T('帳票詳細設計','Report detailed design'),ito,-5,6,6,0,'todo',0,-5),
      t('T11','P3',T('詳細設計完了','Detailed design complete'),yamamoto,10,10,10,0,'todo',1,-14),
      t('T12','P4',T('開発環境構築','Dev environment setup'),takahashi,-3,4,4,50,'doing',0,0),
      t('T13','P4',T('販売管理 開発','Sales module build'),tanaka,6,30,30,0,'todo',0,-14),
      t('T14','P4',T('在庫管理 開発','Inventory module build'),suzuki,4,32,32,0,'todo',0,-14),
      t('T15','P4',T('会計連携IF 開発','GL interface build'),suzuki,9,35,35,0,'todo',0,-14),
      t('T16','P4',T('単体テスト','Unit testing'),ito,20,40,40,0,'todo',0,-14),
      t('T17','P4',T('開発完了','Build complete'),yamamoto,40,40,40,0,'todo',1,-14),
      t('T18','P5',T('結合テスト','System integration test'),ito,38,60,60,0,'todo',0,-14),
      t('T19','P5',T('総合テスト・UAT','UAT'),sato,55,72,72,0,'todo',0,-14),
      t('T20','P6',T('移行計画策定','Cutover planning'),yamamoto,5,25,25,0,'todo',0,-14),
      t('T21','P6',T('データ移行リハーサル','Data migration rehearsal'),takahashi,60,78,78,0,'todo',0,-14),
      t('T22','P6',T('本番稼働','Go-live'),yamamoto,85,85,85,0,'todo',1,-14),
    ],
    raid: [
      {id:'R01',type:'risk',phaseId:'P3',category:'scope',title:T('在庫管理の仕様確定遅れにより開発着手が遅延する','Late inventory spec freeze delays build start'),owner:suzuki,impact:'H',prob:'H',status:'wip',raised:o(-12),due:o(3),mitigation:T('顧客キーマンとの仕様確定会議を今週中に設定','Spec freeze session with client key users this week')},
      {id:'R02',type:'risk',phaseId:'P3',category:'vendor',title:T('会計システムベンダーのIF仕様提示が遅れる','GL vendor late in providing interface spec'),owner:yamamoto,impact:'H',prob:'M',status:'open',raised:o(-8),due:o(7),mitigation:''},
      {id:'R03',type:'risk',phaseId:'P6',category:'technical',title:T('移行データの品質が低く、クレンジング工数が膨らむ','Poor legacy data quality inflates cleansing effort'),owner:takahashi,impact:'M',prob:'M',status:'open',raised:o(-20),due:o(30),mitigation:T('サンプルデータでの品質調査を前倒しで実施','Run data profiling early on samples')},
      {id:'I01',type:'issue',phaseId:'',category:'resource',title:T('テスト環境サーバーの調達が未完了','Test environment servers not yet procured'),owner:takahashi,impact:'H',prob:'',status:'open',raised:o(-20),due:o(-3),mitigation:T('顧客情シスに調達状況を確認中','Checking procurement status with client IT')},
      {id:'I02',type:'issue',phaseId:'P3',category:'scope',title:T('帳票の出力様式が顧客社内で未合意','Report layouts not agreed within client'),owner:ito,impact:'M',prob:'',status:'wip',raised:o(-6),due:o(5),mitigation:T('経理部長のレビューを依頼済み','Review requested from finance manager')},
      {id:'I03',type:'issue',phaseId:'P3',category:'contract',title:T('詳細設計の検収条件（成果物一覧）が契約書と一致していない','Detailed design acceptance criteria differ from the contract deliverable list'),owner:yamamoto,impact:'H',prob:'',status:'open',raised:o(-4),due:o(5),mitigation:T('顧客調達部門と契約変更の要否を確認','Confirm with client procurement whether a contract amendment is needed')},
      {id:'D01',type:'decision',phaseId:'P2',category:'other',title:T('基本設計書を承認（第3回ステコミ）','Basic design approved (SteerCo #3)'),owner:yamamoto,impact:'',prob:'',status:'closed',raised:o(-15),due:'',mitigation:''},
      {id:'A01',type:'assumption',phaseId:'P5',category:'resource',title:T('顧客側のUAT要員3名をテスト期間中に確保できる','3 client UAT testers available during test phase'),owner:sato,impact:'M',prob:'',status:'open',raised:o(-60),due:o(50),mitigation:''},
    ],
    crs: [
      {id:'CR01',phaseId:'P3',title:T('在庫引当ロジックの追加要件','Additional inventory allocation rules'),requester:T('顧客 物流部','Client logistics'),owner:suzuki,scope:T('引当ルール3種の追加','3 new allocation rules'),schedule:10,cost:T('40人日','40 person-days'),status:'pending',raised:o(-14),decided:'',note:''},
      {id:'CR02',phaseId:'P3',title:T('請求書レイアウトの変更','Invoice layout change'),requester:T('顧客 経理部','Client finance'),owner:ito,scope:T('帳票1本のレイアウト変更','1 report layout'),schedule:2,cost:T('3人日','3 person-days'),status:'approved',raised:o(-25),decided:o(-18),note:T('CCB にて承認','Approved at CCB')},
      {id:'CR03',phaseId:'P6',title:T('移行対象データ範囲の拡大（過去5年→10年）','Extend migrated history from 5 to 10 years'),requester:T('顧客 情シス','Client IT'),owner:takahashi,scope:T('移行対象期間の延長','Longer migration history'),schedule:0,cost:T('影響分析中','Under analysis'),status:'draft',raised:o(-2),decided:'',note:''},
    ],
    snapshots: [
      {date:o(-28),scope:'',planned:22,actual:22,spi:1.00,high:0},
      {date:o(-21),scope:'',planned:27,actual:26,spi:0.98,high:1},
      {date:o(-14),scope:'',planned:32,actual:31,spi:0.96,high:1},
      {date:o(-7), scope:'',planned:38,actual:35,spi:0.92,high:2},
    ],
    report: { topics:'', requests:'' },
  };
  // 会議体・ガバナンスは state を参照するので、一時的に差し替えて生成
  const prev = state; state = s;
  s.meetingTypes = meetingTypeTemplates(lang);
  s.naming = defaultNaming(lang);
  s.governance = governanceTemplates(lang);
  state = prev;
  const gs = {G01:['agreed',-60],G02:['agreed',-60],G03:['draft',null],G04:['draft',null],G05:['agreed',-62],G06:['notset',null],G07:['agreed',-50],G08:['draft',null],G09:['agreed',-40],G10:['agreed',-62],G11:['agreed',-65],G12:['agreed',-55]};
  s.governance.forEach(g => { const [st, d] = gs[g.id]; g.status = st; g.agreedDate = d === null ? '' : o(d); g.owner = yamamoto; });
  // 会議
  const ag = (topic, owner, minutes, ref, outcome) => ({topic, owner, minutes, ref: ref || '', outcome: outcome || ''});
  const mtg = (id, typeId, ph, d, time, status, purpose, agenda, extra) => {
    const mt = s.meetingTypes.find(x => x.id === typeId);
    return {id, typeId, title: mt.name, phaseId: ph, date: o(d), time, duration: mt.duration, location: T('会議室A / Teams','Room A / Teams'), organizer: yamamoto, attendees: mt.attendees, purpose, agenda, status, notes:'', decisions:[], actions:[], ...(extra || {})};
  };
  // 体制図
  const [tamura, nakamura, kobayashi, kato, matsumoto] = J ? ['田村','中村','小林','加藤','松本'] : ['Tamura','Nakamura','Kobayashi','Kato','Matsumoto'];
  const op = (id, name, role, org, parentId) => ({id, name, role, access: org === 'us' ? 'member' : 'viewer', org, parentId, note: ''});
  s.org = [
    op('O01', tamura, T('顧客役員（ステコミ議長）','Client exec (SteerCo chair)'), 'client', ''),
    op('O02', nakamura, T('顧客PL','Client PL'), 'client', 'O01'),
    op('O03', yamamoto, 'PM', 'us', 'O01'),
    op('O04', kobayashi, T('物流部 業務リード','Logistics lead'), 'client', 'O02'),
    op('O05', kato, T('経理部 業務リード','Finance lead'), 'client', 'O02'),
    op('O06', matsumoto, T('情シス','Client IT'), 'client', 'O02'),
    op('O07', T('会計ベンダー','GL vendor'), T('会計システム保守','GL system support'), 'vendor', 'O06'),
    op('O08', sato, T('業務リード','Business lead'), 'us', 'O03'),
    op('O09', tanaka, T('設計リード','Design lead'), 'us', 'O03'),
    op('O10', suzuki, T('開発（在庫・IF）','Dev (Inventory/IF)'), 'us', 'O03'),
    op('O11', takahashi, T('基盤・移行','Infra & cutover'), 'us', 'O03'),
    op('O12', ito, T('テスト・帳票','Test & reports'), 'us', 'O03'),
  ];
  // 権限ロール：PM、リード2名（担当フェーズは phases.owner）、他はメンバー／閲覧者
  s.org.find(p => p.id === 'O03').access = 'pm';
  s.org.find(p => p.id === 'O08').access = 'lead';
  s.org.find(p => p.id === 'O09').access = 'lead';
  s.org.find(p => p.id === 'O02').access = 'viewer';
  // 横の関係（カウンターパート）：PM↔顧客PL、業務リード↔物流部、基盤↔情シス、テスト・帳票↔経理、開発↔会計ベンダー
  const peer = (a, b2) => { const x = s.org.find(p => p.id === a); x.peers = (x.peers || []).concat(b2); };
  peer('O03', ['O02']); peer('O08', ['O04']); peer('O11', ['O06']); peer('O12', ['O05']); peer('O10', ['O07']);
  // タスクの種類・優先度・扱い
  const kindOf = {T01:'study',T02:'doc',T03:'doc',T04:'doc',T06:'doc',T07:'doc',T08:'doc',T09:'doc',T10:'doc',T12:'dev',T13:'dev',T14:'dev',T15:'dev',T16:'dev',T20:'doc'};
  const stOf = {T01:'closed',T02:'closed',T03:'closed',T04:'closed',T05:'closed',T06:'draft',T07:'draft',T08:'draft',T09:'review',T12:'impl'};
  const prOf = {T07:'H',T08:'H',T09:'H',T11:'H',T12:'H',T14:'H',T19:'H',T21:'L'};
  s.tasks.forEach(x => { x.kind = kindOf[x.id] || 'general'; if (stOf[x.id]) x.status = stOf[x.id]; else if (x.status === 'done') x.status = 'closed'; x.priority = prOf[x.id] || 'M'; x.disp = ''; });
  Object.assign(s.tasks.find(x => x.id === 'T15'), {carriedFrom: ['P3'], carryCount: 1});
  s.tasks.push(
    {id:'T23', phaseId:'', name:T('在庫照会のスマートフォン対応（顧客要望）','Mobile inventory lookup (client request)'), owner:'', start:o(0), end:o(6), baselineEnd:o(6), progress:0, status:'todo', kind:'dev', priority:'L', disp:'backlog', milestone:false, updated:o(-3)},
    {id:'T24', phaseId:'P6', name:T('旧システムのデータ抽出ツール検証','Validate legacy data extraction tool'), owner:takahashi, start:o(-6), end:o(4), baselineEnd:o(4), progress:20, status:'doing', kind:'general', priority:'M', disp:'hold', dispNote:T('顧客情シスの環境提供待ち','Waiting for client IT environment'), holdUntil:o(-2), milestone:false, updated:o(-6)});
  s.isSample = true;
  s.meetings = [
    mtg('M01','MT01','',-7,'10:00','done',s.meetingTypes[0].purpose,[
      ag(T('前回アクションの確認','Review previous actions'),yamamoto,10,'',T('全3件完了','All 3 closed')),
      ag(T('詳細設計の進捗（在庫管理）','Detailed design progress (Inventory)'),suzuki,20,'T07',T('仕様未確定のため遅延。仕様確定会議を設定する','Delayed due to open spec; set a spec freeze session')),
      ag(T('テスト環境の調達状況','Test environment procurement'),takahashi,15,'I01',T('顧客情シスに督促する','Chase client IT')),
      ag(T('今週のアクション確認','This week\'s actions'),yamamoto,10,'',''),
    ],{notes:T('在庫管理の遅れが詳細設計完了マイルストーンに影響する可能性あり','Inventory delay may impact the design-complete milestone'),
       decisions:[{text:T('在庫管理の未確定仕様は、10日以内に顧客キーマンと確定させる','Freeze open inventory specs with client key users within 10 days')}],
       actions:[
         {id:'A1',text:T('在庫管理の仕様確定会議を設定する','Schedule inventory spec freeze session'),owner:suzuki,due:o(-3),status:'open'},
         {id:'A2',text:T('テスト環境の調達状況を顧客情シスに確認する','Confirm test-env procurement with client IT'),owner:takahashi,due:o(-5),status:'done'},
         {id:'A3',text:T('会計ベンダーにIF仕様の提示日を確認する','Get GL vendor commitment date for IF spec'),owner:yamamoto,due:o(2),status:'open'},
       ]}),
    mtg('M02','MT04','P3',-3,'14:00','planned',s.meetingTypes[3].purpose,[
      ag(T('DB設計書のレビュー','Review DB design'),takahashi,60,'T09',''),
      ag(T('承認可否の判断','Approval decision'),tanaka,20,'',''),
    ],{title:T('設計レビュー（DB設計）','Design review (DB design)')}),
    mtg('M03','MT01','',1,'10:00','planned',s.meetingTypes[0].purpose, s.meetingTypes[0].agenda.split('\n').map(x => ag(x, yamamoto, 12))),
    mtg('M04','MT02','',2,'16:00','planned','',[],{title:T('第4回 ステアリングコミッティ','Steering committee #4')}),
    mtg('M05','MT03','P3',4,'13:00','planned',s.meetingTypes[2].purpose,[ag(T('CR01 在庫引当ロジック追加の判断','Decide CR01 inventory allocation rules'),suzuki,20,'CR01')]),
    mtg('M06','MT01','',8,'10:00','planned',s.meetingTypes[0].purpose, s.meetingTypes[0].agenda.split('\n').map(x => ag(x, yamamoto, 12))),
  ];
  return s;
}
