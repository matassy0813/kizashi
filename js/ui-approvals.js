// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 承認（承認待ちを 1 か所に集めて、まとめて承認・差し戻し） ============
// タスクの「承認待ち」、課題・リスクの「確認待ち」、CR の「承認待ち」のうち、自分が承認できるものだけを並べる。
// 1 件ずつの承認（カンバン・一覧・CR の状態欄）はそのまま残す。まとめて処理した直後は「元に戻す」で戻せる。
const AP_KINDS = ['tasks','raid','crs'];
function approvalQueue(){
  const b = d2n(baseDate()), out = [];
  const add = (col, o, title, sub, since) => out.push({col, o, key: col + ':' + o.id, title, sub, owner: o.owner || '', phaseId: o.phaseId || '', wait: since && !isNaN(d2n(since)) ? Math.max(0, b - d2n(since)) : 0});
  state.tasks.forEach(x => { if (x.status === 'approval' && activeTask(x) && canApprove(x)) add('tasks', x, x.name, t('kind.' + x.kind), x.updated); });
  state.raid.forEach(x => { if (x.status === 'review' && canApproveRaid(x)) add('raid', x, x.title || x.id, `${lbl('raidType', x.type)}${x.mitigation ? ' · ' + x.mitigation : ''}`, x.reviewAt || x.raised); });
  state.crs.forEach((x, i) => { if (x.status === 'pending' && can('crs', i, 'status')) add('crs', x, `${x.id} ${x.title}`, [x.scope, x.schedule ? t('ap.crDays', x.schedule) : '', x.cost].filter(Boolean).join(' · '), x.pendingAt || x.raised); });
  return out.filter(x => inScope(x.o));
}
// まとめて処理する。mode = 'approve'（承認してクローズ）／'return'（差し戻し：1 つ前の段階へ戻し、理由を残す）
function resolveApprovals(items, mode, note){
  const before = items.map(x => ({col: x.col, id: x.o.id, data: JSON.parse(JSON.stringify(x.o))}));
  const who = myName(), today = todayStr(); let n = 0;
  items.forEach(({col, o}) => {
    if (mode === 'approve') {
      if (col === 'tasks') { if (!moveTask(o, 'closed')) return; }
      else if (col === 'raid') { o.status = 'closed'; o.closedAt = today; o.approvedBy = who; o.approvedAt = today; raidLog(o, {kind: 'approve'}); }
      else { o.status = 'approved'; o.decided = o.decided || today; o.approvedBy = who; o.approvedAt = today; }
      delete o.returnNote; delete o.returnedBy; delete o.returnedAt;
    } else {
      if (col === 'tasks') { const fl = flowOf(o); if (!moveTask(o, fl[Math.max(0, fl.indexOf('approval') - 1)])) return; }
      else if (col === 'raid') { o.status = 'wip'; raidLog(o, {kind: 'return', text: note || ''}); }
      else o.status = 'analysis';
      o.returnNote = note || ''; o.returnedBy = who; o.returnedAt = today;
    }
    n++;
  });
  save(); render();
  toastAction(t(mode === 'approve' ? 'ap.doneApprove' : 'ap.doneReturn', n), t('ap.undo'), () => {
    before.forEach(({col, id, data}) => { const k = state[col].findIndex(x => x.id === id); if (k >= 0) state[col][k] = data; });
    save(); render(); toast(t('ap.undone'));
  });
  return n;
}
// 差し戻されたものが、担当者の画面で理由とともに見えるようにする
const returnedNote = o => o.returnNote != null && o.returnedAt ? `<div class="returned">↩ ${t('ap.returnedBy', esc(o.returnedBy || '—'), md(o.returnedAt))}${o.returnNote ? '：' + esc(o.returnNote) : ''}</div>` : '';

function renderApprovals(v){
  const all = approvalQueue(), kind = ui.apKind || '', S = state.settings;
  const list = all.filter(x => !kind || x.col === kind).sort((a, c) => c.wait - a.wait);
  const sel = new Set((ui.apSel || []).filter(k => list.some(x => x.key === k))); ui.apSel = [...sel];
  const cnt = k => k ? all.filter(x => x.col === k).length : all.length;
  v.innerHTML = `<div class="card">
    <div class="bar ap-bar">
      <div class="seg">${['', ...AP_KINDS].map(k => `<button class="${kind === k ? 'on' : ''}" data-apkind="${k}">${t('ap.kind.' + (k || 'all'))}${cnt(k) ? ` <b>${cnt(k)}</b>` : ''}</button>`).join('')}</div>
      <span class="sp"></span>
      <span class="muted small">${t('ap.selected', sel.size)}</span>
      <button class="btn" id="apReturn" ${sel.size ? '' : 'disabled'}>↩ ${t('ap.return')}</button>
      <button class="btn primary" id="apApprove" ${sel.size ? '' : 'disabled'}>✓ ${t('ap.approveSel', sel.size)}</button>
    </div>
    ${list.length ? `<div class="scroll-x"><table class="ap-table">
      <tr><th><input type="checkbox" id="apAll" ${sel.size === list.length ? 'checked' : ''} aria-label="${t('ap.selectAll')}" title="${t('ap.selectAll')}"></th><th>${t('ap.what')}</th><th>${t('col.title')}</th><th>${t('col.phase')}</th><th>${t('col.owner')}</th><th class="num">${t('ap.wait')}</th><th></th></tr>
      ${list.map(x => `<tr class="${sel.has(x.key) ? 'ap-on' : ''}" data-aprow="${esc(x.key)}">
        <td><input type="checkbox" data-apsel="${esc(x.key)}" ${sel.has(x.key) ? 'checked' : ''} aria-label="${esc(x.title)}"></td>
        <td><span class="tag ap-${x.col}">${t('ap.kind.' + x.col)}</span></td>
        <td><div class="ap-title">${x.col === 'raid' ? `<button class="link-btn" data-open-raid="${esc(x.o.id)}">${esc(x.title)}</button>` : esc(x.title)}</div>${x.sub ? `<div class="muted small">${esc(x.sub)}</div>` : ''}${returnedNote(x.o)}</td>
        <td>${phaseTag(x.phaseId)}</td>
        <td class="nowrap">${esc(x.owner || "—")}</td>
        <td class="num ${x.wait >= S.staleDays ? 'red' : 'muted'}">${t('ap.days', x.wait)}</td>
        <td><div class="tname"><button class="btn sm" data-apone="${esc(x.key)}" data-mode="return">↩ ${t('ap.returnOne')}</button><button class="btn primary sm" data-apone="${esc(x.key)}" data-mode="approve">${t('tk.approve')}</button></div></td>
      </tr>`).join('')}
    </table></div>` : `<div class="empty">${t('ap.empty')}</div>`}
    <div class="muted small" style="margin-top:10px">${t('ap.hint', S.staleDays)}</div>
  </div>`;
  const pick = keys => list.filter(x => keys.includes(x.key));
  const setSel = keys => { ui.apSel = keys; render(); };
  v.querySelectorAll('[data-apkind]').forEach(el => el.onclick = () => { ui.apKind = el.dataset.apkind; ui.apSel = []; render(); });
  const all$ = $('#apAll'); if (all$) all$.onchange = () => setSel(all$.checked ? list.map(x => x.key) : []);
  v.querySelectorAll('[data-apsel]').forEach(el => el.onchange = () => { const k = el.dataset.apsel; setSel(el.checked ? [...sel, k] : [...sel].filter(x => x !== k)); });
  // 行のどこを押しても選択を切り替えられる（ボタン以外）
  v.querySelectorAll('[data-aprow]').forEach(r => r.onclick = e => { if (e.target.closest('button, input, a')) return; const k = r.dataset.aprow; setSel(sel.has(k) ? [...sel].filter(x => x !== k) : [...sel, k]); });
  const ask = () => { const why = prompt(t('ap.returnWhy')); return why === null ? null : why.trim(); };
  $('#apApprove').onclick = () => { const items = pick([...sel]); if (!items.length) return; ui.apSel = []; resolveApprovals(items, 'approve'); };
  $('#apReturn').onclick = () => { const items = pick([...sel]); if (!items.length) return; const why = ask(); if (why === null) return; ui.apSel = []; resolveApprovals(items, 'return', why); };
  v.querySelectorAll('[data-apone]').forEach(el => el.onclick = () => {
    const items = pick([el.dataset.apone]); if (!items.length) return;
    if (el.dataset.mode === 'return') { const why = ask(); if (why === null) return; resolveApprovals(items, 'return', why); } else resolveApprovals(items, 'approve');
  });
}
