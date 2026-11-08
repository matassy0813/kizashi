// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ アカウント（最初の画面：ログイン／新規登録） ============
// 1 人 1 つのアカウントで、参加しているプロジェクトをまとめて開く。
//  - 新規登録：自分でログインIDとパスワードを決める（インストールも外部サービスも不要）
//  - ログイン：参加しているプロジェクトの一覧が出て、選ぶだけで開ける（プロジェクトごとのパスワードは要らない）
//  - 招待：PM がログインIDで招待し、案内コードを送る。受け取った人はログイン（なければ新規登録）してコードを入れる
// 顧客の情報を守る仕組みは変わらない：
//  - 参加しているプロジェクトの鍵の一覧（キーリング）は、アカウント鍵で暗号化して預ける
//  - アカウント鍵は、本人のパスワードから作った鍵で包んで預ける。パスワードもアカウント鍵もサーバーには届かない
// サンプルの体験と、アカウントなしでこの PC だけで使う方法も残す（補助の入口）。
const ACCT_KEY = 'kizashi-account', MODE_KEY = 'kizashi-mode', JOIN_KEY = 'kizashi-pending-join';
let acct = null; // {server, login, token, amk, kver, ring: [{id, server, secret, pdk, name, since}]}
const acctLoad = () => { try { acct = JSON.parse(localStorage.getItem(ACCT_KEY) || 'null'); } catch (e) { acct = null; } };
const acctWrite = () => { try { if (acct) localStorage.setItem(ACCT_KEY, JSON.stringify(acct)); else localStorage.removeItem(ACCT_KEY); } catch (e) {} };
const localMode = () => { try { return localStorage.getItem(MODE_KEY) === 'local'; } catch (e) { return false; } };
const pendingJoin = () => { try { return JSON.parse(localStorage.getItem(JOIN_KEY) || 'null'); } catch (e) { return null; } };
const setPendingJoin = j => { try { if (j) localStorage.setItem(JOIN_KEY, JSON.stringify(j)); else localStorage.removeItem(JOIN_KEY); } catch (e) {} };
const ringEntry = id => acct && (acct.ring || []).find(r => r.id === id);
// 最初の画面を出すか：アカウントでログインしておらず、「この PC だけで使う」も選んでおらず、まだ誰としても入っていないとき
const startNeeded = () => !acct && !localMode() && !me();
const acctApi = (method, action, body, query) => api2Acct(acct ? acct.server : cloudServer(), method, action, body, acct && acct.token, query);
async function api2Acct(server, method, action, body, token, query){
  const headers = {'Content-Type': 'application/json'}; if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(`${server}/api/v2/account/${action}${query || ''}`, {method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  let data = {}; try { data = await r.json(); } catch (e) {}
  return {status: r.status, data};
}
const amkKey = amk => crypto.subtle.importKey('raw', unb64u(amk), 'AES-GCM', false, ['encrypt', 'decrypt']);

// ---- 新規登録・ログイン・ログアウト ----
async function acctSignup(login, password, server){
  login = normLogin(login); server = (server || cloudServer()).replace(/\/+$/, '');
  const err = checkNewLogin(login, password); if (err) throw new Error(err);
  const amk = b64u(rand(32)), salt = b64u(rand(16)), {authKey, wrapKey} = await deriveLogin(password, salt);
  const res = await api2Acct(server, 'POST', 'signup', {login, salt, authKey, wrappedAmk: await wrapPdk(amk, wrapKey), keyring: await seal([], await amkKey(amk))});
  if (res.status === 409) throw new Error(t('acct.errTaken', login));
  if (res.status !== 201) throw new Error(res.status === 404 ? t('acct.errServerOld') : 'server_' + res.status);
  acct = {server, login, token: res.data.token, amk, kver: res.data.kver, ring: []}; acctWrite();
  return acct;
}
async function acctLogin(login, password, server){
  login = normLogin(login); server = (server || cloudServer()).replace(/\/+$/, '');
  const pre = await api2Acct(server, 'POST', 'prelogin', {login});
  if (pre.status !== 200) throw new Error(pre.status === 404 ? t('acct.errServerOld') : 'server_' + pre.status);
  const {authKey, wrapKey} = await deriveLogin(password, pre.data.salt);
  const res = await api2Acct(server, 'POST', 'login', {login, authKey});
  if (res.status === 429) throw new Error('locked'); if (res.status === 401) throw new Error('invalid');
  if (res.status !== 200) throw new Error('server_' + res.status);
  const amk = await unwrapPdk(res.data.wrappedAmk, wrapKey), ring = await unseal(res.data.keyring, await amkKey(amk));
  acct = {server, login, token: res.data.token, amk, kver: res.data.kver, ring}; acctWrite();
  acctSyncProjects();
  return acct;
}
// ログアウト：アカウントと、アカウントで開いたプロジェクトの鍵・データの控えを、この PC から消す
async function acctLogout(){
  if (acct && acct.token) { try { await acctApi('POST', 'logout'); } catch (e) {} }
  cloudDisconnect();
  const ids = new Set(((acct && acct.ring) || []).map(r => r.id));
  ws.projects.filter(p => p.cloud && (p.cloud.acct || ids.has(p.cloud.id))).forEach(p => {
    try { localStorage.removeItem(p.key); localStorage.removeItem('pmo-cloudbase-' + p.id); localStorage.removeItem('pmo-ui-' + p.id); } catch (e) {}
  });
  ws.projects = ws.projects.filter(p => !(p.cloud && (p.cloud.acct || ids.has(p.cloud.id))));
  if (!ws.projects.length) ws.projects = [{id: 'p1', key: KEY, name: '', co: '', team: '', pj: '', updated: ''}];
  if (!ws.projects.some(p => p.id === ws.current)) ws.current = ws.projects[0].id;
  wsWrite(); acct = null; acctWrite();
  resetUi(); state = null; load(); ui.me = ''; resetSaveInd(); render(true);
}
// キーリング（参加しているプロジェクトの鍵の一覧）を更新して預け直す。ほかの端末が先に更新していたら、受け取り直して合わせる
async function ringUpdate(mutate){
  for (let i = 0; i < 3; i++) {
    const ring = JSON.parse(JSON.stringify(acct.ring || [])); mutate(ring);
    const res = await acctApi('PUT', 'keyring', {kver: acct.kver, keyring: await seal(ring, await amkKey(acct.amk))});
    if (res.status === 200) { acct.ring = ring; acct.kver = res.data.kver; acctWrite(); return; }
    if (res.status === 401) { await acctLogout(); throw new Error(t('cloud.sessionLost')); }
    if (res.status !== 409) throw new Error('server_' + res.status);
    const g = await acctApi('GET', 'keyring'); acct.ring = await unseal(g.data.keyring, await amkKey(acct.amk)); acct.kver = g.data.kver;
  }
  throw new Error('conflict');
}
// キーリングのプロジェクトを、プロジェクトの切り替えメニューに並べる（中身は開いたときに受け取る）
function acctSyncProjects(){
  if (!acct) return;
  (acct.ring || []).forEach(r => {
    let p = ws.projects.find(x => x.cloud && x.cloud.id === r.id);
    if (!p) { const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); p = {id, key: 'pmo-project-' + id, name: r.name || '', co: '', team: '', pj: '', updated: '', cloud: {v: 2, id: r.id, server: r.server, ver: 0, since: r.since || todayStr(), acct: true}}; ws.projects.push(p); }
    p.cloud.acct = true; if (r.name && !p.name) p.name = r.name;
  });
  if (ws.projects.length > 1) ws.projects = ws.projects.filter(p => !(p.key !== KEY && !p.cloud && !p.name && !localStorage.getItem(p.key))); // 中身のない空の枠は片付ける
  wsWrite();
}
// アカウントでプロジェクトを開く（そのプロジェクト用の合言葉で入る。パスワードを聞き直さない）
async function acctOpenProject(id){
  const r = ringEntry(id); if (!r) throw new Error('not_member');
  acctSyncProjects();
  const p = ws.projects.find(x => x.cloud && x.cloud.id === id);
  if (ws.current !== p.id) {
    const lang = state ? state.project.lang : ''; if (state) save(); cloudDisconnect();
    const hasCopy = !!localStorage.getItem(p.key); ws.current = p.id; wsWrite(); resetUi(); state = null; load();
    if (!hasCopy) { state = cloudBlank(r.name, lang); normalize(); } // この PC にまだ控えがない：中身はログイン後に受け取る
  }
  const meta = wsCurrent().cloud; // 切り替えで一覧を読み直したので、今の枠のものを使う
  if (!meta.token || !meta.pdk) {
    const lr = await loginRaw(r.server, r.id, acct.login, r.secret, deriveFast);
    Object.assign(meta, {login: acct.login, token: lr.token, role: lr.role, pdk: lr.pdk, mustChange: false, acct: true}); wsWrite();
  }
  await cloudOpen();
  if (state.project.name && state.project.name !== r.name) ringUpdate(ring => { const e = ring.find(x => x.id === id); if (e) e.name = state.project.name; }).catch(() => {});
}
// 招待を受けて参加する（ログイン済み）：案内コードで入り、このアカウント用の合言葉に切り替えて、キーリングに加える
async function acctJoin(j, code){
  const lr = await loginRaw(j.server, j.id, acct.login, code);
  const secret = b64u(rand(32));
  await setPasswordRaw(j.server, j.id, lr.token, lr.pdk, secret, deriveFast);
  const meta = {v: 2, id: j.id, server: j.server, login: acct.login, token: lr.token, role: lr.role, pdk: lr.pdk, ver: 0, since: todayStr(), acct: true};
  const g = await api2(j.server, j.id, 'GET', 'doc', null, lr.token), doc = g.status === 200 ? await unseal(g.data.blob, await dataKey(meta)) : null;
  await ringUpdate(ring => { if (!ring.some(x => x.id === j.id)) ring.push({id: j.id, server: j.server, secret, pdk: lr.pdk, name: doc ? doc.project.name : '', since: todayStr()}); });
  setPendingJoin(null);
  await acctOpenProject(j.id);
}
// アカウントで「チームで共有を始める」（PM）：自分のアカウントのプロジェクトとして置く
async function acctShare(){
  const secret = b64u(rand(32)), server = acct.server; // アカウントと同じサーバーに置く
  const meta = await cloudShare(server, acct.login, secret, deriveFast);
  meta.acct = true; wsWrite();
  await ringUpdate(ring => ring.push({id: meta.id, server, secret, pdk: meta.pdk, name: state.project.name, since: todayStr()}));
  return meta;
}

// ---- 最初の画面（ログイン／新規登録）とプロジェクトの選択 ----
const drawLangSeg = () => { const lang = LANG(); $('#langSeg').innerHTML = ['ja','en'].map(l => `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l === 'ja' ? '日本語' : 'EN'}</button>`).join(''); };
function renderStart(){
  document.body.classList.add('locked');
  $('#pjName').textContent = 'Kizashi'; $('#pjSub').textContent = ''; document.title = 'Kizashi';
  $('#tabs').innerHTML = ''; $('#pageHead').innerHTML = ''; $('#hdrRag').innerHTML = ''; $('#meBox').innerHTML = ''; resetSaveInd(); drawLangSeg();
  const S = ui.start || (ui.start = {mode: 'login', err: ''}), pj = pendingJoin();
  const signup = S.mode === 'signup';
  $('#view').classList.add('animate');
  $('#view').innerHTML = `<div class="login-wrap"><div class="card login start">
    <div class="login-logo">${brandLogo()}</div>
    <p class="lead" style="text-align:center;margin:0 0 16px">${t('acct.tagline')}</p>
    ${pj ? `<div class="ro-note">✉ ${t('acct.inviteNote')}</div>` : ''}
    <div class="seg start-seg" role="tablist"><button role="tab" class="${signup ? '' : 'on'}" data-smode="login">${t('acct.login')}</button><button role="tab" class="${signup ? 'on' : ''}" data-smode="signup">${t('acct.signup')}</button></div>
    <form id="stForm" class="lg-form">
      <label class="lbl-block">${t('cloud.loginId')}<input id="stId" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(S.loginId || '')}" autofocus>${signup ? `<small class="muted">${t('cloud.loginIdHint')}</small>` : ''}</label>
      <label class="lbl-block">${signup ? t('cloud.newPw', MIN_PW) : t('cloud.pw')}<input type="password" id="stPw" autocomplete="${signup ? 'new-password' : 'current-password'}"></label>
      ${signup ? `<label class="lbl-block">${t('login.newPin2')}<input type="password" id="stPw2" autocomplete="new-password"></label><p class="muted small">${t('acct.signupNote')}</p>` : ''}
      ${S.err ? `<p class="red small">${esc(S.err)}</p>` : ''}
      <button class="btn primary start-go" type="submit" id="stGo">${signup ? t('acct.signupGo') : t('acct.loginGo')}</button>
    </form>
    <div class="start-alt">
      <button class="btn ghost" id="stSample">▶ ${t('acct.trySample')}</button>
      <button class="btn ghost" id="stLocal">${t('acct.localOnly')}</button>
    </div>
    <details class="cloud-adv"><summary>${t('cloud.server')}</summary><input id="stSrv" value="${esc(cloudServer())}"><small class="muted">${t('cloud.serverHint')}</small></details>
  </div></div>`;
  document.querySelectorAll('[data-smode]').forEach(b => b.onclick = () => { S.mode = b.dataset.smode; S.err = ''; S.loginId = normLogin($('#stId').value); renderStart(); });
  $('#stSample').onclick = () => { try { localStorage.setItem(MODE_KEY, 'local'); } catch (e) {} if (!state || !state.isSample) { if (state) save(); wsBeginNewProject(); state = sample(LANG()); normalize(); save(); } ui.me = (state.org.find(p => p.access === 'pm') || {}).id || ''; save(); render(true); };
  $('#stLocal').onclick = () => { try { localStorage.setItem(MODE_KEY, 'local'); } catch (e) {} render(true); };
  $('#stForm').onsubmit = async e => {
    e.preventDefault();
    const id = $('#stId').value, pw = $('#stPw').value, srv = ($('#stSrv').value || cloudServer()).replace(/\/+$/, '');
    S.loginId = normLogin(id);
    if (signup && pw !== $('#stPw2').value) { S.err = t('login.errMatch'); return renderStart(); }
    const btn = $('#stGo'); btn.disabled = true; btn.textContent = t('cloud.checking');
    try {
      if (srv !== cloudServer()) { try { localStorage.setItem(CLOUD_SRV_KEY, srv); } catch (x) {} }
      if (signup) await acctSignup(id, pw, srv); else await acctLogin(id, pw, srv);
      S.err = ''; S.mode = 'login'; renderProjectPicker();
    } catch (x) {
      const m = String(x.message);
      S.err = m === 'invalid' ? t('cloud.errLogin') : m === 'locked' ? t('cloud.errLocked') : /^server_|Failed to fetch|NetworkError/.test(m) ? t('cloud.errNet') : m;
      renderStart();
    }
  };
}
function renderProjectPicker(){
  document.body.classList.add('locked');
  $('#pjName').textContent = 'Kizashi'; $('#pjSub').textContent = ''; document.title = 'Kizashi';
  $('#tabs').innerHTML = ''; $('#pageHead').innerHTML = ''; $('#hdrRag').innerHTML = ''; resetSaveInd(); drawLangSeg();
  $('#meBox').innerHTML = `<span class="avatar xs">${esc(acct.login.slice(0, 1).toUpperCase())}</span><span class="me-name">${esc(acct.login)}<small>${t('acct.account')}</small></span><button class="btn ghost" id="pkOut">${t('login.logout')}</button>`;
  const pj = pendingJoin(), ring = acct.ring || [], P = ui.picker || (ui.picker = {err: ''});
  const locals = ws.projects.filter(p => !p.cloud && (p.name || localStorage.getItem(p.key)));
  $('#view').classList.add('animate');
  $('#view').innerHTML = `<div class="login-wrap"><div class="card login picker">
    <div class="login-logo small">${brandLogo()}</div>
    <h1 class="large-title" style="text-align:center">${t('acct.pickTitle')}</h1>
    <p class="lead" style="text-align:center">${t('acct.pickLead', esc(acct.login))}</p>
    ${pj ? `<form id="pkJoin" class="card join-card"><b>✉ ${t('acct.joinTitle')}</b><p class="muted small">${t('acct.joinHelp', esc(acct.login))}</p>
      <div class="cloud-link"><input id="pkCode" placeholder="ABCD-EFGH" autocapitalize="characters" autofocus><button class="btn primary" type="submit" id="pkJoinGo">${t('acct.joinGo')}</button></div>
      ${P.err ? `<p class="red small">${esc(P.err)}</p>` : ''}<button type="button" class="btn ghost sm" id="pkJoinNo">${t('acct.joinLater')}</button></form>` : ''}
    <div class="pk-list">
      ${ring.map(r => `<button class="pk-item" data-pk="${esc(r.id)}"><span class="pk-ico">☁</span><span class="pk-main"><b>${esc(r.name || t('cloud.sharedProject'))}</b><small>${t('acct.cloudPj', md(r.since))}</small></span><span class="go">›</span></button>`).join('')}
      ${locals.map(p => `<button class="pk-item" data-pkl="${esc(p.id)}"><span class="pk-ico">💻</span><span class="pk-main"><b>${esc(p.name || '—')}</b><small>${t('acct.localPj')}</small></span><span class="go">›</span></button>`).join('')}
      ${!ring.length && !locals.length ? `<div class="empty">${t('acct.noProjects')}</div>` : ''}
    </div>
    <div class="bar" style="margin-top:12px"><button class="btn primary" id="pkNew">＋ ${t('acct.newProject')}</button><span class="sp"></span></div>
    <p class="muted small">${t('acct.pickNote')}</p>
  </div></div>`;
  $('#pkOut').onclick = () => acctLogout();
  document.querySelectorAll('[data-pk]').forEach(b => b.onclick = async () => {
    b.disabled = true; b.querySelector('small').textContent = t('cloud.checking');
    try { await acctOpenProject(b.dataset.pk); }
    catch (e) { alert(String(e.message) === 'invalid' ? t('acct.errRemoved') : t('cloud.errNet')); renderProjectPicker(); }
  });
  document.querySelectorAll('[data-pkl]').forEach(b => b.onclick = () => { try { localStorage.setItem(MODE_KEY, 'local'); } catch (e) {} if (b.dataset.pkl !== ws.current) switchProject(b.dataset.pkl); else render(true); });
  $('#pkNew').onclick = () => openWizard();
  const jf = $('#pkJoin'); if (jf) {
    $('#pkJoinNo').onclick = () => { setPendingJoin(null); P.err = ''; renderProjectPicker(); };
    jf.onsubmit = async e => {
      e.preventDefault(); const btn = $('#pkJoinGo'); btn.disabled = true; btn.textContent = t('cloud.checking');
      try { await acctJoin(pj, $('#pkCode').value.trim()); P.err = ''; toast(t('acct.joined', state.project.name)); }
      catch (x) { const m = String(x.message); P.err = m === 'invalid' ? t('acct.errCode', acct.login) : m === 'locked' ? t('cloud.errLocked') : m === 'gone' ? t('cloud.errGone') : t('cloud.errNet'); renderProjectPicker(); }
    };
  }
}
acctLoad();
