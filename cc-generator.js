/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — CONTRACT GENERATORS (Oct 2026)
   cc-generator.js   (landlord.html, after tab-rooms.js)

   One layout for all three contracts, five sections in the same order:
     Mieter → Mietzeit → Miete → Kaution → Options   + a summary line
   Only the Mietzeit section differs per type:
     kurzzeit    Mietbeginn · Mietende (hint at 6 months or more)
     jahres      Mietbeginn · Mietende (prefilled: next 31.08., editable)
     mietvertrag Mietbeginn · Laufzeit Unbefristet | Mindestlaufzeit (1–4 J.)
                 | Befristet (Mietende + Grund + Person)
   Erster / letzter Monat (Anteilig | Voll) appear only when they matter.
   Kaution is always due right after signing (no choice).

   The rest of the flow is unchanged (cc-contract-flow.js): For line,
   Miete block, Draft PDF → Approve → tenant + Documents › Unsigned.
   The PDF is the master template (cc-contract-master.js).

   Ids start with cg- · option buttons carry a group class first
   (cg-first-opt …) so the 2-hour draft memory restores them.
   ───────────────────────────────────────────────────────────── */

(function () {
  if (typeof document === 'undefined' || document.getElementById('cg-style')) return;
  const st = document.createElement('style'); st.id = 'cg-style';
  st.textContent = `
/* Generator sheet — one look for all fields (Übergabe included) */
.cg-lbl { display:block; font-size:11px; font-weight:500; letter-spacing:.08em; text-transform:uppercase; color:var(--cc-charcoal); margin:0 0 6px; }
.cg .rm-input, .cg .ccf-for-sel { min-height:44px; font-size:16px; font-weight:400; color:var(--cc-ink); border-radius:var(--cc-r-md); }
.cg .rm-input:read-only { background:var(--cc-surface); }
.cg { display:flex; flex-direction:column; gap:28px; }
.cg-sec { display:flex; flex-direction:column; gap:14px; }
.cg-h { margin:0; padding:0 0 10px; border-bottom:var(--cc-border); font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#8A6535; }
.cg-row { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
.cg-f { display:flex; flex-direction:column; min-width:0; }
.cg-f .rm-input { width:100%; min-width:0; box-sizing:border-box; }
.cg-num { text-align:right; }
.cg-hint { margin:-6px 0 0; font-size:12px; line-height:1.45; color:#7A6F62; }
.cg-hint--warn { color:#7A4E22; }
.cg-seg { display:flex; border:var(--cc-border); border-radius:var(--cc-r-md); overflow:hidden; background:var(--cc-white); }
.cg-seg > button { flex:1 1 0; min-width:0; min-height:40px; border:none; background:transparent; font-family:inherit; font-size:14px; color:var(--cc-charcoal); cursor:pointer; padding:0 6px; }
.cg-seg > button + button { border-left:var(--cc-border); }
.cg-seg > button.active { background:var(--cc-ink); color:var(--cc-white); font-weight:500; }
.cg-info { background:#F3EADB; border-radius:var(--cc-r-md); padding:12px 14px; display:flex; flex-direction:column; gap:6px; font-size:13px; color:#8A6535; }
.cg-info > div { display:flex; justify-content:space-between; gap:12px; }
.cg-info b { color:var(--cc-ink); font-weight:600; text-align:right; }
.cg-switch { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-md); cursor:pointer; }
.cg-switch input { position:absolute; opacity:0; width:0; height:0; }
.cg-switch__t { position:relative; width:40px; height:22px; border-radius:11px; background:var(--cc-stone); flex-shrink:0; transition:background .15s; }
.cg-switch__t::after { content:''; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s; }
.cg-switch input:checked + .cg-switch__t { background:var(--cc-ink); }
.cg-switch input:checked + .cg-switch__t::after { transform:translateX(18px); }
.cg-switch__txt { flex:1; min-width:0; }
.cg-switch__txt b { display:block; font-size:14px; font-weight:500; color:var(--cc-ink); }
.cg-switch__txt small { display:block; font-size:12px; color:#7A6F62; margin-top:2px; line-height:1.4; }
.cg-set { border:var(--cc-border); border-radius:var(--cc-r-md); background:var(--cc-white); }
.cg-set > summary { list-style:none; min-height:48px; display:flex; align-items:center; gap:10px; padding:0 14px; cursor:pointer; font-size:14px; font-weight:500; color:var(--cc-ink); }
.cg-set > summary::-webkit-details-marker { display:none; }
.cg-set > summary span { margin-left:auto; font-size:12px; font-weight:400; color:#7A6F62; white-space:nowrap; }
.cg-set > div { padding:4px 14px 12px; border-top:var(--cc-border); }
.cg-set .rm-pre-row span:first-child { color:#7A6F62; min-width:108px; }
.cg-summary { padding:10px 14px; background:var(--cc-bg); border:var(--cc-border); border-radius:var(--cc-r-md); font-size:12.5px; line-height:1.45; color:var(--cc-charcoal); }
/* For line + Miete block (cc-contract-flow.js) in the same look */
.cg .ccf-for { margin:0; padding:0; background:none; border:none; }
.cg .ccf-for-row { display:block; }
.cg .ccf-for-lbl { display:block; font-size:11px; color:var(--cc-charcoal); margin:0 0 6px; }
.cg .ccf-for-sel { width:100%; background:var(--cc-bg); padding:0 12px; }
.cg .ccf-for-hint, .cg .ccf-hint { font-size:12px; color:#7A6F62; }
.cg .ccf-miete { margin:0; display:flex; flex-direction:column; gap:12px; }
.cg .ccf-miete > .rm-fields-title { display:none; }
.cg .ccf-seg { margin:0; border-radius:var(--cc-r-md); background:var(--cc-white); }
.cg .ccf-seg button { min-height:40px; font-size:14px; color:var(--cc-charcoal); }
.cg .ccf-seg[data-mode="pauschal"] button[data-v="pauschal"],
.cg .ccf-seg[data-mode="kalt_nk"] button[data-v="kalt_nk"] { color:var(--cc-white); }
.cg .ccf-miete .rm-field-row { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
.cg .ccf-miete .rm-field { margin:0; }
.cg .ccf-miete .rm-input { text-align:right; }
.cg .ccf-warm { background:#F3EADB; border:none; border-radius:var(--cc-r-md); padding:12px 14px; font-size:13px; color:#8A6535; }
.cg .ccf-warm #rc-warm { font-size:14px; font-weight:600; color:var(--cc-ink); }
.cg .ccf-kaution-hint { margin:-6px 0 0; font-size:12px; color:#7A4E22; }
`;
  document.head.appendChild(st);
})();

/* ── HELPERS ───────────────────────────────────────────────── */
const _cgEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _cgD  = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const _cgDe = d => d ? String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() : '';
const _cgDeShort = d => d ? String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' : '';
const _cgDim = d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const _cgEur = n => (typeof ccFmtEUR === 'function' ? ccFmtEUR(Number(n) || 0) : (Number(n) || 0).toFixed(2) + ' €');
const _cgIn  = id => document.getElementById(id);
const _cgV   = id => (_cgIn(id)?.value || '').trim();
let _cgType = null;   // the generator open right now
/* The next 31.08. on or after a date (ISO in, ISO out) — Jahresvertrag end */
function ccNext3108(iso) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const y = Number(s.slice(0, 4));
  return s <= y + '-08-31' ? y + '-08-31' : (y + 1) + '-08-31';
}

function _cgSeg(group, opts, cur, label) {
  return `<div class="cg-f">${label ? `<span class="cg-lbl">${label}</span>` : ''}
    <div class="cg-seg" role="radiogroup"${label ? ` aria-label="${_cgEsc(label.replace(/<[^>]+>/g, ''))}"` : ''}>${opts.map(([v, l]) =>
      `<button type="button" class="cg-${group}-opt cg-opt${String(v) === String(cur) ? ' active' : ''}" data-val="${v}" onclick="ccgPick(this)">${l}</button>`).join('')}</div></div>`;
}
function _cgField(id, label, attrs, hint) {
  return `<div class="cg-f"><label for="${id}" class="cg-lbl">${label}</label><input class="rm-input" id="${id}" ${attrs || 'type="text"'}/>${hint ? `<p class="cg-hint" style="margin-top:6px">${hint}</p>` : ''}</div>`;
}
function ccgPick(btn) {
  const seg = btn && btn.parentElement; if (!seg) return;
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
  ccgUpdate();
}
function _cgOpt(group) { return document.querySelector('#contractBody .cg-' + group + '-opt.active')?.dataset.val || null; }

/* ── BODY ──────────────────────────────────────────────────── */
function ccgBodyHTML(type, room, renew) {
  _cgType = type;
  const s = typeof appSettings !== 'undefined' ? appSettings : {};
  const arr = v => (typeof _parseArr === 'function' ? _parseArr(v) : (Array.isArray(v) ? v : []));
  const inv = Array.isArray(room.inventar) ? room.inventar.length : 0;
  const kitchen = '';
  let term = '';
  if (type === 'mietvertrag') {
    term = `${_cgField('cg-start', 'Mietbeginn', 'type="date"')}
      ${_cgSeg('term', [['unb', 'Unbefristet'], ['min', 'Mindestlaufzeit'], ['bef', 'Befristet']], 'unb', 'Laufzeit')}
      <div id="cg-unb-wrap" class="cg-info"><div><span>Kündigung</span><b>3 Monate (Mieter) · Schriftform · § 573c BGB</b></div></div>
      <div id="cg-min-wrap" style="display:none" class="cg-sec">
        ${_cgSeg('years', [[1, '1 Jahr'], [2, '2 Jahre'], [3, '3 Jahre'], [4, '4 Jahre']], 1, 'Kündigungsverzicht')}
        <div class="cg-info"><div><span>Frühestens kündbar zum</span><b id="cg-min-bis">—</b></div></div></div>
      <div id="cg-bef-wrap" style="display:none" class="cg-sec">
        ${_cgField('cg-end', 'Mietende', 'type="date"')}
        <div class="cg-f"><label for="cg-grund" class="cg-lbl">Befristungsgrund (§ 575 BGB)</label>
          <select class="rm-input" id="cg-grund" onchange="ccgUpdate()">
            <option value="eigenbedarf">Eigenbedarf</option><option value="abriss">Abriss / Umbau</option><option value="dienst">Dienstwohnung</option></select></div>
        <div id="cg-person-wrap">${_cgField('cg-person', 'Für wen (Eigenbedarf)', 'type="text" placeholder="z. B. Tochter des Vermieters"', 'Required by law for Eigenbedarf.')}</div>
      </div>`;
  } else {
    const endHint = type === 'jahres' ? 'Mietende is prefilled with the next 31.08. — change it only for an exception.' : '';
    term = `<div class="cg-row">${_cgField('cg-start', 'Mietbeginn', 'type="date"')}${_cgField('cg-end', 'Mietende', 'type="date"' + (type === 'jahres' ? ' data-auto="1"' : ''))}</div>
      <p class="cg-hint" id="cg-stay">${endHint}</p>`;
  }
  term += `<div id="cg-first-wrap" style="display:none">${_cgSeg('first', [['anteilig', 'Anteilig'], ['voll', 'Voller Monat']], 'anteilig', '<span id="cg-first-lbl">Erster Monat</span>')}</div>
    <div id="cg-last-wrap" style="display:none">${_cgSeg('last', [['anteilig', 'Anteilig'], ['voll', 'Voller Monat']], 'anteilig', '<span id="cg-last-lbl">Letzter Monat</span>')}</div>`;

  const set = [
    ['Vermieter', s.vermieter_name || '—'],
    ['Objekt', [s.objekt_adresse, s.objekt_plz_ort].filter(Boolean).join(', ') || '—'],
    ['Zimmer', [room.name, room.flaeche_m2 ? 'ca. ' + room.flaeche_m2 + ' m²' : '', room.floor].filter(Boolean).join(' · ')],
    ['Mitgenutzt', arr(room.gemeinschaftsraeume).join(', ') || '—'],
    ['Bank', s.iban ? 'IBAN ' + s.iban : '—'],
    ['Schlüssel', `Haustür ×${room.haustuerschluessel || 1} · Zimmer ×${room.zimmerschluessel || 1}`],
    ['Inventar', inv ? `Anlage A · ${inv} ${inv === 1 ? 'Gegenstand' : 'Gegenstände'}` : 'none — no Anlage A page'],
  ].map(([k, v]) => `<div class="rm-pre-row"><span>${k}</span><span>${_cgEsc(v)}</span></div>`).join('');

  return `<div class="cg" data-type="${type}">
  <section class="cg-sec"><h3 class="cg-h">Mieter</h3>
    <div id="cg-for-slot"></div>
    ${_cgField('cg-name', 'Name', 'type="text" placeholder="Vor- und Nachname" autocomplete="off"')}
    <div class="cg-row">${_cgField('cg-dob', 'Geburtsdatum', 'type="text" inputmode="numeric" placeholder="TT.MM.JJJJ" oninput="_autoFormatGermanDate(event)"')}${_cgField('cg-tel', 'Telefon', 'type="tel" placeholder="+49 …"', 'optional')}</div>
    ${_cgField('cg-email', 'E-Mail', 'type="email" placeholder="mieter@beispiel.de"')}
    ${_cgField('cg-adr', 'Aktuelle Adresse', 'type="text" placeholder="Straße, PLZ Ort"')}
  </section>
  <section class="cg-sec"><h3 class="cg-h">Mietzeit</h3>${term}</section>
  <section class="cg-sec"><h3 class="cg-h">Miete</h3><div id="cg-miete-slot"></div></section>
  <section class="cg-sec"><h3 class="cg-h">Kaution</h3>
    <div class="cg-f rm-kaution-row" style="background:none;padding:0;margin:0;display:flex;flex-direction:column;align-items:stretch">
      <label for="cg-kaution" class="cg-lbl rm-kaution-lbl" style="letter-spacing:.08em;color:var(--cc-charcoal)">Kaution</label>
      <input class="rm-input cg-num" id="cg-kaution" type="number" data-cc-num="2" data-auto="1" placeholder="0,00" oninput="this.removeAttribute('data-auto');ccgUpdate()"/>
    </div>
    <p class="cg-hint" id="cg-kaution-rule"></p>
  </section>
  <section class="cg-sec"><h3 class="cg-h">Options</h3>
    ${_cgField('cg-sig', 'Unterzeichnungsdatum', 'type="date"', 'optional — leave empty to sign by hand')}
    <label class="cg-switch" for="cg-bg"><input type="checkbox" id="cg-bg"/><span class="cg-switch__t" aria-hidden="true"></span>
      <span class="cg-switch__txt"><b>Mietbürgschaft</b><small>Extra last page for a guarantor, filled in by hand</small></span></label>
    <details class="cg-set"><summary>From settings<span>Vermieter · Bank · Inventar</span></summary><div>${set}</div></details>
  </section>
  <div class="cg-summary" id="cg-summary"></div>
</div>`;
}

/* ── WIRING ────────────────────────────────────────────────── */
function ccgInit() {
  const body = _cgIn('contractBody'); if (!body) return;
  const st = _cgIn('cg-start'), en = _cgIn('cg-end');
  st?.addEventListener('input', () => { _cgAutoEnd(); ccgUpdate(); });
  st?.addEventListener('change', () => { _cgAutoEnd(); ccgUpdate(); });
  en?.addEventListener('input', ev => { if (ev.isTrusted) en.removeAttribute('data-auto'); ccgUpdate(); });
  en?.addEventListener('change', () => ccgUpdate());
  ccgUpdate();
}
/* Jahresvertrag: Mietende follows Mietbeginn (next 31.08.) until you type your own */
function _cgAutoEnd() {
  if (_cgType !== 'jahres') return;
  const en = _cgIn('cg-end'), s = _cgV('cg-start');
  if (!en || !en.hasAttribute('data-auto')) return;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (typeof ccParseDate === 'function' ? ccParseDate(s) : null);
  const nx = iso ? ccNext3108(iso) : '';
  if (nx && en.value !== nx) { en.value = nx; en.dispatchEvent(new Event('change', { bubbles: true })); }
}
function _cgIso(id) {
  const v = _cgV(id); if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return typeof ccParseDate === 'function' ? (ccParseDate(v) || '') : '';
}
/* Everything that depends on other fields: visible switches, Kaution, summary */
function ccgUpdate() {
  if (!_cgIn('contractBody') || !document.querySelector('#contractBody .cg:not(.cg--ub)')) return;   // not the Übergabe form
  const type = _cgType;
  const start = _cgIso('cg-start');
  const term = type === 'mietvertrag' ? (_cgOpt('term') || 'unb') : null;
  const hasEnd = type !== 'mietvertrag' || term === 'bef';
  const end = hasEnd ? _cgIso('cg-end') : '';
  const S = _cgD(start), E = _cgD(end);
  const same = !!(S && E && S.getFullYear() === E.getFullYear() && S.getMonth() === E.getMonth());

  if (type === 'mietvertrag') {
    _cgIn('cg-unb-wrap').style.display = term === 'unb' ? '' : 'none';
    _cgIn('cg-min-wrap').style.display = term === 'min' ? '' : 'none';
    _cgIn('cg-bef-wrap').style.display = term === 'bef' ? '' : 'none';
    _cgIn('cg-person-wrap').style.display = _cgV('cg-grund') === 'eigenbedarf' ? '' : 'none';
    const y = Number(_cgOpt('years') || 1);
    _cgIn('cg-min-bis').textContent = S ? _cgDe(new Date(S.getFullYear() + y, S.getMonth(), S.getDate() - 1)) : '—';
  }
  // First / last month only when they matter
  const fw = _cgIn('cg-first-wrap'), lw = _cgIn('cg-last-wrap');
  const firstPartial = !!S && S.getDate() !== 1 && !(same && E && E.getDate() - S.getDate() + 1 === _cgDim(S));
  if (fw) { fw.style.display = firstPartial ? '' : 'none';
    if (firstPartial) _cgIn('cg-first-lbl').textContent = 'Erster Monat · Einzug ' + _cgDeShort(S) + ' (' + ((same ? E.getDate() : _cgDim(S)) - S.getDate() + 1) + ' Tage)'; }
  const lastPartial = !!E && !same && E.getDate() !== _cgDim(E);
  if (lw) { lw.style.display = lastPartial ? '' : 'none';
    if (lastPartial) _cgIn('cg-last-lbl').textContent = 'Letzter Monat · Auszug ' + _cgDeShort(E) + ' (' + E.getDate() + ' Tage)'; }

  // Kurzzeit: length of stay + hint at 6 months or more
  const stay = _cgIn('cg-stay');
  if (stay && type === 'kurzzeit') {
    if (S && E && E >= S) {
      const long6 = E >= new Date(S.getFullYear(), S.getMonth() + 6, S.getDate());
      stay.className = 'cg-hint' + (long6 ? ' cg-hint--warn' : '');
      stay.textContent = long6 ? '6 months or longer — this is usually a Jahresvertrag.' : 'Kurzzeit · stay under 6 months.';
    } else { stay.className = 'cg-hint'; stay.textContent = 'Kurzzeit · stay under 6 months.'; }
  }

  // Kaution: rule until you type your own amount
  const m = typeof ccfMieteGet === 'function' ? ccfMieteGet() : null;
  const kIn = _cgIn('cg-kaution'), rule = _cgIn('cg-kaution-rule');
  const renewK = typeof _contractRenew !== 'undefined' && _contractRenew && _contractRenew.tid;
  if (kIn && m && typeof ccKaution === 'function') {
    const room = typeof getRoomById === 'function' && typeof _contractRoomId !== 'undefined' ? getRoomById(_contractRoomId) : null;
    const k = ccKaution({ contract: type === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag', mode: m.mode, kalt: m.kalt, nk: m.nk,
      rec: typeof ccRoomKautionRec === 'function' ? ccRoomKautionRec(room, type) : room, start, end, noOverride: type === 'kurzzeit' });
    if (kIn.hasAttribute('data-auto') && !renewK) { kIn.value = String(k.amount); }
    if (rule && !renewK) rule.textContent = (k.source === 'override' ? 'Individual Kaution of this room' : k.rule) + ' · fällig sofort nach Vertragsunterzeichnung';
  }

  // Summary line above the buttons
  const sum = _cgIn('cg-summary');
  if (sum) {
    const dates = start ? (_cgDe(S) + (end ? ' – ' + _cgDe(E) : (type === 'mietvertrag' ? (term === 'min' ? ' · unbefristet, Verzicht ' + (_cgOpt('years') || 1) + ' J.' : ' · unbefristet') : ' – Mietende?'))) : 'Mietbeginn?';
    const warm = m ? _cgEur(m.total) + (m.mode === 'pauschal' ? ' pauschal' : ' warm') : '';
    const kv = renewK ? 'Kaution bereits geleistet' : (kIn && kIn.value !== '' ? 'Kaution ' + _cgEur(ccKautionManual(kIn.value)) : 'Kaution —');
    sum.textContent = [dates, warm, kv].filter(Boolean).join(' · ');
  }
}

/* ── BUILD: master template → container + payload for the flow ── */
async function ccgBuild(type, forApprove) {
  const room0 = getRoomById(_contractRoomId); if (!room0) return null;
  const room = _rcContractRoom(room0);
  const name = _cgV('cg-name');
  const start = _cgIso('cg-start');
  const term = type === 'mietvertrag' ? (_cgOpt('term') || 'unb') : null;
  const hasEnd = type !== 'mietvertrag' || term === 'bef';
  const end = hasEnd ? _cgIso('cg-end') : '';
  const grund = term === 'bef' ? _cgV('cg-grund') : '';
  const person = grund === 'eigenbedarf' ? _cgV('cg-person') : '';
  if (term === 'bef' && grund === 'eigenbedarf' && !person) { alert('Bitte angeben, für wen der Eigenbedarf besteht (gesetzliche Pflicht).'); if (typeof ccCancelPdf === 'function') ccCancelPdf(); return null; }
  if (!forApprove && !ccConfirmMissingDates([!start && 'Mietbeginn', hasEnd && !end && 'Mietende'])) return null;

  const m = ccfMieteGet() || { mode: 'kalt_nk', kalt: 0, nk: 0, total: 0 };
  const manual = ccKautionManual(_cgIn('cg-kaution')?.value);
  const rn = typeof _contractRenew !== 'undefined' ? _contractRenew : null;
  const existing = !!(rn && rn.tid && !(manual > 0));
  let kautionAmount = manual;
  if (kautionAmount == null) {
    kautionAmount = ccKaution({ contract: type === 'kurzzeit' ? 'kurzzeit' : 'mietvertrag', mode: m.mode, kalt: m.kalt, nk: m.nk,
      rec: typeof ccRoomKautionRec === 'function' ? ccRoomKautionRec(room0, type) : room0, start, end, noOverride: type === 'kurzzeit' }).amount;
  }
  const s = typeof appSettings !== 'undefined' ? appSettings : {};
  const d = ccContractData({
    type, settings: s,
    room: { name: room0.name, flaeche_m2: room0.flaeche_m2, gemeinschaftsraeume: _parseArr(room0.gemeinschaftsraeume),
            haustuerschluessel: room0.haustuerschluessel, zimmerschluessel: room0.zimmerschluessel,
            inventar: Array.isArray(room0.inventar) ? room0.inventar : [] },
    tenant: { name, address: _cgV('cg-adr'), birthday: _cgV('cg-dob'), email: _cgV('cg-email'), phone: _cgV('cg-tel') },
    start, end,
    rent: { mode: m.mode, kalt: m.kalt, nk: m.nk },
    kaution: existing ? { existing: true, amount: Number(rn.kautionSoll) || 0 } : { amount: kautionAmount },
    firstFull: _cgOpt('first') === 'voll', lastFull: _cgOpt('last') === 'voll',
    mv: type === 'mietvertrag' ? { befristet: term === 'bef', grund, person, mindestJahre: term === 'min' ? Number(_cgOpt('years') || 1) : 0 } : null,
    sigDate: _cgIso('cg-sig'),
    buergschaft: !!_cgIn('cg-bg')?.checked,
  });

  document.getElementById('_pdfRenderContainer')?.remove();
  const c = document.createElement('div');
  c.id = '_pdfRenderContainer';
  c.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#ffffff;z-index:-1;';
  document.body.appendChild(c);
  const res = await ccContractRender(c, d);
  if (res.overflow > 0) {          // never hand out a contract with hidden text
    c.remove();
    alert('Der Vertrag konnte nicht vollständig gesetzt werden (Text passt nicht auf die Seite). Bitte kürzere Eingaben verwenden oder melden.');
    if (typeof ccCancelPdf === 'function') ccCancelPdf();
    return null;
  }
  return {
    container: c,
    filename: ccPdfFileName(type === 'kurzzeit' ? 'Kurzzeitmietvertrag' : 'Mietvertrag', room0.name, name),
    payload: { kind: 'contract', ctype: type, room: room0.name, forId: ccfForValue(), renew: rn,
      tenant: { name, address: _cgV('cg-adr'), birthday: _cgV('cg-dob'), email: _cgV('cg-email'), phone: _cgV('cg-tel') },
      start, end: end || null, rent: m, kaution: existing ? null : (Number(kautionAmount) || 0),
      first_month: _cgOpt('first') === 'voll' ? 'voll' : 'anteilig', last_month: _cgOpt('last') === 'voll' ? 'voll' : 'anteilig',
      docLabel: type === 'kurzzeit' ? 'Kurzzeitmietvertrag' : 'Mietvertrag' },
  };
}
