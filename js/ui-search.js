// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ 全体検索（画面右上の検索欄。「/」または Ctrl+K でどこからでも） ============
// タスク・課題・会議（議題・決定・宿題）・変更要求・ガバナンスをまとめて探し、押すとその場所を開く。
// 自分のロールで見られない画面のものは出さない。
function searchAll(q){
  const s = q.trim().toLowerCase(); if (!s) return [];
  const tabs = tabsFor(), out = [];
  const hit = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(s));
  const snip = (...vals) => { const v = vals.map(x => String(x || '')).find(x => x.toLowerCase().includes(s)) || ''; const k = v.toLowerCase().indexOf(s); return k < 0 ? '' : (k > 24 ? '…' : '') + v.slice(Math.max(0, k - 24), k + s.length + 40); };
  if (tabs.includes('tasks')) state.tasks.forEach(x => { if (hit(x.id, x.name, x.owner)) out.push({kind: 'tasks', id: x.id, title: `${x.id} ${x.name}`, sub: [x.owner, lbl('taskStatus', x.status), md(x.end)].filter(Boolean).join(' · '), go: () => openTaskById(x.id)}); });
  if (tabs.includes('raid')) state.raid.forEach(x => { if (hit(x.id, x.title, x.detail, x.impactText, x.mitigation, x.ask, raidOwners(x).join(' '), x.approver, ...(x.log || []).map(e => e.text))) out.push({kind: 'raid', id: x.id, title: `${x.id} ${x.title}`, sub: snip(x.title, x.detail, x.impactText, x.mitigation, x.ask, ...(x.log || []).map(e => e.text)) || ownersText(x), go: () => openRaid$(x.id)}); });
  if (tabs.includes('meetings')) state.meetings.forEach(m => {
    const parts = [m.title, m.purpose, m.notes, ...m.agenda.map(a => a.topic + ' ' + (a.outcome || '')), ...m.decisions.map(d => d.text), ...m.actions.map(a => a.text + ' ' + (a.owner || ''))];
    if (hit(...parts)) out.push({kind: 'meetings', id: m.id, title: `${md(m.date)} ${m.title}`, sub: snip(...parts), go: () => go({tab: 'meetings', meetingId: m.id})});
  });
  if (tabs.includes('governance')) {
    state.crs.forEach(c => { if (hit(c.id, c.title, c.scope, c.note)) out.push({kind: 'crs', id: c.id, title: `${c.id} ${c.title}`, sub: lbl('crStatus', c.status), go: () => go({tab: 'governance'})}); });
    state.governance.forEach(g => { if (hit(g.title, g.body, g.content)) out.push({kind: 'governance', id: g.id, title: g.title, sub: snip(g.body, g.content), go: () => go({tab: 'governance'})}); });
  }
  return out.slice(0, 40);
}
function openTaskById(id){ const i = state.tasks.findIndex(x => x.id === id); if (i < 0) return; go({tab: 'tasks', taskView: ui.taskView === 'backlog' && state.tasks[i].disp !== 'backlog' ? 'kanban' : ui.taskView, taskSel: String(i)}); }
function openSearch(){
  document.querySelectorAll('.gs-pop').forEach(x => x.remove());
  const box = document.createElement('div'); box.className = 'gs-pop'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', t('srch.title'));
  box.innerHTML = `<input class="gs-input" placeholder="${t('srch.ph')}" aria-label="${t('srch.title')}"><div class="gs-list"></div><div class="gs-foot muted small">${t('srch.hint')}</div>`;
  document.body.appendChild(box);
  const inp = box.querySelector('input'), list = box.querySelector('.gs-list'); let res = [], cur = 0;
  const draw = () => {
    res = searchAll(inp.value); cur = Math.min(cur, Math.max(0, res.length - 1));
    list.innerHTML = !inp.value.trim() ? `<div class="empty">${t('srch.start')}</div>` : res.length ? res.map((r, k) => `<button class="gs-item ${k === cur ? 'on' : ''}" data-k="${k}"><span class="tag gs-${r.kind}">${t('srch.kind.' + r.kind)}</span><span class="gs-main"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></button>`).join('') : `<div class="empty">${t('srch.none')}</div>`;
    list.querySelectorAll('[data-k]').forEach(b => b.onclick = () => pick(+b.dataset.k));
  };
  const close = () => { box.remove(); document.removeEventListener('pointerdown', out, true); };
  const pick = k => { const r = res[k]; if (!r) return; close(); r.go(); };
  const out = e => { if (!box.contains(e.target) && !e.target.closest('#gsBtn')) close(); };
  inp.oninput = () => { cur = 0; draw(); };
  inp.onkeydown = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); cur = Math.min(res.length - 1, cur + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
  };
  setTimeout(() => document.addEventListener('pointerdown', out, true));
  draw(); inp.focus();
  return {box, input: inp, draw};
}
document.addEventListener('keydown', e => {
  if (!me()) return;
  const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
});
