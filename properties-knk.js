'use strict';

/* ══════════════════════════════════════════════════════
   properties-knk.js — Kaufnebenkosten of a purchase (Oct 2026)
   One row per cost (table prop_knk): Grunderwerbsteuer · Notar · Grundbuch · Makler · Sonstiges
   (Notar / Grundbuch: Kauf or Grundschuld). Every row: Expected → Invoice → Paid (or Not needed).
   · "Paid" books the one entry in Controlling › One-off (kind Kaufnebenkosten · source_ref knk:<id>),
     which is read-only there. The Controlling property is found like the Kreditrate:
     ctrl_properties.loan_ref = properties.id, else the same name. Not set up there yet → the row is
     paid here and books itself as soon as the property exists in Controlling.
   · Kaufnebenkosten typed in Controlling before show up here as paid (nothing to retype);
     the first change turns them into a row of this list (the same booking).
   · "Acquisition costs" of the property = the sum of the list (saved into properties.nebenkosten,
     so the dashboard keeps working). Without a list the typed number stays.
   · Files: the private bucket maintenance-docs, folder kaufnebenkosten/<property id>/.
   · Shown in the property pop-up (Kauf card under the KPIs, rows open inline — one level)
     and as a "Kauf · n open" pill in the Portfolio list.
══════════════════════════════════════════════════════ */

const KNK = { rows: [], ctrl: [], ot: [], loaded: false, missing: false, open: null, show: {}, draft: {}, ids: {} };
const KNK_ARTEN = ['Grunderwerbsteuer', 'Notar', 'Grundbuch', 'Makler', 'Sonstiges'];
const KNK_ICON = {
  Grunderwerbsteuer: ['ti-building-bank', '#E6EEF6', '#2F5470'],
  Notar:             ['ti-signature',     '#EFEAF6', '#5B4A7A'],
  Grundbuch:         ['ti-book',          '#EAF3E0', '#46682A'],
  Makler:            ['ti-key',           '#FAF0DC', '#7A5A22'],
  Sonstiges:         ['ti-receipt',       '#EDE8E0', '#7A6F62'],
};
const KNK_BUCKET = 'maintenance-docs';
const knkEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const knkR2 = v => Math.round((Number(v) || 0) * 100) / 100;
const knkNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
const knkHasPart = art => art === 'Notar' || art === 'Grundbuch';
const knkHasPct = art => art === 'Grunderwerbsteuer' || art === 'Makler';
const knkToday = () => (typeof ccTodayISO === 'function' ? ccTodayISO() : new Date().toISOString().slice(0, 10));
const knkDate = iso => (iso ? (typeof ccFmtDate === 'function' ? ccFmtDate(iso) : iso) : '');
const knkPct = v => (typeof ccFmtNum === 'function' ? ccFmtNum(Number(v) || 0, 2) : String(v)) + '\u00a0%';
const knkSel = id => (window.CSS && CSS.escape ? CSS.escape(id) : String(id));
const knkNil = v => v === null || v === undefined || v === '';

/* A small message at the bottom (this page has no toast of its own) */
function knkSay(msg) {
  let t = document.getElementById('knkToast');
  if (!t) { t = document.createElement('div'); t.id = 'knkToast'; t.className = 'knk-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ── Data ─────────────────────────────────────────────── */
async function knkLoad() {
  const [r, c, o] = await Promise.all([
    _supa.from('prop_knk').select('*'),
    _supa.from('ctrl_properties').select('*'),
    _supa.from('ctrl_expense_one_time').select('*').eq('kind', 'Kaufnebenkosten'),
  ]);
  KNK.missing = !!r.error;                                 // PROPERTIES-KNK.sql not run yet
  KNK.rows = r.error ? [] : (r.data || []);
  KNK.ctrl = c.error ? [] : (c.data || []);
  KNK.ot = o.error ? [] : (o.data || []);
  KNK.loaded = true;
  knkAutoBook().then(n => { if (n) knkRender(); }).catch(() => {});
}
const knkPut = row => { KNK.rows = KNK.rows.filter(r => r.id !== row.id).concat([row]); return row; };

/* The Controlling property of a Properties entry: the loan link first, else the same name (as the Kreditrate) */
function knkCtrlOf(p) {
  if (!p) return null;
  const linked = c => !knkNil(c.loan_ref);
  return KNK.ctrl.find(c => linked(c) && String(c.loan_ref) === String(p.id))
      || KNK.ctrl.find(c => !linked(c) && knkNorm(c.name) === knkNorm(p.name)) || null;
}

/* The costs of a property: this list + Kaufnebenkosten typed in Controlling before */
function knkItems(p) {
  if (!p) return [];
  const ctrl = knkCtrlOf(p);
  const linked = new Set(KNK.rows.filter(r => !knkNil(r.ot_id)).map(r => String(r.ot_id)));
  const list = KNK.rows.filter(r => Number(r.property_id) === Number(p.id)).map(r => {
    const o = knkNil(r.ot_id) ? null : KNK.ot.find(x => String(x.id) === String(r.ot_id));
    return Object.assign({}, r, { key: r.id, legacy: false, booked: !!o });
  });
  if (ctrl) KNK.ot.filter(o => Number(o.property_id) === Number(ctrl.id) && !linked.has(String(o.id))).forEach(o => {
    const amt = knkR2((Number(o.direction) === 1 ? -1 : 1) * (Number(o.amount) || 0)), day = String(o.invoice_date || '').slice(0, 10);
    list.push({ key: 'ot:' + o.id, legacy: true, booked: true, ot_id: String(o.id), property_id: p.id,
      art: KNK_ARTEN.includes(o.knk_type) ? o.knk_type : 'Sonstiges', part: knkHasPart(o.knk_type) ? (o.knk_part || null) : null,
      company: o.company || '', note: KNK_ARTEN.includes(o.knk_type) ? '' : (o.item || ''), pct: null, expected: null,
      inv_date: day, inv_amount: amt, paid_on: day, paid_amount: amt, not_needed: false, file_path: null, file_name: null,
      sort: 99, created_at: o.created_at || '' });
  });
  const rank = i => Math.max(0, KNK_ARTEN.indexOf(i.art)) * 10 + (i.part === 'Grundschuld' ? 1 : 0);
  const when = i => String(i.paid_on || i.inv_date || i.created_at || '');
  return list.sort((a, b) => rank(a) - rank(b) || (a.sort || 0) - (b.sort || 0) || when(a).localeCompare(when(b)));
}
const knkSt = i => (i.not_needed ? 'no' : i.paid_on ? 'paid' : (!knkNil(i.inv_amount) || i.inv_date) ? 'inv' : 'exp');
const knkAmt = i => (i.paid_on ? i.paid_amount : !knkNil(i.inv_amount) ? i.inv_amount : i.expected);
function knkSum(p) {
  const it = knkItems(p), act = it.filter(i => !i.not_needed), paid = act.filter(i => i.paid_on);
  const total = knkR2(act.reduce((s, i) => s + (Number(knkAmt(i)) || 0), 0));
  const paidSum = knkR2(paid.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0));
  return { it, n: act.length, nPaid: paid.length, nOpen: act.length - paid.length, total, paid: paidSum, open: knkR2(total - paidSum), any: it.length > 0 };
}
const knkHas = p => KNK.loaded && knkItems(p).length > 0;
/* The typed "Acquisition costs" vs the list: the same → it simply is the list's sum; different (e.g. costs never
   booked in Controlling) → both stay visible and nothing is overwritten until you change something in the list */
function knkTotalNote(p) {
  if (!knkHas(p)) return '';
  const S = knkSum(p);
  return Math.abs(S.total - (Number(p.nebenkosten) || 0)) < 0.005 ? 'sum of the Kauf list' : 'Kauf list: ' + eur(S.total);
}

/* Grunderwerbsteuer: Wiesbaden + AKK (Kastel, Kostheim, Amöneburg) and the rest of Hessen 6 %, Mainz / Rheinland-Pfalz 5 % (editable) */
function knkRate(p) {
  const a = String((p && p.addr) || '').toLowerCase();
  if (/wiesbaden|kastel|kostheim|amöneburg|amoeneburg/.test(a)) return 6;
  const plz = (a.match(/\b(\d{5})\b/) || [])[1] || '';
  return /^(3[4-6]|6[0-5])/.test(plz) ? 6 : 5;
}

/* ── Controlling booking (the one entry in One-off) ── */
function knkBooking(row, ctrl) {
  const amt = Number(row.paid_amount) || 0;
  return {
    property_id: ctrl.id, invoice_date: row.paid_on,
    item: [row.art, knkHasPart(row.art) ? row.part : '', row.note].filter(Boolean).join(' · '),
    company: row.company || null, amount: knkR2(Math.abs(amt)), kind: 'Kaufnebenkosten', direction: amt < 0 ? 1 : -1,
    knk_type: row.art, knk_part: knkHasPart(row.art) ? (row.part || null) : null, source_ref: 'knk:' + row.id,
  };
}
async function knkSyncBooking(p, row) {
  const ctrl = knkCtrlOf(p);
  if (!ctrl || knkNil(row.ot_id) || !row.paid_on) return;
  const { data, error } = await _supa.from('ctrl_expense_one_time').update(knkBooking(row, ctrl)).eq('id', row.ot_id).select().single();
  if (error) throw error;
  if (data) KNK.ot = KNK.ot.filter(o => String(o.id) !== String(data.id)).concat([data]);
}
/* Paid rows whose property was not in Controlling yet → booked now (runs after every load) */
async function knkAutoBook() {
  let n = 0;
  for (const r of KNK.rows.filter(x => x.paid_on && knkNil(x.ot_id) && !x.not_needed)) {
    const p = (window._props || []).find(x => Number(x.id) === Number(r.property_id)), ctrl = knkCtrlOf(p);
    if (!p || !ctrl) continue;
    try {
      const { data: b, error } = await _supa.from('ctrl_expense_one_time').insert(knkBooking(r, ctrl)).select().single();
      if (error) throw error;
      KNK.ot.push(b);
      const u = await _supa.from('prop_knk').update({ ot_id: String(b.id) }).eq('id', r.id).select().single();
      if (!u.error && u.data) knkPut(u.data);
      n++;
    } catch (e) { console.warn('[properties] Kaufnebenkosten booking', e); }
  }
  return n;
}
/* "Acquisition costs" = the sum of the list (only when there is a list) */
async function knkSyncTotal(p) {
  const S = knkSum(p);
  if (!S.any || Math.abs(S.total - (Number(p.nebenkosten) || 0)) < 0.005) return;
  try {
    const d = await updateProperty(p.id, { nebenkosten: S.total });
    window._props = (window._props || []).map(x => (x.id === p.id ? Object.assign({}, x, d || { nebenkosten: S.total }) : x));
  } catch (e) { console.warn('[properties] acquisition costs', e); }
}

/* The row of a cost — a Controlling booking from before becomes a row on its first change (same booking) */
async function knkEnsureRow(p, it) {
  if (!it.legacy) return KNK.rows.find(r => r.id === it.key);
  const ins = {
    property_id: p.id, art: it.art, part: it.part, company: it.company || null, note: it.note || null,
    inv_date: it.inv_date, inv_amount: it.inv_amount, paid_on: it.paid_on, paid_amount: it.paid_amount, ot_id: String(it.ot_id), sort: 50,
  };
  const { data, error } = await _supa.from('prop_knk').insert(ins).select().single();
  if (error) throw error;
  knkPut(data);
  KNK.ids[it.key] = data.id;
  if (KNK.open === it.key) KNK.open = data.id;
  return data;
}
async function knkSave(p, it, patch) {
  try {
    const row = await knkEnsureRow(p, it);
    if (!row) return;
    const { data, error } = await _supa.from('prop_knk').update(Object.assign({}, patch, { updated_at: new Date().toISOString() })).eq('id', row.id).select().single();
    if (error) throw error;
    knkPut(data);
    if (!knkNil(data.ot_id) && data.paid_on) await knkSyncBooking(p, data);
    await knkSyncTotal(p);
  } catch (e) { knkSay('Not saved — ' + (e.message || e)); }
  knkRender();
}

/* ── Actions ── */
async function knkStart(p) {
  if (KNK.missing) return knkSay('Run PROPERTIES-KNK.sql in Supabase first');
  const rate = knkRate(p), price = Number(p.kaufpreis) || 0, noLoan = !(Number(p.darlehen) > 0);
  const rows = [
    { art: 'Grunderwerbsteuer', company: 'Finanzamt', pct: rate, expected: price > 0 ? knkR2(price * rate / 100) : null, sort: 1 },
    { art: 'Notar', part: 'Kauf', sort: 2 }, { art: 'Notar', part: 'Grundschuld', sort: 3, not_needed: noLoan },
    { art: 'Grundbuch', part: 'Kauf', sort: 4 }, { art: 'Grundbuch', part: 'Grundschuld', sort: 5, not_needed: noLoan },
    { art: 'Makler', sort: 6 },
  ].map(r => Object.assign({ property_id: p.id }, r));
  const { data, error } = await _supa.from('prop_knk').insert(rows).select();
  if (error) return knkSay('Not saved — ' + (error.message || error));
  (data || []).forEach(knkPut);
  await knkSyncTotal(p);
  knkSay('Checklist ready · Grunderwerbsteuer ' + knkPct(rate));
  knkRender();
}
async function knkAdd(p) {
  if (KNK.missing) return knkSay('Run PROPERTIES-KNK.sql in Supabase first');
  const { data, error } = await _supa.from('prop_knk').insert({ property_id: p.id, art: 'Sonstiges', sort: 90 }).select().single();
  if (error) return knkSay('Not saved — ' + (error.message || error));
  knkPut(data);
  KNK.open = data.id;
  knkRender();
}
function knkSetArt(p, it, art) {
  if (!KNK_ARTEN.includes(art) || art === it.art) return;
  const patch = { art, part: knkHasPart(art) ? (it.part || 'Kauf') : null };
  if (knkHasPct(art)) {
    const pct = !knkNil(it.pct) ? it.pct : (art === 'Grunderwerbsteuer' ? knkRate(p) : null);
    patch.pct = pct;
    if (!knkNil(pct) && knkNil(it.expected) && Number(p.kaufpreis) > 0) patch.expected = knkR2(Number(p.kaufpreis) * pct / 100);
  } else patch.pct = null;
  if (art === 'Grunderwerbsteuer' && !it.company) patch.company = 'Finanzamt';
  return knkSave(p, it, patch);
}
async function knkPay(p, it) {
  if (it.paid_on) return knkUnpay(p, it);
  if (it.not_needed) return knkSay('This one is marked as not needed');
  const q = f => document.querySelector('#viewMode [data-kf="' + f + '"][data-id="' + knkSel(it.key) + '"]');
  const on = (q('paid_on') && q('paid_on').value) || (KNK.draft[it.key] || {}).on || knkToday();
  const raw = q('paid_amount') ? parseFloat(q('paid_amount').value) : NaN;
  const amt = knkR2(isFinite(raw) ? raw : (it.paid_amount ?? it.inv_amount ?? it.expected));
  if (!(Math.abs(amt) > 0)) return knkSay('Add the amount first');
  let booking = null;
  try {
    const row = await knkEnsureRow(p, it), ctrl = knkCtrlOf(p);
    const patch = { paid_on: on, paid_amount: amt, updated_at: new Date().toISOString() };
    if (ctrl) {
      const b = await _supa.from('ctrl_expense_one_time').insert(knkBooking(Object.assign({}, row, patch), ctrl)).select().single();
      if (b.error) throw b.error;
      booking = b.data; patch.ot_id = String(booking.id);
    }
    const { data, error } = await _supa.from('prop_knk').update(patch).eq('id', row.id).select().single();
    if (error) throw error;
    if (booking) KNK.ot.push(booking);
    knkPut(data); delete KNK.draft[it.key];
    await knkSyncTotal(p);
    knkSay(ctrl ? 'Paid · booked in Controlling' : 'Paid · books itself into Controlling once ' + p.name + ' is set up there');
  } catch (e) {
    if (booking) { try { await _supa.from('ctrl_expense_one_time').delete().eq('id', booking.id); } catch (x) {} }   // never half-saved
    knkSay('Not saved — ' + (e.message || e));
  }
  knkRender();
}
async function knkUnpay(p, it) {
  if (!confirm('Remove the payment?' + (it.booked ? '\n\nThe booking in Controlling › One-off is deleted too – it is the same entry.' : ''))) return;
  try {
    const row = await knkEnsureRow(p, it);
    if (!knkNil(row.ot_id)) {
      const { error } = await _supa.from('ctrl_expense_one_time').delete().eq('id', row.ot_id);
      if (error) throw error;
      KNK.ot = KNK.ot.filter(o => String(o.id) !== String(row.ot_id));
    }
    const { data, error } = await _supa.from('prop_knk').update({ paid_on: null, ot_id: null, updated_at: new Date().toISOString() }).eq('id', row.id).select().single();
    if (error) throw error;
    knkPut(data);
    await knkSyncTotal(p);
  } catch (e) { knkSay('Not saved — ' + (e.message || e)); }
  knkRender();
}
async function knkDel(p, it) {
  if (it.paid_on) return knkSay('Switch off “Paid” first');
  if (!confirm('Remove “' + it.art + (it.part ? ' · ' + it.part : '') + '”?')) return;
  try {
    const { error } = await _supa.from('prop_knk').delete().eq('id', it.key);
    if (error) throw error;
    if (it.file_path) _supa.storage.from(KNK_BUCKET).remove([it.file_path]).catch(() => {});
    KNK.rows = KNK.rows.filter(r => r.id !== it.key);
    if (KNK.open === it.key) KNK.open = null;
    await knkSyncTotal(p);
  } catch (e) { knkSay('Not removed — ' + (e.message || e)); }
  knkRender();
}
async function knkFile(p, key, file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return knkSay('The file is too big (max. 20 MB)');
  const it = knkItems(p).find(x => x.key === key);
  if (!it) return;
  knkSay('Uploading …');
  try {
    const row = await knkEnsureRow(p, it);
    const ext = ((file.name || '').split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
    const path = 'kaufnebenkosten/' + p.id + '/' + row.id + '-' + Date.now() + '.' + ext;
    const up = await _supa.storage.from(KNK_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) throw up.error;
    const old = row.file_path;
    const { data, error } = await _supa.from('prop_knk').update({ file_path: path, file_name: file.name || ('Rechnung.' + ext) }).eq('id', row.id).select().single();
    if (error) throw error;
    knkPut(data);
    if (old) _supa.storage.from(KNK_BUCKET).remove([old]).catch(() => {});
    knkSay('File saved');
  } catch (e) { knkSay('The file could not be saved — ' + (e.message || e)); }
  knkRender();
}
async function knkOpenFile(it) {
  if (!it.file_path) return;
  const w = window.open('', '_blank');                      // opened inside the tap (iPhone), filled below
  const { data, error } = await _supa.storage.from(KNK_BUCKET).createSignedUrl(it.file_path, 600);
  if (error || !data || !data.signedUrl) { if (w) w.close(); return knkSay('The file could not be opened'); }
  if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
}
async function knkFileDel(p, it) {
  if (!it.file_path || !confirm('Remove the file “' + (it.file_name || 'Rechnung') + '”?')) return;
  try {
    const { data, error } = await _supa.from('prop_knk').update({ file_path: null, file_name: null }).eq('id', it.key).select().single();
    if (error) throw error;
    knkPut(data);
    _supa.storage.from(KNK_BUCKET).remove([it.file_path]).catch(() => {});
  } catch (e) { knkSay('Not removed — ' + (e.message || e)); }
  knkRender();
}
/* A field was changed (saved when you leave it) */
async function knkChange(el) {
  const p = knkProp(), key = el.dataset.id, f = el.dataset.kf;
  if (!p) return;
  const it = knkItems(p).find(x => x.key === key);
  if (!it) return;
  let v = el.value;
  if (['pct', 'expected', 'inv_amount', 'paid_amount'].includes(f)) { const x = v === '' ? null : parseFloat(v); v = x === null || !isFinite(x) ? null : knkR2(x); }
  else if (f === 'inv_date' || f === 'paid_on') v = v || null;
  else v = String(v || '').trim() || null;
  if (f === 'paid_on' && !it.paid_on) { (KNK.draft[key] = KNK.draft[key] || {}).on = v; return; }    // used when "Paid" is switched on
  if (f === 'paid_on' && !v) { knkSay('Switch off “Paid” instead'); return knkRender(); }
  if (f === 'paid_amount' && it.paid_on && !(Math.abs(Number(v)) > 0)) { knkSay('Enter the amount'); return knkRender(); }
  const patch = { [f]: v };
  if (f === 'pct' && v !== null && Number(p.kaufpreis) > 0) patch.expected = knkR2(Number(p.kaufpreis) * v / 100);
  await knkSave(p, it, patch);
}

/* ── Views ── */
function knkPill(p) {
  if (!KNK.loaded) return '';
  const S = knkSum(p);
  return S.nOpen > 0 ? '<span class="knk-pill">Kauf · ' + S.nOpen + ' open</span>' : '';
}
function knkSectionHTML(p) {
  if (!KNK.loaded) return '';
  const head = '<span class="mod-sec" id="knkSec">Kauf</span>';
  if (KNK.missing) return head + '<p class="knk-hint">Run PROPERTIES-KNK.sql in Supabase to enter the Kaufnebenkosten here.</p>';
  const S = knkSum(p);
  const kd = p.kaufdatum && p.kaufdatum !== '—' ? knkDate(p.kaufdatum) : '';
  const sub = ['Kaufpreis ' + eur(p.kaufpreis), kd].filter(Boolean).join(' · ');
  if (!S.any) {
    return head + '<div class="knk-card">' +
      '<div class="knk-card__h"><span class="knk-card__l">Kaufnebenkosten</span><span class="knk-card__t knk-nil">—</span></div>' +
      '<div class="knk-card__s">' + knkEsc(sub) + '</div>' +
      '<div class="knk-btns"><button type="button" class="knk-btn knk-btn--p" data-knk="start"><i class="ti ti-checklist" aria-hidden="true"></i>Start checklist</button>' +
      '<button type="button" class="knk-btn" data-knk="add"><i class="ti ti-plus" aria-hidden="true"></i>Add cost</button></div>' +
      '<p class="knk-hint">Grunderwerbsteuer, Notar, Grundbuch and Makler in one tap — add the amounts when the invoices come.</p></div>';
  }
  const done = S.n > 0 && S.nOpen === 0;
  const w = done ? 100 : S.total > 0 ? Math.max(0, Math.min(100, Math.round(S.paid / S.total * 100))) : 0;
  const card = '<div class="knk-card">' +
    '<div class="knk-card__h"><span class="knk-card__l">Kaufnebenkosten</span><span class="knk-card__t">' + eur(S.total) + '</span></div>' +
    '<div class="knk-card__s">' + knkEsc(sub) + '</div>' +
    '<div class="knk-bar"><i style="width:' + w + '%"></i></div>' +
    '<div class="knk-card__f"><span>' + S.nPaid + ' of ' + S.n + ' paid</span><span>' + eur(S.open) + ' open</span></div>' +
    (done ? '<span class="knk-seal"><i class="ti ti-rosette-discount-check" aria-hidden="true"></i>All Kaufnebenkosten paid</span>' : '') + '</div>';
  const fold = done && !KNK.show[p.id];
  const rows = fold
    ? '<button type="button" class="knk-more" data-knk="show">Show the ' + S.it.length + ' costs<i class="ti ti-chevron-down" aria-hidden="true"></i></button>'
    : S.it.map(i => knkRowHTML(p, i)).join('') +
      (done ? '<button type="button" class="knk-more" data-knk="show">Hide the costs<i class="ti ti-chevron-up" aria-hidden="true"></i></button>' : '');
  return head + card + rows + '<button type="button" class="knk-add" data-knk="add"><i class="ti ti-plus" aria-hidden="true"></i>Add cost</button>';
}
function knkRowHTML(p, i) {
  const st = knkSt(i), ic = KNK_ICON[i.art] || KNK_ICON.Sonstiges, a = knkAmt(i), open = KNK.open === i.key;
  const PL = { exp: ['knk-p--exp', 'Expected'], inv: ['knk-p--inv', 'Invoice'], paid: ['knk-p--paid', 'Paid'], no: ['knk-p--no', 'Not needed'] }[st];
  const title = i.art + (knkHasPart(i.art) && i.part ? ' · ' + i.part : '') + (i.art === 'Sonstiges' && i.note ? ' · ' + i.note : '');
  const sub = st === 'paid' ? [i.company, 'paid ' + knkDate(i.paid_on), i.booked ? '' : 'not in Controlling yet'].filter(Boolean).join(' · ')
    : st === 'inv' ? [i.company, i.inv_date ? 'invoice ' + knkDate(i.inv_date) : 'invoice', i.file_path ? '1 file' : ''].filter(Boolean).join(' · ')
    : st === 'no' ? 'not needed'
    : knkHasPct(i.art) && !knkNil(i.pct) ? [i.company, knkPct(i.pct) + ' of ' + eur(p.kaufpreis)].filter(Boolean).join(' · ')
    : (i.company || 'tap to add the amount');
  return '<button type="button" class="knk-it' + (st === 'no' ? ' is-off' : '') + (open ? ' is-open' : '') + '" data-knk="open" data-id="' + knkEsc(i.key) + '" aria-expanded="' + open + '">' +
      '<span class="knk-ic" style="background:' + ic[1] + ';color:' + ic[2] + '"><i class="ti ' + ic[0] + '" aria-hidden="true"></i></span>' +
      '<span class="knk-it__m"><span class="knk-it__t">' + knkEsc(title) + '</span><span class="knk-it__s">' + knkEsc(sub) + '</span></span>' +
      '<span class="knk-it__r"><span class="knk-it__a' + (knkNil(a) ? ' knk-nil' : '') + '">' + (knkNil(a) ? '—' : eur(a)) + '</span>' +
      '<span class="knk-p ' + PL[0] + '">' + PL[1] + '</span></span></button>' + (open ? knkEditorHTML(p, i) : '');
}
function knkEditorHTML(p, i) {
  const st = knkSt(i), id = knkEsc(i.key), paid = !!i.paid_on;
  const seg = (name, opts, cur) => '<div class="knk-seg" role="group">' + opts.map(o =>
    '<button type="button" class="' + (cur === o ? 'on' : '') + '" data-knk="' + name + '" data-id="' + id + '" data-v="' + knkEsc(o) + '" aria-pressed="' + (cur === o) + '">' + knkEsc(o) + '</button>').join('') + '</div>';
  const num = (f, label, v) => '<div class="e-field"><label class="e-lbl">' + label + '</label><input class="cc-input" type="number" data-cc-num="2" inputmode="decimal" data-kf="' + f + '" data-id="' + id + '" value="' + (knkNil(v) ? '' : knkEsc(v)) + '"/></div>';
  const day = (f, label, v) => '<div class="e-field"><label class="e-lbl">' + label + '</label><input class="cc-input" type="date" data-kf="' + f + '" data-id="' + id + '" value="' + knkEsc(v || '') + '"/></div>';
  const txt = (f, label, v, ph) => '<div class="e-field"><label class="e-lbl">' + label + '</label><input class="cc-input" data-kf="' + f + '" data-id="' + id + '" value="' + knkEsc(v || '') + '" placeholder="' + knkEsc(ph || '') + '" autocomplete="off"/></div>';
  const payAmt = !knkNil(i.paid_amount) ? i.paid_amount : (!knkNil(i.inv_amount) ? i.inv_amount : i.expected);
  const exp = st === 'exp' || st === 'no'
    ? '<div class="knk-g2">' + (knkHasPct(i.art) ? num('pct', '% of the price', i.pct) : '') + num('expected', 'Expected €', i.expected) + '</div>' : '';
  const file = '<div class="knk-files">' + (i.file_path
      ? '<span class="knk-chip"><button type="button" class="knk-chip__n" data-knk="file" data-id="' + id + '"><i class="ti ti-file-text" aria-hidden="true"></i>' + knkEsc(i.file_name || 'Rechnung') + '</button>' +
        '<button type="button" class="knk-chip__x" data-knk="fileDel" data-id="' + id + '" aria-label="Remove the file">✕</button></span>' : '') +
    '<label class="knk-chip knk-chip--add"><i class="ti ti-plus" aria-hidden="true"></i>' + (i.file_path ? 'Replace file' : 'File') +
      '<input type="file" accept="application/pdf,image/*" data-knk-file="' + id + '" hidden/></label></div>';
  const links = [paid ? '' : '<button type="button" data-knk="no" data-id="' + id + '">' + (i.not_needed ? 'Needed after all' : 'Not needed') + '</button>',
                 paid || i.legacy ? '' : '<button type="button" data-knk="del" data-id="' + id + '">Remove</button>'].filter(Boolean).join(' · ');
  return '<div class="knk-ed">' +
    seg('art', KNK_ARTEN, i.art) +
    (knkHasPart(i.art) ? seg('part', ['Kauf', 'Grundschuld'], i.part) : '') +
    txt('company', i.art === 'Grunderwerbsteuer' ? 'Finanzamt' : 'Firma', i.company, i.art === 'Notar' ? 'z. B. Notariat Dr. Weber' : i.art === 'Grundbuch' ? 'z. B. Amtsgericht Mainz' : '') +
    (i.art === 'Sonstiges' ? txt('note', 'Beschreibung', i.note, 'z. B. Gutachter') : '') +
    exp +
    '<div class="knk-g2">' + day('inv_date', 'Invoice date', i.inv_date) + num('inv_amount', 'Invoice €', i.inv_amount) + '</div>' +
    file +
    '<div class="knk-pay' + (paid ? ' is-on' : '') + '"><div class="knk-pay__m"><span class="knk-pay__t">Paid</span><span class="knk-pay__s">' +
      (paid ? (i.booked ? 'booked in Controlling › One-off' : 'books itself into Controlling once the property is set up there') : 'flip it when it’s paid · books into Controlling') + '</span></div>' +
      '<button type="button" class="knk-tg' + (paid ? ' on' : '') + '" data-knk="pay" data-id="' + id + '" role="switch" aria-checked="' + paid + '" aria-label="Paid"' + (i.not_needed ? ' disabled' : '') + '></button></div>' +
    '<div class="knk-g2">' + day('paid_on', 'On', i.paid_on || (KNK.draft[i.key] || {}).on || knkToday()) + num('paid_amount', 'Paid €', payAmt) + '</div>' +
    (links ? '<p class="knk-links">' + links + '</p>' : '') +
  '</div>';
}

/* ── Redraw (keeps the scroll position and the field you were in) ── */
function knkProp() { return (window._props || []).find(x => x.id === _pid) || null; }
function knkRender() {
  setTimeout(() => {
    const a = document.activeElement, f = a && a.dataset ? a.dataset.kf : null;
    let id = f ? a.dataset.id : null;
    if (id && KNK.ids[id]) id = KNK.ids[id];
    const body = document.querySelector('#detailOverlay .sheet-body'), top = body ? body.scrollTop : 0;
    const p = knkProp();
    if (p && !_editing) renderView(p);
    if (body) body.scrollTop = top;
    if (typeof renderPortfolio === 'function') renderPortfolio();
    if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (e) {} }
    if (f && id) { const el = document.querySelector('#viewMode [data-kf="' + f + '"][data-id="' + knkSel(id) + '"]'); if (el) { try { el.focus(); } catch (e) {} } }
  }, 0);
}
/* properties.html#knk=<id> (e.g. "Open in Properties" in Controlling) → that property, at the Kauf card */
function knkOpenLink() {
  const m = String(location.hash || '').match(/^#knk=(\d+)/);
  if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  const id = Number(m[1]);
  if (!(window._props || []).some(x => x.id === id)) return;
  const t = document.getElementById('tabPort');
  if (t && typeof showTab === 'function') showTab('portfolio', t);
  openDetail(id);
  setTimeout(() => { const s = document.getElementById('knkSec'); if (s) s.scrollIntoView({ block: 'start' }); }, 150);
}

/* ── Wiring ── */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-knk]');
  if (!b || b.disabled || !b.closest('#viewMode')) return;
  const p = knkProp();
  if (!p) return;
  const a = b.dataset.knk, key = b.dataset.id;
  if (a === 'open') { KNK.open = KNK.open === key ? null : key; return knkRender(); }
  if (a === 'show') { KNK.show[p.id] = !KNK.show[p.id]; return knkRender(); }
  if (a === 'start') return knkStart(p);
  if (a === 'add') return knkAdd(p);
  const it = key ? knkItems(p).find(x => x.key === key) : null;
  if (!it) return;
  if (a === 'art') return knkSetArt(p, it, b.dataset.v);
  if (a === 'part') return b.dataset.v === it.part ? null : knkSave(p, it, { part: b.dataset.v });
  if (a === 'pay') return knkPay(p, it);
  if (a === 'no') return it.paid_on ? knkSay('Switch off “Paid” first') : knkSave(p, it, { not_needed: !it.not_needed });
  if (a === 'del') return knkDel(p, it);
  if (a === 'file') return knkOpenFile(it);
  if (a === 'fileDel') return knkFileDel(p, it);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!el || !el.closest || !el.closest('#viewMode') || !el.dataset) return;
  if (el.dataset.knkFile) { const p = knkProp(); if (p) knkFile(p, el.dataset.knkFile, el.files && el.files[0]); return; }
  if (el.dataset.kf) knkChange(el);
});
