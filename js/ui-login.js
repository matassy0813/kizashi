// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 0kaka
// 商用ライセンス（改変の非公開・組み込み・SaaS 提供）は COMMERCIAL.md を参照 / Commercial licensing: see COMMERCIAL.md
'use strict';
// ============ ログイン ============
// 利用者は「自分の名前＋自分で決めたパスコード」で入る。PMは案内コードを発行するだけで、
// 本人のパスコードは知らない（他の人の画面には入れない）。ログイン状態はこのPCだけに保存する。
async function hashPin(pin, salt){
  const text = `${salt}:${pin}`;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261; for (const c of text) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return 'f' + h.toString(16); // 暗号APIが無い環境の予備
}
const randomHex = n => [...(window.crypto ? crypto.getRandomValues(new Uint8Array(n)) : Array.from({length: n}, () => Math.random() * 256 | 0))].map(x => x.toString(16).padStart(2, '0')).join('');
const newInviteCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = window.crypto ? crypto.getRandomValues(new Uint8Array(8)) : Array.from({length: 8}, () => Math.random() * 256 | 0); return [...r].map(x => A[x % A.length]).join('').replace(/(.{4})/, '$1-'); };
async function makeSecret(pin){ const salt = randomHex(8); return {salt, hash: await hashPin(pin, salt)}; }
async function checkSecret(sec, pin){ return !!sec && sec.hash === await hashPin(pin, sec.salt); }
const loginStatus = p => p.pin ? 'set' : p.invite ? 'invited' : 'none';
const MIN_PIN = 4;

function renderLoginScreen(){
  document.body.classList.add('locked');
  const L = ui.login || (ui.login = {id: '', err: ''});
  const sel = state.org.find(p => p.id === L.id);
  const bootstrap = !state.org.some(p => p.pin); // まだ誰もパスコードを持っていない＝PMが最初に入る
  const color = o => ({client: 'var(--green)', us: 'var(--accent)', vendor: 'var(--amber)'}[o] || 'var(--muted)');
  let body;
  if (!sel) {
    const people = [...state.org].sort((a, b) => (a.access === 'pm' ? -1 : 0) - (b.access === 'pm' ? -1 : 0));
    body = `<p class="muted">${t('login.pick')}</p>
      <div class="people">${people.map(p => `<button class="person" data-login="${p.id}"><span class="avatar sm" style="background:${color(p.org)}">${esc((p.name || '?').slice(0, 1))}</span>
        <span class="pn"><b>${esc(p.name)}</b><small>${t('roleShort.' + (p.access || 'member'))}${p.role ? ' · ' + esc(p.role) : ''}</small></span><span class="lock">${p.pin ? '🔒' : ''}</span></button>`).join('')}</div>`;
  } else {
    const mode = state.isSample ? 'sample' : sel.pin ? 'pin' : sel.invite ? 'invite' : (sel.access === 'pm' && bootstrap) ? 'bootstrap' : 'need';
    const pinInputs = `<label class="lbl-block">${t('login.newPin', MIN_PIN)}<input type="password" id="lgPin1" autocomplete="new-password" inputmode="text"></label>
      <label class="lbl-block">${t('login.newPin2')}<input type="password" id="lgPin2" autocomplete="new-password"></label>`;
    body = `<div class="who"><span class="avatar" style="background:${color(sel.org)}">${esc(sel.name.slice(0, 1))}</span><div><b>${esc(sel.name)}</b><div class="muted small">${t('role.' + (sel.access || 'member'))}</div></div></div>
      <form id="lgForm" class="lg-form" autocomplete="off">
      ${mode === 'pin' ? `<label class="lbl-block">${t('login.pin')}<input type="password" id="lgPin" autocomplete="current-password" autofocus></label>` : ''}
      ${mode === 'invite' ? `<p class="muted small">${t('login.inviteHelp')}</p><label class="lbl-block">${t('login.invite')}<input id="lgCode" placeholder="ABCD-EFGH" autofocus></label>${pinInputs}` : ''}
      ${mode === 'bootstrap' ? `<p class="muted small">${t('login.bootHelp')}</p>${pinInputs}` : ''}
      ${mode === 'sample' ? `<p class="muted small">${t('login.sampleHelp')}</p>` : ''}
      ${mode === 'need' ? `<p class="need">${t('login.needInvite', esc(state.project.pm || 'PM'))}</p>` : ''}
      ${L.err ? `<p class="red small">${esc(L.err)}</p>` : ''}
      <div class="bar" style="margin:6px 0 0"><button type="button" class="btn" id="lgBack">${t('wz.back')}</button><span class="sp"></span>${mode !== 'need' ? `<button class="btn primary" type="submit">${t('login.go')}</button>` : ''}</div>
      </form>`;
  }
  $('#pjName').textContent = state.project.name || 'PMO'; $('#pjSub').textContent = ''; document.title = `${state.project.name} | Kizashi`;
  $('#tabs').innerHTML = ''; $('#pageHead').innerHTML = ''; $('#hdrRag').innerHTML = ''; $('#meBox').innerHTML = '';
  $('#view').classList.add('animate');
  $('#view').innerHTML = `<div class="login-wrap"><div class="card login">
    <div class="login-logo">兆</div><div class="login-brand">Kizashi</div>
    <h1 class="large-title" style="text-align:center">${esc(state.project.name || 'PMO')}</h1>
    <p class="lead" style="text-align:center;margin-bottom:18px">${t('login.title')}</p>
    ${state.isSample ? `<div class="ro-note">${t('login.sampleNote')}</div>` : ''}
    ${body}
    <div class="login-foot"><button class="btn ghost" id="lgImport">${t('login.import')}</button>${ws && ws.projects.length > 1 ? `<button class="btn ghost" id="lgOther">${t('ws.openOther')}</button>` : ''}${state.isSample ? `<button class="btn ghost" data-wizard>${t('dash.start')}</button>` : ''}<input type="file" id="lgFile" accept=".json,application/json" hidden></div>
  </div></div>`;
  $('#view').querySelectorAll('[data-login]').forEach(el => el.onclick = () => { L.id = el.dataset.login; L.err = ''; render(); });
  const back = $('#lgBack'); if (back) back.onclick = () => { L.id = ''; L.err = ''; render(); };
  $('#lgImport').onclick = () => $('#lgFile').click();
  $('#lgFile').onchange = e => { const f = e.target.files[0]; if (!f) return; readJsonFile(f, d => { ui.login = {id: '', err: ''}; importProjectData(d); }); e.target.value = ''; };
  const other = $('#lgOther'); if (other) other.onclick = () => openProjectSwitcher(other);
  const form = $('#lgForm'); if (form) form.onsubmit = async e => { e.preventDefault(); await doLogin(sel); };
  const first = $('#view').querySelector('input'); if (first) first.focus();
}
async function doLogin(p){
  const L = ui.login, v = id => ($('#' + id) || {}).value || '';
  const fail = msg => { L.err = msg; render(); };
  const setNew = async () => {
    const a = v('lgPin1'), b = v('lgPin2');
    if (a.length < MIN_PIN) { fail(t('login.errShort', MIN_PIN)); return false; }
    if (a !== b) { fail(t('login.errMatch')); return false; }
    p.pin = await makeSecret(a); delete p.invite; return true;
  };
  if (state.isSample) { /* サンプルは体験用：誰でも入れる */ }
  else if (p.pin) { if (!await checkSecret(p.pin, v('lgPin'))) return fail(t('login.errPin')); }
  else if (p.invite) { if (!await checkSecret(p.invite, v('lgCode').trim().toUpperCase())) return fail(t('login.errCode')); if (!await setNew()) return; }
  else if (p.access === 'pm' && !state.org.some(x => x.pin)) { if (!await setNew()) return; }
  else return;
  ui.me = p.id; ui.login = {id: '', err: ''}; ui.meetingId = ''; ui.orgSel = '';
  document.body.classList.remove('locked');
  save(); go({tab: ROLE_HOME[p.access || 'member']});
  toast(t('login.welcome', p.name));
}
function logout(){ ui.me = ''; ui.login = {id: '', err: ''}; save(); render(); }
