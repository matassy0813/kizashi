// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ Kizashi クラウド同期サーバー（Cloudflare Workers + Durable Objects） ============
// サーバーは「鍵のかかった箱」を預かるだけで、中身（顧客の情報を含むプロジェクトのデータ）は読めない。運営者（開発者）も同じ。
//
// v2（メンバーごとのログイン）
//  - プロジェクトのデータは、ブラウザの中でプロジェクト鍵（ランダム）を使って暗号化する
//  - プロジェクト鍵は、メンバーごとに「本人のパスワードから作った鍵」で包んで（暗号化して）預ける
//  - パスワードはサーバーに届かない。届くのはパスワードから作った確認用の値だけで、サーバーはそのハッシュを持つ
//  - ログインに成功すると、そのメンバー用の「包まれた鍵」と、期限つきのセッションを渡す
//  - メンバーの追加・役割変更・削除は PM（追加と役割は PMO も）だけができる。削除された人はもう入れない
//  - 10 回続けて間違えると 15 分間ログインできない
// v1（リンクの鍵だけで共有する以前の方式）は、移行のために残す
import { DurableObject } from 'cloudflare:workers';

const MAX_BLOB = 1_900_000; // Durable Object（SQLite）の 1 行の上限 2MB に収める
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;
const ROLES = ['pm', 'pmo', 'lead', 'member', 'viewer'];
const SESSION_DAYS = 30, MAX_FAILS = 10, LOCK_MS = 15 * 60 * 1000;
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS}});
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const randTok = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const str = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

export class Room extends DurableObject {
  // 表は毎回確かめて作る（削除のあとに同じ部屋が使われても動くように）
  ensure(){
    const sql = this.ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS doc (k INTEGER PRIMARY KEY, ver INTEGER NOT NULL, auth TEXT NOT NULL, blob TEXT NOT NULL, updated INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS members (login TEXT PRIMARY KEY, role TEXT NOT NULL, salt TEXT NOT NULL, auth_hash TEXT NOT NULL, wrapped TEXT NOT NULL, must_change INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, last_login INTEGER NOT NULL DEFAULT 0)');
    sql.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, login TEXT NOT NULL, expires INTEGER NOT NULL)');
  }
  row(){ this.ensure(); return this.ctx.storage.sql.exec('SELECT ver, auth, blob FROM doc WHERE k = 1').toArray()[0]; }
  member(login){ return this.ctx.storage.sql.exec('SELECT * FROM members WHERE login = ?', login).toArray()[0]; }
  broadcast(ver){ for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ver})); } catch (e) {} } }
  async session(req, url){
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('t') || '';
    if (tok.length < 32) return null;
    const s = this.ctx.storage.sql.exec('SELECT s.login, m.role, m.must_change FROM sessions s JOIN members m ON m.login = s.login WHERE s.token_hash = ? AND s.expires > ?', await sha256(tok), Date.now()).toArray()[0];
    return s ? {...s, tokenHash: await sha256(tok)} : null;
  }
  async newSession(login){
    const token = randTok(), sql = this.ctx.storage.sql;
    sql.exec('DELETE FROM sessions WHERE expires < ?', Date.now());
    sql.exec('INSERT INTO sessions (token_hash, login, expires) VALUES (?, ?, ?)', await sha256(token), login, Date.now() + SESSION_DAYS * 864e5);
    return token;
  }
  acceptWs(){
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server); // 休止できる WebSocket（つないでいるだけでは課金されにくい）
    const r = this.row(); if (r) server.send(JSON.stringify({ver: r.ver}));
    return new Response(null, {status: 101, webSocket: client});
  }
  async fetch(req){
    const url = new URL(req.url), v2 = url.pathname.match(/^\/api\/v2\/p\/([^/]+)\/([a-z]+)$/);
    return v2 ? this.v2(req, url, v2[1], v2[2]) : this.v1(req);
  }

  // ---- v2：メンバーごとのログイン ----
  async v2(req, url, id, action){
    const sql = this.ctx.storage.sql, r = this.row(), now = Date.now();
    if (r && r.auth !== 'v2') return json({error: 'not_found'}, 404); // v1 の部屋は v2 から触れない
    let body = {};
    if (req.method !== 'GET' && req.method !== 'DELETE' && !(req.headers.get('Upgrade') === 'websocket')) { try { body = await req.json(); } catch (e) { return json({error: 'bad_request'}, 400); } }
    if (action === 'create' && req.method === 'POST') {
      if (r) return json({error: 'exists'}, 409);
      const {login, salt, authKey, wrapped, blob} = body;
      if (!LOGIN_RE.test(login || '') || !str(salt, 64) || !str(authKey, 128) || !str(wrapped, 512) || !str(blob, MAX_BLOB)) return json({error: 'bad_request'}, 400);
      sql.exec('INSERT INTO doc (k, ver, auth, blob, updated) VALUES (1, 1, ?, ?, ?)', 'v2', blob, now);
      sql.exec('INSERT INTO members (login, role, salt, auth_hash, wrapped, must_change, created, last_login) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', login, 'pm', salt, await sha256(salt + ':' + authKey), wrapped, now, now);
      return json({token: await this.newSession(login), role: 'pm', ver: 1}, 201);
    }
    if (!r) return json({error: 'not_found'}, 404);
    if (action === 'prelogin' && req.method === 'POST') {
      const m = this.member(String(body.login || '').toLowerCase());
      // 登録のない ID にも、それらしい値を返す（どの ID があるかを探られないように）
      return json({salt: m ? m.salt : (await sha256('kizashi-fake:' + id + ':' + body.login)).slice(0, 24)});
    }
    if (action === 'login' && req.method === 'POST') {
      const login = String(body.login || '').toLowerCase(), m = this.member(login);
      if (!m) return json({error: 'invalid'}, 401);
      if (m.locked_until > now) return json({error: 'locked', retryAfter: Math.ceil((m.locked_until - now) / 1000)}, 429);
      if (!str(body.authKey, 128) || await sha256(m.salt + ':' + body.authKey) !== m.auth_hash) {
        const fails = m.fails + 1;
        sql.exec('UPDATE members SET fails = ?, locked_until = ? WHERE login = ?', fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MS : 0, login);
        return json({error: fails >= MAX_FAILS ? 'locked' : 'invalid'}, fails >= MAX_FAILS ? 429 : 401);
      }
      sql.exec('UPDATE members SET fails = 0, locked_until = 0, last_login = ? WHERE login = ?', now, login);
      return json({token: await this.newSession(login), role: m.role, wrapped: m.wrapped, mustChange: !!m.must_change, ver: r.ver});
    }
    // ここから先はログインが必要
    const s = await this.session(req, url);
    if (!s) return json({error: 'unauthorized'}, 401);
    if (action === 'ws') { if (req.headers.get('Upgrade') !== 'websocket') return json({error: 'upgrade_required'}, 426); return this.acceptWs(); }
    const admin = s.role === 'pm' || s.role === 'pmo';
    switch (`${req.method} ${action}`) {
      case 'GET me': return json({login: s.login, role: s.role, mustChange: !!s.must_change});
      case 'POST logout': sql.exec('DELETE FROM sessions WHERE token_hash = ?', s.tokenHash); return json({ok: true});
      case 'POST password': { // 本人がパスワードを決める・変える（新しい値で鍵を包み直して預ける）
        const {salt, authKey, wrapped} = body;
        if (!str(salt, 64) || !str(authKey, 128) || !str(wrapped, 512)) return json({error: 'bad_request'}, 400);
        sql.exec('UPDATE members SET salt = ?, auth_hash = ?, wrapped = ?, must_change = 0 WHERE login = ?', salt, await sha256(salt + ':' + authKey), wrapped, s.login);
        sql.exec('DELETE FROM sessions WHERE login = ? AND token_hash != ?', s.login, s.tokenHash); // ほかの端末のログインは切る
        return json({ok: true});
      }
      case 'GET doc': return json({ver: r.ver, blob: r.blob});
      case 'PUT doc': {
        const {ver, blob} = body;
        if (typeof blob !== 'string' || !Number.isInteger(ver)) return json({error: 'bad_request'}, 400);
        if (blob.length > MAX_BLOB) return json({error: 'too_large', max: MAX_BLOB}, 413);
        if (s.must_change) return json({error: 'must_change'}, 403);
        if (r.ver !== ver) return json({error: 'conflict', ver: r.ver}, 409);
        sql.exec('UPDATE doc SET ver = ?, blob = ?, updated = ? WHERE k = 1', r.ver + 1, blob, now);
        this.broadcast(r.ver + 1); return json({ver: r.ver + 1});
      }
      case 'GET members': return json({members: sql.exec('SELECT login, role, must_change, created, last_login, locked_until FROM members ORDER BY created').toArray().map(m => ({login: m.login, role: m.role, invited: !!m.must_change, created: m.created, lastLogin: m.last_login, locked: m.locked_until > now}))});
      case 'PUT member': { // 招待（新規）・招待のやり直し（案内コードで入り直す）
        if (!admin) return json({error: 'forbidden'}, 403);
        const login = String(body.login || '').toLowerCase(), {role, salt, authKey, wrapped} = body;
        if (!LOGIN_RE.test(login) || !ROLES.includes(role) || !str(salt, 64) || !str(authKey, 128) || !str(wrapped, 512)) return json({error: 'bad_request'}, 400);
        const cur = this.member(login);
        if ((role === 'pm' || (cur && cur.role === 'pm')) && s.role !== 'pm') return json({error: 'forbidden'}, 403);
        if (cur && login === s.login) return json({error: 'self'}, 400);
        sql.exec('INSERT INTO members (login, role, salt, auth_hash, wrapped, must_change, created) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT(login) DO UPDATE SET role = excluded.role, salt = excluded.salt, auth_hash = excluded.auth_hash, wrapped = excluded.wrapped, must_change = 1, fails = 0, locked_until = 0', login, role, salt, await sha256(salt + ':' + authKey), wrapped, now);
        sql.exec('DELETE FROM sessions WHERE login = ?', login);
        return json({ok: true, login});
      }
      case 'PATCH member': {
        if (!admin) return json({error: 'forbidden'}, 403);
        const login = String(body.login || '').toLowerCase(), cur = this.member(login);
        if (!cur) return json({error: 'not_found'}, 404);
        if (!ROLES.includes(body.role) || ((body.role === 'pm' || cur.role === 'pm') && s.role !== 'pm')) return json({error: 'forbidden'}, 403);
        if (cur.role === 'pm' && body.role !== 'pm' && sql.exec("SELECT COUNT(*) AS n FROM members WHERE role = 'pm'").toArray()[0].n <= 1) return json({error: 'last_pm'}, 400);
        sql.exec('UPDATE members SET role = ? WHERE login = ?', body.role, login);
        return json({ok: true});
      }
      case 'DELETE member': { // ログインを止める（その人は以後入れない）
        if (s.role !== 'pm') return json({error: 'forbidden'}, 403);
        const login = String(url.searchParams.get('login') || '').toLowerCase(), cur = this.member(login);
        if (!cur) return json({error: 'not_found'}, 404);
        if (cur.role === 'pm' && sql.exec("SELECT COUNT(*) AS n FROM members WHERE role = 'pm'").toArray()[0].n <= 1) return json({error: 'last_pm'}, 400);
        sql.exec('DELETE FROM members WHERE login = ?', login); sql.exec('DELETE FROM sessions WHERE login = ?', login);
        return json({ok: true});
      }
      case 'DELETE project': {
        if (s.role !== 'pm') return json({error: 'forbidden'}, 403);
        await this.ctx.storage.deleteAll();
        for (const ws of this.ctx.getWebSockets()) { try { ws.close(4000, 'deleted'); } catch (e) {} }
        return json({ok: true});
      }
    }
    return json({error: 'not_found'}, 404);
  }

  // ---- v1：リンクの鍵だけで共有する以前の方式（移行のために残す） ----
  async v1(req){
    const r = this.row();
    if (req.headers.get('Upgrade') === 'websocket') { if (r && r.auth === 'v2') return json({error: 'not_found'}, 404); return this.acceptWs(); }
    const auth = req.headers.get('X-Auth-Hash') || '';
    if (r && r.auth !== auth) return json({error: 'forbidden'}, 403);
    if (req.method === 'GET') return r ? json({ver: r.ver, blob: r.blob}) : json({error: 'not_found'}, 404);
    if (req.method === 'PUT') {
      let body; try { body = await req.json(); } catch (e) { return json({error: 'bad_request'}, 400); }
      const {ver, blob} = body || {};
      if (typeof blob !== 'string' || !Number.isInteger(ver)) return json({error: 'bad_request'}, 400);
      if (blob.length > MAX_BLOB) return json({error: 'too_large', max: MAX_BLOB}, 413);
      if (!r) {
        if (ver !== 0) return json({error: 'not_found'}, 404);
        this.ctx.storage.sql.exec('INSERT INTO doc (k, ver, auth, blob, updated) VALUES (1, 1, ?, ?, ?)', auth, blob, Date.now());
        this.broadcast(1); return json({ver: 1}, 201);
      }
      if (r.ver !== ver) return json({error: 'conflict', ver: r.ver}, 409);
      const next = r.ver + 1;
      this.ctx.storage.sql.exec('UPDATE doc SET ver = ?, blob = ?, updated = ? WHERE k = 1', next, blob, Date.now());
      this.broadcast(next); return json({ver: next});
    }
    if (req.method === 'DELETE') {
      if (!r) return json({error: 'not_found'}, 404);
      await this.ctx.storage.deleteAll();
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(4000, 'deleted'); } catch (e) {} }
      return json({ok: true});
    }
    return json({error: 'method'}, 405);
  }
  webSocketMessage(ws, msg){ if (msg === 'ping') ws.send('pong'); }
  webSocketClose(ws, code){ try { ws.close(code, 'bye'); } catch (e) {} }
}

export default {
  async fetch(req, env){
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
    const url = new URL(req.url);
    if (url.pathname === '/api/health') return json({ok: true, service: 'kizashi-cloud', api: [1, 2]});
    // 人がこの URL を直接開いたときは、アプリ本体へ案内する（ここはアプリが裏で使う同期サーバー）
    if (url.pathname === '/' || url.pathname === '/index.html') return Response.redirect(env.APP_URL || 'https://matassy0813.github.io/kizashi/Kizashi.html', 302);
    const room = id => env.ROOMS.get(env.ROOMS.idFromName(id), {locationHint: env.LOCATION_HINT || 'apac'});
    const v2 = url.pathname.match(/^\/api\/v2\/p\/([^/]+)\/[a-z]+$/);
    if (v2) return ID_RE.test(v2[1]) ? room(v2[1]).fetch(req) : json({error: 'not_found'}, 404);
    const m = url.pathname.match(/^\/api\/p\/([^/]+)(\/ws)?$/);
    if (!m || !ID_RE.test(m[1])) return json({error: 'not_found'}, 404);
    const stub = room(m[1]);
    if (m[2]) { // v1：版番号の知らせだけを流す（データは流さない）
      if (req.headers.get('Upgrade') !== 'websocket') return json({error: 'upgrade_required'}, 426);
      return stub.fetch(req);
    }
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (tok.length < 32) return json({error: 'unauthorized'}, 401);
    const headers = new Headers(req.headers); headers.set('X-Auth-Hash', await sha256(tok)); headers.delete('Authorization');
    return stub.fetch(new Request(req.url, {method: req.method, headers, body: req.method === 'PUT' ? await req.text() : undefined}));
  },
};
