# Kizashi クラウド同期サーバー

チームで同じプロジェクトを見るための、小さな同期サーバーです。Cloudflare Workers と Durable Objects で動きます。

## 仕組み

- **サーバーは中身を読めません**：データはブラウザの中で暗号化（AES-GCM）してから送ります。鍵は共有リンクの `#` より後ろだけにあり、ブラウザはその部分をサーバーへ送りません。
- **サーバーがすること**：暗号化された箱を1つ預かり、版番号を進めることだけです。
- **書き込みの確認**：リンクの鍵から作った合言葉が必要です。サーバーは、その合言葉のハッシュしか持ちません。
- **同時に保存したとき**：版番号が合わない書き込みは `409` で断ります。ブラウザ側で両方の変更を項目ごとに合わせてから、書き直します（`js/merge.js`）。
- **ほかの人への知らせ**：書き込みがあると、同じプロジェクトを開いている人に WebSocket で「新しい版がある」とだけ知らせます。データそのものは流しません。

| API | 内容 |
|---|---|
| `GET /api/health` | 動いているかの確認 |
| `GET /api/p/:id` | 暗号化された中身と版番号を受け取る（`Authorization: Bearer <合言葉>`） |
| `PUT /api/p/:id` | `{ver, blob}` を送る。`ver` は手元の版番号（新規は 0）。合わなければ `409` |
| `DELETE /api/p/:id` | プロジェクトを消す |
| `GET /api/p/:id/ws` | 新しい版の知らせ（WebSocket） |

公式の同期サーバーは `https://kizashi-cloud.kizashipm.workers.dev` で動いていて、アプリの既定になっています（`js/cloud.js` の `CLOUD_DEFAULT`）。自社でサーバーを立てる場合は、次の手順で公開し、アプリの「設定・データ」→「チームで共有」→「同期サーバー」にそのURLを入れます。

## 公開のしかた（最初の1回だけ）

1. Cloudflare の無料アカウントを作ります（https://dash.cloudflare.com/sign-up ）
2. このフォルダの1つ上（リポジトリの直下）で、次の2つを実行します
   ```bash
   npx wrangler@4 login
   ```
   ```bash
   npx wrangler@4 deploy --config cloud/wrangler.toml
   ```
3. 表示された URL（`https://kizashi-cloud.<アカウント名>.workers.dev`）を、`js/cloud.js` の `CLOUD_DEFAULT` に書きます
4. `python build.py` で Kizashi.html を作り直します

料金は、無料枠（Workers：1日10万リクエストまで、Durable Objects：SQLite保存）の範囲で、小〜中規模のチームなら収まる想定です。

## 手元で試す

```bash
npx wrangler@4 dev --config cloud/wrangler.toml --port 8787 --ip 127.0.0.1
```

アプリの「設定・データ」→「チームで共有」→「同期サーバー」に `http://127.0.0.1:8787` を入れて、共有を始めます。

結合テストは `tests/cloud-it.js` にあります。アプリを開いた状態で読み込み、`await runCloudIT('http://127.0.0.1:8787')` を実行します。

## 注意

- 共有リンクを知っている人は、誰でもプロジェクトを開けます。メンバー以外には渡さないでください。
- 各自のパスコードは、画面に入るためのものです。データそのものを守っているのは、リンクの鍵です。
- 1つのプロジェクトの大きさの上限は、暗号化・圧縮したあとで約1.9MBです。
