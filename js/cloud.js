// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ クラウド共有（チーム全員で同じデータを見る） ============
// 導入の手間をなくすため、アカウント作成もインストールも要らない作りにする。
//  1. PM が「チームで共有」を押す → このプロジェクトがクラウドに置かれ、共有リンクができる
//  2. 招待の文面にリンクが入る → メンバーはリンクを開いて、自分の名前とパスコードで入るだけ
//  3. 以後、誰かが保存するとすぐ全員の画面に反映される（同時に直しても、項目ごとに合わせて消さない）
// データはブラウザの中で暗号化してから送る。鍵はリンクの # の後ろにあり、サーバーには届かない（サーバーは中身を読めない）。
const CLOUD_DEFAULT = 'https://kizashi-cloud.kizashipm.workers.dev'; // 公開している同期サーバー（自社で立てたサーバーは設定画面で入れる）
const CLOUD_APP_URL = 'https://matassy0813.github.io/kizashi/Kizashi.html'; // ファイルで開いているときの共有リンクの行き先
const CLOUD_SRV_KEY = 'kizashi-cloud-server';
const LOCAL_ONLY = [['project', 'lang'], ['project', 'baseDate']]; // 人ごとに違ってよいもの（表示言語・基準日）は共有しない
const cloud = {status: '', ws: null, timer: null, poll: null, busy: false, again: false, applying: false, retry: 0};

// ---- 暗号・符号化 ----
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const toB64 = bytes => { let s = ''; const u = new Uint8Array(bytes); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function streamBytes(bytes, T){ const s = new Blob([bytes]).stream().pipeThrough(new T('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function cloudKeys(secret){
  const raw = unb64u(secret);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const token = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kizashi-auth:' + secret)));
  return {key, token};
}
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
const baseKey = p => 'pmo-cloudbase-' + p.id;
const readBase = p => { try { return JSON.parse(localStorage.getItem(baseKey(p)) || 'null'); } catch (e) { return null; } };
const writeBase = (p, s) => { try { localStorage.setItem(baseKey(p), JSON.stringify(s)); } catch (e) {} };
function shareLink(meta){
  const here = /^https?:/.test(location.protocol) ? location.origin + location.pathname : CLOUD_APP_URL;
  return `${here}#join=${meta.id}.${meta.secret}${meta.server && meta.server !== CLOUD_DEFAULT ? '&srv=' + encodeURIComponent(meta.server) : ''}`;
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
async function api(meta, method, body){
  const {token} = await cloudKeys(meta.secret);
  const r = await fetch(`${meta.server}/api/p/${meta.id}`, {method, headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store'});
  let data = {}; try { data = await r.json(); } catch (e) {}
  return {status: r.status, data};
}

// ---- 状態の表示（画面右上の保存表示を「クラウド」用にする） ----
function cloudSetStatus(s){
  cloud.status = s;
  const el = document.querySelector('#saveInd'); if (!el || !cloudMeta()) return;
  el.classList.toggle('cloud', true); el.classList.toggle('offline', s === 'offline');
  el.innerHTML = `<span class="dot"></span>${t('cloud.st.' + s)}`; el.title = t('cloud.stHint');
  const pill = document.querySelector('.cloud-card .pill'); if (pill) { pill.textContent = t('cloud.st.' + s); pill.classList.toggle('ok', s === 'synced'); }
}

// ---- 共有を始める（PM） ----
async function cloudShare(server){
  const p = wsCurrent(); if (p.cloud) return p.cloud;
  server = (server || cloudServer()).replace(/\/+$/, '');
  if (!server) throw new Error('no_server');
  const meta = {id: b64u(rand(16)), secret: b64u(rand(32)), server, ver: 0, since: todayStr(), by: myName()};
  const shared = sharedOf(state), {key} = await cloudKeys(meta.secret);
  const res = await api(meta, 'PUT', {ver: 0, blob: await seal(shared, key)});
  if (res.status !== 201 && res.status !== 200) throw new Error('server_' + res.status);
  meta.ver = res.data.ver; p.cloud = meta; wsWrite(); writeBase(p, shared);
  try { localStorage.setItem(CLOUD_SRV_KEY, server); } catch (e) {}
  cloudConnect(); cloudSetStatus('synced');
  return meta;
}
// 共有をやめる（このブラウザだけで使う。クラウドのデータは残る：ほかの人は使い続けられる）
function cloudLeave(){
  const p = wsCurrent(); if (!p.cloud) return;
  cloudDisconnect(); delete p.cloud; wsWrite(); try { localStorage.removeItem(baseKey(p)); } catch (e) {}
  const el = document.querySelector('#saveInd'); if (el) el.classList.remove('cloud', 'offline');
}

// ---- リンクから参加する（メンバー） ----
function parseJoin(hash){
  const h = new URLSearchParams(String(hash || '').replace(/^#/, '')), j = h.get('join'); if (!j) return null;
  const [id, secret] = j.split('.'); if (!id || !secret) return null;
  return {id, secret, server: (h.get('srv') || cloudServer()).replace(/\/+$/, '')};
}
async function cloudJoin(j){
  const hit = ws.projects.find(p => p.cloud && p.cloud.id === j.id);
  if (hit) { if (hit.id !== ws.current) switchProject(hit.id); await cloudPull(); return 'opened'; }
  if (!j.server) throw new Error('no_server');
  const meta = {id: j.id, secret: j.secret, server: j.server, ver: 0, since: todayStr()};
  const res = await api(meta, 'GET'); if (res.status !== 200) throw new Error('server_' + res.status);
  const {key} = await cloudKeys(meta.secret), remote = await unseal(res.data.blob, key);
  // 同じプロジェクト（JSON で受け取っていたもの）があれば、それをクラウドにつなぐ。なければ新しく加える
  const same = ws.projects.find(p => p.uid && remote.project && p.uid === remote.project.uid && !p.cloud);
  if (same) { if (same.id !== ws.current) { save(); ws.current = same.id; wsWrite(); resetUi(); state = null; load(); } }
  else if (ws.projects.length === 1 && state && state.isSample && !wsCurrent().cloud) { /* 初めて開いた人：最初に入っているサンプルの代わりに使う */ }
  else { if (state) save(); wsBeginNewProject(); }
  const lang = state && state.project ? state.project.lang : '';
  state = withLocal(remote, {project: {lang: lang || remote.project.lang}}); normalize();
  meta.ver = res.data.ver; wsCurrent().cloud = meta; ui.me = ''; cloud.applying = true; save(); cloud.applying = false; wsWrite(); writeBase(wsCurrent(), sharedOf(state));
  cloudConnect(); render(true); cloudSetStatus('synced');
  return 'joined';
}

// ---- 送る・受け取る ----
// 保存のたびに呼ばれる。少し待ってまとめて送る（入力中に何度も送らない）
function cloudAfterSave(){
  if (cloud.applying || !cloudMeta()) return;
  cloudSetStatus('pending');
  clearTimeout(cloud.timer); cloud.timer = setTimeout(cloudPush, 700);
}
// 送受信は 1 本ずつ順番に行う（途中で次の依頼が来たら、終わってからもう一度回す）
const cloudPush = () => cloudRun(false);
const cloudPull = () => cloudRun(true);
async function cloudRun(pull){
  if (!cloudMeta()) return;
  if (cloud.busy) { cloud.again = cloud.again || (pull ? 'pull' : 'push'); return; }
  cloud.busy = true;
  try { await (pull ? syncPull() : syncPush()); cloud.retry = 0; }
  catch (e) { cloudOffline(); }
  finally {
    cloud.busy = false;
    const next = cloud.again; cloud.again = false;
    if (next) cloudRun(next === 'pull');
  }
}
async function syncPush(){
  const meta = cloudMeta(), p = wsCurrent(), shared = sharedOf(state), base = readBase(p);
  if (base && deq(shared, base)) { cloudSetStatus('synced'); return; }
  cloudSetStatus('syncing');
  const {key} = await cloudKeys(meta.secret);
  const res = await api(meta, 'PUT', {ver: meta.ver, blob: await seal(shared, key)});
  if (res.status === 200 || res.status === 201) { meta.ver = res.data.ver; wsWrite(); writeBase(p, shared); cloudSetStatus(deq(sharedOf(state), shared) ? 'synced' : 'pending'); if (!deq(sharedOf(state), shared)) cloud.again = 'push'; return; }
  if (res.status === 409) return syncPull(); // 先に誰かが保存していた：合わせてから送り直す
  if (res.status === 413) { cloudSetStatus('tooLarge'); return; }
  throw new Error('server_' + res.status);
}
// クラウドの最新を受け取り、自分のまだ送っていない変更と合わせる
async function syncPull(){
  const meta = cloudMeta(), p = wsCurrent();
  const res = await api(meta, 'GET');
  if (res.status === 404 || res.status === 403) { cloudSetStatus('gone'); return; }
  if (res.status !== 200) throw new Error('server_' + res.status);
  let remote = null;
  if (res.data.ver !== meta.ver) { const {key} = await cloudKeys(meta.secret); remote = await unseal(res.data.blob, key); }
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
  cloudDisconnect(); const meta = cloudMeta(); if (!meta) return;
  const open = () => {
    let sock; try { sock = new WebSocket(meta.server.replace(/^http/, 'ws') + `/api/p/${meta.id}/ws`); } catch (e) { return; }
    cloud.ws = sock;
    sock.onmessage = e => { let d = {}; try { d = JSON.parse(e.data); } catch (x) {} const m = cloudMeta(); if (m && m.id === meta.id && d.ver > m.ver) cloudPull(); };
    sock.onclose = () => { if (cloud.ws === sock) { cloud.ws = null; setTimeout(() => { if (cloudMeta() && cloudMeta().id === meta.id && !cloud.ws) open(); }, 3000); } };
  };
  open();
  cloud.poll = setInterval(() => { if (!document.hidden) cloudPull(); }, 30000); // 知らせが届かない環境の予備
}
function cloudDisconnect(){ if (cloud.ws) { const s = cloud.ws; cloud.ws = null; try { s.close(); } catch (e) {} } clearInterval(cloud.poll); clearTimeout(cloud.timer); }
window.addEventListener('focus', () => { if (cloudMeta()) cloudPull(); });
window.addEventListener('online', () => { if (cloudMeta()) cloudPull(); });

// ---- 起動時：共有リンクで開かれたら参加し、共有中のプロジェクトならつなぐ ----
async function cloudBoot(){
  const j = parseJoin(location.hash);
  if (j) {
    history.replaceState(null, '', location.pathname + location.search); // 鍵をアドレス欄に残さない
    try { const r = await cloudJoin(j); toast(t(r === 'joined' ? 'cloud.joined' : 'cloud.opened', state.project.name)); }
    catch (e) { alert(t(String(e.message).startsWith('server_4') ? 'cloud.errLink' : 'cloud.errJoin')); }
    return;
  }
  if (cloudMeta()) { cloudConnect(); cloudSetStatus('syncing'); cloudPull(); }
}
// プロジェクトを切り替えたら、つなぎ先も切り替える
function cloudOnSwitch(){ cloudDisconnect(); const el = document.querySelector('#saveInd'); if (el) el.classList.remove('cloud', 'offline'); if (cloudMeta()) { cloudConnect(); cloudSetStatus('syncing'); cloudPull(); } }

// ---- 設定画面の「チームで共有」 ----
function cloudCard(){
  const meta = cloudMeta(), pm = canCreate('admin');
  if (meta) return `<div class="card cloud-card" style="margin-top:14px"><h2>☁ ${t('cloud.title')}<span class="hint">${t('cloud.onHint')}</span></h2>
    <div class="cloud-state"><span class="pill ok">${t('cloud.st.' + (cloud.status || 'synced'))}</span><span class="muted small">${t('cloud.since', md(meta.since), esc(meta.by || '—'))}</span></div>
    <label class="lbl-block" style="margin-top:10px">${t('cloud.link')}<div class="cloud-link"><input readonly value="${esc(shareLink(meta))}" id="cloudLinkTxt"><button class="btn primary" id="cloudCopy">${t('cloud.copy')}</button></div><small class="muted">${t('cloud.linkHint')}</small></label>
    <div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn" id="cloudLeave">${t('cloud.leave')}</button></div></div>`;
  return `<div class="card cloud-card" style="margin-top:14px"><h2>☁ ${t('cloud.title')}<span class="hint">${t('cloud.offHint')}</span></h2>
    <ol class="cloud-steps"><li>${t('cloud.step1')}</li><li>${t('cloud.step2')}</li><li>${t('cloud.step3')}</li></ol>
    <p class="muted small">${t('cloud.privacy')}</p>
    ${pm ? `<details class="cloud-adv" ${cloudServer() ? '' : 'open'}><summary>${t('cloud.server')}</summary><input id="cloudSrv" placeholder="https://kizashi-cloud.example.workers.dev" value="${esc(cloudServer())}"><small class="muted">${t('cloud.serverHint')}</small></details>
    <div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn primary" id="cloudStart">☁ ${t('cloud.start')}</button></div>` : `<p class="muted small">${t('cloud.pmOnly')}</p>`}</div>`;
}
function bindCloudCard(root){
  const cp = root.querySelector('#cloudCopy'); if (cp) cp.onclick = () => copyText(shareLink(cloudMeta()));
  const lv = root.querySelector('#cloudLeave'); if (lv) lv.onclick = () => { if (confirm(t('cloud.leaveConfirm'))) { cloudLeave(); render(); toast(t('cloud.left')); } };
  const st = root.querySelector('#cloudStart'); if (st) st.onclick = async () => {
    const srv = (root.querySelector('#cloudSrv') || {}).value || cloudServer();
    if (!srv) { toast(t('cloud.needServer')); return; }
    st.disabled = true; st.textContent = t('cloud.starting');
    try { await cloudShare(srv); render(); toast(t('cloud.started')); }
    catch (e) { st.disabled = false; st.textContent = '☁ ' + t('cloud.start'); alert(t('cloud.errStart', String(e.message))); }
  };
}
