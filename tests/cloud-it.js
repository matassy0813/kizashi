// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ クラウド共有の結合テスト（IT） ============
// 同期サーバーを実際に使って、共有・暗号化・自動反映・同時編集の合わせ込みを確かめる。
// 使い方：同期サーバーを起動（npx wrangler dev --config cloud/wrangler.toml --port 8787）し、
//         ツールを開いた状態でこのファイルを読み込んで await runCloudIT('http://127.0.0.1:8787') を実行する。
// 「もう一人のメンバー」は、サーバーへ直接読み書きして再現する。終わったら部屋を消し、このブラウザの保存内容を元に戻す。
async function runCloudIT(server){
  const snap = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); snap[k] = localStorage.getItem(k); }
  const keepUi = JSON.parse(JSON.stringify(ui)), out = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tc = async (id, name, fn) => { let ok = false, detail = ''; try { const r = await fn(); ok = r === true; if (!ok) detail = JSON.stringify(r); } catch (e) { detail = e.message; } out.push({id, name, ok, detail}); };
  // もう一人のメンバー：サーバーから受け取り、変えて、送る
  const other = async (meta, change) => {
    const {key} = await cloudKeys(meta.secret), g = await api(meta, 'GET'), doc = await unseal(g.data.blob, key);
    change(doc); return api(meta, 'PUT', {ver: g.data.ver, blob: await seal(doc, key)});
  };
  let meta = null;
  try {
    wsBeginNewProject(); state = sample('ja'); normalize(); ui.me = 'O03'; save(); render();
    await tc('IT-01', 'チームで共有を始めると、クラウドに置かれ、知らせの接続ができる', async () => { meta = await cloudShare(server); await wait(300); return (meta.ver === 1 && !!cloud.ws && cloud.status === 'synced') || {ver: meta.ver, ws: !!cloud.ws, st: cloud.status}; });
    await tc('IT-02', 'サーバーには暗号化された中身だけが届く（プロジェクト名もタスク名も読めない）', async () => { const g = await api(meta, 'GET'), plain = g.data.blob.includes(state.project.name) || g.data.blob.includes('DB設計'); const {key} = await cloudKeys(meta.secret), doc = await unseal(g.data.blob, key); return (!plain && deq(doc, sharedOf(state))) || {plain}; });
    await tc('IT-03', '合言葉（リンクの鍵）が違うと読めない', async () => { const r = await fetch(`${server}/api/p/${meta.id}`, {headers: {Authorization: 'Bearer ' + 'x'.repeat(43)}}); return r.status === 403 || r.status; });
    await tc('IT-04', '共有リンクから、プロジェクトの番号・鍵・サーバーを読み取れる', async () => { const j = parseJoin(new URL(shareLink(meta)).hash); return (j.id === meta.id && j.secret === meta.secret && j.server === server) || j; });
    await tc('IT-05', 'ほかのメンバーが保存すると、知らせを受けて自動で画面に反映される', async () => { await other(meta, d => { d.tasks.find(x => x.id === 'T07').progress = 77; }); for (let i = 0; i < 30 && state.tasks.find(x => x.id === 'T07').progress !== 77; i++) await wait(200); return state.tasks.find(x => x.id === 'T07').progress === 77 || state.tasks.find(x => x.id === 'T07').progress; });
    await tc('IT-06', '同時に別の項目を直しても、両方の変更が残る（後から送った側が合わせて送り直す）', async () => {
      cloudDisconnect(); state.tasks.find(x => x.id === 'T08').name = 'PMが変えた名前';
      await other(meta, d => { d.tasks.find(x => x.id === 'T09').progress = 96; });
      await cloudPush();
      const {key} = await cloudKeys(meta.secret), g = await api(meta, 'GET'), doc = await unseal(g.data.blob, key), T = id => doc.tasks.find(x => x.id === id);
      cloudConnect();
      return (T('T08').name === 'PMが変えた名前' && T('T09').progress === 96 && state.tasks.find(x => x.id === 'T09').progress === 96 && g.data.ver === meta.ver) || {t08: T('T08').name, t09: T('T09').progress, ver: [g.data.ver, meta.ver]};
    });
    await tc('IT-07', '同時に同じ番号でタスクを作っても、両方残り、自分の分の番号が付け直される', async () => {
      cloudDisconnect(); const mine = newTask({name: 'PMの新しいタスク'});
      await other(meta, d => { d.tasks.push({...d.tasks[0], id: mine.id, name: 'メンバーの新しいタスク'}); });
      await cloudPush(); cloudConnect();
      const names = state.tasks.filter(x => /新しいタスク/.test(x.name)).map(x => x.id + ':' + x.name);
      return (names.length === 2 && new Set(names.map(n => n.split(':')[0])).size === 2) || names;
    });
    await tc('IT-08', '同じ課題に二人がコメントしても、両方残る', async () => {
      cloudDisconnect(); raidLog(state.raid.find(r => r.id === 'I01'), {kind: 'comment', text: 'PMのコメント'});
      await other(meta, d => { d.raid.find(r => r.id === 'I01').log.push({at: nowStamp(), by: '鈴木', kind: 'comment', text: 'メンバーのコメント'}); });
      await cloudPush(); cloudConnect();
      const cs = state.raid.find(r => r.id === 'I01').log.filter(e => e.kind === 'comment').map(e => e.text);
      return (cs.includes('PMのコメント') && cs.includes('メンバーのコメント')) || cs;
    });
    await tc('IT-09', '表示言語は人ごと（切り替えても共有しない・版が進まない）', async () => { const v0 = meta.ver; state.project.lang = 'en'; save(); await wait(1200); const {key} = await cloudKeys(meta.secret), doc = await unseal((await api(meta, 'GET')).data.blob, key); state.project.lang = 'ja'; save(); await wait(900); return (meta.ver === v0 && !('lang' in doc.project)) || {v0, v: meta.ver, lang: doc.project.lang}; });
    await tc('IT-10', '招待の文面に共有リンクが入る', async () => inviteText(state.org.find(p => p.id === 'O10'), 'ABCD-1234').includes(shareLink(meta)));
    await tc('IT-11', '通信できないときは「オフライン」と出し、自分の変更は手元に残る', async () => {
      const keepSrv = meta.server; meta.server = 'http://127.0.0.1:9'; cloudDisconnect(); state.tasks.find(x => x.id === 'T10').progress = 33; await cloudPush();
      const off = cloud.status === 'offline', kept = state.tasks.find(x => x.id === 'T10').progress === 33;
      meta.server = keepSrv; clearTimeout(cloud.timer); await cloudPush(); cloudConnect();
      const {key} = await cloudKeys(meta.secret), doc = await unseal((await api(meta, 'GET')).data.blob, key);
      return (off && kept && doc.tasks.find(x => x.id === 'T10').progress === 33 && cloud.status === 'synced') || {off, kept, st: cloud.status};
    });
    await tc('IT-12', '「このPCでの共有をやめる」と接続を切るが、クラウドのデータは残る（ほかの人は使い続けられる）', async () => { const m = {...meta}; cloudLeave(); const stays = (await api(m, 'GET')).status === 200; return (!cloudMeta() && !cloud.ws && stays) || {meta: !!cloudMeta(), stays}; });
  } finally {
    cloudDisconnect();
    if (meta) { try { await api(meta, 'DELETE'); } catch (e) {} }
    localStorage.clear(); Object.entries(snap).forEach(([k, v]) => localStorage.setItem(k, v));
    Object.keys(ui).forEach(k => delete ui[k]); Object.assign(ui, keepUi); state = null; load(); render(true); cloudOnSwitch();
  }
  console.table(out);
  return {total: out.length, ok: out.filter(r => r.ok).length, ng: out.filter(r => !r.ok)};
}
