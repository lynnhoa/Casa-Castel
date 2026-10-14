/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — APP
   maintenance.js

   Seventh management app (login tile + profile menus of all apps).
   Tabs: Renovierungen · Schäden. Each tab lists its cases grouped
   by property, in the order of the Properties app; a property
   without cases is not shown. Done cases fold per property.

   Two levels only: the list and ONE panel (read view ⇄ edit).
   Panel: bottom sheet (phone) · centred window (iPad) ·
          side panel next to the list (laptop) — like Settlements.
   After Save the panel goes back to its read view.

   Data:       maint_cases · maint_docs · bucket maintenance-docs
               (MAINTENANCE.sql)
   Properties: read only, from Controlling's list (`ctrl_properties`) — the same
               ids as Controlling, so costs land on exactly that property there
   Rules:      Kosten = the Costs table (receipts − returns; year by each line's date)
               · one status field: open / in_progress / done
                 ("Planned" in Renovierungen, "Open" in Schäden)
               · the property name is saved with the case, so the case
                 keeps it if the property is removed later
               · Save shows at once and retries once by itself; a toast
                 only when it really failed (the form comes back)

   Costs (per case, in the panel, D1): one row = one receipt / invoice
               Receipt no. · Description · Brand / Provider · Amount · Date · Photos
               grouped Self-bought / Provider · tap a row = edit it in place
               · the row's photos / PDFs are documents linked to the row (cost_id)
   Documents (per case, in the panel):
               Photos  = camera or library, several at once, saved as photos
                         (shrunk to 2000 px + a small preview in /thumbs/)
               Upload  = one file + its Type (Angebot, Schadenbericht, Photo, Other;
                         invoices / receipts belong in Costs)
               Edit    = × deletes a file, tapping a file fixes Type / Betrag / date
               Files are private (bucket maintenance-docs, one folder per case);
               a tap opens them with a short-lived link.
   ───────────────────────────────────────────────────────────── */

'use strict';

const MT = {
  tab: (() => {
    try { const t = localStorage.getItem('mt_last_tab'); return ['renovierung', 'schaden'].includes(t) ? t : 'renovierung'; }
    catch (e) { return 'renovierung'; }
  })(),
  props: [],        // properties: id, name, sort_order
  cases: [],        // maint_cases rows
  docs:  [],        // maint_docs rows (no file contents) · cost_id = file of a cost row
  costs: [],        // maint_costs rows: one per receipt / invoice
  loaded: false,
  loadError: null,
  open: {},         // unfolded "Done" groups: { 'schaden|p:4': true }
  sel: null,        // panel: { id, isNew, edit, draft, snap, docEdit, add, fix, cost }
  busy: false,      // a save / delete is running
  up: null,         // upload running: { caseId, total, done, where: 'docs' | 'costs' }
  links: {},        // file path → { url, exp } (short-lived private links)
};

const MT_KIND = {
  renovierung: { title: 'Renovierungen', one: 'Renovierung', empty: 'No Renovierungen yet.', open: 'Planned', openCount: 'planned' },
  schaden:     { title: 'Schäden',       one: 'Schaden',     empty: 'No Schäden yet.',       open: 'Open',    openCount: 'open' },
};
const MT_PAID = [['me', 'Me'], ['versicherung', 'Versicherung'], ['mieter', 'Mieter'], ['weg', 'WEG / HV']];
const MT_DOC = {
  rechnung:       { label: 'Rechnung',       icon: 'ti-file-invoice' },
  angebot:        { label: 'Angebot',        icon: 'ti-file-text' },
  schadenbericht: { label: 'Schadenbericht', icon: 'ti-file-description' },
  photo:          { label: 'Photo',          icon: 'ti-photo' },
  other:          { label: 'Other',          icon: 'ti-file' },
  receipt:        { label: 'Receipt',        icon: 'ti-receipt' },      // file of a cost row
};
const MT_COST = {
  self:     { label: 'Self-bought', who: 'Brand' },
  provider: { label: 'Provider',    who: 'Provider' },
};
const MT_DOC_ORDER = ['schadenbericht', 'angebot', 'rechnung', 'other', 'photo'];
const MT_BUCKET = 'maintenance-docs';
const MT_MAX_MB = 30;

/* ── Small helpers ────────────────────────────────────────── */
const mtEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mtEur = n => ccFmtEUR(Math.round((Number(n) || 0) * 100) / 100);
const mtDate = iso => (iso ? ccFmtDate(iso) : '');
const mtYear = () => ccTodayISO().slice(0, 4);
const mtStatusLabel = (kind, s) => (s === 'done' ? 'Done' : s === 'in_progress' ? 'In progress' : (MT_KIND[kind] || MT_KIND.schaden).open);
const mtPillCls = s => (s === 'done' ? 'mt-pill--done' : s === 'in_progress' ? 'mt-pill--prog' : 'mt-pill--open');
const mtPill = (kind, s) => `<span class="mt-pill ${mtPillCls(s)}">${mtStatusLabel(kind, s)}</span>`;
const mtPaidLabel = v => (MT_PAID.find(p => p[0] === v) || [null, ''])[1];
const mtCase = id => MT.cases.find(c => String(c.id) === String(id)) || null;
const mtProp = id => (id === null || id === undefined || id === '' ? null : MT.props.find(p => String(p.id) === String(id)) || null);
const mtPropName = c => { const p = mtProp(c.property_id); return p ? p.name : (c.property_name || 'Unknown property'); };
function mtSay(msg) { if (typeof ctlToast === 'function') ctlToast(msg); }
function mtUuid() {
  if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const mtNativeVal = el => (el ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get.call(el) : '');
const mtFine = () => window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Kosten: the Costs table of these cases — receipts minus returns, optionally one year
   (each line counts in the year of its own date, the same as in Controlling) */
const mtSign = r => (r.return_of ? -1 : 1);
function mtCost(caseIds, year, kind) {
  const ids = new Set(caseIds.map(String));
  const sum = MT.costs.reduce((a, r) => {
    if (!ids.has(String(r.case_id)) || (kind && r.kind !== kind)) return a;
    if (year && String(r.cost_date || '').slice(0, 4) !== year) return a;
    return a + mtSign(r) * (Number(r.amount) || 0);
  }, 0);
  return Math.round(sum * 100) / 100;
}
const mtAmt = n => (n ? mtEur(n) : '—');

/* A save/delete: one automatic retry (a connection hiccup is not an error) */
async function mtTry(fn) {
  const run = async () => { try { return (await fn()) || {}; } catch (e) { return { error: e }; } };
  let r = await run();
  if (r.error) { await new Promise(res => setTimeout(res, 400)); r = await run(); }
  return r;
}

/* ── Data ─────────────────────────────────────────────────── */
async function mtLoad() {
  const sb = _ctlSupa;
  const once = () => Promise.all([
    sb.from('ctrl_properties').select('id,name,sort_order,active'),
    sb.from('maint_cases').select('*'),
    sb.from('maint_docs').select('id,case_id,cost_id,doc_type,file_path,file_name,amount,doc_date,created_at'),
    sb.from('maint_costs').select('*'),
  ]);
  let res = await once();
  if (res.some(r => r.error)) {
    await new Promise(r => setTimeout(r, 400));
    res = await once();
  }
  const bad = res.find(r => r.error);
  if (bad) throw bad.error;
  [MT.props, MT.cases, MT.docs, MT.costs] = res.map(r => r.data || []);
  MT.props.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || (Number(a.id) || 0) - (Number(b.id) || 0));
  MT.loaded = true;
}

/* ── Tabs ─────────────────────────────────────────────────── */
function mtSwitchTab(kind) {
  if (!MT_KIND[kind]) kind = 'renovierung';
  MT.tab = kind;
  try { localStorage.setItem('mt_last_tab', kind); } catch (e) {}
  document.querySelectorAll('#appTabs .cc-tab').forEach(b => {
    const on = b.dataset.tab === kind;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  Object.keys(MT_KIND).forEach(k => {
    const el = document.getElementById('tab-' + k);
    if (el) el.style.display = k === kind ? '' : 'none';
  });
  mtRender();
}
/* Tapping a tab: an open panel closes (asks first if there are unsaved changes) */
async function mtTabClick(kind) {
  if (kind === MT.tab) return;
  if (MT.sel && !(await mtClose())) return;
  mtSwitchTab(kind);
  window.scrollTo(0, 0);
}

/* ── List ─────────────────────────────────────────────────── */
/* Cases of one tab, grouped by property (Properties order; removed properties last) */
function mtGroups(kind) {
  const list = MT.cases.filter(c => c.kind === kind);
  const groups = new Map();
  list.forEach(c => {
    const p = mtProp(c.property_id);
    const key = p ? 'p:' + p.id : 'n:' + (c.property_name || '');
    if (!groups.has(key)) groups.set(key, { key, name: mtPropName(c), order: p ? (Number(p.sort_order) || 0) : 1e9, cases: [] });
    groups.get(key).cases.push(c);
  });
  const byDate = (a, b) => String(b.case_date || '').localeCompare(String(a.case_date || '')) ||
                           String(b.created_at || '').localeCompare(String(a.created_at || ''));
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'de'))
    .map(g => ({ ...g, active: g.cases.filter(c => c.status !== 'done').sort(byDate), done: g.cases.filter(c => c.status === 'done').sort(byDate) }));
}

function mtRowHTML(c) {
  const sub = [c.area, mtDate(c.case_date)].filter(Boolean).map(mtEsc).join(' · ');
  const cost = mtCost([c.id]);
  const sel = MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id) ? ' is-sel' : '';
  return `<button type="button" class="mt-row${sel}" data-mt="open" data-id="${mtEsc(c.id)}">
      <span class="mt-row__l"><span class="mt-row__t">${mtEsc(c.title)}</span>${sub ? `<span class="mt-row__s">${sub}</span>` : ''}</span>
      <span class="mt-row__r"><span class="mt-row__a${cost ? '' : ' mt-mu'}">${mtAmt(cost)}</span>${mtPill(c.kind, c.status)}</span>
    </button>`;
}

function mtRender() {
  const kind = MT.tab;
  const el = document.getElementById('tab-' + kind);
  if (!el) return;
  if (MT.loadError) { el.innerHTML = mtErrorHTML(MT.loadError); return; }
  const list = MT.cases.filter(c => c.kind === kind);
  const head = `
    <div class="mt-hdr">
      <h1 class="cc-h1">${MT_KIND[kind].title}</h1>
      <button type="button" class="mt-add" data-mt="new"><i class="ti ti-plus" aria-hidden="true"></i><span>New</span></button>
    </div>`;
  if (!list.length) { el.innerHTML = head + `<p class="mt-empty">${MT_KIND[kind].empty}</p>`; return; }

  const ids = list.map(c => c.id), y = mtYear();
  const nOpen = list.filter(c => c.status === 'open').length, nProg = list.filter(c => c.status === 'in_progress').length;
  const counts = [nOpen ? `${nOpen} ${MT_KIND[kind].openCount}` : '', nProg ? `${nProg} in progress` : ''].filter(Boolean).join(' · ') || 'all done';
  const sum = `
    <div class="cc-sum2">
      <div class="cc-sum2__meta"><b>Kosten</b><span>${counts}</span></div>
      <div class="cc-sum2__vals"><span><i>${y}</i>${mtEur(mtCost(ids, y))}</span><span><i>Total</i>${mtEur(mtCost(ids))}</span></div>
    </div>`;

  const cards = mtGroups(kind).map(g => {
    const total = mtCost(g.cases.map(c => c.id));
    const fk = kind + '|' + g.key, open = !!MT.open[fk];
    const fold = g.done.length ? `
      <button type="button" class="mt-fold" data-mt="fold" data-key="${mtEsc(fk)}" aria-expanded="${open}">
        <span>Done (${g.done.length})</span><i class="ti ti-chevron-down" aria-hidden="true"></i>
      </button>${open ? g.done.map(mtRowHTML).join('') : ''}` : '';
    return `
      <section class="mt-card" aria-label="${mtEsc(g.name)}">
        <div class="mt-card__hd"><h2 class="mt-card__name">${mtEsc(g.name)}</h2><span class="mt-card__sum${total ? '' : ' mt-mu'}">${mtAmt(total)}</span></div>
        ${g.active.map(mtRowHTML).join('')}${fold}
      </section>`;
  }).join('');

  el.innerHTML = head + sum + `<div class="mt-list">${cards}</div>`;
}

function mtErrorHTML(e) {
  const msg = String((e && (e.message || e.code)) || e || '');
  const d1 = /maint_costs|cost_id/i.test(msg);
  const missing = d1 || /maint_(cases|docs)/i.test(msg);
  const again = t => `<a href="#" onclick="location.reload();return false;">${t}</a>`;
  return `
    <div class="mt-hdr"><h1 class="cc-h1">${MT_KIND[MT.tab].title}</h1></div>
    <p class="mt-note">${missing
      ? `The Maintenance tables are missing. Run ${d1 ? 'MAINTENANCE-D1.sql' : 'MAINTENANCE.sql'} in Supabase, then ${again('try again')}.`
      : `The data could not be loaded. ${again('Try again')}`}</p>
    <p class="mt-muted">${mtEsc(msg)}</p>`;
}

/* ── Panel ────────────────────────────────────────────────── */
function mtPanelHTML() {
  const s = MT.sel;
  if (!s) return '';
  const c = s.isNew ? null : mtCase(s.id);
  if (!s.isNew && !c) return '';
  const kind = s.isNew ? s.draft.kind : c.kind;
  const title = s.isNew ? 'New ' + MT_KIND[kind].one : c.title;
  const sub = s.isNew ? 'Fill in the details' : `${mtPropName(c)} · ${MT_KIND[c.kind].one}`;
  return `
    <div class="mt-ph">
      <div class="mt-ph__ht"><p class="mt-ph__t" id="mtPanelTitle">${mtEsc(title)}</p><p class="mt-ph__s" id="mtPanelSub">${mtEsc(sub)}</p></div>
      <button type="button" class="mt-ph__x" data-mt="close" aria-label="Close"><i class="ti ti-x" aria-hidden="true"></i></button>
    </div>
    ${s.edit ? mtEditHTML(c, s) : mtReadHTML(c)}
    ${s.isNew ? `<section class="mt-sec"><p class="mt-sec__t">Costs and documents</p><p class="mt-docs-empty">Receipts, photos and documents can be added after Save.</p></section>` : mtCostsHTML(c) + mtDocsHTML(c)}`;
}

function mtReadHTML(c) {
  const f = (k, v, full) => `<div class="mt-f${full ? ' mt-f--full' : ''}"><span class="mt-k">${k}</span>${v}</div>`;
  const v = (t, cls) => (t ? `<span class="mt-v${cls ? ' ' + cls : ''}">${mtEsc(t)}</span>` : '<span class="mt-v mt-mu">—</span>');
  return `
    <section class="mt-sec">
      <p class="mt-sec__t">Details</p>
      <div class="mt-grid">
        ${f('Property', v(mtPropName(c)))}
        ${f('Area', v(c.area))}
        ${f('Type', v(MT_KIND[c.kind].one))}
        ${f('Date', v(mtDate(c.case_date)))}
        ${f('Status', mtPill(c.kind, c.status))}
        ${c.kind === 'schaden' ? f('Paid by', v(mtPaidLabel(c.paid_by))) : ''}
        ${f('Description', v(c.description, 'mt-v--text'), true)}
      </div>
      ${mtActive(c) ? '' : '<div class="cc-sec-foot"><button type="button" class="cc-foot-btn" data-mt="edit"><i class="ti ti-pencil" aria-hidden="true"></i> Edit</button></div>'}
    </section>`;
}

function mtEditHTML(c, s) {
  const d = s.draft || {
    kind: c.kind, title: c.title, property_id: c.property_id, property_name: c.property_name, area: c.area,
    case_date: c.case_date, status: c.status, paid_by: c.paid_by, description: c.description,
  };
  const pid = d.property_id === null || d.property_id === undefined ? '' : String(d.property_id);
  let props = `<option value=""${pid ? '' : ' selected'}>Choose</option>` +
    MT.props.filter(p => p.active !== false || String(p.id) === pid)
      .map(p => `<option value="${mtEsc(p.id)}"${String(p.id) === pid ? ' selected' : ''}>${mtEsc(p.name)}</option>`).join('');
  if (pid && !mtProp(pid)) props += `<option value="${mtEsc(pid)}" selected>${mtEsc(d.property_name || 'Property')} (removed)</option>`;
  const kinds = Object.keys(MT_KIND).map(k => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${MT_KIND[k].one}</option>`).join('');
  const stats = ['open', 'in_progress', 'done'].map(st => `<option value="${st}"${(d.status || 'open') === st ? ' selected' : ''}>${mtStatusLabel(d.kind, st)}</option>`).join('');
  const paid = `<option value=""${d.paid_by ? '' : ' selected'}>—</option>` +
    MT_PAID.map(([v, l]) => `<option value="${v}"${d.paid_by === v ? ' selected' : ''}>${l}</option>`).join('');
  return `
    <section class="mt-sec mt-sec--edit">
      <p class="mt-sec__t">Details</p>
      <div class="mt-grid">
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-title">Title</label>
          <input class="mt-in" id="mtF-title" type="text" maxlength="120" autocomplete="off" value="${mtEsc(d.title || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-prop">Property</label><select class="mt-in" id="mtF-prop">${props}</select></div>
        <div class="mt-f"><label class="mt-k" for="mtF-area">Area</label>
          <input class="mt-in" id="mtF-area" type="text" maxlength="80" autocomplete="off" placeholder="e.g. Bad 1. OG" value="${mtEsc(d.area || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-kind">Type</label><select class="mt-in" id="mtF-kind">${kinds}</select></div>
        <div class="mt-f"><label class="mt-k" for="mtF-date">Date</label><input class="mt-in" id="mtF-date" type="date" value="${mtEsc(d.case_date || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-status">Status</label><select class="mt-in" id="mtF-status">${stats}</select></div>
        <div class="mt-f" data-only="schaden"${d.kind === 'schaden' ? '' : ' hidden'}><label class="mt-k" for="mtF-paid">Paid by</label><select class="mt-in" id="mtF-paid">${paid}</select></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-desc">Description</label>
          <textarea class="mt-in mt-ta" id="mtF-desc" rows="3" maxlength="2000">${mtEsc(d.description || '')}</textarea></div>
      </div>
      <div class="cc-sec-foot">
        ${s.isNew ? '' : '<button type="button" class="cc-foot-btn mt-del is-left" data-mt="del"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>'}
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="cancel">Cancel</button>
          <button type="button" class="cc-foot-btn mt-save" data-mt="save">Save</button>
        </span>
      </div>
    </section>`;
}

function mtRenderPanel() {
  const p = document.getElementById('mtPanel'), sc = document.getElementById('mtScrim'), split = document.getElementById('mtSplit');
  if (!p) return;
  const html = mtPanelHTML();
  if (!html) {
    MT.sel = null;
    p.hidden = true; p.innerHTML = ''; p._key = '';
    if (sc) sc.hidden = true;
    split?.classList.remove('has-panel');
    document.body.classList.remove('mt-panel-open');
    return;
  }
  const who = MT.sel.isNew ? 'new' : String(MT.sel.id);
  const keep = p._key === who ? p.scrollTop : 0;             // same entry → keep the scroll position
  mtCostCapture();                                           // an open cost form keeps what is typed
  p.innerHTML = html;
  p.hidden = false;
  if (sc) sc.hidden = false;
  split?.classList.add('has-panel');
  document.body.classList.add('mt-panel-open');
  p.scrollTop = keep;
  p._key = who;
  // the date field becomes a German field right after it is drawn → note the form after that
  if (MT.sel.edit) { const sel = MT.sel; delete sel.snap; setTimeout(() => { if (MT.sel === sel && sel.edit) sel.snap = mtFormSnap(); }, 0); }
  mtAfterPanel();
}

/* What the form says right now (to notice unsaved changes) */
function mtFormSnap() {
  return ['mtF-title', 'mtF-prop', 'mtF-area', 'mtF-kind', 'mtF-date', 'mtF-status', 'mtF-paid', 'mtF-desc']
    .map(id => { const el = document.getElementById(id); return el ? el.value : ''; })
    .join('\u0001');
}
const mtDirty = () => !!(MT.sel && (
  (MT.sel.edit && MT.sel.snap !== undefined && mtFormSnap() !== MT.sel.snap) ||
  MT.sel.add || (MT.sel.fix && mtFixChanged()) || (MT.sel.cost && mtCostChanged())));

/* Type changed in the form: status words, "Paid by" and the new-entry title follow */
function mtKindChanged() {
  const kind = document.getElementById('mtF-kind')?.value;
  if (!MT_KIND[kind]) return;
  const st = document.getElementById('mtF-status');
  if (st) [...st.options].forEach(o => { o.textContent = mtStatusLabel(kind, o.value); });
  const paid = document.querySelector('#mtPanel [data-only="schaden"]');
  if (paid) paid.hidden = kind !== 'schaden';
  if (MT.sel && MT.sel.isNew) {
    MT.sel.draft.kind = kind;
    const t = document.getElementById('mtPanelTitle');
    if (t) t.textContent = 'New ' + MT_KIND[kind].one;
  }
}

/* Read + check the form. Returns the fields, or null (and says what is missing). */
function mtReadForm() {
  const g = id => document.getElementById(id);
  const bad = (id, msg) => {
    const el = g(id);
    if (el) {
      el.setAttribute('aria-invalid', 'true');
      el.addEventListener('input', () => el.removeAttribute('aria-invalid'), { once: true });
      if (!el.classList.contains('cc-cal')) el.focus();       // a date field would open the calendar on focus
    }
    mtSay(msg);
    return null;
  };
  const title = g('mtF-title').value.trim();
  const pid = g('mtF-prop').value;
  const kind = g('mtF-kind').value;
  const dateEl = g('mtF-date');
  const date = dateEl.value || '';                         // ISO, or '' when empty / not a date
  if (!title) return bad('mtF-title', 'Add a title.');
  if (!pid) return bad('mtF-prop', MT.props.length ? 'Choose the property.' : 'No properties yet. Add them in the Properties app first.');
  if (!date && mtNativeVal(dateEl).trim()) return bad('mtF-date', 'Check the date (TT.MM.JJJJ).');
  const p = mtProp(pid);
  const old = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  return {
    kind: MT_KIND[kind] ? kind : MT.tab,
    title,
    property_id: Number(pid),
    property_name: p ? p.name : ((MT.sel.draft && MT.sel.draft.property_name) || (old && old.property_name) || ''),
    area: g('mtF-area').value.trim() || null,
    case_date: date || null,
    status: g('mtF-status').value || 'open',
    paid_by: kind === 'schaden' ? (g('mtF-paid').value || null) : null,
    description: g('mtF-desc').value.trim() || null,
  };
}

/* ── Panel actions ────────────────────────────────────────── */
async function mtOpen(id) {
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(id) && !MT.sel.edit) return;
  if (MT.sel && !(await mtClose())) return;
  MT.sel = { id, isNew: false, edit: false };
  mtRenderPanel();
  mtRender();
}

async function mtNew() {
  if (MT.sel && !(await mtClose())) return;
  MT.sel = {
    id: null, isNew: true, edit: true,
    draft: { kind: MT.tab, title: '', property_id: '', area: '', case_date: ccTodayISO(), status: 'open', paid_by: '', description: '' },
  };
  mtRenderPanel();
  mtRender();
  if (mtFine()) document.getElementById('mtF-title')?.focus();
}

function mtEdit() {
  if (!MT.sel || MT.sel.isNew || mtActive(mtCase(MT.sel.id))) return;
  MT.sel = { id: MT.sel.id, isNew: false, edit: true };
  mtRenderPanel();
}

function mtCancel() {
  if (!MT.sel) return;
  if (MT.sel.isNew) { mtClose(true); return; }
  MT.sel = { id: MT.sel.id, isNew: false, edit: false };
  mtRenderPanel();
}

/* Close the panel. Unsaved changes → ask first. Returns true when it closed. */
async function mtClose(force) {
  if (!MT.sel) return true;
  if (!force && mtDirty()) {
    const ok = await mtConfirm({ title: 'Discard your changes?', text: 'What you typed in this entry is not saved.', ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok) return false;
  }
  MT.sel = null;
  mtRenderPanel();
  mtRender();
  return true;
}

async function mtSave() {
  const s = MT.sel;
  if (!s || !s.edit || MT.busy) return;
  const f = mtReadForm();
  if (!f) return;
  MT.busy = true;
  const isNew = !!s.isNew, id = isNew ? mtUuid() : s.id;
  const oldRow = isNew ? null : { ...mtCase(id) };
  const now = new Date().toISOString();
  const row = { ...(oldRow || {}), ...f, id, updated_at: now, created_at: oldRow ? oldRow.created_at : now };

  // 1 · show it at once: list + panel back in the read view
  if (isNew) MT.cases.push(row); else Object.assign(mtCase(id), row);
  MT.sel = { id, isNew: false, edit: false };
  if (row.kind !== MT.tab) mtSwitchTab(row.kind); else mtRender();       // type changed → the list follows
  mtRenderPanel();

  // 2 · store it (one retry)
  const sb = _ctlSupa;
  const payload = {
    kind: f.kind, title: f.title, property_id: f.property_id, property_name: f.property_name, area: f.area,
    case_date: f.case_date, status: f.status, paid_by: f.paid_by, description: f.description,
  };
  const r = await mtTry(() => (isNew ? sb.from('maint_cases').insert({ id, ...payload }) : sb.from('maint_cases').update(payload).eq('id', id)));
  MT.busy = false;
  if (!r.error) return;

  // 3 · not stored: everything back as it was, the form comes back with what you typed
  console.error('[maintenance] save failed:', r.error);
  if (isNew) MT.cases = MT.cases.filter(c => c.id !== id);
  else Object.assign(mtCase(id), oldRow);
  MT.sel = { id: isNew ? null : id, isNew, edit: true, draft: { ...f } };
  const backTo = isNew ? MT.tab : oldRow.kind;
  if (backTo !== MT.tab) mtSwitchTab(backTo); else mtRender();
  mtRenderPanel();
  mtSay('Not saved. Check the connection and save again.');
}

async function mtDelete() {
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!c || MT.busy) return;
  if (MT.up && String(MT.up.caseId) === String(c.id)) { mtSay('Wait until the upload is finished.'); return; }
  const n = MT.docs.filter(d => String(d.case_id) === String(c.id)).length;
  const k = MT.costs.filter(r => String(r.case_id) === String(c.id) && !r.return_of).length;
  const parts = [k ? `${k} receipt${k === 1 ? '' : 's'}` : '', n ? `${n} file${n === 1 ? '' : 's'}` : ''].filter(Boolean);
  const ok = await mtConfirm({
    title: 'Delete this entry?',
    text: `"${c.title}"${parts.length ? ' and its ' + parts.join(' and ') : ''} will be deleted for good.`,
    ok: 'Delete', danger: true,
  });
  if (!ok) return;
  MT.busy = true;
  const idx = MT.cases.indexOf(c);
  const docs = MT.docs.filter(d => String(d.case_id) === String(c.id));
  const costs = MT.costs.filter(r => String(r.case_id) === String(c.id));
  MT.cases.splice(idx, 1);
  MT.docs = MT.docs.filter(d => String(d.case_id) !== String(c.id));
  MT.costs = MT.costs.filter(r => String(r.case_id) !== String(c.id));
  MT.sel = null;
  mtRenderPanel();
  mtRender();

  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_cases').delete().eq('id', c.id));      // its cost + document rows go with it
  MT.busy = false;
  if (r.error) {
    console.error('[maintenance] delete failed:', r.error);
    MT.cases.splice(idx, 0, c);
    MT.docs.push(...docs);
    MT.costs.push(...costs);
    mtRender();
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  const paths = docs.flatMap(mtFilesOf);
  if (paths.length) {
    try { await sb.storage.from(MT_BUCKET).remove(paths); }
    catch (e) { console.warn('[maintenance] files not removed:', e); }
  }
  mtSay('Deleted');
}

/* ── Documents ────────────────────────────────────────────── */
const mtThumbPath = p => String(p || '').replace(/^([^/]+)\//, '$1/thumbs/');            // <case>/thumbs/<id>.jpg
const mtFilesOf = d => (d.doc_type === 'photo' ? [d.file_path, mtThumbPath(d.file_path)] : [d.file_path]).filter(Boolean);
const mtDocsOf = caseId => MT.docs.filter(d => String(d.case_id) === String(caseId));
const mtIsImage = f => /^image\//.test(f.type || '') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(f.name || '');
const mtIsPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const mtLinkNow = p => { const l = MT.links[p]; return l && l.exp > Date.now() + 5000 ? l.url : null; };
/* Something in the panel is open or running (an edit, a form, an upload) → the other buttons wait */
const mtUpFor = c => (c && MT.up && String(MT.up.caseId) === String(c.id) ? MT.up : null);
const mtActive = c => !!(MT.sel && (MT.sel.edit || MT.sel.docEdit || MT.sel.add || MT.sel.fix || MT.sel.cost || mtUpFor(c)));
/* Documents of the Documents section (files of cost rows live in Costs) */
const mtCaseDocs = caseId => MT.docs.filter(d => String(d.case_id) === String(caseId) && !d.cost_id);

/* Angebot, Schadenbericht … from the file name (you can change it); invoices belong in Costs */
function mtGuessType(name, isImg) {
  const n = String(name || '').toLowerCase();
  if (/angebot|kostenvoranschlag|\bkva?\b|offer|quote/.test(n)) return 'angebot';
  if (/schaden|bericht|gutachten|report/.test(n)) return 'schadenbericht';
  return isImg ? 'photo' : 'other';
}
/* The day a photo was taken (file date), else today */
function mtFileDay(f) {
  const t = Number(f && f.lastModified);
  const day = t ? ccDayOf(new Date(t)) : '';
  return day && day <= ccTodayISO() && day >= '2000-01-01' ? day : ccTodayISO();
}
/* Photo → JPEG, longest side max px (null if the browser cannot read it) */
function mtShrink(file, max, quality) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      cv.toBlob(b => resolve(b || null), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/* Short-lived private links (1 hour) for the files of the open entry */
async function mtPrepareLinks(paths) {
  const need = [...new Set(paths.filter(p => p && !mtLinkNow(p)))];
  if (!need.length) return;
  try {
    const { data, error } = await _ctlSupa.storage.from(MT_BUCKET).createSignedUrls(need, 3600);
    if (error) throw error;
    (data || []).forEach(x => { if (x && x.signedUrl && x.path) MT.links[x.path] = { url: x.signedUrl, exp: Date.now() + 3500 * 1000 }; });
  } catch (e) { console.warn('[maintenance] links:', e); }
}
function mtFillThumbs() {
  document.querySelectorAll('#mtPanel img[data-path]').forEach(img => {
    if (img.getAttribute('src')) return;
    const thumb = mtLinkNow(img.dataset.thumb), full = mtLinkNow(img.dataset.path);
    if (thumb) {
      img.onerror = () => { const f = mtLinkNow(img.dataset.path); img.onerror = null; if (f) img.src = f; };   // no preview → the photo itself
      img.src = thumb;
    } else if (full) img.src = full;
  });
}
function mtAfterPanel() {
  const c = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  if (!c) return;
  const paths = mtDocsOf(c.id).flatMap(mtFilesOf);
  mtFillThumbs();
  if (paths.length) mtPrepareLinks(paths).then(mtFillThumbs);
}

/* Tap on a file → opens on top of the app (iPhone viewer / new tab) */
function mtOpenUrl(url) {
  let w = null;
  try { w = window.open(url, '_blank'); } catch (e) { w = null; }
  if (w) { try { w.opener = null; } catch (e) {} return; }
  location.assign(url);                                   // pop-ups blocked: open it here (Back returns)
}
function mtOpenDoc(id) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d) return;
  const ready = mtLinkNow(d.file_path);
  if (ready) { mtOpenUrl(ready); return; }
  let w = null;                                           // open the tab inside the tap, fill it when the link is there
  try { w = window.open('', '_blank'); } catch (e) { w = null; }
  mtPrepareLinks([d.file_path]).then(() => {
    const url = mtLinkNow(d.file_path);
    if (!url) { try { if (w) w.close(); } catch (e) {} mtSay('The file could not be opened. Try again.'); return; }
    if (w) { try { w.location.replace(url); return; } catch (e) {} }
    mtOpenUrl(url);
  });
}

/* ── Documents: drawing ── */
function mtDocsHTML(c) {
  const s = MT.sel, docs = mtCaseDocs(c.id);
  const byDate = (a, b) => String(a.doc_date || '').localeCompare(String(b.doc_date || '')) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  const photos = docs.filter(d => d.doc_type === 'photo').sort(byDate);
  const files = docs.filter(d => d.doc_type !== 'photo')
    .sort((a, b) => MT_DOC_ORDER.indexOf(a.doc_type) - MT_DOC_ORDER.indexOf(b.doc_type) || byDate(a, b));
  const locked = !!(s.edit || s.cost);                     // Details / a cost row in edit → documents only to look at
  const ed = !!s.docEdit && !locked;
  const upAny = mtUpFor(c), up = upAny && upAny.where !== 'costs' ? upAny : null;

  let h = '<section class="mt-sec" id="mtDocs"><p class="mt-sec__t">Documents</p>';
  if (s.add && !locked) h += mtDocFormHTML('mtA', s.add, s.add.name, s.add.isImg, 'add');
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!docs.length && !s.add && !up) h += '<p class="mt-docs-empty">No photos or documents yet.</p>';
  if (photos.length) {
    h += `<p class="mt-k mt-gl">Photos (${photos.length})</p><div class="mt-pg">` + photos.map(p => `
      <div class="mt-pt">
        <button type="button" class="mt-pt__open" data-mt="${ed ? 'none' : 'openDoc'}" data-id="${mtEsc(p.id)}" aria-label="Photo ${mtEsc(mtDate(p.doc_date))}"${ed ? ' tabindex="-1"' : ''}>
          <img alt="" loading="lazy" data-path="${mtEsc(p.file_path)}" data-thumb="${mtEsc(mtThumbPath(p.file_path))}"/></button>
        ${ed ? `<button type="button" class="mt-x" data-mt="delDoc" data-id="${mtEsc(p.id)}" aria-label="Delete photo"><i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
      </div>`).join('') + '</div>';
  }
  if (files.length) {
    h += '<div class="mt-dl">' + files.map(d => (s.fix === String(d.id) && !locked)
      ? mtDocFormHTML('mtX', { type: d.doc_type, amount: d.amount, date: d.doc_date }, d.file_name || MT_DOC[d.doc_type].label, false, 'fix')
      : mtDocRowHTML(d, ed)).join('') + '</div>';
  }
  if (ed && !s.fix) h += '<p class="mt-hint">Tap a document to change its type, Betrag or date. The × deletes it.</p>';
  if (!locked && !s.add && !s.fix && !upAny) {
    h += ed
      ? '<div class="cc-sec-foot"><button type="button" class="cc-foot-btn mt-save" data-mt="docsDone">Done</button></div>'
      : `<div class="cc-sec-foot">
          <span class="is-left mt-foot-l">
            <button type="button" class="cc-foot-btn" data-mt="photos"><i class="ti ti-camera" aria-hidden="true"></i> Photos</button>
            <button type="button" class="cc-foot-btn" data-mt="upload"><i class="ti ti-upload" aria-hidden="true"></i> Upload</button>
          </span>
          ${docs.length ? '<button type="button" class="cc-foot-btn" data-mt="docsEdit"><i class="ti ti-pencil" aria-hidden="true"></i> Edit</button>' : '<span aria-hidden="true"></span>'}
        </div>`;
  }
  return h + '</section>';
}

function mtDocRowHTML(d, ed) {
  const t = MT_DOC[d.doc_type] || MT_DOC.other;
  const sub = [d.file_name, mtDate(d.doc_date)].filter(Boolean).map(mtEsc).join(' · ');
  return `<div class="mt-dr">
      <button type="button" class="mt-dr__main" data-mt="${ed ? 'fixDoc' : 'openDoc'}" data-id="${mtEsc(d.id)}">
        <span class="mt-di"><i class="ti ${t.icon}" aria-hidden="true"></i></span>
        <span class="mt-dn"><span class="mt-dt">${t.label}</span>${sub ? `<span class="mt-ds">${sub}</span>` : ''}</span>
        ${d.doc_type === 'rechnung' ? `<span class="mt-da">${mtEur(d.amount)}</span>` : ''}
      </button>
      ${ed ? `<button type="button" class="mt-x" data-mt="delDoc" data-id="${mtEsc(d.id)}" aria-label="Delete ${t.label}"><i class="ti ti-x" aria-hidden="true"></i></button>` : ''}
    </div>`;
}

/* One form for a new file (pre = mtA) and for fixing one (pre = mtX) */
function mtDocFormHTML(pre, v, name, isImg, mode) {
  const types = [...(v.type === 'rechnung' ? ['rechnung'] : []), 'angebot', 'schadenbericht', ...(isImg || v.type === 'photo' ? ['photo'] : []), 'other'];
  const isRe = v.type === 'rechnung';
  const amt = v.amount === null || v.amount === undefined || v.amount === '' ? '' : String(v.amount);
  return `<div class="mt-ab" id="${pre}-form">
      <div class="mt-fc"><i class="ti ${isImg ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i><span>${mtEsc(name)}</span></div>
      <div class="mt-grid">
        <div class="mt-f"><label class="mt-k" for="${pre}-type">Type</label>
          <select class="mt-in" id="${pre}-type" data-doc-type="${pre}">${types.map(t => `<option value="${t}"${v.type === t ? ' selected' : ''}>${MT_DOC[t].label}</option>`).join('')}</select></div>
        <div class="mt-f" data-only-re="${pre}"${isRe ? '' : ' hidden'}><label class="mt-k" for="${pre}-amount">Betrag (€)</label>
          <input class="mt-in" id="${pre}-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="${pre}-date" id="${pre}-dateLbl">${isRe ? 'Rechnungsdatum' : 'Date'}</label>
          <input class="mt-in" id="${pre}-date" type="date" value="${mtEsc(v.date || '')}"/></div>
      </div>
      <div class="cc-sec-foot"><span class="cc-foot-right">
        <button type="button" class="cc-foot-btn" data-mt="${mode}Cancel">Cancel</button>
        <button type="button" class="cc-foot-btn mt-save" data-mt="${mode}Save">Save</button>
      </span></div>
    </div>`;
}
/* Type changed in a document form: Betrag only for a Rechnung */
function mtDocTypeChanged(pre) {
  const t = document.getElementById(pre + '-type')?.value;
  const box = document.querySelector(`#mtPanel [data-only-re="${pre}"]`);
  if (box) box.hidden = t !== 'rechnung';
  const lbl = document.getElementById(pre + '-dateLbl');
  if (lbl) lbl.textContent = t === 'rechnung' ? 'Rechnungsdatum' : 'Date';
}
/* Read + check a document form → { type, amount, date } or null */
function mtReadDocForm(pre) {
  const g = id => document.getElementById(pre + '-' + id);
  const type = g('type').value;
  const amtEl = g('amount'), dateEl = g('date');
  const date = dateEl.value || '';
  const fail = (el, msg) => { if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); return null; };
  let amount = null;
  if (type === 'rechnung') {
    const raw = amtEl.value;                               // "1250.5" (German field) or ''
    if (raw === '' || !isFinite(Number(raw))) return fail(amtEl, 'Enter the Betrag of the Rechnung.');
    amount = Math.round(Number(raw) * 100) / 100;
  }
  if (!date && mtNativeVal(dateEl).trim()) return fail(dateEl, 'Check the date (TT.MM.JJJJ).');
  if (type === 'rechnung' && !date) return fail(dateEl, 'Enter the Rechnungsdatum.');
  return { type, amount, date: date || null };
}
function mtFixChanged() {
  const d = MT.docs.find(x => String(x.id) === String(MT.sel && MT.sel.fix));
  const t = document.getElementById('mtX-type');
  if (!d || !t) return false;
  const a = document.getElementById('mtX-amount'), dt = document.getElementById('mtX-date');
  const amt = t.value === 'rechnung' ? (a && a.value !== '' ? Math.round(Number(a.value) * 100) / 100 : null) : null;
  const was = d.doc_type === 'rechnung' && d.amount !== null && d.amount !== undefined ? Math.round(Number(d.amount) * 100) / 100 : null;
  return t.value !== d.doc_type || amt !== was || (dt ? dt.value || null : null) !== (d.doc_date || null);
}

/* ── Documents: actions ── */
function mtFileInput(id, accept, multiple, onPick) {
  let inp = document.getElementById(id);
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = id; inp.accept = accept; inp.multiple = multiple;
    inp.style.display = 'none'; inp.setAttribute('aria-hidden', 'true');
    inp.addEventListener('change', () => { const files = [...(inp.files || [])]; inp.value = ''; if (files.length) onPick(files); });
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.click();
}
const mtOpenCase = () => (MT.sel && !MT.sel.isNew && !MT.sel.edit ? mtCase(MT.sel.id) : null);
function mtRefresh(caseId) {
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(caseId)) mtRenderPanel();
  mtRender();
}

/* Photos: camera or library, several at once → saved as photos right away */
function mtPickPhotos() {
  if (!mtOpenCase()) return;
  if (MT.up) { mtSay('Wait until the upload is finished.'); return; }
  mtFileInput('mtPhotoInput', 'image/*', true, mtAddPhotos);
}
async function mtAddPhotos(files) {
  const c = mtOpenCase();
  if (!c || MT.up) return;
  const imgs = files.filter(mtIsImage);
  if (!imgs.length) { mtSay('Choose photos (JPG, PNG or HEIC).'); return; }
  MT.up = { caseId: c.id, total: imgs.length, done: 0, where: 'docs' };
  mtRefresh(c.id);
  let ok = 0;
  for (const f of imgs) {
    if (await mtUploadOne(c, f, { type: 'photo', amount: null, date: mtFileDay(f) })) ok++;
    MT.up.done++;
    mtRefresh(c.id);
  }
  MT.up = null;
  mtRefresh(c.id);
  if (ok === imgs.length) mtSay(ok === 1 ? 'Photo saved' : ok + ' photos saved');
  else mtSay(`${ok} of ${imgs.length} photos saved. Add the others again.`);
}

/* Upload: one file → its Type (+ Betrag and Rechnungsdatum for a Rechnung) → Save */
function mtPickFile() {
  if (!mtOpenCase()) return;
  if (MT.up) { mtSay('Wait until the upload is finished.'); return; }
  mtFileInput('mtFileInput', 'application/pdf,image/*', false, files => {
    const f = files[0], c = mtOpenCase();
    if (!f || !c) return;
    if (!mtIsPdf(f) && !mtIsImage(f)) { mtSay('Choose a PDF or a photo.'); return; }
    if (f.size > MT_MAX_MB * 1024 * 1024) { mtSay(`This file is too big (max ${MT_MAX_MB} MB).`); return; }
    MT.sel.docEdit = false; MT.sel.fix = null;
    MT.sel.add = { file: f, name: f.name || 'Document', isImg: mtIsImage(f), type: mtGuessType(f.name, mtIsImage(f)), amount: '', date: ccTodayISO() };
    mtRenderPanel();
    document.getElementById('mtDocs')?.scrollIntoView({ block: 'nearest' });
  });
}
async function mtAddSave() {
  const s = MT.sel, c = mtOpenCase();
  if (!s || !s.add || !c || MT.up) return;
  const v = mtReadDocForm('mtA');
  if (!v) return;
  const add = s.add;
  s.add = null;
  MT.up = { caseId: c.id, total: 1, done: 0, where: 'docs' };
  mtRefresh(c.id);
  const ok = await mtUploadOne(c, add.file, v);
  MT.up = null;
  if (!ok && MT.sel && String(MT.sel.id) === String(c.id)) MT.sel.add = { ...add, type: v.type, amount: v.amount ?? '', date: v.date };   // the form comes back
  mtRefresh(c.id);
  mtSay(ok ? MT_DOC[v.type].label + ' saved' : 'Not uploaded. Check the connection and try again.');
}

/* Store one file: shrink a photo → upload (one retry) → its row; nothing is left half-saved */
async function mtUploadOne(c, file, v, extra) {
  const sb = _ctlSupa, store = sb.storage.from(MT_BUCKET);
  const id = mtUuid(), img = mtIsImage(file);
  let blob = file, ext = (String(file.name || '').match(/\.([a-z0-9]{1,5})$/i) || [, img ? 'jpg' : 'pdf'])[1].toLowerCase();
  let type = file.type || (mtIsPdf(file) ? 'application/pdf' : 'application/octet-stream');
  if (img) {
    const small = await mtShrink(file, 2000, 0.85);
    if (small) { blob = small; ext = 'jpg'; type = 'image/jpeg'; }
  }
  const path = `${c.id}/${id}.${ext}`;
  const put = (p, b, t) => mtTry(async () => {
    const r = await store.upload(p, b, { contentType: t, upsert: false, cacheControl: '3600' });
    if (r && r.error && /exist|duplicate|409/i.test(String(r.error.message || r.error.statusCode || ''))) return {};   // first try did arrive
    return r;
  });
  const up = await put(path, blob, type);
  if (up.error) { console.error('[maintenance] upload failed:', up.error); return false; }
  if (v.type === 'photo' && img) {                         // small preview for the photo grid (best effort)
    const thumb = await mtShrink(file, 360, 0.7);
    if (thumb) await put(mtThumbPath(path), thumb, 'image/jpeg');
  }
  const row = {
    id, case_id: c.id, doc_type: v.type, file_path: path,
    file_name: String(file.name || (img ? 'Photo.jpg' : 'Document')).slice(0, 180),
    amount: v.type === 'rechnung' ? v.amount : null, doc_date: v.date || null,
    ...(extra || {}),
  };
  const ins = await mtTry(() => sb.from('maint_docs').insert(row));
  if (ins.error) {
    console.error('[maintenance] document row failed:', ins.error);
    try { await store.remove([path, mtThumbPath(path)]); } catch (e) {}
    return false;
  }
  MT.docs.push({ ...row, created_at: new Date().toISOString() });
  return true;
}

/* Fix a file: Type / Betrag / date */
async function mtFixSave() {
  const s = MT.sel, d = s && MT.docs.find(x => String(x.id) === String(s.fix));
  if (!d) return;
  const v = mtReadDocForm('mtX');
  if (!v) return;
  const before = { doc_type: d.doc_type, amount: d.amount, doc_date: d.doc_date };
  const patch = { doc_type: v.type, amount: v.type === 'rechnung' ? v.amount : null, doc_date: v.date };
  Object.assign(d, patch);
  s.fix = null;
  mtRefresh(d.case_id);
  const r = await mtTry(() => _ctlSupa.from('maint_docs').update(patch).eq('id', d.id));
  if (!r.error) return;
  console.error('[maintenance] document change failed:', r.error);
  Object.assign(d, before);
  if (MT.sel && String(MT.sel.id) === String(d.case_id)) { MT.sel.docEdit = true; MT.sel.fix = String(d.id); }
  mtRefresh(d.case_id);
  mtSay('Not saved. Check the connection and save again.');
}

async function mtDelDoc(id) {
  const d = MT.docs.find(x => String(x.id) === String(id));
  if (!d) return;
  const label = d.doc_type === 'photo' ? 'photo' : MT_DOC[d.doc_type].label;
  const ok = await mtConfirm({ title: `Delete this ${label}?`, text: `${d.file_name || label} will be deleted for good.`, ok: 'Delete', danger: true });
  if (!ok) return;
  const idx = MT.docs.indexOf(d);
  MT.docs.splice(idx, 1);
  if (MT.sel && !mtDocsOf(d.case_id).length) MT.sel.docEdit = false;    // nothing left to edit
  mtRefresh(d.case_id);
  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_docs').delete().eq('id', d.id));
  if (r.error) {
    console.error('[maintenance] document delete failed:', r.error);
    MT.docs.splice(idx, 0, d);
    mtRefresh(d.case_id);
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  try { await sb.storage.from(MT_BUCKET).remove(mtFilesOf(d)); } catch (e) { console.warn('[maintenance] file not removed:', e); }
}

/* ── Costs (D1) ───────────────────────────────────────────────
   One row = one receipt / invoice: Receipt no. · Description · Brand / Provider ·
   Amount · Date · Photos. Grouped Self-bought / Provider. A tap on a row opens it
   in place (one form at a time); its photos / PDFs are added in the form and
   stored on Save. Returns (D2) are rows with return_of = their receipt. */
const mtCostsOf = caseId => MT.costs.filter(r => String(r.case_id) === String(caseId));
const mtCostFiles = costId => MT.docs.filter(d => String(d.cost_id) === String(costId));
const mtCostByDate = (a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')) ||
                               String(a.created_at || '').localeCompare(String(b.created_at || ''));

function mtCostsHTML(c) {
  const s = MT.sel, f = s.cost;
  const rows = mtCostsOf(c.id);
  const busy = !!(s.edit || s.docEdit || s.add || s.fix);          // another part of the panel is being changed
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'costs' ? upAny : null;
  const tap = !busy && !f && !upAny;
  let h = '<section class="mt-sec mt-costs" id="mtCosts"><p class="mt-sec__t">Costs</p>';
  if (f && f.isNew) h += mtCostFormHTML(f);
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!rows.length && !(f && f.isNew)) h += '<p class="mt-docs-empty">No receipts yet.</p>';

  Object.keys(MT_COST).forEach(kind => {
    const list = rows.filter(r => r.kind === kind && !r.return_of).sort(mtCostByDate);
    if (!list.length) return;
    h += `<div class="mt-cg">
      <div class="mt-cg__h"><span class="mt-cg__t">${MT_COST[kind].label} · ${list.length}</span><span class="mt-cg__s">${mtEur(mtCost([c.id], null, kind))}</span></div>
      <div class="mt-ch" aria-hidden="true"><span>Receipt no.</span><span>Description</span><span>${MT_COST[kind].who}</span><span class="r">Amount</span><span>Date</span><span></span></div>
      ${list.map(r => (f && !f.isNew && String(f.id) === String(r.id)) ? mtCostFormHTML(f) : mtCostRowHTML(r, tap)).join('')}
    </div>`;
  });
  if (rows.length) h += `<div class="mt-su"><span>Kosten</span><b>${mtEur(mtCost([c.id]))}</b></div>`;
  if (!busy && !f && !upAny) {
    h += `<div class="cc-sec-foot">
      <span class="is-left mt-foot-l">
        <button type="button" class="cc-foot-btn" data-mt="costNew" data-k="self"><i class="ti ti-plus" aria-hidden="true"></i> Self-bought</button>
        <button type="button" class="cc-foot-btn" data-mt="costNew" data-k="provider"><i class="ti ti-plus" aria-hidden="true"></i> Provider</button>
      </span><span aria-hidden="true"></span>
    </div>`;
  }
  return h + '</section>';
}

function mtCostRowHTML(r, tap) {
  const n = mtCostFiles(r.id).length;
  return `<button type="button" class="mt-cr" data-mt="${tap ? 'costEdit' : 'none'}" data-id="${mtEsc(r.id)}"${tap ? '' : ' tabindex="-1"'}>
      <span class="mt-cr__a"><span class="mt-cr__no">${mtEsc(r.receipt_no || '—')}</span><span class="mt-cr__desc">${mtEsc(r.description || '')}</span></span>
      <span class="mt-cr__amt">${mtEur(r.amount)}</span>
      <span class="mt-cr__b"><span class="mt-cr__who">${mtEsc(r.brand || '')}</span><span class="mt-cr__date">${mtEsc(mtDate(r.cost_date))}</span></span>
      <span class="mt-cr__f">${n ? `<i class="ti ti-paperclip" aria-hidden="true"></i>${n}` : ''}</span>
    </button>`;
}

function mtCostFormHTML(f) {
  const amt = f.amount === null || f.amount === undefined || f.amount === '' ? '' : String(f.amount);
  const chips = f.files.map((x, i) => `
      <span class="mt-chip${x.file ? ' is-new' : ''}">
        ${x.id ? `<button type="button" class="mt-chip__n" data-mt="openDoc" data-id="${mtEsc(x.id)}">` : '<span class="mt-chip__n">'}<i class="ti ${x.img ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i>${mtEsc(x.name)}${x.id ? '</button>' : '</span>'}
        <button type="button" class="mt-chip__x" data-mt="costFileDel" data-i="${i}" aria-label="Remove ${mtEsc(x.name)}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>`).join('');
  return `<div class="mt-ab mt-cf-form" id="mtC-form">
      <div class="mt-seg" role="group" aria-label="Type">
        ${Object.keys(MT_COST).map(k => `<button type="button" class="mt-seg__b${f.kind === k ? ' is-on' : ''}" data-mt="costKind" data-k="${k}" aria-pressed="${f.kind === k}">${MT_COST[k].label}</button>`).join('')}
      </div>
      <div class="mt-grid">
        <div class="mt-f"><label class="mt-k" for="mtC-no">Receipt no.</label>
          <input class="mt-in" id="mtC-no" type="text" maxlength="60" autocomplete="off" value="${mtEsc(f.receipt_no || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-desc">Description</label>
          <input class="mt-in" id="mtC-desc" type="text" maxlength="160" autocomplete="off" value="${mtEsc(f.description || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-who" id="mtC-whoLbl">${MT_COST[f.kind].who}</label>
          <input class="mt-in" id="mtC-who" type="text" maxlength="80" autocomplete="off" value="${mtEsc(f.brand || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-amount">Amount (€)</label>
          <input class="mt-in" id="mtC-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-date">Date</label>
          <input class="mt-in" id="mtC-date" type="date" value="${mtEsc(f.cost_date || '')}"/></div>
        <div class="mt-f mt-f--full"><span class="mt-k">Photos</span>
          <div class="mt-chips">${chips}
            <button type="button" class="mt-chip mt-chip--add" data-mt="costFile"><i class="ti ti-camera" aria-hidden="true"></i> Photo / PDF</button>
          </div></div>
      </div>
      <div class="cc-sec-foot">
        ${f.isNew ? '' : '<button type="button" class="cc-foot-btn mt-del is-left" data-mt="costDel"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>'}
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="costCancel">Cancel</button>
          <button type="button" class="cc-foot-btn mt-save" data-mt="costSave">Save</button>
        </span>
      </div>
    </div>`;
}

/* What is typed in the open cost form → its state (so a redraw keeps it) */
function mtCostCapture() {
  const f = MT.sel && MT.sel.cost;
  if (!f || !document.getElementById('mtC-form')) return;
  const g = id => document.getElementById(id);
  f.receipt_no = g('mtC-no').value;
  f.description = g('mtC-desc').value;
  f.brand = g('mtC-who').value;
  f.amount = g('mtC-amount').value;                         // "1250.5" (German field) or ''
  f.cost_date = g('mtC-date').value || '';
}
const mtCostSnapOf = f => JSON.stringify([f.kind, f.receipt_no || '', f.description || '', f.brand || '', String(f.amount ?? ''), f.cost_date || '',
  f.files.map(x => x.id || x.name).join('|')]);
function mtCostChanged() {
  const f = MT.sel && MT.sel.cost;
  if (!f) return false;
  mtCostCapture();
  return mtCostSnapOf(f) !== f.snap;
}

function mtCostNew(kind) {
  const c = mtOpenCase();
  if (!c || mtActive(c)) return;
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: MT_COST[kind] ? kind : 'self', receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO(), files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
  document.getElementById('mtCosts')?.scrollIntoView({ block: 'nearest' });
  if (mtFine()) document.getElementById('mtC-no')?.focus();
}
function mtCostEdit(id) {
  const c = mtOpenCase(), r = MT.costs.find(x => String(x.id) === String(id));
  if (!c || !r || mtActive(c)) return;
  MT.sel.cost = { isNew: false, id: r.id, kind: r.kind, receipt_no: r.receipt_no || '', description: r.description || '', brand: r.brand || '',
    amount: r.amount ?? '', cost_date: r.cost_date || '', delIds: [],
    files: mtCostFiles(r.id).map(d => ({ id: d.id, name: d.file_name || 'File', img: d.file_path && /\.(jpe?g|png|webp|heic|gif)$/i.test(d.file_path) })) };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
}
function mtCostKind(kind) {
  const f = MT.sel && MT.sel.cost;
  if (!f || !MT_COST[kind]) return;
  f.kind = kind;
  document.querySelectorAll('#mtC-form .mt-seg__b').forEach(b => { const on = b.dataset.k === kind; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  const l = document.getElementById('mtC-whoLbl');
  if (l) l.textContent = MT_COST[kind].who;
}
function mtCostPickFiles() {
  const f = MT.sel && MT.sel.cost;
  if (!f) return;
  mtFileInput('mtCostInput', 'image/*,application/pdf', true, files => {
    const g = MT.sel && MT.sel.cost;
    if (!g) return;
    const ok = files.filter(x => (mtIsImage(x) || mtIsPdf(x)) && x.size <= MT_MAX_MB * 1024 * 1024);
    if (ok.length < files.length) mtSay(`Only photos and PDFs up to ${MT_MAX_MB} MB.`);
    mtCostCapture();
    ok.forEach(x => g.files.push({ id: null, file: x, name: x.name || (mtIsImage(x) ? 'Photo.jpg' : 'Document.pdf'), img: mtIsImage(x) }));
    mtRenderPanel();
  });
}
function mtCostFileDel(i) {
  const f = MT.sel && MT.sel.cost;
  if (!f || !f.files[i]) return;
  mtCostCapture();
  const [x] = f.files.splice(i, 1);
  if (x.id) f.delIds.push(x.id);
  mtRenderPanel();
}
function mtCostCancel() {
  if (!MT.sel) return;
  MT.sel.cost = null;
  mtRenderPanel();
}

async function mtCostSave() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || MT.busy) return;
  mtCostCapture();
  const g = id => document.getElementById(id);
  const fail = (id, msg) => { const el = g(id); if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); };
  const amount = f.amount === '' || !isFinite(Number(f.amount)) ? null : Math.round(Number(f.amount) * 100) / 100;
  if (!String(f.receipt_no).trim() && !String(f.description).trim()) return fail('mtC-no', 'Enter the receipt no. or a description.');
  if (amount === null || amount < 0) return fail('mtC-amount', 'Enter the amount.');
  if (!f.cost_date) return fail('mtC-date', mtNativeVal(g('mtC-date')).trim() ? 'Check the date (TT.MM.JJJJ).' : 'Enter the date.');

  MT.busy = true;
  const isNew = f.isNew, id = f.id;
  const now = new Date().toISOString();
  const old = isNew ? null : { ...MT.costs.find(x => String(x.id) === String(id)) };
  const row = {
    id, case_id: c.id, kind: f.kind, receipt_no: String(f.receipt_no).trim() || null, description: String(f.description).trim() || null,
    brand: String(f.brand).trim() || null, amount, cost_date: f.cost_date, return_of: old ? old.return_of || null : null,
  };
  const pending = f.files.filter(x => x.file), dels = f.delIds.slice();

  // 1 · show it at once
  if (isNew) MT.costs.push({ ...row, created_at: now, updated_at: now });
  else Object.assign(MT.costs.find(x => String(x.id) === String(id)), row, { updated_at: now });
  s.cost = null;
  if (pending.length) MT.up = { caseId: c.id, total: pending.length, done: 0, where: 'costs' };
  mtRefresh(c.id);

  // 2 · store the row (one retry)
  const sb = _ctlSupa;
  const { id: _id, ...fields } = row;
  const r = await mtTry(() => (isNew ? sb.from('maint_costs').insert(row) : sb.from('maint_costs').update(fields).eq('id', id)));
  if (r.error) {
    console.error('[maintenance] cost save failed:', r.error);
    if (isNew) MT.costs = MT.costs.filter(x => String(x.id) !== String(id));
    else Object.assign(MT.costs.find(x => String(x.id) === String(id)), old);
    MT.up = null;
    MT.busy = false;
    if (MT.sel && String(MT.sel.id) === String(c.id)) MT.sel.cost = f;          // the form comes back with what you typed
    mtRefresh(c.id);
    mtSay('Not saved. Check the connection and save again.');
    return;
  }

  // 3 · files: removed ones go, new ones are stored with the row
  for (const docId of dels) {
    const d = MT.docs.find(x => String(x.id) === String(docId));
    if (!d) continue;
    MT.docs = MT.docs.filter(x => x !== d);
    const del = await mtTry(() => sb.from('maint_docs').delete().eq('id', d.id));
    if (del.error) { MT.docs.push(d); continue; }
    try { await sb.storage.from(MT_BUCKET).remove(mtFilesOf(d)); } catch (e) { console.warn('[maintenance] file not removed:', e); }
  }
  let failed = 0;
  for (const x of pending) {
    const ok = await mtUploadOne(c, x.file, { type: 'receipt', amount: null, date: row.cost_date }, { cost_id: id });
    if (!ok) failed++;
    if (MT.up) MT.up.done++;
    mtRefresh(c.id);
  }
  MT.up = null;
  MT.busy = false;
  mtRefresh(c.id);
  if (failed) mtSay(`${pending.length - failed} of ${pending.length} files saved. Add the others again.`);
}

async function mtCostDelete() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  const r0 = f && !f.isNew ? MT.costs.find(x => String(x.id) === String(f.id)) : null;
  if (!r0 || !c || MT.busy) return;
  const files = mtCostFiles(r0.id);
  const name = r0.receipt_no ? 'Receipt ' + r0.receipt_no : (r0.description || 'This receipt');
  const ok = await mtConfirm({ title: 'Delete this receipt?', text: `${name}${files.length ? ` and its ${files.length} file${files.length === 1 ? '' : 's'}` : ''} will be deleted for good.`, ok: 'Delete', danger: true });
  if (!ok) return;
  MT.busy = true;
  const rows = MT.costs.filter(x => String(x.id) === String(r0.id) || String(x.return_of) === String(r0.id));   // with its returns
  const docs = MT.docs.filter(d => rows.some(x => String(x.id) === String(d.cost_id)));
  MT.costs = MT.costs.filter(x => !rows.includes(x));
  MT.docs = MT.docs.filter(d => !docs.includes(d));
  s.cost = null;
  mtRefresh(c.id);
  const sb = _ctlSupa;
  const r = await mtTry(() => sb.from('maint_costs').delete().eq('id', r0.id));          // its returns + file rows go with it
  MT.busy = false;
  if (r.error) {
    console.error('[maintenance] cost delete failed:', r.error);
    MT.costs.push(...rows);
    MT.docs.push(...docs);
    mtRefresh(c.id);
    mtSay('Not deleted. Check the connection and try again.');
    return;
  }
  const paths = docs.flatMap(mtFilesOf);
  if (paths.length) { try { await sb.storage.from(MT_BUCKET).remove(paths); } catch (e) { console.warn('[maintenance] files not removed:', e); } }
}

/* ── In-app confirm sheet (instead of confirm()) ─────────────
   mtConfirm({ title, text, ok, cancel, danger }) → Promise<boolean> */
function mtConfirm(o) {
  return new Promise(resolve => {
    document.getElementById('mtConfirm')?.remove();
    const h = document.createElement('div');
    h.id = 'mtConfirm';
    h.className = 'mt-cf';
    h.innerHTML = `<div class="mt-cf__bg" data-v="0"></div>
      <div class="mt-cf__s" role="alertdialog" aria-modal="true" aria-labelledby="mtCfT">
        <p class="mt-cf__t" id="mtCfT">${mtEsc(o.title || 'Are you sure?')}</p>
        ${o.text ? `<p class="mt-cf__x">${mtEsc(o.text)}</p>` : ''}
        <div class="mt-cf__b">
          <button type="button" class="mt-btn ${o.danger ? 'mt-btn--d' : 'mt-btn--p'}" data-v="1">${mtEsc(o.ok || 'OK')}</button>
          <button type="button" class="mt-btn mt-btn--s" data-v="0">${mtEsc(o.cancel || 'Cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(h);
    const done = v => { document.removeEventListener('keydown', key, true); h.remove(); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(false); } };
    document.addEventListener('keydown', key, true);
    h.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { e.stopPropagation(); done(b.dataset.v === '1'); } });
    setTimeout(() => h.querySelector('[data-v="1"]')?.focus(), 0);
  });
}

/* ── Wiring ───────────────────────────────────────────────── */
function mtWire() {
  document.querySelectorAll('#appTabs .cc-tab').forEach(b => {
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => mtTabClick(b.dataset.tab));
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mt]');
    if (!b || MT.loadError) return;
    const a = b.dataset.mt;
    if (a === 'new') mtNew();
    else if (a === 'open') mtOpen(b.dataset.id);
    else if (a === 'fold') { MT.open[b.dataset.key] = !MT.open[b.dataset.key]; mtRender(); }
    else if (a === 'close') mtClose();
    else if (a === 'edit') mtEdit();
    else if (a === 'cancel') mtCancel();
    else if (a === 'save') mtSave();
    else if (a === 'del') mtDelete();
    else if (a === 'photos') mtPickPhotos();
    else if (a === 'upload') mtPickFile();
    else if (a === 'openDoc') mtOpenDoc(b.dataset.id);
    else if (a === 'docsEdit') { if (MT.sel) { MT.sel.docEdit = true; MT.sel.fix = null; mtRenderPanel(); } }
    else if (a === 'docsDone') { if (MT.sel) { MT.sel.docEdit = false; MT.sel.fix = null; mtRenderPanel(); } }
    else if (a === 'fixDoc') { if (MT.sel) { MT.sel.fix = String(b.dataset.id); mtRenderPanel(); } }
    else if (a === 'fixCancel') { if (MT.sel) { MT.sel.fix = null; mtRenderPanel(); } }
    else if (a === 'fixSave') mtFixSave();
    else if (a === 'delDoc') mtDelDoc(b.dataset.id);
    else if (a === 'addCancel') { if (MT.sel) { MT.sel.add = null; mtRenderPanel(); } }
    else if (a === 'addSave') mtAddSave();
    else if (a === 'costNew') mtCostNew(b.dataset.k);
    else if (a === 'costEdit') mtCostEdit(b.dataset.id);
    else if (a === 'costKind') mtCostKind(b.dataset.k);
    else if (a === 'costFile') mtCostPickFiles();
    else if (a === 'costFileDel') mtCostFileDel(Number(b.dataset.i));
    else if (a === 'costCancel') mtCostCancel();
    else if (a === 'costSave') mtCostSave();
    else if (a === 'costDel') mtCostDelete();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'mtF-kind') mtKindChanged();
    else if (t.dataset && t.dataset.docType) mtDocTypeChanged(t.dataset.docType);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && MT.sel && !document.getElementById('mtConfirm') && !document.getElementById('ccCal')) mtClose();
  });
}

/* ── Boot ─────────────────────────────────────────────────── */
async function mtBoot() {
  ctlShowLoading(true);
  const session = await ctlGetSession();
  if (!session) { ctlShowLoading(false); location.replace('login.html'); return; }
  try { localStorage.setItem('mgmt_last_app', 'maintenance.html'); } catch (e) {}
  mtWire();
  try {
    await mtLoad();
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
  } catch (e) {
    console.error('[maintenance] boot failed:', e);
    MT.loadError = e;
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
  } finally {
    ctlShowLoading(false);
  }
}
