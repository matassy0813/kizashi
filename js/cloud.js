// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ クラウド共有（チーム全員で同じデータを見る） ============
// 導入の手間をなくすため、インストールも外部サービスのアカウント作成も要らない作りにする。
//  1. PM が自分のログインIDとパスワードを決めて「チームで共有を始める」を押す
//  2. PM が体制図でメンバーごとにログインIDを決め、「招待を発行」→ 案内文（リンク・ID・案内コード）を送る
//  3. メンバーはリンクを開き、ID と案内コードで入って、自分のパスワードを決める（PM も知らない）
//  4. 以後、誰かが保存するとすぐ全員の画面に反映される（同時に直しても、項目ごとに合わせて消さない）
// 顧客の情報を守るため、サーバーにも運営者（開発者）にも中身が読めない作りにする：
//  - データはブラウザの中で「プロジェクト鍵」を使って暗号化してから送る
//  - プロジェクト鍵は、メンバーごとに「本人のパスワードから作った鍵」で包んで預ける。パスワードそのものはサーバーに届かない
// 以前の「リンクの鍵だけで共有する方式（v1）」で共有中のプロジェクトは、PM が新しい方式に切り替えられる。
const CLOUD_DEFAULT = 'https://kizashi-cloud.kizashipm.workers.dev'; // 公開している同期サーバー（自社で立てたサーバーは設定画面で入れる）
const CLOUD_APP_URL = 'https://matassy0813.github.io/kizashi/Kizashi.html'; // ファイルで開いているときのリンクの行き先
const CLOUD_SRV_KEY = 'kizashi-cloud-server';
const LOCAL_ONLY = [['project', 'lang'], ['project', 'baseDate']]; // 人ごとに違ってよいもの（表示言語・基準日）は共有しない
const PBKDF2_ITER = 600000, MIN_PW = 8;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;
const cloud = {status: '', ws: null, timer: null, poll: null, busy: false, again: false, applying: false, retry: 0, members: null, membersAt: 0};

// ---- 暗号・符号化 ----
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const toB64 = bytes => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const normLogin = s => String(s || '').trim().toLowerCase();
async function streamBytes(bytes, T){ const s = new Blob([bytes]).stream().pipeThrough(new T('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
// v1：リンクの鍵からデータ鍵と合言葉を作る
async function cloudKeys(secret){
  const raw = unb64u(secret);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const token = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kizashi-auth:' + secret)));
  return {key, token};
}
// v2：パスワードから「サーバーに見せる確認用の値」と「プロジェクト鍵を包む鍵」を作る（時間のかかる計算で、総当たりを難しくする）
async function deriveLogin(password, salt){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: unb64u(salt), iterations: PBKDF2_ITER}, base, 512));
  return {authKey: b64u(bits.slice(0, 32)), wrapKey: await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt'])};
}
// アカウントで入るときの、プロジェクトごとのランダムな合言葉（推測できない長さなので、時間のかかる計算は要らない）
async function deriveFast(secret, salt){
  const base = await crypto.subtle.importKey('raw', unb64u(secret), 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt: unb64u(salt), info: new TextEncoder().encode('kizashi-member')}, base, 512));
  return {authKey: b64u(bits.slice(0, 32)), wrapKey: await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt'])};
}
async function wrapPdk(pdk, wrapKey){ const iv = rand(12), ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, wrapKey, unb64u(pdk)); return `w1.${toB64(iv)}.${toB64(ct)}`; }
async function unwrapPdk(wrapped, wrapKey){ const [v, iv, ct] = String(wrapped).split('.'); if (v !== 'w1') throw new Error('format'); return b64u(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(iv)}, wrapKey, fromB64(ct))); }
async function dataKey(meta){ return meta.v === 2 ? crypto.subtle.importKey('raw', unb64u(meta.pdk), 'AES-GCM', false, ['encrypt', 'decrypt']) : (await cloudKeys(meta.secret)).key; }
async function seal(obj, key){
  let bytes = new TextEncoder().encode(JSON.stringify(obj)), z = 0;
  if (typeof CompressionStream === 'function') { bytes = await streamBytes(bytes, CompressionStream); z = 1; }
  const iv = rand(12), ct = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, bytes));
  return `k1.${z}.${toB64(iv)}.${toB64(ct)}`;
}
async function unseal(blob, key){
  const [v, z, iv, ct] = String(blob).split('.'); if (v !== 'k1') throw new Error('format');
  let bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromB64(iv)}, key, fromB64(ct)));
  if (z === '1') bytes = await streamBytes(bytes, DecompressionStream);
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---- 保存先・リンク ----
const cloudServer = () => { try { return (localStorage.getItem(CLOUD_SRV_KEY) || CLOUD_DEFAULT).replace(/\/+$/, ''); } catch (e) { return CLOUD_DEFAULT; } };
const cloudMeta = () => { const p = ws && wsCurrent(); return p && p.cloud ? p.cloud : null; };
const cloudV2 = () => { const m = cloudMeta(); return !!m && m.v === 2; };
const cloudSignedIn = () => { const m = cloudMeta(); return !!m && (m.v !== 2 || (!!m.token && !!m.pdk)); };
const baseKey = p => 'pmo-cloudbase-' + p.id;
const readBase = p => { try { return JSON.parse(localStorage.getItem(baseKey(p)) || 'null'); } catch (e) { return null; } };
const writeBase = (p, s) => { try { localStorage.setItem(baseKey(p), JSON.stringify(s)); } catch (e) {} };
function shareLink(meta){
  const here = /^https?:/.test(location.protocol) ? location.origin + location.pathname : CLOUD_APP_URL;
  const srv = meta.server && meta.server !== CLOUD_DEFAULT ? '&srv=' + encodeURIComponent(meta.server) : '';
  return meta.v === 2 ? `${here}#p=${meta.id}${srv}` : `${here}#join=${meta.id}.${meta.secret}${srv}`;
}
// 共有する内容（人ごとの設定を除いたもの）
function sharedOf(s){
  const c = JSON.parse(JSON.stringify(s));
  LOCAL_ONLY.forEach(path => { let o = c; for (let i = 0; i < path.length - 1; i++) o = o && o[path[i]]; if (o) delete o[path[path.length - 1]]; });
  return c;
}
function withLocal(shared, mine){
  const c = JSON.parse(JSON.stringify(shared));
  LOCAL_ONLY.forEach(path => { let a = mine, o = c; for (let i = 0; i < path.length - 1; i++) { a = a && a[path[i]]; o = o && o[path[i]]; } const k = path[path.length - 1]; if (o && a && k in a) o[k] = a[k]; });
  return c;
}
// ログインする前（中身をまだ受け取っていない）プロジェクトの仮の中身
const cloudBlank = (name, lang) => ({version: 2, project: {name: name || '', lang: lang || LANG(), uid: ''}, settings: {}, phases: [], tasks: [], raid: [], meetings: [], meetingTypes: [], governance: [], crs: [], snapshots: [], org: [], flows: [], charts: [], report: {topics: '', requests: ''}, cloudPending: true});

// ---- サーバーとのやり取り ----
async function api(meta, method, body){ // v1
  const {token} = await cloudKeys(meta.secret);
  const r = await fetch(`${meta.server}/api/p/${meta.id}`, {method, headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  let data = {}; try { data = await r.json(); } catch (e) {}
  return {status: r.status, data};
}
async function api2(server, id, method, action, body, token, query){ // v2
  const headers = {'Content-Type': 'application/json'}; if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(`${server}/api/v2/p/${id}/${action}${query || ''}`, {method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  let data = {}; try { data = await r.json(); } catch (e) {}
  return {status: r.status, data};
}
const apiMe = (meta, method, action, body, query) => api2(meta.server, meta.id, method, action, body, meta.token, query);
const getDoc = meta => meta.v === 2 ? apiMe(meta, 'GET', 'doc') : api(meta, 'GET');
const putDoc = (meta, body) => meta.v === 2 ? apiMe(meta, 'PUT', 'doc', body) : api(meta, 'PUT', body);

// ---- 状態の表示（画面右上の保存表示を「クラウド」用にする） ----
function cloudSetStatus(s){
  cloud.status = s;
  const el = document.querySelector('#saveInd'); if (!el || !cloudMeta()) return;
  el.classList.toggle('cloud', true); el.classList.toggle('offline', s === 'offline' || s === 'loggedOut');
  el.innerHTML = `<span class="dot"></span>${t('cloud.st.' + s)}`; el.title = t('cloud.stHint');
  const pill = document.querySelector('.cloud-card .pill'); if (pill) { pill.textContent = t('cloud.st.' + s); pill.classList.toggle('ok', s === 'synced'); }
}

// ---- 共有を始める（PM）：自分のログインIDとパスワードを決める。リンク共有（v1）からの切り替えも同じ ----
function checkNewLogin(login, password, password2){
  if (!LOGIN_RE.test(login)) return t('cloud.errLoginId');
  if (String(password || '').length < MIN_PW) return t('cloud.errPwShort', MIN_PW);
  if (password2 != null && password !== password2) return t('login.errMatch');
  return '';
}
async function cloudShare(server, login, password, derive = deriveLogin){
  const p = wsCurrent(), old = p.cloud && p.cloud.v !== 2 ? p.cloud : null;
  if (p.cloud && !old) return p.cloud;
  login = normLogin(login); const err = checkNewLogin(login, password); if (err) throw new Error(err);
  server = (server || cloudServer()).replace(/\/+$/, ''); if (!server) throw new Error('no_server');
  const mine = me(); if (mine) mine.login = login; // 体制図の自分にログインIDを結びつける
  if (state.org.some(x => x !== mine && normLogin(x.login) === login)) throw new Error(t('cloud.errLoginDup', login));
  const meta = {v: 2, id: b64u(rand(16)), server, login, role: 'pm', pdk: b64u(rand(32)), ver: 0, since: todayStr(), by: myName()};
  const salt = b64u(rand(16)), {authKey, wrapKey} = await derive(password, salt);
  const shared = sharedOf(state);
  const res = await api2(server, meta.id, 'POST', 'create', {login, salt, authKey, wrapped: await wrapPdk(meta.pdk, wrapKey), blob: await seal(shared, await dataKey(meta))});
  if (res.status !== 201) throw new Error('server_' + res.status);
  meta.token = res.data.token; meta.ver = res.data.ver;
  cloudDisconnect(); p.cloud = meta; wsWrite(); writeBase(p, shared);
  cloud.applying = true; save(); cloud.applying = false;
  try { localStorage.setItem(CLOUD_SRV_KEY, server); } catch (e) {}
  if (old) { try { await api(old, 'DELETE'); } catch (e) {} } // 以前のリンク共有の箱は消す（リンクを知っている人も開けなくなる）
  cloudConnect(); cloudSetStatus('synced');
  return meta;
}
// 共有をやめる（このブラウザだけで使う。クラウドのデータは残る：ほかの人は使い続けられる）
function cloudLeave(){
  const p = wsCurrent(); if (!p.cloud) return;
  cloudDisconnect(); delete p.cloud; wsWrite(); try { localStorage.removeItem(baseKey(p)); } catch (e) {}
  resetSaveInd();
}
// 共有していないプロジェクトでは、画面右上の表示を「保存済み」に戻す
function resetSaveInd(){ const el = document.querySelector('#saveInd'); if (!el) return; el.classList.remove('cloud', 'offline'); el.title = ''; if (el.textContent.includes('☁')) el.innerHTML = `<span class="dot"></span>${t('save.saved')}`; }

// ---- ログイン（v2） ----
const looksLikeCode = s => /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(String(s || '').trim());
const canonCode = s => { const c = String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); return c.slice(0, 4) + '-' + c.slice(4); };
async function loginRaw(server, id, login, password, derive = deriveLogin){
  login = normLogin(login);
  const pre = await api2(server, id, 'POST', 'prelogin', {login});
  if (pre.status === 404) throw new Error('gone'); if (pre.status !== 200) throw new Error('server_' + pre.status);
  const tryOne = async pw => {
    const {authKey, wrapKey} = await derive(pw, pre.data.salt);
    const res = await api2(server, id, 'POST', 'login', {login, authKey});
    if (res.status === 200) return {...res.data, login, pdk: await unwrapPdk(res.data.wrapped, wrapKey)};
    if (res.status === 429) throw new Error('locked');
    if (res.status === 401) return null;
    throw new Error('server_' + res.status);
  };
  // 案内コードは、大文字・小文字やハイフンの有無が違っても通す
  const r = await tryOne(password) || (looksLikeCode(password) && canonCode(password) !== password ? await tryOne(canonCode(password)) : null);
  if (!r) throw new Error('invalid');
  return r;
}
async function setPasswordRaw(server, id, token, pdk, password, derive = deriveLogin){
  const salt = b64u(rand(16)), {authKey, wrapKey} = await derive(password, salt);
  const res = await api2(server, id, 'POST', 'password', {salt, authKey, wrapped: await wrapPdk(pdk, wrapKey)}, token);
  if (res.status !== 200) throw new Error('server_' + res.status);
}
async function cloudLogin(login, password){
  const meta = cloudMeta(), r = await loginRaw(meta.server, meta.id, login, password);
  Object.assign(meta, {login: r.login, token: r.token, role: r.role, pdk: r.pdk, mustChange: !!r.mustChange}); wsWrite();
  return meta;
}
async function cloudSetPassword(password){
  const meta = cloudMeta(); await setPasswordRaw(meta.server, meta.id, meta.token, meta.pdk, password);
  meta.mustChange = false; wsWrite();
}
// ログインできたら中身を受け取り、体制図の中の自分（ログインIDが同じ人）として入る
async function cloudOpen(){
  const meta = cloudMeta(), p = wsCurrent();
  const res = await getDoc(meta); if (res.status === 401) return cloudSessionLost(); if (res.status !== 200) throw new Error('server_' + res.status);
  const remote = await unseal(res.data.blob, await dataKey(meta));
  state = withLocal(remote, state); delete state.cloudPending; normalize();
  meta.ver = res.data.ver; wsWrite(); writeBase(p, remote);
  const mine = state.org.find(x => normLogin(x.login) === meta.login);
  ui.me = mine ? mine.id : ''; ui.login = {id: '', err: mine ? '' : t('cloud.errNotInOrg', meta.login)};
  if (mine) ui.tab = ROLE_HOME[mine.access || 'member']; // ロールの最初の画面から（ローカルのログインと同じ）
  cloud.applying = true; save(); cloud.applying = false;
  cloudConnect(); cloudSetStatus('synced'); render(true);
  if (mine) toast(t('login.welcome', mine.name));
}
// ログアウト：この PC からプロジェクト鍵とデータの控えを消す（次に開くときはログインして受け取り直す）
function cloudForget(){
  const meta = cloudMeta(), p = wsCurrent(); if (!meta) return;
  cloudDisconnect();
  ['token', 'pdk', 'role', 'mustChange'].forEach(k => delete meta[k]);
  try { localStorage.removeItem(p.key); localStorage.removeItem(baseKey(p)); } catch (e) {}
  state = cloudBlank(state.project.name, state.project.lang); normalize(); ui.me = '';
  cloud.applying = true; save(); cloud.applying = false; wsWrite();
}
async function cloudLogout(){ const meta = cloudMeta(); if (meta && meta.token) { try { await apiMe(meta, 'POST', 'logout'); } catch (e) {} } cloudForget(); render(true); }
function cloudSessionLost(){ cloudForget(); cloudSetStatus('loggedOut'); render(true); toast(t('cloud.sessionLost')); }

// ---- メンバーの招待・役割・削除（PM・PMO） ----
async function cloudInvite(person){
  const meta = cloudMeta(), login = normLogin(person.login);
  if (!LOGIN_RE.test(login)) throw new Error(t('cloud.errLoginId'));
  if (state.org.some(x => x !== person && normLogin(x.login) === login)) throw new Error(t('cloud.errLoginDup', login));
  const code = newInviteCode(), salt = b64u(rand(16)), {authKey, wrapKey} = await deriveLogin(code, salt);
  const res = await apiMe(meta, 'PUT', 'member', {login, role: person.access || 'member', salt, authKey, wrapped: await wrapPdk(meta.pdk, wrapKey)});
  if (res.status === 401) { cloudSessionLost(); throw new Error(t('cloud.sessionLost')); }
  if (res.status !== 200) throw new Error(res.data.error === 'forbidden' ? t('perm.denied') : 'server_' + res.status);
  person.login = login; person.invitedAt = todayStr(); cloud.membersAt = 0; save();
  return code;
}
async function cloudSetRole(person){
  const meta = cloudMeta(); if (!meta || meta.v !== 2 || !person.login) return;
  const res = await apiMe(meta, 'PATCH', 'member', {login: normLogin(person.login), role: person.access || 'member'});
  if (res.status !== 200 && res.status !== 404) toast(t('cloud.errRole', res.data.error || res.status));
  cloud.membersAt = 0;
}
async function cloudRemoveMember(login){
  const meta = cloudMeta(); if (!meta || meta.v !== 2 || !login) return false;
  const res = await apiMe(meta, 'DELETE', 'member', null, '?login=' + encodeURIComponent(normLogin(login)));
  cloud.membersAt = 0; return res.status === 200;
}
// サーバーにあるメンバーの状態（招待中・利用中など）。体制図の表示に使う
async function cloudMembers(force){
  const meta = cloudMeta(); if (!meta || meta.v !== 2 || !meta.token) return null;
  if (!force && cloud.members && Date.now() - cloud.membersAt < 30000) return cloud.members;
  const res = await apiMe(meta, 'GET', 'members'); if (res.status !== 200) return cloud.members;
  cloud.members = res.data.members; cloud.membersAt = Date.now(); return cloud.members;
}
const memberState = login => { const m = (cloud.members || []).find(x => x.login === normLogin(login)); return !m ? 'none' : m.locked ? 'locked' : m.invited ? 'invited' : 'active'; };

// ---- リンクから開く ----
function parseJoin(hash){
  const h = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const srv = (h.get('srv') || cloudServer()).replace(/\/+$/, '');
  if (h.get('p')) return {v: 2, id: h.get('p'), server: srv};
  const j = h.get('join'); if (!j) return null;
  const [id, secret] = j.split('.'); if (!id || !secret) return null;
  return {v: 1, id, secret, server: srv};
}
function cloudOpenSlot(){ // 新しいプロジェクトの枠（初めて開いた人は、最初に入っているサンプルの代わりに使う）
  if (ws.projects.length === 1 && state && state.isSample && !wsCurrent().cloud) return;
  if (state) save(); wsBeginNewProject();
}
async function cloudJoin(j){
  const hit = ws.projects.find(p => p.cloud && p.cloud.id === j.id);
  if (hit) { if (hit.id !== ws.current) switchProject(hit.id); if (cloudSignedIn()) await cloudPull(); else render(true); return 'opened'; }
  if (!j.server) throw new Error('no_server');
  if (j.v === 2 && (acct || !localMode())) { // アカウントで入る：参加済みなら開き、まだなら案内コードを聞く
    if (acct && ringEntry(j.id)) { await acctOpenProject(j.id); return 'opened'; }
    setPendingJoin({v: 2, id: j.id, server: j.server}); if (acct) renderProjectPicker(); else { ui.start = {mode: 'login', err: ''}; render(true); }
    return 'pending';
  }
  if (j.v === 2) { // 以前の方式（プロジェクトごとのパスワード）：ログインしてから中身を受け取る
    cloudOpenSlot(); state = cloudBlank('', state && state.project.lang); normalize();
    wsCurrent().cloud = {v: 2, id: j.id, server: j.server, ver: 0, since: todayStr()}; ui.me = '';
    cloud.applying = true; save(); cloud.applying = false; wsWrite(); render(true);
    return 'joined';
  }
  const meta = {id: j.id, secret: j.secret, server: j.server, ver: 0, since: todayStr()};
  const res = await api(meta, 'GET'); if (res.status !== 200) throw new Error('server_' + res.status);
  const remote = await unseal(res.data.blob, (await cloudKeys(meta.secret)).key);
  const same = ws.projects.find(p => p.uid && remote.project && p.uid === remote.project.uid && !p.cloud);
  if (same) { if (same.id !== ws.current) { save(); ws.current = same.id; wsWrite(); resetUi(); state = null; load(); } }
  else cloudOpenSlot();
  const lang = state && state.project ? state.project.lang : '';
  state = withLocal(remote, {project: {lang: lang || remote.project.lang}}); normalize();
  meta.ver = res.data.ver; wsCurrent().cloud = meta; ui.me = ''; cloud.applying = true; save(); cloud.applying = false; wsWrite(); writeBase(wsCurrent(), sharedOf(state));
  cloudConnect(); render(true); cloudSetStatus('synced');
  return 'joined';
}

// ---- 送る・受け取る ----
// 保存のたびに呼ばれる。少し待ってまとめて送る（入力中に何度も送らない）
function cloudAfterSave(){
  if (cloud.applying || !cloudMeta() || !cloudSignedIn() || state.cloudPending) return;
  cloudSetStatus('pending');
  clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudPush, 700);
}
// 送受信は 1 本ずつ順番に行う（途中で次の依頼が来たら、終わってからもう一度回す）
const cloudPush = () => cloudRun(false);
const cloudPull = () => cloudRun(true);
// 待っている依頼は、順番の分まで終わってから「終わった」と返す（先に返すと、呼んだ側が古い状態を見てしまう）
const cloudWaiters = [];
const cloudIdle = () => cloud.busy ? new Promise(r => cloudWaiters.push(r)) : Promise.resolve();
async function cloudRun(pull){
  if (!cloudMeta() || !cloudSignedIn() || state.cloudPending) return;
  if (cloud.busy) { cloud.again = cloud.again === 'push' || !pull ? 'push' : 'pull'; return cloudIdle(); }
  cloud.busy = true;
  try { await (pull ? syncPull() : syncPush()); cloud.retry = 0; }
  catch (e) { cloudOffline(); }
  finally {
    cloud.busy = false;
    const next = cloud.again; cloud.again = false;
    if (next && cloudSignedIn()) cloudRun(next === 'pull'); // 次の分が終わるまで、待っている人はそのまま待つ
    else cloudWaiters.splice(0).forEach(r => r());
  }
}
async function syncPush(){
  const meta = cloudMeta(), p = wsCurrent(), shared = sharedOf(state), base = readBase(p);
  if (base && deq(shared, base)) { cloudSetStatus('synced'); return; }
  cloudSetStatus('syncing');
  const res = await putDoc(meta, {ver: meta.ver, blob: await seal(shared, await dataKey(meta))});
  if (res.status === 200 || res.status === 201) { meta.ver = res.data.ver; wsWrite(); writeBase(p, shared); cloudSetStatus(deq(sharedOf(state), shared) ? 'synced' : 'pending'); if (!deq(sharedOf(state), shared)) cloud.again = 'push'; return; }
  if (res.status === 409) return syncPull(); // 先に誰かが保存していた：合わせてから送り直す
  if (res.status === 401 && meta.v === 2) return cloudSessionLost();
  if (res.status === 403 && res.data.error === 'must_change') { cloudSetStatus('loggedOut'); return; }
  if (res.status === 413) { cloudSetStatus('tooLarge'); return; }
  throw new Error('server_' + res.status);
}
// クラウドの最新を受け取り、自分のまだ送っていない変更と合わせる
async function syncPull(){
  const meta = cloudMeta(), p = wsCurrent();
  const res = await getDoc(meta);
  if (res.status === 401 && meta.v === 2) return cloudSessionLost();
  if (res.status === 404 || res.status === 403) { cloudSetStatus('gone'); return; }
  if (res.status !== 200) throw new Error('server_' + res.status);
  let remote = null;
  if (res.data.ver !== meta.ver) remote = await unseal(res.data.blob, await dataKey(meta));
  // ここから先は待ち時間なし（受け取っている間に入力された分も、取りこぼさず合わせる）
  const base = readBase(p) || {}, local = sharedOf(state);
  if (!remote) { if (!deq(local, base)) return syncPush(); cloudSetStatus('synced'); return; }
  const merged = merge3(base, local, remote), changed = !deq(merged, local);
  if (changed) { state = withLocal(merged, state); normalize(); cloud.applying = true; save(); cloud.applying = false; render(false); }
  meta.ver = res.data.ver; wsWrite(); writeBase(p, remote);
  if (!deq(sharedOf(state), remote)) return syncPush(); // 自分の分（と補った欄）がまだ載っていない
  cloudSetStatus('synced');
  if (changed) flashCloud();
}
function flashCloud(){ const el = document.querySelector('#saveInd'); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
function cloudOffline(){
  cloudSetStatus('offline');
  cloud.retry = Math.min(6, cloud.retry + 1);
  clearTimeout(cloud.timer); cloud.timer = setTimeout(() => cloudPull(), 2000 * 2 ** cloud.retry);
}

// ---- 知らせを受け取る（誰かが保存したら、すぐ取りに行く） ----
function cloudConnect(){
  cloudDisconnect(); const meta = cloudMeta(); if (!meta || !cloudSignedIn()) return;
  const url = meta.v === 2 ? `${meta.server.replace(/^http/, 'ws')}/api/v2/p/${meta.id}/ws?t=${encodeURIComponent(meta.token)}` : `${meta.server.replace(/^http/, 'ws')}/api/p/${meta.id}/ws`;
  const open = () => {
    let sock; try { sock = new WebSocket(url); } catch (e) { return; }
    cloud.ws = sock;
    sock.onmessage = e => { let d = {}; try { d = JSON.parse(e.data); } catch (x) {} const m = cloudMeta(); if (m && m.id === meta.id && d.ver > m.ver) cloudPull(); };
    sock.onclose = () => { if (cloud.ws === sock) { cloud.ws = null; setTimeout(() => { const m = cloudMeta(); if (m && m.id === meta.id && cloudSignedIn() && !cloud.ws) open(); }, 3000); } };
  };
  open();
  cloud.poll = setInterval(() => { if (!document.hidden) cloudPull(); }, 30000); // 知らせが届かない環境の予備
}
function cloudDisconnect(){ if (cloud.ws) { const s = cloud.ws; cloud.ws = null; try { s.close(); } catch (e) {} } clearInterval(cloud.poll); clearTimeout(cloud.timer); }
window.addEventListener('focus', () => { if (cloudMeta()) cloudPull(); });
window.addEventListener('online', () => { if (cloudMeta()) cloudPull(); });

// ---- 起動時：リンクで開かれたら参加し、共有中のプロジェクトならつなぐ ----
async function cloudBoot(){
  const j = parseJoin(location.hash);
  if (j) {
    history.replaceState(null, '', location.pathname + location.search); // リンクの情報をアドレス欄に残さない
    try { const r = await cloudJoin(j); if (j.v === 1) toast(t(r === 'joined' ? 'cloud.joined' : 'cloud.opened', state.project.name)); }
    catch (e) { alert(t(String(e.message).startsWith('server_4') ? 'cloud.errLink' : 'cloud.errJoin')); }
    return;
  }
  if (cloudMeta()) { if (!cloudSignedIn()) { if (ui.me) { ui.me = ''; render(true); } return; } cloudConnect(); cloudSetStatus('syncing'); cloudPull(); }
}
// プロジェクトを切り替えたら、つなぎ先も切り替える
function cloudOnSwitch(){ cloudDisconnect(); cloud.members = null; resetSaveInd(); if (cloudMeta() && cloudSignedIn()) { cloudConnect(); cloudSetStatus('syncing'); cloudPull(); } }

// ---- ログイン画面（共有中のプロジェクト） ----
function renderCloudLogin(){
  const meta = cloudMeta(), L = ui.login || (ui.login = {id: '', err: ''});
  if (acct && !meta.token) {
    if (!ringEntry(meta.id)) { setPendingJoin({v: 2, id: meta.id, server: meta.server}); renderProjectPicker(); return; }
    $('#view').innerHTML = `<div class="login-wrap"><div class="card login"><div class="login-logo">${brandLogo()}</div><p class="lead" style="text-align:center">☁ ${t('acct.opening')}</p></div></div>`;
    acctOpenProject(meta.id).catch(e => { alert(String(e.message) === 'invalid' ? t('acct.errRemoved') : t('cloud.errNet')); renderProjectPicker(); });
    return;
  }
  const step = meta.token && meta.pdk && meta.mustChange ? 'setpw' : meta.token && meta.pdk ? 'notInOrg' : 'login';
  const body = step === 'setpw' ? `<p class="muted small">${t('cloud.setPwHelp', MIN_PW)}</p><form id="clForm" class="lg-form" autocomplete="off">
      <label class="lbl-block">${t('cloud.newPw', MIN_PW)}<input type="password" id="clPw1" autocomplete="new-password" autofocus></label>
      <label class="lbl-block">${t('login.newPin2')}<input type="password" id="clPw2" autocomplete="new-password"></label>
      ${L.err ? `<p class="red small">${esc(L.err)}</p>` : ''}<div class="bar" style="margin:6px 0 0"><span class="sp"></span><button class="btn primary" type="submit" id="clGo">${t('cloud.setPw')}</button></div></form>`
    : step === 'notInOrg' ? `<p class="need">${esc(L.err || t('cloud.errNotInOrg', meta.login))}</p><div class="bar"><span class="sp"></span><button class="btn" id="clOut">${t('login.logout')}</button></div>`
    : `<form id="clForm" class="lg-form">
      <label class="lbl-block">${t('cloud.loginId')}<input id="clId" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(L.loginId || '')}" autofocus></label>
      <label class="lbl-block">${t('cloud.pw')}<input type="password" id="clPw" autocomplete="current-password"></label>
      <p class="muted small">${t('cloud.firstTime')}</p>
      ${L.err ? `<p class="red small">${esc(L.err)}</p>` : ''}<div class="bar" style="margin:6px 0 0"><span class="sp"></span><button class="btn primary" type="submit" id="clGo">${t('login.go')}</button></div></form>`;
  $('#view').innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="login-logo">${brandLogo()}</div>
    <h1 class="large-title" style="text-align:center">${esc(state.project.name || t('cloud.sharedProject'))}</h1>
    <p class="lead" style="text-align:center;margin-bottom:18px">☁ ${t('cloud.loginTitle')}</p>
    ${body}
    <div class="login-foot">${ws && ws.projects.length > 1 ? `<button class="btn ghost" id="lgOther">${t('ws.openOther')}</button>` : ''}</div>
  </div></div>`;
  const other = $('#lgOther'); if (other) other.onclick = () => openProjectSwitcher(other);
  const out = $('#clOut'); if (out) out.onclick = () => cloudLogout();
  const form = $('#clForm'); if (!form) return;
  const busy = on => { const b = form.querySelector('#clGo'); if (b && document.body.contains(form)) { b.disabled = on; b.textContent = on ? t('cloud.checking') : (step === 'setpw' ? t('cloud.setPw') : t('login.go')); } }; // 画面が次の段階に変わっていたら触らない
  form.onsubmit = async e => {
    e.preventDefault(); busy(true);
    try {
      if (step === 'setpw') {
        const a = $('#clPw1').value, b = $('#clPw2').value, err = a.length < MIN_PW ? t('cloud.errPwShort', MIN_PW) : a !== b ? t('login.errMatch') : '';
        if (err) { L.err = err; return renderCloudLogin(); }
        await cloudSetPassword(a); L.err = ''; await cloudOpen(); return;
      }
      L.loginId = normLogin($('#clId').value);
      await cloudLogin(L.loginId, $('#clPw').value); L.err = '';
      if (cloudMeta().mustChange) return renderCloudLogin();
      await cloudOpen();
    } catch (x) {
      const m = String(x.message);
      L.err = m === 'invalid' ? t('cloud.errLogin') : m === 'locked' ? t('cloud.errLocked') : m === 'gone' ? t('cloud.errGone') : t('cloud.errNet');
      renderCloudLogin();
    } finally { busy(false); }
  };
}

// ---- 設定画面の「チームで共有」 ----
const accountFields = (id) => `<div class="form-grid">
    <label>${t('cloud.loginId')}<input id="${id}Id" autocapitalize="off" spellcheck="false" placeholder="yamamoto" value="${esc((me() || {}).login || '')}"><small class="muted">${t('cloud.loginIdHint')}</small></label>
    <label>${t('cloud.newPw', MIN_PW)}<input type="password" id="${id}Pw1" autocomplete="new-password"></label>
    <label>${t('login.newPin2')}<input type="password" id="${id}Pw2" autocomplete="new-password"></label></div>`;
function cloudCard(){
  const meta = cloudMeta(), pm = canCreate('admin');
  if (meta && meta.v === 2) return `<div class="card cloud-card" style="margin-top:14px"><h2>☁ ${t('cloud.title')}<span class="hint">${t('cloud.onHint')}</span></h2>
    <div class="cloud-state"><span class="pill ok">${t('cloud.st.' + (cloud.status || 'synced'))}</span><span class="muted small">${t('cloud.signedInAs', esc(meta.login || '—'), t('role.' + (meta.role || 'member')))}</span><span class="muted small">${t('cloud.since', md(meta.since), esc(meta.by || '—'))}</span></div>
    <label class="lbl-block" style="margin-top:10px">${t('cloud.link')}<div class="cloud-link"><input readonly value="${esc(shareLink(meta))}" id="cloudLinkTxt"><button class="btn" id="cloudCopy">${t('cloud.copy')}</button></div><small class="muted">${t('cloud.linkHint2')}</small></label>
    <p class="muted small">${t('cloud.privacy2')}</p>
    <div class="bar" style="margin-top:6px"><span class="muted small">${t('cloud.inviteWhere')}</span><span class="sp"></span><button class="btn" id="cloudLeave">${t('cloud.leave')}</button></div></div>`;
  if (meta) return `<div class="card cloud-card" style="margin-top:14px"><h2>☁ ${t('cloud.title')}<span class="hint">${t('cloud.v1Hint')}</span></h2>
    <p class="muted small">${t('cloud.v1Why')}</p>
    ${pm && acct ? `<div class="bar" style="margin-top:10px"><span class="muted small">${t('acct.shareAs', esc(acct.login))}</span><span class="sp"></span><button class="btn primary" id="cloudUpgradeAcct">${t('cloud.upgrade')}</button></div>` : pm ? `${accountFields('cu')}<div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn primary" id="cloudUpgrade">${t('cloud.upgrade')}</button></div>` : `<p class="muted small">${t('cloud.pmOnly')}</p>`}</div>`;
  return `<div class="card cloud-card" style="margin-top:14px"><h2>☁ ${t('cloud.title')}<span class="hint">${t('cloud.offHint')}</span></h2>
    <ol class="cloud-steps"><li>${t('cloud.step1b')}</li><li>${t('cloud.step2b')}</li><li>${t('cloud.step3b')}</li></ol>
    <p class="muted small">${t('cloud.privacy2')}</p>
    ${pm && acct ? `<div class="bar" style="margin-top:10px"><span class="muted small">${t('acct.shareAs', esc(acct.login))}</span><span class="sp"></span><button class="btn primary" id="cloudStartAcct">☁ ${t('cloud.start')}</button></div>`
      : pm ? `<p class="muted small">${t('acct.needAccount')}</p><div class="bar"><span class="sp"></span><button class="btn primary" id="cloudToStart">${t('acct.toStart')}</button></div><details class="cloud-adv"><summary>${t('acct.legacyShare')}</summary>${accountFields('cs')}<details class="cloud-adv"><summary>${t('cloud.server')}</summary><input id="cloudSrv" placeholder="https://kizashi-cloud.example.workers.dev" value="${esc(cloudServer())}"><small class="muted">${t('cloud.serverHint')}</small></details>
    <div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn" id="cloudStart">☁ ${t('cloud.start')}</button></div></details>` : `<p class="muted small">${t('cloud.pmOnly')}</p>`}</div>`;
}
function bindCloudCard(root){
  const cp = root.querySelector('#cloudCopy'); if (cp) cp.onclick = () => copyText(shareLink(cloudMeta()));
  const lv = root.querySelector('#cloudLeave'); if (lv) lv.onclick = () => { if (confirm(t('cloud.leaveConfirm'))) { cloudLeave(); render(); toast(t('cloud.left')); } };
  const start = (btn, pre, label) => btn.onclick = async () => {
    const v = k => (root.querySelector('#' + pre + k) || {}).value || '';
    const err = checkNewLogin(normLogin(v('Id')), v('Pw1'), v('Pw2')); if (err) { alert(err); return; }
    const srv = (root.querySelector('#cloudSrv') || {}).value || cloudServer();
    btn.disabled = true; btn.textContent = t('cloud.starting');
    try { await cloudShare(srv, v('Id'), v('Pw1')); render(); toast(t('cloud.started2')); }
    catch (e) { btn.disabled = false; btn.textContent = label; alert(t('cloud.errStart', String(e.message))); }
  };
  const st = root.querySelector('#cloudStart'); if (st) start(st, 'cs', '☁ ' + t('cloud.start'));
  const ts = root.querySelector('#cloudToStart'); if (ts) ts.onclick = () => { try { localStorage.removeItem(MODE_KEY); } catch (e) {} save(); ui.me = ''; ui.start = {mode: 'signup', err: ''}; render(true); };
  root.querySelectorAll('#cloudStartAcct, #cloudUpgradeAcct').forEach(b => b.onclick = async () => {
    const label = b.textContent; b.disabled = true; b.textContent = t('cloud.starting');
    try { await acctShare(); render(); toast(t('cloud.started2')); } catch (e) { b.disabled = false; b.textContent = label; alert(t('cloud.errStart', String(e.message))); }
  });
  const up = root.querySelector('#cloudUpgrade'); if (up) start(up, 'cu', t('cloud.upgrade'));
}
