// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
// ============ Kizashi クラウド同期サーバー（Cloudflare Workers + Durable Objects） ============
// サーバーは「暗号化された箱」を預かって版番号を進めるだけ。中身（プロジェクトのデータ）は読めない。
//  - 暗号の鍵は共有リンクの # の後ろにあり、ブラウザはそこをサーバーへ送らない
//  - 書き込み・読み出しには、鍵から作った合言葉（トークン）が必要。サーバーはそのハッシュだけを持つ
//  - 版番号が合わない書き込みは 409 で断り、ブラウザ側で両方の変更を合わせてから書き直す
//  - 書き込みがあると、同じプロジェクトを開いている人に WebSocket で「新しい版がある」とだけ知らせる
import { DurableObject } from 'cloudflare:workers';

const MAX_BLOB = 1_900_000; // Durable Object（SQLite）の 1 行の上限 2MB に収める
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS}});
const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export class Room extends DurableObject {
  // 表は毎回確かめて作る（削除のあとに同じ部屋が使われても動くように）
  row(){
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS doc (k INTEGER PRIMARY KEY, ver INTEGER NOT NULL, auth TEXT NOT NULL, blob TEXT NOT NULL, updated INTEGER NOT NULL)');
    return this.ctx.storage.sql.exec('SELECT ver, auth, blob FROM doc WHERE k = 1').toArray()[0];
  }
  broadcast(ver){ for (const ws of this.ctx.getWebSockets()) { try { ws.send(JSON.stringify({ver})); } catch (e) {} } }
  async fetch(req){
    if (req.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server); // 休止できる WebSocket（つないでいるだけでは課金されにくい）
      const r = this.row(); if (r) server.send(JSON.stringify({ver: r.ver}));
      return new Response(null, {status: 101, webSocket: client});
    }
    const auth = req.headers.get('X-Auth-Hash') || '', r = this.row();
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
    const url = new URL(req.url), m = url.pathname.match(/^\/api\/p\/([^/]+)(\/ws)?$/);
    if (url.pathname === '/api/health') return json({ok: true, service: 'kizashi-cloud'});
    // 人がこの URL を直接開いたときは、アプリ本体へ案内する（ここはアプリが裏で使う同期サーバー）
    if (url.pathname === '/' || url.pathname === '/index.html') return Response.redirect(env.APP_URL || 'https://matassy0813.github.io/kizashi/Kizashi.html', 302);
    if (!m || !ID_RE.test(m[1])) return json({error: 'not_found'}, 404);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]), {locationHint: env.LOCATION_HINT || 'apac'});
    if (m[2]) { // 版番号の知らせだけを流す（データは流さない）ので、合言葉は不要
      if (req.headers.get('Upgrade') !== 'websocket') return json({error: 'upgrade_required'}, 426);
      return stub.fetch(req);
    }
    const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (tok.length < 32) return json({error: 'unauthorized'}, 401);
    const headers = new Headers(req.headers); headers.set('X-Auth-Hash', await sha256(tok)); headers.delete('Authorization');
    return stub.fetch(new Request(req.url, {method: req.method, headers, body: req.method === 'PUT' ? await req.text() : undefined}));
  },
};
