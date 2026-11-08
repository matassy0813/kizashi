// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ クラウド共有の結合テスト（IT） ============
// 同期サーバーを実際に使って、メンバーごとのログイン・暗号化・自動反映・同時編集の合わせ込みを確かめる。
// 使い方：同期サーバーを起動（npx wrangler dev --config cloud/wrangler.toml --port 8787）し、
//         ツールを開いた状態でこのファイルを読み込んで await runCloudIT('http://127.0.0.1:8787') を実行する。
// 「もう一人のメンバー」は、自分のログインIDとパスワードでサーバーへ直接読み書きして再現する。
// 終わったらテスト用のプロジェクトをサーバーから消し、このブラウザの保存内容を元に戻す。
async function runCloudIT(server){
  const snap = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); snap[k] = localStorage.getItem(k); }
  const keepUi = JSON.parse(JSON.stringify(ui)), keepPrompt = window.prompt, keepConfirm = window.confirm, keepAlert = window.alert, out = [];
  window.confirm = () => true; window.alert = () => {};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const tc = async (id, name, fn) => { let ok = false, detail = ''; try { const r = await fn(); ok = r === true; if (!ok) detail = JSON.stringify(r); } catch (e) { detail = e.message; } out.push({id, name, ok, detail}); };
  const PW = 'pm-pass-1234', MPW = 'member-pass-5678';
  let meta = null, mem = null, v1meta = null;
  // もう一人のメンバー（鈴木）：自分のセッションで受け取り、変えて、送る
  const other = async change => {
    const key = await crypto.subtle.importKey('raw', unb64u(mem.pdk), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const g = await api2(server, meta.id, 'GET', 'doc', null, mem.token), doc = await unseal(g.data.blob, key);
    change(doc); return api2(server, meta.id, 'PUT', 'doc', {ver: g.data.ver, blob: await seal(doc, key)}, mem.token);
  };
  const serverDoc = async () => unseal((await api2(server, meta.id, 'GET', 'doc', null, meta.token)).data.blob, await dataKey(meta));
  try {
    wsBeginNewProject(); state = sample('ja'); normalize(); state.isSample = false; ui.me = 'O03'; save(); render();
    await tc('IT-01', 'PMが自分のログインIDとパスワードを決めて共有を始めると、クラウドに置かれ、PMとしてログインした状態になる', async () => {
      meta = await cloudShare(server, 'Yamamoto', PW); await wait(300);
      return (meta.v === 2 && meta.login === 'yamamoto' && meta.role === 'pm' && !!meta.token && me().login === 'yamamoto' && !!cloud.ws && cloud.status === 'synced') || {v: meta.v, login: meta.login, ws: !!cloud.ws, st: cloud.status};
    });
    await tc('IT-02', 'サーバーには暗号化された中身だけが届く（プロジェクト名・タスク名・人の名前・パスワードは読めない）', async () => {
      const g = await api2(server, meta.id, 'GET', 'doc', null, meta.token), mm = await api2(server, meta.id, 'GET', 'members', null, meta.token);
      const raw = JSON.stringify(g.data) + JSON.stringify(mm.data);
      const leaks = [state.project.name, 'DB設計', '鈴木', PW, meta.pdk].filter(s => raw.includes(s));
      return (!leaks.length && deq(await serverDoc(), sharedOf(state))) || leaks;
    });
    await tc('IT-03', 'リンクを知っているだけでは開けない（ログインしていないと 401）', async () => { const r = await api2(server, meta.id, 'GET', 'doc'); const l = parseJoin(new URL(shareLink(meta)).hash); return (r.status === 401 && l.v === 2 && !('secret' in l) && !shareLink(meta).includes(meta.pdk)) || r.status; });
    await tc('IT-04', 'PMが体制図でログインIDを決めて招待すると、案内コードが発行され、案内文にリンク・ID・コードが入る', async () => {
      const p = state.org.find(x => x.id === 'O10'); p.login = 'suzuki';
      const code = await cloudInvite(p), txt = inviteText(p, code), list = await cloudMembers(true);
      window.__code = code;
      return (/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) && txt.includes(shareLink(meta)) && txt.includes('suzuki') && txt.includes(code) && memberState('suzuki') === 'invited' && list.length === 2) || {code, st: memberState('suzuki')};
    });
    await tc('IT-05', 'メンバーは案内コードで入り、自分のパスワードを決める。以後は自分のパスワードで入れ、案内コードは使えない', async () => {
      const first = await loginRaw(server, meta.id, 'suzuki', window.__code.toLowerCase().replace('-', '')); // 小文字・ハイフンなしでも通る
      await setPasswordRaw(server, meta.id, first.token, first.pdk, MPW);
      mem = await loginRaw(server, meta.id, 'SUZUKI', MPW);
      let oldCode = 'ok'; try { await loginRaw(server, meta.id, 'suzuki', window.__code); oldCode = 'still works'; } catch (e) { oldCode = e.message; }
      return (first.mustChange === true && mem.mustChange === false && mem.role === 'member' && mem.pdk === meta.pdk && oldCode === 'invalid') || {first: first.mustChange, mem: mem.mustChange, oldCode};
    });
    await tc('IT-06', 'パスワードが違うと入れない。10回続けて間違えると一時的にロックされる', async () => {
      let e1 = ''; try { await loginRaw(server, meta.id, 'suzuki', 'wrong-pass'); } catch (e) { e1 = e.message; }
      let last = ''; for (let i = 0; i < 9; i++) { try { await loginRaw(server, meta.id, 'suzuki', 'wrong-pass-' + i); } catch (e) { last = e.message; } }
      let e3 = ''; try { await loginRaw(server, meta.id, 'suzuki', MPW); } catch (e) { e3 = e.message; }
      return (e1 === 'invalid' && last === 'locked' && e3 === 'locked') || {e1, last, e3};
    });
    await tc('IT-07', 'PMが招待をやり直すと、ロックが解け、新しい案内コードで入り直せる（古いパスワードは使えない）', async () => {
      const p = state.org.find(x => x.id === 'O10'); const code = await cloudInvite(p);
      let oldPw = ''; try { await loginRaw(server, meta.id, 'suzuki', MPW); oldPw = 'works'; } catch (e) { oldPw = e.message; }
      const first = await loginRaw(server, meta.id, 'suzuki', code); await setPasswordRaw(server, meta.id, first.token, first.pdk, MPW); mem = await loginRaw(server, meta.id, 'suzuki', MPW);
      return (oldPw === 'invalid' && !!mem.token) || {oldPw};
    });
    await tc('IT-08', 'メンバーが保存すると、PMの画面に自動で反映される', async () => { await other(d => { d.tasks.find(x => x.id === 'T07').progress = 77; }); for (let i = 0; i < 30 && state.tasks.find(x => x.id === 'T07').progress !== 77; i++) await wait(200); return state.tasks.find(x => x.id === 'T07').progress === 77 || state.tasks.find(x => x.id === 'T07').progress; });
    await tc('IT-09', '同時に別の項目を直しても、両方の変更が残る', async () => {
      cloudDisconnect(); state.tasks.find(x => x.id === 'T08').name = 'PMが変えた名前';
      await other(d => { d.tasks.find(x => x.id === 'T09').progress = 96; });
      await cloudPush(); const doc = await serverDoc(); cloudConnect();
      return (doc.tasks.find(x => x.id === 'T08').name === 'PMが変えた名前' && doc.tasks.find(x => x.id === 'T09').progress === 96 && state.tasks.find(x => x.id === 'T09').progress === 96) || 'merge failed';
    });
    await tc('IT-10', '同時に同じ番号でタスクを作っても両方残る。同じ課題への二人のコメントも両方残る', async () => {
      cloudDisconnect(); const mine = newTask({name: 'PMの新しいタスク'}); raidLog(state.raid.find(r => r.id === 'I01'), {kind: 'comment', text: 'PMのコメント'});
      await other(d => { d.tasks.push({...d.tasks[0], id: mine.id, name: 'メンバーの新しいタスク'}); d.raid.find(r => r.id === 'I01').log.push({at: nowStamp(), by: '鈴木', kind: 'comment', text: 'メンバーのコメント'}); });
      await cloudPush(); cloudConnect();
      const names = state.tasks.filter(x => /新しいタスク/.test(x.name)).map(x => x.id), cs = state.raid.find(r => r.id === 'I01').log.filter(e => e.kind === 'comment').map(e => e.text);
      return (names.length === 2 && new Set(names).size === 2 && cs.includes('PMのコメント') && cs.includes('メンバーのコメント')) || {names, cs};
    });
    await tc('IT-11', 'メンバーはほかの人を招待できない（サーバーが断る）', async () => { const r = await api2(server, meta.id, 'PUT', 'member', {login: 'hacker', role: 'pm', salt: 'x', authKey: 'x', wrapped: 'x'}, mem.token); return r.status === 403 || r.status; });
    await tc('IT-12', '体制図で役割を変えると、サーバーの役割も変わる（PMOにすると招待できる）', async () => {
      const p = state.org.find(x => x.id === 'O10'); p.access = 'pmo'; await cloudSetRole(p);
      const r = await api2(server, meta.id, 'GET', 'me', null, mem.token); p.access = 'member'; await cloudSetRole(p);
      return r.data.role === 'pmo' || r.data;
    });
    await tc('IT-13', '表示言語は人ごと（切り替えても共有しない・版が進まない）', async () => { const v0 = meta.ver; state.project.lang = 'en'; save(); await wait(1200); const doc = await serverDoc(); state.project.lang = 'ja'; save(); await wait(900); return (meta.ver === v0 && !('lang' in doc.project)) || {v0, v: meta.ver}; });
    await tc('IT-14', '通信できないときは「オフライン」と出し、自分の変更は手元に残る。つながったら送る', async () => {
      const keepSrv = meta.server; meta.server = 'http://127.0.0.1:9'; cloudDisconnect(); state.tasks.find(x => x.id === 'T10').progress = 33; await cloudPush();
      const off = cloud.status === 'offline'; meta.server = keepSrv; clearTimeout(cloud.timer); await cloudPush(); cloudConnect();
      return (off && (await serverDoc()).tasks.find(x => x.id === 'T10').progress === 33 && cloud.status === 'synced') || {off, st: cloud.status};
    });
    await tc('IT-15', 'PMがログインを止めると、その人はもう読めず、入れない', async () => {
      const ok = await cloudRemoveMember('suzuki');
      const r = await api2(server, meta.id, 'GET', 'doc', null, mem.token); let e = ''; try { await loginRaw(server, meta.id, 'suzuki', MPW); } catch (x) { e = x.message; }
      return (ok && r.status === 401 && e === 'invalid') || {ok, st: r.status, e};
    });
    await tc('IT-16', 'ログアウトすると、この PC から鍵とデータの控えが消える。ログインし直すと受け取り直せる', async () => {
      const p = wsCurrent(), id = meta.id;
      await cloudLogout();
      const gone = !cloudMeta().token && !cloudMeta().pdk && !localStorage.getItem(baseKey(p)) && state.cloudPending === true && !me() && document.body.classList.contains('locked');
      await cloudLogin('yamamoto', PW); await cloudOpen(); meta = cloudMeta();
      return (gone && meta.id === id && state.tasks.find(x => x.id === 'T10').progress === 33 && me() && me().login === 'yamamoto') || {gone, me: !!me()};
    });
    await tc('IT-17', '別のブラウザで開く：リンクを開くとログイン画面になり、ログインすると中身を受け取る', async () => {
      const link = new URL(shareLink(meta)).hash; const p = wsCurrent(), keepMeta = {...meta};
      delete p.cloud; wsWrite(); // この PC では初めて、という状態を作る
      await cloudJoin(parseJoin(link)); const login = document.body.classList.contains('locked') && !!document.querySelector('#clId');
      await cloudLogin('yamamoto', PW); await cloudOpen();
      const ok = login && state.tasks.find(x => x.id === 'T08').name === 'PMが変えた名前' && !!me();
      meta = cloudMeta(); if (wsCurrent() !== p) { /* 新しい枠で開いた */ }
      return ok || {login, me: !!me()};
    });
    await tc('IT-18', '以前のリンク共有（v1）のプロジェクトを、メンバーごとのログインに切り替えられる（古い箱は消える）', async () => {
      wsBeginNewProject(); state = sample('ja'); normalize(); state.isSample = false; ui.me = 'O03'; save();
      v1meta = {id: b64u(rand(16)), secret: b64u(rand(32)), server, ver: 0, since: todayStr()};
      const put = await api(v1meta, 'PUT', {ver: 0, blob: await seal(sharedOf(state), (await cloudKeys(v1meta.secret)).key)}); v1meta.ver = put.data.ver; wsCurrent().cloud = v1meta; wsWrite();
      const before = cloudCard().includes('cloudUpgrade');
      const up = await cloudShare(server, 'yamamoto', PW); const old = await api(v1meta, 'GET');
      const ok = before && up.v === 2 && old.status === 404;
      try { await apiMe(up, 'DELETE', 'project'); } catch (e) {}
      return ok || {before, v: up.v, old: old.status};
    });
  } finally {
    cloudDisconnect();
    if (meta && meta.token) { try { await apiMe(meta, 'DELETE', 'project'); } catch (e) {} }
    if (v1meta) { try { await api(v1meta, 'DELETE'); } catch (e) {} }
    window.prompt = keepPrompt; window.confirm = keepConfirm; window.alert = keepAlert; delete window.__code;
    localStorage.clear(); Object.entries(snap).forEach(([k, v]) => localStorage.setItem(k, v));
    Object.keys(ui).forEach(k => delete ui[k]); Object.assign(ui, keepUi); ws = null; state = null; load(); render(true); cloudOnSwitch();
  }
  console.table(out);
  return {total: out.length, ok: out.filter(r => r.ok).length, ng: out.filter(r => !r.ok)};
}
