// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 入力フィールド共通 ============
// data-col/data-key/data-f で保存先を特定。data-fk は再描画後のフォーカス復元用
function fld(col, key, f, val, o = {}){
  const fk = `${col}|${key}|${f}`;
  const attrs = `data-col="${col}" data-key="${esc(key)}" data-f="${f}" data-fk="${esc(fk)}" ${o.cls ? `class="${o.cls}"` : ''} ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.title ? `title="${esc(o.title)}"` : ''}`;
  if (o.type === 'select') return `<select ${attrs}>${o.blank ? `<option value="">${o.blank === true ? '—' : esc(o.blank)}</option>` : ''}${o.opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (o.type === 'textarea') return `<textarea ${attrs} rows="${o.rows || 3}">${esc(val)}</textarea>`;
  // 長い文章の欄（w-name）は 1 行の入力ではなく、セルの中で折り返して全文が見える欄にする。Enter で確定
  if ((!o.type || o.type === 'text') && /\bw-name\b/.test(o.cls || '')) return `<textarea ${attrs.replace('class="', 'class="cellwrap ')} rows="1">${esc(val)}</textarea>`;
  if (o.type === 'checkbox') return `<input type="checkbox" ${attrs} ${val ? 'checked' : ''}>`;
  return `<input type="${o.type || 'text'}" ${attrs} value="${esc(val)}" ${o.step ? `step="${o.step}"` : ''}>`;
}
const enumOpts = (group, lang) => ENUM[group].map(v => [v, lbl(group, v, lang)]);
const phaseOpts = () => state.phases.map(p => [p.id, `${p.code} ${p.name}`]);
const sevBadge = (s, lang) => `<span class="sev ${s}">${esc(lbl('level', s, lang))}</span>`;
const lvBadge = s => s ? sevBadge(s) : '<span class="muted">—</span>';
const ragBadge = r => `<span class="rag ${r}">${t('rag.' + r)}</span>`;
const TRASH = '<svg viewBox="0 0 24 24" class="ico-trash" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
const delBtn = (col, key, name) => `<button class="btn ghost del" data-del="${col}" data-key="${esc(key)}" data-name="${esc(name || '')}" title="${t('btn.delete')}" aria-label="${t('btn.delete')}">${TRASH}</button>`;
const phaseTag = id => id ? `<span class="tag">${esc((phaseOf(id) || {}).code || '')} ${esc(phaseName(id))}</span>` : `<span class="tag common">${t('common.common')}</span>`;

function toast(msg){ const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove('on'), 1800); }
function download(name, content, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function copyText(s){
  const fb = () => { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(t('msg.copied')); } catch(e) { alert(t('msg.copyFailed')); } ta.remove(); };
  if (navigator.clipboard) navigator.clipboard.writeText(s).then(() => toast(t('msg.copied')), fb); else fb();
}
const toCsv = rows => rows.map(r => r.map(c => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_');

// ============ 簡易 Markdown → HTML（レポート・議事録プレビュー用） ============
function mdToHtml(src){
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const ls = src.split('\n'), out = []; let i = 0;
  while (i < ls.length) {
    const l = ls[i];
    if (/^# /.test(l)) { out.push(`<h1>${inline(l.slice(2))}</h1>`); i++; }
    else if (/^## /.test(l)) { out.push(`<h2>${inline(l.slice(3))}</h2>`); i++; }
    else if (/^### /.test(l)) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i++; }
    else if (/^\|/.test(l)) {
      const rows = []; while (i < ls.length && /^\|/.test(ls[i])) { rows.push(ls[i]); i++; }
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push(`<div class="scroll-x"><table><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table></div>`);
    }
    else if (/^- /.test(l)) { const it = []; while (i < ls.length && /^- /.test(ls[i])) { it.push(`<li>${inline(ls[i].slice(2))}</li>`); i++; } out.push(`<ul>${it.join('')}</ul>`); }
    else if (l.trim() === '') i++;
    else { out.push(`<p>${inline(l)}</p>`); i++; }
  }
  return out.join('');
}
const cell = s => String(s ?? '').replace(/\|/g, '／').replace(/\n/g, ' ');
