// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ワークスペース（複数プロジェクト・会社／チーム／PJコード） ============
// 1 つのブラウザで複数のプロジェクトを持ち、会社コード › チームコード › PJコードで区分けして切り替える。
// 既存のデータ（KEY に保存済み）は、そのまま 1 つ目のプロジェクトとして引き継ぐ（データを移動・コピーしない）。
// ログイン状態や表示状態（ui）はプロジェクトごとに別に保存する。
const WS_KEY = 'pmo-workspace-v1';
const UI_BASE = JSON.parse(JSON.stringify(ui)); // ui の初期値（プロジェクトを切り替えたときに戻す）
let ws = null;
const uiKeyOf = p => p.key === KEY ? UI_KEY : 'pmo-ui-' + p.id;
const wsWrite = () => { try { localStorage.setItem(WS_KEY, JSON.stringify(ws)); } catch(e) {} };
const wsCurrent = () => ws.projects.find(p => p.id === ws.current) || ws.projects[0];
const resetUi = () => { Object.keys(ui).forEach(k => delete ui[k]); Object.assign(ui, JSON.parse(JSON.stringify(UI_BASE))); };
const codeChain = p => [p.co, p.team, p.pj].filter(Boolean).join(' / ');
function wsInit(){
  try { ws = JSON.parse(localStorage.getItem(WS_KEY) || 'null'); } catch(e) { ws = null; }
  if (!ws || !Array.isArray(ws.projects) || !ws.projects.length) { ws = {projects: [{id: 'p1', key: KEY, name: '', co: '', team: '', pj: '', updated: ''}], current: 'p1'}; wsWrite(); }
  if (!ws.projects.some(p => p.id === ws.current)) ws.current = ws.projects[0].id;
}
// 現在のプロジェクトの名前・コードを一覧に反映する
function wsSync(){
  const p = ws && wsCurrent(); if (!p || !state) return;
  Object.assign(p, {name: state.project.name, co: state.project.companyCode || '', team: state.project.teamCode || '', pj: state.project.code || '', uid: state.project.uid, sample: !!state.isSample, updated: todayStr()});
  wsWrite();
}
function switchProject(id){
  if (!ws.projects.some(p => p.id === id) || id === ws.current) return;
  save(); ws.current = id; wsWrite(); resetUi(); state = null; load(); render(true);
  toast(t('ws.switched', state.project.name));
}
// 新しいプロジェクトの枠を作って切り替える（はじめかた・読み込みから使う）。現在のプロジェクトは保存して残す
function wsBeginNewProject(){
  if (state) save();
  const id = 'p' + Date.now().toString(36);
  ws.projects.push({id, key: 'pmo-project-' + id, name: '', co: '', team: '', pj: '', updated: todayStr()});
  ws.current = id; wsWrite(); resetUi();
  return id;
}
function deleteProject(id){
  if (ws.projects.length <= 1) { toast(t('ws.lastOne')); return; }
  const p = ws.projects.find(x => x.id === id); if (!p) return;
  if (!confirm(t('ws.deleteConfirm', p.name || '—'))) return;
  try { localStorage.removeItem(p.key); localStorage.removeItem(uiKeyOf(p)); } catch(e) {}
  ws.projects = ws.projects.filter(x => x.id !== id);
  if (ws.current === id) { ws.current = ws.projects[0].id; wsWrite(); resetUi(); state = null; load(); }
  else wsWrite();
  render(true); toast(t('ws.deleted'));
}
// 受け取ったデータ（JSON）を読み込む：同じプロジェクト（uid が一致）があれば更新、なければ新しいプロジェクトとして追加
function importProjectData(d){
  const data = d.version === 2 ? d : migrateV1(d);
  const uid = data.project && data.project.uid, hit = uid && ws.projects.find(p => p.uid === uid);
  if (hit) {
    if (hit.id === ws.current) { state = data; normalize(); ui.me = ''; save(); render(true); }
    else { try { localStorage.setItem(hit.key, JSON.stringify(data)); } catch(e) {} save(); ws.current = hit.id; wsWrite(); resetUi(); state = null; load(); render(true); }
    toast(t('ws.updated', data.project.name)); return 'updated';
  }
  wsBeginNewProject(); state = data; normalize(); save(); render(true);
  toast(t('ws.added', data.project.name)); return 'added';
}
function readJsonFile(file, then){
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!d.tasks) throw 0; then(d); } catch(err) { alert(t('set.restoreFail')); } };
  r.readAsText(file);
}
// プロジェクトの切り替えメニュー（会社 › チームでまとめて表示）
function openProjectSwitcher(anchor){
  document.querySelectorAll('.ws-pop').forEach(x => x.remove());
  const m = document.createElement('div'); m.className = 'ws-pop';
  const draw = (q = '') => {
    const ql = q.trim().toLowerCase();
    const list = ws.projects.filter(p => !ql || [p.name, p.co, p.team, p.pj].some(v => String(v || '').toLowerCase().includes(ql)));
    const groups = {};
    list.forEach(p => { const g = p.co || t('ws.noCompany'); const tm = p.team || t('ws.noTeam'); ((groups[g] = groups[g] || {})[tm] = groups[g][tm] || []).push(p); });
    m.innerHTML = `<div class="ws-head"><b>${t('ws.title')}</b><span class="muted small">${t('ws.count', ws.projects.length)}</span></div>
      <input class="ws-search" placeholder="${t('ws.search')}" value="${esc(q)}">
      <div class="ws-list">${Object.keys(groups).sort().map(g => `<div class="ws-co">🏢 ${esc(g)}</div>${Object.keys(groups[g]).sort().map(tm => `<div class="ws-team">👥 ${esc(tm)}</div>${groups[g][tm].map(p => `
        <div class="ws-item ${p.id === ws.current ? 'on' : ''}" data-ws="${p.id}"><div class="ws-main"><b>${esc(p.name || '—')}</b>${p.sample ? `<span class="tag common">${t('ws.sample')}</span>` : ''}<small>${esc(codeChain(p) || t('ws.noCode'))}</small></div>
          ${p.id === ws.current ? '<span class="ws-check">✓</span>' : `<button class="btn ghost" data-ws-del="${p.id}" title="${t('btn.delete')}">✕</button>`}</div>`).join('')}`).join('')}`).join('') || `<div class="empty">${t('ws.none')}</div>`}</div>
      <div class="ws-foot"><button class="btn primary" data-ws-new>＋ ${t('ws.new')}</button><button class="btn" data-ws-import>${t('ws.import')}</button><input type="file" accept=".json,application/json" hidden></div>`;
    const s = m.querySelector('.ws-search'); s.oninput = () => { const pos = s.selectionStart; draw(s.value); const n = m.querySelector('.ws-search'); n.focus(); n.setSelectionRange(pos, pos); };
    m.querySelectorAll('[data-ws]').forEach(el => el.onclick = e => { if (e.target.closest('[data-ws-del]')) return; close(); switchProject(el.dataset.ws); });
    m.querySelectorAll('[data-ws-del]').forEach(el => el.onclick = () => { close(); deleteProject(el.dataset.wsDel); });
    m.querySelector('[data-ws-new]').onclick = () => { close(); openWizard(); };
    const fi = m.querySelector('input[type=file]');
    m.querySelector('[data-ws-import]').onclick = () => fi.click();
    fi.onchange = e => { const f = e.target.files[0]; if (f) { close(); readJsonFile(f, importProjectData); } };
  };
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - 380)) + 'px'; m.style.top = (r.bottom + 8) + 'px';
  document.body.appendChild(m); draw();
  const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = ev => { if (!m.contains(ev.target) && !anchor.contains(ev.target)) close(); };
  setTimeout(() => document.addEventListener('pointerdown', out, true));
  m.querySelector('.ws-search').focus();
}
