// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 変更の合わせ込み（3方向マージ） ============
// base＝最後に同期した内容、local＝自分の画面の今、remote＝クラウドの今。
// 片方だけが変えたところはその変更を採り、両方が変えたところは項目（id）ごと・欄ごとに合わせる。
// 同じ欄を両方が変えたときは、あとから保存した自分（local）を採る。
// 経緯（log）や記録（snapshots）のように「足していくだけ」の並びは、両方の分を残す。
const deq = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const hasIds = arr => Array.isArray(arr) && arr.length > 0 && arr.every(x => isObj(x) && x.id != null && x.id !== '');
const APPEND_ONLY = new Set(['log', 'snapshots']);
function merge3(base, local, remote, key){
  if (deq(local, remote)) return local;
  if (deq(base, local)) return remote;
  if (deq(base, remote)) return local;
  if (Array.isArray(local) && Array.isArray(remote)) {
    if (APPEND_ONLY.has(key)) return mergeAppend(local, remote);
    if ((hasIds(local) || !local.length) && (hasIds(remote) || !remote.length) && (local.length || remote.length)) return mergeById(Array.isArray(base) ? base : [], local, remote);
    return local; // id のない並び（議題など）を両方が変えたときは、自分の変更を採る
  }
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {}, out = {};
    for (const k of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      const inL = k in local, inR = k in remote, inB = k in b;
      if (inL && inR) out[k] = merge3(b[k], local[k], remote[k], k);
      else if (inL) { if (!inB || !deq(b[k], local[k])) out[k] = local[k]; } // 相手が消した欄：自分が変えていなければ消す
      else if (inR) { if (!inB || !deq(b[k], remote[k])) out[k] = remote[k]; }
    }
    return out;
  }
  return local;
}
function mergeAppend(local, remote){
  const seen = new Set(), out = [];
  [...remote, ...local].forEach(x => { const k = JSON.stringify(x); if (!seen.has(k)) { seen.add(k); out.push(x); } });
  return out.sort((a, c) => String(a && (a.at || a.date) || '').localeCompare(String(c && (c.at || c.date) || '')));
}
// id のある並び（タスク・課題・会議・メンバーなど）を項目ごとに合わせる。並び順はクラウド側を基本に、自分が足したものを後ろへ
function mergeById(base, local, remote){
  const B = new Map(base.filter(isObj).map(x => [String(x.id), x])), L = new Map(local.map(x => [String(x.id), x])), R = new Map(remote.map(x => [String(x.id), x]));
  const out = [], renamed = [];
  const order = [...remote.map(x => String(x.id)), ...local.map(x => String(x.id)).filter(id => !R.has(id))];
  for (const id of order) {
    const b = B.get(id), l = L.get(id), r = R.get(id);
    if (l && r) {
      if (!b && !deq(l, r)) { out.push(r); renamed.push(l); continue; } // 二人が同時に同じ ID で別のものを作った：両方残す
      out.push(merge3(b, l, r));
    }
    else if (l) { if (!b || !deq(b, l)) out.push(l); } // 相手が消したもの：自分が変えていれば残す
    else if (r) { if (!b || !deq(b, r)) out.push(r); }
  }
  // 同じ ID で作られた自分の分は、空いている番号に付け直す（例：T25 が重なったら T26 に）
  renamed.forEach(x => {
    const m = String(x.id).match(/^(.*?)(\d+)$/), pre = m ? m[1] : String(x.id) + '-', width = m ? m[2].length : 2;
    let n = Math.max(0, ...out.map(y => { const k = String(y.id); return k.startsWith(pre) ? parseInt(k.slice(pre.length)) || 0 : 0; })) + 1;
    out.push({...x, id: pre + String(n).padStart(width, '0')});
  });
  return out;
}
