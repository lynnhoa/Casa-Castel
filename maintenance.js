/* ─────────────────────────────────────────────────────────────
   MAINTENANCE — APP
   maintenance.js

   Seventh management app (login tile + profile menus of all apps).
   Tabs: Renovierungen · Schäden. Each tab lists its cases grouped
   by property (Controlling's order) and inside by year of the start
   date, newest first; a property without cases is not shown. A year
   is open when it is this year or still has a case that is not done.
   Each case: Start + optional End (D2).

   D4 · An entry opens IN PLACE inside its property card (like the Tenants
   cards) — no pop-up. One entry open at a time; a tap on its title closes it.
   Open entry = title · one summary line (area · start – end · status) with a
   small "Edit" → the details form in that spot; then receipts first (Kosten,
   "+ Add receipt", the table newest first), documents last. "+ New" opens an
   empty entry on top of the list. After Save it stays open (read view).

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
               · D2: a return is its own row (return_of = its receipt), shown
                 under the receipt, own slip no. / date / photo; Net per receipt
               · D2: receipt / slip no. already used elsewhere → asks first
               · D3: every receipt / return is booked in Controlling One-off by a
                 database rule (MAINTENANCE-D3.sql) — switch off per entry or per
                 receipt ("Controlling: Not booked"); returns follow their receipt.
                 Controlling opens an entry here with maintenance.html#cost=<id>
               · D5: Schadensbericht (Schäden) — report fields in Details,
                 Documents › "Schadensbericht" → short form (Zimmer, Mieter,
                 Versicherung per property, photos in / out + Beschreibung) →
                 PDF in the app's document style (maint-schaden-pdf.js, pdf-open.js,
                 cc-ueberg-photos.js) → saved in Documents, opened in the viewer
               · D6: slim, descriptive report for the Hausverwaltung (MAINTENANCE-D6.sql):
                 Details = Schadensart · Festgestellt am · Besichtigung · Ursache ·
                 Sofortmaßnahmen · Bitte an die HV · (Polizei-Az) · Description =
                 Schadensbild; form = Zimmer · Mieter · Ort · Dringend · Weitere Anlagen · Fotos
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
  d5: false,        // MAINTENANCE-D5.sql has been run (Schadensbericht fields)
  d6: false,        // MAINTENANCE-D6.sql has been run (slim report: Besichtigung, Bitte an HV, Ort …)
  vers: {},         // property id → { versicherer, versicherungsnr } (maint_props)
  sbData: null,     // Schadensbericht: rooms, tenants, apartments, Hausverwaltung (loaded when needed)
};

const MT_KIND = {
  renovierung: { title: 'Renovierungen', one: 'Renovierung', empty: 'No Renovierungen yet.', open: 'Planned', openCount: 'planned' },
  schaden:     { title: 'Schäden',       one: 'Schaden',     empty: 'No Schäden yet.',       open: 'Open',    openCount: 'open' },
};
const MT_PAID = [['me', 'Me'], ['versicherung', 'Versicherung'], ['mieter', 'Mieter'], ['weg', 'WEG / HV']];
const MT_DOC = {
  rechnung:       { label: 'Rechnung',       icon: 'ti-file-invoice' },
  angebot:        { label: 'Angebot',        icon: 'ti-file-text' },
  schadenbericht: { label: 'Schadensbericht', icon: 'ti-file-description' },
  photo:          { label: 'Photo',          icon: 'ti-photo' },
  other:          { label: 'Other',          icon: 'ti-file' },
  receipt:        { label: 'Receipt',        icon: 'ti-receipt' },      // file of a cost row
};
const MT_COST = {
  self:     { label: 'Self-bought', who: 'Brand' },
  provider: { label: 'Provider',    who: 'Provider' },
};
const MT_DOC_ORDER = ['schadenbericht', 'angebot', 'rechnung', 'other', 'photo'];
/* Schadensbericht (D5) — MT_SB_ARTEN comes from maint-schaden-pdf.js */
const MT_SB_BY  = [['mieter', 'Mieter'], ['dritter', 'Dritter'], ['verschleiss', 'Verschleiß / Gebäude'], ['unbekannt', 'Unbekannt']];
const MT_SB_OWN = [['sonder', 'Sondereigentum'], ['gemeinschaft', 'Gemeinschaftseigentum']];
const MT_PAID_DE = { me: 'Eigentümer', versicherung: 'Versicherung', mieter: 'Mieter', weg: 'WEG / Hausverwaltung' };
const MT_DOC_DE  = { rechnung: 'Rechnung', angebot: 'Angebot', schadenbericht: 'Schadensbericht / Gutachten', other: 'Dokument' };
const MT_CASA_ID = 7;                          // Casa Castel in Controlling (CASA_PROP_ID)
const MT_SB_ALL  = '__gemeinschaft__';         // Casa Castel: Gemeinschaftsfläche instead of a Zimmer
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
    sb.from('ctrl_properties').select('*'),
    sb.from('maint_cases').select('*'),
    sb.from('maint_docs').select('*'),
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
  // D5: Schadensbericht fields there? (MAINTENANCE-D5.sql) → Versicherung per property
  try {
    const v = await sb.from('maint_props').select('*');
    MT.d5 = !v.error;
    (v.data || []).forEach(r => { MT.vers[String(r.property_id)] = r; });
  } catch (e) { MT.d5 = false; }
  try { MT.d6 = MT.d5 && !(await sb.from('maint_cases').select('besichtigung').limit(1)).error; }
  catch (e) { MT.d6 = false; }
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
    .map(g => {
      const years = new Map();
      g.cases.forEach(c => {
        const y = mtCaseYear(c);
        if (!years.has(y)) years.set(y, []);
        years.get(y).push(c);
      });
      return { ...g, years: [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, cs]) => ({ y, cases: cs.sort(byDate) })) };
    });
}
/* The year an entry belongs to: its start date (else when it was created) */
const mtCaseYear = c => String(c.case_date || ccDayOf(c.created_at) || '').slice(0, 4) || '—';
/* Start – End as text: "16.01.2026 – 20.03.2026" · "from 16.01.2026" · "" */
function mtSpan(c) {
  const a = mtDate(c.case_date), b = mtDate(c.end_date);
  if (a && b) return a === b ? a : a + ' – ' + b;
  if (a) return 'from ' + a;
  return b ? 'until ' + b : '';
}

function mtRowHTML(c) {
  const sub = [c.area, mtSpan(c)].filter(Boolean).map(mtEsc).join(' · ');
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
  mtParkPanel();                                             // keep the open entry safe while the list is redrawn
  if (MT.loadError) { el.innerHTML = mtErrorHTML(MT.loadError); return; }
  const list = MT.cases.filter(c => c.kind === kind);
  const newTop = MT.sel && MT.sel.isNew && MT.sel.draft && MT.sel.draft.kind === kind
    ? '<section class="mt-card mt-card--new" aria-label="New entry"><div class="mt-slot"></div></section>' : '';
  const head = `
    <div class="mt-hdr">
      <h1 class="cc-h1">${MT_KIND[kind].title}</h1>
      <button type="button" class="mt-add" data-mt="new"><i class="ti ti-plus" aria-hidden="true"></i><span>New</span></button>
    </div>`;
  if (!list.length) {
    el.innerHTML = head + (newTop ? `<div class="mt-list">${newTop}</div>` : `<p class="mt-empty">${MT_KIND[kind].empty}</p>`);
    mtPlacePanel(el);
    return;
  }

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
    const years = g.years.map(Y => {
      const fk = kind + '|' + g.key + '|' + Y.y;
      // open by default: this year, or a year that still has something not done
      const auto = Y.y === y || Y.cases.some(c => c.status !== 'done');
      const hasOpen = MT.sel && !MT.sel.isNew && Y.cases.some(c => String(c.id) === String(MT.sel.id));
      const open = hasOpen || (MT.open[fk] === undefined ? auto : !!MT.open[fk]);
      const sumY = mtCost(Y.cases.map(c => c.id));
      return `
        <button type="button" class="mt-yr" data-mt="fold" data-key="${mtEsc(fk)}" data-auto="${auto ? 1 : 0}" aria-expanded="${open}">
          <span class="mt-yr__y">${mtEsc(Y.y)}</span><span class="mt-yr__n">${Y.cases.length} ${Y.cases.length === 1 ? 'entry' : 'entries'}</span>
          <span class="mt-yr__s${sumY ? '' : ' mt-mu'}">${mtAmt(sumY)}</span><i class="ti ti-chevron-down" aria-hidden="true"></i>
        </button>${open ? Y.cases.map(c => (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(c.id)) ? '<div class="mt-slot"></div>' : mtRowHTML(c)).join('') : ''}`;
    }).join('');
    return `
      <section class="mt-card" aria-label="${mtEsc(g.name)}">
        <div class="mt-card__hd"><h2 class="mt-card__name">${mtEsc(g.name)}</h2><span class="mt-card__sum${total ? '' : ' mt-mu'}">${mtAmt(total)}</span></div>
        ${years}
      </section>`;
  }).join('');

  el.innerHTML = head + sum + `<div class="mt-list">${newTop}${cards}</div>`;
  mtPlacePanel(el);
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
  const head = `
    <button type="button" class="mt-oh__t" data-mt="close" aria-label="Close ${mtEsc(title)}" aria-expanded="true">
      <span id="mtPanelTitle">${mtEsc(title)}</span><i class="ti ti-chevron-up" aria-hidden="true"></i>
    </button>`;
  if (s.isNew) {
    return head + mtEditHTML(c, s) +
      '<p class="mt-docs-empty mt-after">Receipts, photos and documents can be added after Save.</p>';
  }
  return head + (s.edit ? mtEditHTML(c, s) : mtSummaryHTML(c)) + mtCostsHTML(c) + mtDocsHTML(c);
}

/* The details at a glance: area · start – end · status (· paid by · not in Controlling), description below */
function mtSummaryHTML(c) {
  const bits = [c.kind === 'schaden' ? c.schadensart : '', c.area, mtSpan(c)].filter(Boolean).map(mtEsc);
  bits.push(mtPill(c.kind, c.status).replace('class="mt-pill ', 'class="mt-pill mt-pill--sm '));
  if (c.kind === 'schaden' && c.paid_by) bits.push('Paid by ' + mtEsc(mtPaidLabel(c.paid_by)));
  if (c.book_ctrl === false) bits.push('<span class="mt-off">not in Controlling</span>');
  return `
    <div class="mt-oh__s">
      <span class="mt-oh__l">${bits.join(' · ')}</span>
      ${mtActive(c) ? '' : '<button type="button" class="mt-link" data-mt="edit">Edit</button>'}
    </div>
    ${c.description ? `<p class="mt-oh__d">${mtEsc(c.description)}</p>` : ''}`;
}

function mtEditHTML(c, s) {
  const d = s.draft || {
    kind: c.kind, title: c.title, property_id: c.property_id, property_name: c.property_name, area: c.area,
    case_date: c.case_date, end_date: c.end_date, status: c.status, paid_by: c.paid_by, description: c.description,
    book_ctrl: c.book_ctrl !== false,
    schadensart: c.schadensart, festgestellt_am: c.festgestellt_am, ursache: c.ursache, verursacher: c.verursacher,
    massnahmen: c.massnahmen, schadennummer: c.schadennummer, mieter_informiert: c.mieter_informiert,
    eigentum: c.eigentum, polizei_az: c.polizei_az, besichtigung: c.besichtigung, bitte_hv: c.bitte_hv,
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
      <div class="mt-grid">
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-title">Title</label>
          <input class="mt-in" id="mtF-title" type="text" maxlength="120" autocomplete="off" value="${mtEsc(d.title || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-prop">Property</label><select class="mt-in" id="mtF-prop">${props}</select></div>
        <div class="mt-f"><label class="mt-k" for="mtF-area">Area</label>
          <input class="mt-in" id="mtF-area" type="text" maxlength="80" autocomplete="off" placeholder="e.g. Bad 1. OG" value="${mtEsc(d.area || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-date">Start</label><input class="mt-in" id="mtF-date" type="date" value="${mtEsc(d.case_date || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-end">End</label><input class="mt-in" id="mtF-end" type="date" value="${mtEsc(d.end_date || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtF-kind">Type</label><select class="mt-in" id="mtF-kind">${kinds}</select></div>
        <div class="mt-f"><label class="mt-k" for="mtF-status">Status</label><select class="mt-in" id="mtF-status">${stats}</select></div>
        <div class="mt-f" data-only="schaden"${d.kind === 'schaden' ? '' : ' hidden'}><label class="mt-k" for="mtF-paid">Paid by</label><select class="mt-in" id="mtF-paid">${paid}</select></div>
        <div class="mt-f"><label class="mt-k" for="mtF-book">Controlling</label><select class="mt-in" id="mtF-book">
          <option value="1"${d.book_ctrl === false ? '' : ' selected'}>Booked</option><option value="0"${d.book_ctrl === false ? ' selected' : ''}>Not booked</option></select></div>
        ${MT.d5 ? mtSbFieldsHTML(d) : ''}
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtF-desc">Description</label>
          <textarea class="mt-in mt-ta" id="mtF-desc" rows="3" maxlength="2000"${d.kind === 'schaden' ? ' placeholder="One line per point, e.g. Wasser tropft durch die Deckenleuchte"' : ''}>${mtEsc(d.description || '')}</textarea></div>
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
  const p = document.getElementById('mtPanel');
  if (!p) return;
  const html = mtPanelHTML();
  if (!html) {
    MT.sel = null;
    p.innerHTML = '';
    mtParkPanel();
    return;
  }
  mtCostCapture();                                           // an open cost form keeps what is typed
  mtSbCapture();                                             // … and the Schadensbericht form
  p.innerHTML = html;
  // the date field becomes a German field right after it is drawn → note the form after that
  if (MT.sel.edit) { const sel = MT.sel; delete sel.snap; setTimeout(() => { if (MT.sel === sel && sel.edit) sel.snap = mtFormSnap(); }, 0); }
  mtAfterPanel();
}
/* The open entry is one element that moves into its place in the list (so a redraw of
   the list never loses what is typed) and back to its hidden home when nothing is open */
function mtParkPanel() {
  const p = document.getElementById('mtPanel'), home = document.getElementById('mtPanelHome');
  if (p && home && p.parentNode !== home) home.appendChild(p);
}
function mtPlacePanel(root) {
  const p = document.getElementById('mtPanel'), slot = root && root.querySelector('.mt-slot');
  if (!p) return;
  if (slot && MT.sel) slot.replaceWith(p); else mtParkPanel();
}
function mtScrollToOpen() {
  const p = document.getElementById('mtPanel');
  if (p && p.parentNode && p.parentNode.id !== 'mtPanelHome') p.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* What the form says right now (to notice unsaved changes) */
function mtFormSnap() {
  return ['mtF-title', 'mtF-prop', 'mtF-area', 'mtF-kind', 'mtF-date', 'mtF-end', 'mtF-status', 'mtF-paid', 'mtF-book', 'mtF-desc',
    'mtF-art', 'mtF-found', 'mtF-visit', 'mtF-cause', 'mtF-measures', 'mtF-ask', 'mtF-police']
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
  mtSbVis();
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
  const dateEl = g('mtF-date'), endEl = g('mtF-end');
  const date = dateEl.value || '';                         // ISO, or '' when empty / not a date
  const end = endEl ? endEl.value || '' : '';
  if (!title) return bad('mtF-title', 'Add a title.');
  if (!pid) return bad('mtF-prop', MT.props.length ? 'Choose the property.' : 'No properties yet. Add them in the Properties app first.');
  if (!date && mtNativeVal(dateEl).trim()) return bad('mtF-date', 'Check the start date (TT.MM.JJJJ).');
  if (endEl && !end && mtNativeVal(endEl).trim()) return bad('mtF-end', 'Check the end date (TT.MM.JJJJ).');
  if (date && end && end < date) return bad('mtF-end', 'The end can\'t be before the start.');
  const p = mtProp(pid);
  const old = MT.sel && !MT.sel.isNew ? mtCase(MT.sel.id) : null;
  let sbf = null;                                          // D5/D6: report fields of a Schaden
  if (MT.d5 && kind === 'schaden' && g('mtF-art')) {
    const found = g('mtF-found').value || '';
    if (!found && mtNativeVal(g('mtF-found')).trim()) return bad('mtF-found', 'Check "Festgestellt am" (TT.MM.JJJJ).');
    if (date && found && found < date) return bad('mtF-found', '"Festgestellt am" can\'t be before the start.');
    const art = g('mtF-art').value || null;
    sbf = {
      schadensart: art, festgestellt_am: found || null,
      ursache: g('mtF-cause').value.trim() || null,
      massnahmen: g('mtF-measures').value.trim() || null,
      polizei_az: /Einbruch/.test(art || '') ? (g('mtF-police').value.trim() || null) : null,
    };
    if (MT.d6 && g('mtF-visit')) {
      sbf.besichtigung = g('mtF-visit').value.trim() || null;
      sbf.bitte_hv = mtIsCasa(pid) ? null : (g('mtF-ask').value.trim() || null);
    }
  }
  return {
    sbf,
    kind: MT_KIND[kind] ? kind : MT.tab,
    title,
    property_id: Number(pid),
    property_name: p ? p.name : ((MT.sel.draft && MT.sel.draft.property_name) || (old && old.property_name) || ''),
    area: g('mtF-area').value.trim() || null,
    case_date: date || null,
    end_date: end || null,
    status: g('mtF-status').value || 'open',
    paid_by: kind === 'schaden' ? (g('mtF-paid').value || null) : null,
    description: g('mtF-desc').value.trim() || null,
    book_ctrl: g('mtF-book') ? g('mtF-book').value !== '0' : true,
  };
}

/* ── Panel actions ────────────────────────────────────────── */
async function mtOpen(id) {
  if (MT.sel && !MT.sel.isNew && String(MT.sel.id) === String(id) && !MT.sel.edit) return;
  if (MT.sel && !(await mtClose())) return;
  MT.sel = { id, isNew: false, edit: false };
  mtRenderPanel();
  mtRender();
  mtScrollToOpen();
}

async function mtNew() {
  if (MT.sel && !(await mtClose())) return;
  MT.sel = {
    id: null, isNew: true, edit: true,
    draft: { kind: MT.tab, title: '', property_id: '', area: '', case_date: ccTodayISO(), end_date: '', status: 'open', paid_by: '', description: '', book_ctrl: true },
  };
  mtRenderPanel();
  mtRender();
  mtScrollToOpen();
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
  const { sbf, ...fv } = f;
  const flat = { ...fv, ...(sbf || {}) };                  // the Schaden report fields sit with the rest (D5)
  const row = { ...(oldRow || {}), ...flat, id, updated_at: now, created_at: oldRow ? oldRow.created_at : now };

  // 1 · show it at once: list + panel back in the read view
  if (isNew) MT.cases.push(row); else Object.assign(mtCase(id), row);
  MT.sel = { id, isNew: false, edit: false };
  if (row.kind !== MT.tab) mtSwitchTab(row.kind); else mtRender();       // type changed → the list follows
  mtRenderPanel();

  // 2 · store it (one retry)
  const sb = _ctlSupa;
  const payload = {
    kind: f.kind, title: f.title, property_id: f.property_id, property_name: f.property_name, area: f.area,
    case_date: f.case_date, end_date: f.end_date, status: f.status, paid_by: f.paid_by, description: f.description,
    book_ctrl: f.book_ctrl !== false,
    ...(f.sbf || {}),
  };
  const r = await mtTry(() => (isNew ? sb.from('maint_cases').insert({ id, ...payload }) : sb.from('maint_cases').update(payload).eq('id', id)));
  MT.busy = false;
  if (!r.error) return;

  // 3 · not stored: everything back as it was, the form comes back with what you typed
  console.error('[maintenance] save failed:', r.error);
  const sqlMissing = /book_ctrl|maint_cost_id|schadensart|festgestellt|report_no|in_report|taken_at|caption|besichtigung|bitte_hv|report_ort|report_dringend|report_anlagen/i.test(String((r.error && (r.error.message || r.error.details)) || ''));
  if (isNew) MT.cases = MT.cases.filter(c => c.id !== id);
  else Object.assign(mtCase(id), oldRow);
  MT.sel = { id: isNew ? null : id, isNew, edit: true, draft: { ...flat } };
  const backTo = isNew ? MT.tab : oldRow.kind;
  if (backTo !== MT.tab) mtSwitchTab(backTo); else mtRender();
  mtRenderPanel();
  mtSay(sqlMissing ? 'Not saved: run the newest MAINTENANCE SQL in Supabase first.' : 'Not saved. Check the connection and save again.');
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
const mtActive = c => !!(MT.sel && (MT.sel.edit || MT.sel.docEdit || MT.sel.add || MT.sel.fix || MT.sel.cost || MT.sel.sb || mtUpFor(c)));
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

  let h = '<section class="mt-docs" id="mtDocs"><p class="mt-sec__t">Documents</p>';
  if (s.sb && !locked) h += mtSbFormHTML(c, s.sb);
  else if (c.kind === 'schaden' && !locked && !ed && !s.add && !s.fix && !upAny)
    h += `<button type="button" class="mt-sbbar" data-mt="sbOpen"><i class="ti ti-file-description" aria-hidden="true"></i><span>Schadensbericht</span><em>PDF</em></button>`;
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
  if (!locked && !s.add && !s.fix && !s.sb && !upAny) {
    h += ed
      ? '<div class="cc-sec-foot"><button type="button" class="cc-foot-btn mt-save" data-mt="docsDone">Done</button></div>'
      : `<div class="cc-sec-foot">
          <span class="is-left mt-foot-l">
            <button type="button" class="cc-foot-btn" data-mt="photos"><i class="ti ti-camera" aria-hidden="true"></i> Photos</button>
            <button type="button" class="cc-foot-btn" data-mt="upload"><i class="ti ti-file-plus" aria-hidden="true"></i> Document</button>
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
    if (await mtUploadOne(c, f, { type: 'photo', amount: null, date: mtFileDay(f) }, await mtPhotoExtra(f))) ok++;
    MT.up.done++;
    mtRefresh(c.id);
  }
  MT.up = null;
  mtRefresh(c.id);
  if (ok === imgs.length) mtSay(ok === 1 ? 'Photo saved' : ok + ' photos saved');
  else mtSay(`${ok} of ${imgs.length} photos saved. Add the others again.`);
}

/* Document: a PDF from Files is kept as it is · photos (camera or library) become ONE PDF,
   a page per photo (e.g. a 3-page Angebot) → its Type → Save. Documents never land in the photo grid;
   documentation photos go through "Photos". */
function mtPickFile() {
  if (!mtOpenCase()) return;
  if (MT.up) { mtSay('Wait until the upload is finished.'); return; }
  mtFileInput('mtDocInput', 'application/pdf,image/*', true, async files => {
    const c = mtOpenCase();
    if (!c) return;
    const pdfs = files.filter(mtIsPdf), imgs = files.filter(f => !mtIsPdf(f) && mtIsImage(f));
    let file = null, pages = 0;
    if (pdfs.length) {
      if (files.length > 1) mtSay('One PDF at a time – the first one is used.');
      file = pdfs[0];
    } else if (imgs.length) {
      if (imgs.some(f => f.size > MT_MAX_MB * 1024 * 1024)) { mtSay(`A photo is too big (max ${MT_MAX_MB} MB).`); return; }
      mtSay(imgs.length === 1 ? 'Making a PDF…' : `Making a PDF with ${imgs.length} pages…`);
      file = await mtPhotosToPdf(imgs);
      if (!file) { mtSay('The PDF could not be made. Try again.'); return; }
      pages = imgs.length;
    } else { mtSay('Choose a PDF or a photo.'); return; }
    if (file.size > MT_MAX_MB * 1024 * 1024) { mtSay(`This file is too big (max ${MT_MAX_MB} MB).`); return; }
    const now = mtOpenCase();
    if (!now || String(now.id) !== String(c.id)) return;            // another entry was opened meanwhile
    MT.sel.docEdit = false; MT.sel.fix = null;
    MT.sel.add = { file, name: (file.name || 'Document.pdf') + (pages > 1 ? ` · ${pages} pages` : ''), isImg: false,
      type: mtGuessType(file.name, false), amount: '', date: ccTodayISO() };
    mtRenderPanel();
    document.getElementById('mtDocs')?.scrollIntoView({ block: 'nearest' });
  });
}
/* Photos → one A4 PDF (portrait or landscape per photo, the whole photo, nothing cut off) */
async function mtPhotosToPdf(imgs) {
  try {
    if (!window.jspdf) await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (const f of imgs) {
      const p = await mtImageData(f, 2000, 0.85);
      if (!p) return null;
      const land = p.w > p.h, W = land ? 297 : 210, H = land ? 210 : 297, M = 8;
      if (!pdf) pdf = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
      else pdf.addPage('a4', land ? 'landscape' : 'portrait');
      const k = Math.min((W - 2 * M) / p.w, (H - 2 * M) / p.h), w = p.w * k, h = p.h * k;
      pdf.addImage(p.url, 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
    }
    const base = imgs.length === 1 ? String(imgs[0].name || 'Scan').replace(/\.[a-z0-9]+$/i, '') : 'Scan ' + mtDate(ccTodayISO());
    return new File([pdf.output('blob')], base + '.pdf', { type: 'application/pdf' });
  } catch (e) {
    console.error('[maintenance] photo → PDF:', e);
    return null;
  }
}
/* A photo → JPEG data, longest side max px (upright, as the phone shows it) */
function mtImageData(file, max, quality) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      resolve({ url: cv.toDataURL('image/jpeg', quality), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
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

/* ── Costs (D1 + D2) ──────────────────────────────────────────
   One row = one receipt / invoice: Receipt no. · Description · Brand / Provider ·
   Amount · Date · Photos. Grouped Self-bought / Provider. A tap on a row opens it
   in place (one form at a time); its photos / PDFs are added in the form and
   stored on Save.
   D2 · A return is its own row (return_of = its receipt): own slip no., date,
   amount and photo, shown under its receipt, then the receipt's Net. It can't be
   more than what is left of the receipt, nor before the receipt's date.
   D2 · A receipt / slip no. that is already used anywhere → asks before saving. */
const mtCostsOf = caseId => MT.costs.filter(r => String(r.case_id) === String(caseId));
const mtCostFiles = costId => MT.docs.filter(d => String(d.cost_id) === String(costId));
const mtCostById = id => MT.costs.find(x => String(x.id) === String(id)) || null;
const mtReturnsOf = id => MT.costs.filter(x => String(x.return_of) === String(id)).sort(mtCostByDate);
const mtCostByDate = (a, b) => String(a.cost_date || '').localeCompare(String(b.cost_date || '')) ||
                               String(a.created_at || '').localeCompare(String(b.created_at || ''));
const mtNum = n => Math.round((Number(n) || 0) * 100) / 100;
const mtNeg = n => '\u2212' + mtEur(n);                      // −30,00 €

function mtCostsHTML(c) {
  const s = MT.sel, f = s.cost;
  const rows = mtCostsOf(c.id);
  const busy = !!(s.edit || s.docEdit || s.add || s.fix || s.sb);  // another part of the panel is being changed
  const upAny = mtUpFor(c), up = upAny && upAny.where === 'costs' ? upAny : null;
  const tap = !busy && !f && !upAny;
  const isForm = r => f && !f.isNew && String(f.id) === String(r.id);
  // D4 · receipts first: Kosten on top, then "+ Add receipt", then the table (newest first)
  const self = mtCost([c.id], null, 'self'), prov = mtCost([c.id], null, 'provider');
  let h = `<section class="mt-costs" id="mtCosts">
    <div class="mt-ks"><b>Kosten</b><em>${mtEur(mtCost([c.id]))}</em></div>
    <p class="mt-kv">Self-bought ${mtEur(self)} · Provider ${mtEur(prov)}</p>`;
  if (c.book_ctrl === false) h += '<p class="mt-off-note"><i class="ti ti-unlink" aria-hidden="true"></i>Not booked in Controlling</p>';
  if (f && f.isNew && !f.return_of) h += mtCostFormHTML(f);
  else if (!busy && !f && !upAny) h += '<button type="button" class="mt-addr" data-mt="costNew" data-k="self"><i class="ti ti-plus" aria-hidden="true"></i>Add receipt</button>';
  if (up) h += `<p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Uploading ${Math.min(up.done + 1, up.total)} of ${up.total}</p>`;
  if (!rows.length && !(f && f.isNew)) h += '<p class="mt-docs-empty">No receipts yet.</p>';

  Object.keys(MT_COST).forEach(kind => {
    const list = rows.filter(r => r.kind === kind && !r.return_of).sort((a, b) => mtCostByDate(b, a));   // newest first
    if (!list.length) return;
    h += `<div class="mt-cg">
      <div class="mt-cg__h"><span class="mt-cg__t">${MT_COST[kind].label} · ${list.length}</span><span class="mt-cg__s">${mtEur(mtCost([c.id], null, kind))}</span></div>
      <div class="mt-ch" aria-hidden="true"><span>Receipt no.</span><span>Description</span><span>${MT_COST[kind].who}</span><span class="r">Amount</span><span>Date</span><span></span></div>
      ${list.map(r => {
        const rets = mtReturnsOf(r.id);
        let x = isForm(r) ? mtCostFormHTML(f) : mtCostRowHTML(r, tap);
        rets.forEach(t => { x += isForm(t) ? mtCostFormHTML(f) : mtCostRowHTML(t, tap); });
        if (f && f.isNew && String(f.return_of) === String(r.id)) x += mtCostFormHTML(f);   // a new return sits under its receipt
        if (rets.length) x += `<div class="mt-net"><span>Net</span><b>${mtEur(mtNum(r.amount) - rets.reduce((a, t) => a + mtNum(t.amount), 0))}</b></div>`;
        return x;
      }).join('')}
    </div>`;
  });
  return h + '</section>';
}

function mtCostRowHTML(r, tap) {
  const n = mtCostFiles(r.id).length, ret = !!r.return_of;
  const parent = ret ? mtCostById(r.return_of) : null;
  const off = ret ? !!parent && parent.book_ctrl === false : r.book_ctrl === false;
  const no = ret ? (r.receipt_no ? 'Slip ' + r.receipt_no : 'Return') : (r.receipt_no || '—');
  const desc = ret ? (r.description ? 'Return · ' + r.description : 'Return') : (r.description || '');
  return `<button type="button" class="mt-cr${ret ? ' mt-cr--ret' : ''}" data-mt="${tap ? 'costEdit' : 'none'}" data-id="${mtEsc(r.id)}"${tap ? '' : ' tabindex="-1"'}>
      <span class="mt-cr__a"><span class="mt-cr__no">${ret ? '<i class="ti ti-corner-down-right" aria-hidden="true"></i>' : ''}${mtEsc(no)}</span><span class="mt-cr__desc">${mtEsc(desc)}${off ? '<span class="mt-off">not in Controlling</span>' : ''}</span></span>
      <span class="mt-cr__amt">${ret ? mtNeg(r.amount) : mtEur(r.amount)}</span>
      <span class="mt-cr__b"><span class="mt-cr__who">${ret ? '' : mtEsc(r.brand || '')}</span><span class="mt-cr__date">${mtEsc(mtDate(r.cost_date))}</span></span>
      <span class="mt-cr__f">${n ? `<i class="ti ti-paperclip" aria-hidden="true"></i>${n}` : ''}</span>
    </button>`;
}

function mtCostFormHTML(f) {
  const ret = !!f.return_of, parent = ret ? mtCostById(f.return_of) : null;
  const cs = MT.sel ? mtCase(MT.sel.id) : null, caseOff = !!cs && cs.book_ctrl === false;
  const amt = f.amount === null || f.amount === undefined || f.amount === '' ? '' : String(f.amount);
  const chips = f.files.map((x, i) => `
      <span class="mt-chip${x.file ? ' is-new' : ''}">
        ${x.id ? `<button type="button" class="mt-chip__n" data-mt="openDoc" data-id="${mtEsc(x.id)}">` : '<span class="mt-chip__n">'}<i class="ti ${x.img ? 'ti-photo' : 'ti-file-text'}" aria-hidden="true"></i>${mtEsc(x.name)}${x.id ? '</button>' : '</span>'}
        <button type="button" class="mt-chip__x" data-mt="costFileDel" data-i="${i}" aria-label="Remove ${mtEsc(x.name)}"><i class="ti ti-x" aria-hidden="true"></i></button>
      </span>`).join('');
  const top = ret
    ? `<p class="mt-ret-t"><i class="ti ti-corner-down-right" aria-hidden="true"></i>Return for ${parent && parent.receipt_no ? 'Receipt ' + mtEsc(parent.receipt_no) : 'this receipt'}${parent && parent.brand ? ' · ' + mtEsc(parent.brand) : ''}</p>`
    : `<div class="mt-seg" role="group" aria-label="Type">
        ${Object.keys(MT_COST).map(k => `<button type="button" class="mt-seg__b${f.kind === k ? ' is-on' : ''}" data-mt="costKind" data-k="${k}" aria-pressed="${f.kind === k}">${MT_COST[k].label}</button>`).join('')}
      </div>`;
  const left = [
    f.isNew ? '' : `<button type="button" class="cc-foot-btn mt-del" data-mt="costDel"><i class="ti ti-trash" aria-hidden="true"></i> Delete</button>`,
    !ret && !f.isNew ? '<button type="button" class="cc-foot-btn" data-mt="costReturn"><i class="ti ti-arrow-back-up" aria-hidden="true"></i> Return</button>' : '',
  ].join('');
  return `<div class="mt-ab mt-cf-form${ret ? ' is-ret' : ''}" id="mtC-form">
      ${top}
      <div class="mt-grid">
        <div class="mt-f"><label class="mt-k" for="mtC-no">${ret ? 'Slip no.' : 'Receipt no.'}</label>
          <input class="mt-in" id="mtC-no" type="text" maxlength="60" autocomplete="off" value="${mtEsc(f.receipt_no || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-desc">Description</label>
          <input class="mt-in" id="mtC-desc" type="text" maxlength="160" autocomplete="off" value="${mtEsc(f.description || '')}"${ret ? ' placeholder="optional"' : ''}/></div>
        ${ret ? '' : `<div class="mt-f"><label class="mt-k" for="mtC-who" id="mtC-whoLbl">${MT_COST[f.kind].who}</label>
          <input class="mt-in" id="mtC-who" type="text" maxlength="80" autocomplete="off" value="${mtEsc(f.brand || '')}"/></div>`}
        <div class="mt-f"><label class="mt-k" for="mtC-amount">Amount (€)</label>
          <input class="mt-in" id="mtC-amount" data-cc-num="2" inputmode="decimal" autocomplete="off" value="${mtEsc(amt)}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtC-date">Date</label>
          <input class="mt-in" id="mtC-date" type="date" value="${mtEsc(f.cost_date || '')}"/></div>
        <div class="mt-f mt-f--full"><span class="mt-k">Photos</span>
          <div class="mt-chips">${chips}
            <button type="button" class="mt-chip mt-chip--add" data-mt="costFile"><i class="ti ti-camera" aria-hidden="true"></i> Photo / PDF</button>
          </div></div>
        ${ret ? '' : `<div class="mt-f mt-f--full">${caseOff
          ? '<p class="mt-hint">This entry is not booked in Controlling.</p>'
          : `<label class="mt-chk"><input type="checkbox" id="mtC-book"${f.book_ctrl === false ? '' : ' checked'}/><span>Book in Controlling</span></label>`}</div>`}
      </div>
      <div class="cc-sec-foot">
        ${left ? `<span class="is-left mt-foot-l">${left}</span>` : ''}
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
  if (g('mtC-who')) f.brand = g('mtC-who').value;
  f.amount = g('mtC-amount').value;                         // "1250.5" (German field) or ''
  f.cost_date = g('mtC-date').value || '';
  if (g('mtC-book')) f.book_ctrl = g('mtC-book').checked;
}
const mtCostSnapOf = f => JSON.stringify([f.kind, f.receipt_no || '', f.description || '', f.brand || '', String(f.amount ?? ''), f.cost_date || '',
  f.book_ctrl !== false, f.files.map(x => x.id || x.name).join('|')]);
function mtCostChanged() {
  const f = MT.sel && MT.sel.cost;
  if (!f) return false;
  mtCostCapture();
  return mtCostSnapOf(f) !== f.snap;
}
const mtCostFilesOf = id => mtCostFiles(id).map(d => ({ id: d.id, name: d.file_name || 'File', img: !!d.file_path && /\.(jpe?g|png|webp|heic|gif)$/i.test(d.file_path) }));

function mtCostNew(kind) {
  const c = mtOpenCase();
  if (!c || mtActive(c)) return;
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: MT_COST[kind] ? kind : 'self', return_of: null, receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO(), book_ctrl: true, files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
  document.getElementById('mtC-form')?.scrollIntoView({ block: 'nearest' });
  if (mtFine()) document.getElementById('mtC-no')?.focus();
}
function mtCostEdit(id) {
  const c = mtOpenCase(), r = mtCostById(id);
  if (!c || !r || mtActive(c)) return;
  MT.sel.cost = { isNew: false, id: r.id, kind: r.kind, return_of: r.return_of || null, receipt_no: r.receipt_no || '', description: r.description || '',
    brand: r.brand || '', amount: r.amount ?? '', cost_date: r.cost_date || '', book_ctrl: r.book_ctrl !== false, delIds: [], files: mtCostFilesOf(r.id) };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
}
/* "+ Return" in a receipt's form → a new return under that receipt */
async function mtCostNewReturn() {
  const f = MT.sel && MT.sel.cost;
  if (!f || f.isNew || f.return_of) return;
  if (mtCostChanged()) {
    const ok = await mtConfirm({ title: 'Discard your changes?', text: 'What you changed in this receipt is not saved.', ok: 'Discard', cancel: 'Keep editing', danger: true });
    if (!ok) return;
  }
  const r = mtCostById(f.id);
  if (!r || !MT.sel) return;
  MT.sel.cost = { isNew: true, id: mtUuid(), kind: r.kind, return_of: r.id, receipt_no: '', description: '', brand: '',
    amount: '', cost_date: ccTodayISO() < String(r.cost_date || '') ? r.cost_date : ccTodayISO(), files: [], delIds: [] };
  MT.sel.cost.snap = mtCostSnapOf(MT.sel.cost);
  mtRenderPanel();
  document.getElementById('mtC-form')?.scrollIntoView({ block: 'nearest' });
  if (mtFine()) document.getElementById('mtC-no')?.focus();
}
function mtCostKind(kind) {
  const f = MT.sel && MT.sel.cost;
  if (!f || f.return_of || !MT_COST[kind]) return;
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

/* Receipt / slip no. already used (anywhere) → where */
function mtDupOf(no, selfId) {
  const k = String(no || '').trim().toLowerCase();
  if (!k) return null;
  const d = MT.costs.find(r => String(r.id) !== String(selfId) && String(r.receipt_no || '').trim().toLowerCase() === k);
  if (!d) return null;
  const c = mtCase(d.case_id);
  return { row: d, where: c ? `“${c.title}” (${mtPropName(c)})` : 'another entry', same: MT.sel && String(d.case_id) === String(MT.sel.id) };
}

async function mtCostSave() {
  const s = MT.sel, f = s && s.cost, c = s && !s.isNew ? mtCase(s.id) : null;
  if (!f || !c || MT.busy) return;
  mtCostCapture();
  const g = id => document.getElementById(id);
  const fail = (id, msg) => { const el = g(id); if (el) { el.setAttribute('aria-invalid', 'true'); if (!el.classList.contains('cc-cal')) el.focus(); } mtSay(msg); };
  const ret = !!f.return_of, parent = ret ? mtCostById(f.return_of) : null;
  if (ret && !parent) { mtSay('The receipt of this return was deleted.'); f.return_of = null; return; }
  const amount = f.amount === '' || !isFinite(Number(f.amount)) ? null : mtNum(f.amount);
  if (!ret && !String(f.receipt_no).trim() && !String(f.description).trim()) return fail('mtC-no', 'Enter the receipt no. or a description.');
  if (amount === null || amount < 0 || (ret && amount <= 0)) return fail('mtC-amount', 'Enter the amount.');
  if (!f.cost_date) return fail('mtC-date', mtNativeVal(g('mtC-date')).trim() ? 'Check the date (TT.MM.JJJJ).' : 'Enter the date.');
  if (ret) {
    const others = mtReturnsOf(parent.id).filter(t => String(t.id) !== String(f.id)).reduce((a, t) => a + mtNum(t.amount), 0);
    const left = mtNum(mtNum(parent.amount) - others);
    if (amount > left) return fail('mtC-amount', `The return can't be more than what is left of the receipt (${mtEur(left)}).`);
    if (parent.cost_date && f.cost_date < parent.cost_date) return fail('mtC-date', `The return can't be before the receipt (${mtDate(parent.cost_date)}).`);
  } else if (!f.isNew) {
    const back = mtReturnsOf(f.id).reduce((a, t) => a + mtNum(t.amount), 0);
    if (amount < back) return fail('mtC-amount', `The receipt can't be less than its returns (${mtEur(back)}).`);
    const first = mtReturnsOf(f.id)[0];
    if (first && first.cost_date < f.cost_date) return fail('mtC-date', `The receipt can't be after its return (${mtDate(first.cost_date)}).`);
  }
  const dup = mtDupOf(f.receipt_no, f.id);
  if (dup) {
    const what = (ret ? 'Slip ' : 'Receipt ') + String(f.receipt_no).trim();
    const ok = await mtConfirm({ title: `${what} already exists`, text: dup.same ? 'It is already in this entry. Save it anyway?' : `It is already in ${dup.where}. Save it anyway?`, ok: 'Save anyway' });
    if (!ok) return;
    if (!MT.sel || MT.sel.cost !== f) return;                  // the panel changed meanwhile
  }

  MT.busy = true;
  const isNew = f.isNew, id = f.id;
  const now = new Date().toISOString();
  const old = isNew ? null : { ...mtCostById(id) };
  const row = {
    id, case_id: c.id, kind: ret ? parent.kind : f.kind, receipt_no: String(f.receipt_no).trim() || null, description: String(f.description).trim() || null,
    brand: ret ? null : String(f.brand).trim() || null, amount, cost_date: f.cost_date, return_of: ret ? parent.id : null,
    book_ctrl: ret ? true : f.book_ctrl !== false,                 // a return follows its receipt
  };
  const kindChanged = !ret && old && old.kind !== row.kind;
  const rets = kindChanged ? mtReturnsOf(id) : [];
  const pending = f.files.filter(x => x.file), dels = f.delIds.slice();

  // 1 · show it at once (a receipt's returns follow its type)
  if (isNew) MT.costs.push({ ...row, created_at: now, updated_at: now });
  else Object.assign(mtCostById(id), row, { updated_at: now });
  rets.forEach(t => { t.kind = row.kind; });
  s.cost = null;
  if (pending.length) MT.up = { caseId: c.id, total: pending.length, done: 0, where: 'costs' };
  mtRefresh(c.id);

  // 2 · store the row (one retry)
  const sb = _ctlSupa;
  const { id: _id, ...fields } = row;
  let r = await mtTry(() => (isNew ? sb.from('maint_costs').insert(row) : sb.from('maint_costs').update(fields).eq('id', id)));
  if (!r.error && rets.length) r = await mtTry(() => sb.from('maint_costs').update({ kind: row.kind }).eq('return_of', id));
  if (r.error) {
    console.error('[maintenance] cost save failed:', r.error);
    const sqlMissing = /book_ctrl|maint_cost_id|schadensart|festgestellt|report_no|in_report|taken_at|caption|besichtigung|bitte_hv|report_ort|report_dringend|report_anlagen/i.test(String((r.error && (r.error.message || r.error.details)) || ''));
    if (isNew) MT.costs = MT.costs.filter(x => String(x.id) !== String(id));
    else Object.assign(mtCostById(id), old);
    rets.forEach(t => { t.kind = old.kind; });
    MT.up = null;
    MT.busy = false;
    if (MT.sel && String(MT.sel.id) === String(c.id)) MT.sel.cost = f;          // the form comes back with what you typed
    mtRefresh(c.id);
    mtSay(sqlMissing ? 'Not saved: run MAINTENANCE-D3.sql in Supabase first.' : 'Not saved. Check the connection and save again.');
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
  const r0 = f && !f.isNew ? mtCostById(f.id) : null;
  if (!r0 || !c || MT.busy) return;
  const ret = !!r0.return_of;
  const rows = MT.costs.filter(x => String(x.id) === String(r0.id) || String(x.return_of) === String(r0.id));   // with its returns
  const docs = MT.docs.filter(d => rows.some(x => String(x.id) === String(d.cost_id)));
  const nRet = rows.length - 1;
  const name = ret ? (r0.receipt_no ? 'Slip ' + r0.receipt_no : 'This return') + ' (' + mtNeg(r0.amount) + ')'
                   : (r0.receipt_no ? 'Receipt ' + r0.receipt_no : (r0.description || 'This receipt'));
  const extra = [nRet ? `its ${nRet} return${nRet === 1 ? '' : 's'}` : '', docs.length ? `${docs.length} file${docs.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  const ok = await mtConfirm({ title: ret ? 'Delete this return?' : 'Delete this receipt?', text: `${name}${extra ? ' and ' + extra : ''} will be deleted for good.`, ok: 'Delete', danger: true });
  if (!ok) return;
  MT.busy = true;
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

/* ── Schadensbericht (D5) ─────────────────────────────────────
   Details of a Schaden hold the report fields; Documents › "Schadensbericht"
   opens a short form in place (only the report choices): Zimmer (Casa
   Castel) · Mieter · Mieter unterschreibt mit · Versicherung (saved once per
   property) · photos in / out + Beschreibung. "PDF erstellen" builds the PDF
   with the app's document code (maint-schaden-pdf.js · cc-ueberg-photos.js ·
   pdf-open.js), saves it in Documents (a new version each time, the report
   number stays) and opens it in the viewer.                              */
const mtNorm = v => String(v || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
function mtIsCasa(pid) {
  const p = mtProp(pid);
  return Number(pid) === MT_CASA_ID || (!!p && mtNorm(p.name) === 'casacastel');
}
const mtLabelOf = (list, v) => (list.find(x => x[0] === v) || [, ''])[1];

/* Details › the Schaden-only report fields (shown with the Schaden type) — D6: only what the report uses */
function mtSbFieldsHTML(d) {
  const sch = d.kind === 'schaden', hid = sch ? '' : ' hidden';
  const opt = (list, v) => `<option value=""${v ? '' : ' selected'}>—</option>` +
    list.map(([k, l]) => `<option value="${mtEsc(k)}"${v === k ? ' selected' : ''}>${mtEsc(l)}</option>`).join('');
  const arten = (typeof MT_SB_ARTEN !== 'undefined' ? MT_SB_ARTEN : []).map(a => [a, a]);
  const casa = mtIsCasa(d.property_id), police = /Einbruch/.test(d.schadensart || '');
  const f = (id, label, field, extra) => `<div class="mt-f${extra && extra.full ? ' mt-f--full' : ''}" data-only="schaden"${extra && extra.sb ? ` data-sb="${extra.sb}"` : ''}${extra && extra.hide !== undefined ? (extra.hide ? ' hidden' : '') : hid}><label class="mt-k" for="${id}">${label}</label>${field}</div>`;
  const ta = (id, v, ph, rows) => `<textarea class="mt-in mt-ta" id="${id}" rows="${rows || 3}" maxlength="2000" placeholder="${mtEsc(ph)}">${mtEsc(v || '')}</textarea>`;
  return `
        <p class="mt-sbh mt-f--full" data-only="schaden"${hid}>For the Schadensbericht</p>
        ${f('mtF-art', 'Schadensart', `<select class="mt-in" id="mtF-art">${opt(arten, d.schadensart)}</select>`)}
        ${f('mtF-found', 'Festgestellt am', `<input class="mt-in" id="mtF-found" type="date" value="${mtEsc(d.festgestellt_am || '')}"/>`)}
        ${MT.d6 ? f('mtF-visit', 'Besichtigung vor Ort', `<input class="mt-in" id="mtF-visit" type="text" maxlength="160" autocomplete="off" placeholder="z. B. 14.10.2026, 20:00 Uhr, durch die Eigentümer" value="${mtEsc(d.besichtigung || '')}"/>`, { full: true }) : ''}
        ${f('mtF-cause', 'Vermutete Ursache', ta('mtF-cause', d.ursache, 'z. B. Wasser kommt aus der Wohnung zwei Stockwerke darüber – noch ungeklärt', 2), { full: true })}
        ${f('mtF-measures', 'Sofortmaßnahmen', ta('mtF-measures', d.massnahmen, 'One point per line, e.g. Hausmeister hat das Wasser abgestellt'), { full: true })}
        ${MT.d6 ? f('mtF-ask', 'Bitte an die Hausverwaltung', ta('mtF-ask', d.bitte_hv, 'One point per line, e.g. Leckortung veranlassen'), { full: true, sb: 'ask', hide: !sch || casa }) : ''}
        ${f('mtF-police', 'Polizei-Aktenzeichen', `<input class="mt-in" id="mtF-police" type="text" maxlength="60" autocomplete="off" value="${mtEsc(d.polizei_az || '')}"/>`, { sb: 'police', hide: !sch || !police })}
        <p class="mt-hint mt-f--full" data-only="schaden"${hid}>Description = the Schadensbild in the report: one line per point.</p>`;
}
/* Which Schaden fields show: type Schaden · Betroffen only for apartments · Polizei only for Einbruch / Vandalismus */
function mtSbVis() {
  const kind = document.getElementById('mtF-kind')?.value;
  const sch = kind === 'schaden';
  const casa = mtIsCasa(document.getElementById('mtF-prop')?.value);
  const police = /Einbruch/.test(document.getElementById('mtF-art')?.value || '');
  document.querySelectorAll('#mtPanel [data-only="schaden"]').forEach(el => {
    const sb = el.dataset.sb;
    el.hidden = !sch || ((sb === 'own' || sb === 'ask') && casa) || (sb === 'police' && !police);
  });
}

/* Everything the report needs from the other apps (fresh each time the form opens) */
async function mtSbLoad() {
  const sb = _ctlSupa;
  const all = t => sb.from(t).select('*').then(r => (r.error ? [] : r.data || []), () => []);
  const [rooms, ten, apts, verw, rten, vers] = await Promise.all([
    all('rooms'), all('tenant_records'), all('rentals_apartments'), all('rentals_verwaltung'), all('rnt_tenant_records'), all('maint_props'),
  ]);
  try { if (typeof loadSettings === 'function') await loadSettings(); } catch (e) {}
  vers.forEach(r => { MT.vers[String(r.property_id)] = r; });
  MT.sbData = {
    rooms: rooms.filter(r => r.active !== false).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).map(r => r.name).filter(Boolean),
    ten, apts, verw, rten,
  };
}
/* The Rentals apartment of a property (link in Controlling, else the same name) */
function mtSbApt(c) {
  const p = mtProp(c.property_id), apts = (MT.sbData && MT.sbData.apts) || [];
  if (!p) return null;
  if (p.rentals_apartment_ref) return apts.find(a => String(a.id) === String(p.rentals_apartment_ref)) || null;
  return apts.find(a => mtNorm(a.name) === mtNorm(p.name)) || null;
}
/* Any stored date → YYYY-MM-DD */
function mtIso(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
const mtSbNames = r => [[r.first_name, r.last_name], [r.first_name_2, r.last_name_2], [r.first_name_3, r.last_name_3]]
  .map(x => x.filter(Boolean).join(' ')).filter(Boolean).join(', ') || r.name || '';
/* Who lived there on the Schadenstag (else today) */
function mtSbTenant(c, room) {
  const D = MT.sbData; if (!D) return '';
  const day = c.case_date || ccTodayISO();
  let list;
  if (mtIsCasa(c.property_id)) {
    if (!room || room === MT_SB_ALL) return '';
    list = D.ten.filter(r => String(r.room || '') === room);
  } else {
    const apt = mtSbApt(c); if (!apt) return '';
    list = D.rten.filter(r => String(r.apartment_id) === String(apt.id));
  }
  const inside = r => { const a = mtIso(r.mietbeginn), b = mtIso(r.mietende); return (!a || a <= day) && (!b || b >= day); };
  let hits = list.filter(inside);
  if (!hits.length && day >= ccTodayISO()) hits = list.filter(r => r.status === 'active');
  hits.sort((a, b) => mtIso(b.mietbeginn).localeCompare(mtIso(a.mietbeginn)));
  return hits.length ? mtSbNames(hits[0]) : '';
}
/* The photos of the entry, in the order they were taken */
function mtSbPhotos(c) {
  const t = p => String(p.taken_at || p.doc_date || p.created_at || '');
  return mtCaseDocs(c.id).filter(d => d.doc_type === 'photo').sort((a, b) => t(a).localeCompare(t(b)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
function mtSbWhen(p) {
  if (p.taken_at) {
    const d = new Date(p.taken_at);
    if (!isNaN(d)) { const two = n => String(n).padStart(2, '0'); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}`; }
  }
  return mtDate(p.doc_date || ccDayOf(p.created_at)) || '';
}
function mtSbNextNo() {
  const y = new Date().getFullYear();
  const n = MT.cases.map(x => String(x.report_no || '').match(/^SB-(\d{4})-(\d+)$/)).filter(m => m && Number(m[1]) === y).map(m => Number(m[2]));
  return `SB-${y}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}

/* ── the form ── */
async function mtSbOpen() {
  const c = mtOpenCase();
  if (!c || c.kind !== 'schaden' || mtActive(c)) return;
  if (!MT.d5) { mtSay('Run MAINTENANCE-D5.sql in Supabase first.'); return; }
  MT.sel.sb = { ready: false };
  mtRenderPanel();
  document.getElementById('mtDocs')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  await mtSbLoad();
  const f = MT.sel && MT.sel.sb;
  if (!f || String(MT.sel.id) !== String(c.id)) return;
  const casa = mtIsCasa(c.property_id), rooms = MT.sbData.rooms;
  let room = c.report_room || '';
  if (casa && !room) room = rooms.find(r => mtNorm(c.area).includes(mtNorm(r))) || '';       // "Zimmer Oslo" → Oslo
  const S = (typeof appSettings !== 'undefined' && appSettings) || {}, apt = casa ? null : mtSbApt(c);
  const auto = mtSbTenant(c, room);
  Object.assign(f, {
    ready: true, room,
    mieter: c.report_mieter || auto, mieterAuto: !c.report_mieter,
    ort: c.report_ort || S.unterschrift_ort || (apt && apt.unterschrift_ort) || '',
    dringend: c.report_dringend || '', anlagen: c.report_anlagen || '',
    photosOn: mtSbPhotos(c).length > 0, busy: false, done: '',
  });
  mtRenderPanel();
}
function mtSbCapture() {
  const f = MT.sel && MT.sel.sb, g = id => document.getElementById(id);
  if (!f || !f.ready || !g('mtSb-form')) return;
  if (g('mtSb-room')) f.room = g('mtSb-room').value;
  if (g('mtSb-mieter')) f.mieter = g('mtSb-mieter').value;
  if (g('mtSb-ort')) f.ort = g('mtSb-ort').value;
  if (g('mtSb-urgent')) f.dringend = g('mtSb-urgent').value;
  if (g('mtSb-extra')) f.anlagen = g('mtSb-extra').value;
}
function mtSbFormHTML(c, f) {
  if (!f.ready) return `<div class="mt-ab mt-sb" id="mtSb-form"><p class="mt-sb__t"><i class="ti ti-file-description" aria-hidden="true"></i>Schadensbericht</p>
    <p class="mt-up" role="status"><span class="mt-spin" aria-hidden="true"></span>Loading…</p></div>`;
  const casa = mtIsCasa(c.property_id);
  const rooms = casa ? MT.sbData.rooms.slice() : [];
  if (casa && f.room && f.room !== MT_SB_ALL && !rooms.includes(f.room)) rooms.push(f.room);
  const photos = mtSbPhotos(c);
  let n = 0;
  const tiles = photos.map(p => {
    const on = p.in_report !== false;
    return `<button type="button" class="mt-sbt${on ? '' : ' is-off'}" data-mt="sbPhoto" data-id="${mtEsc(p.id)}" aria-label="${on ? 'Photo ' + (n + 1) : 'Photo not in the report'}${p.caption ? ': ' + mtEsc(p.caption) : ''}">
        <img alt="" loading="lazy" data-path="${mtEsc(p.file_path)}" data-thumb="${mtEsc(mtThumbPath(p.file_path))}"/>
        ${on ? `<span class="mt-sbt__no">${++n}</span>` : '<span class="mt-sbt__off"><i class="ti ti-eye-off" aria-hidden="true"></i></span>'}
        ${p.caption ? '<span class="mt-sbt__cap" aria-hidden="true"><i class="ti ti-align-left"></i></span>' : ''}
      </button>`;
  }).join('');
  const busy = !!f.busy;
  return `<div class="mt-ab mt-sb" id="mtSb-form">
      <p class="mt-sb__t"><i class="ti ti-file-description" aria-hidden="true"></i>Schadensbericht${c.report_no ? ' · ' + mtEsc(c.report_no) : ''}</p>
      <div class="mt-grid">
        ${casa ? `<div class="mt-f mt-f--full"><label class="mt-k" for="mtSb-room">Zimmer</label><select class="mt-in" id="mtSb-room">
          <option value=""${f.room ? '' : ' selected'}>Choose</option>
          ${rooms.map(r => `<option value="${mtEsc(r)}"${f.room === r ? ' selected' : ''}>${mtEsc(r)}</option>`).join('')}
          <option value="${MT_SB_ALL}"${f.room === MT_SB_ALL ? ' selected' : ''}>Gemeinschaftsfläche</option></select></div>` : ''}
        <div class="mt-f"><label class="mt-k" for="mtSb-mieter">Mieter</label>
          <input class="mt-in" id="mtSb-mieter" type="text" maxlength="160" autocomplete="off" placeholder="${casa && f.room === MT_SB_ALL ? 'optional' : ''}" value="${mtEsc(f.mieter || '')}"/></div>
        <div class="mt-f"><label class="mt-k" for="mtSb-ort">Ort</label>
          <input class="mt-in" id="mtSb-ort" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Mainz" value="${mtEsc(f.ort || '')}"/></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtSb-urgent">Dringend <span class="mt-mu">(optional)</span></label>
          <input class="mt-in" id="mtSb-urgent" type="text" maxlength="200" autocomplete="off" placeholder="z. B. Wasser tritt aus Decke und Leuchte aus, Elektrik im Bad defekt" value="${mtEsc(f.dringend || '')}"/></div>
        <div class="mt-f mt-f--full"><label class="mt-k" for="mtSb-extra">Weitere Anlagen <span class="mt-mu">(optional)</span></label>
          <textarea class="mt-in mt-ta" id="mtSb-extra" rows="2" maxlength="600" placeholder="One per line, e.g. 2 Videos separat (IMG_9009.mov)">${mtEsc(f.anlagen || '')}</textarea></div>
        <div class="mt-f mt-f--full"><span class="mt-k">Fotos</span>
          <div class="mt-seg" role="group" aria-label="Fotos im Bericht">
            <button type="button" class="mt-seg__b${f.photosOn ? '' : ' is-on'}" data-mt="sbFotos" data-v="0" aria-pressed="${!f.photosOn}">Ohne Fotos</button>
            <button type="button" class="mt-seg__b${f.photosOn ? ' is-on' : ''}" data-mt="sbFotos" data-v="1" aria-pressed="${!!f.photosOn}">Mit Fotos</button>
          </div>
          ${f.photosOn ? `<div class="mt-sbg">${tiles}
            <button type="button" class="mt-sbt mt-sbt--add" data-mt="sbAddPhoto"><i class="ti ti-camera" aria-hidden="true"></i><span>Foto</span></button></div>
            <p class="mt-hint">Tap a photo to leave it out or add a Beschreibung. New photos are kept in the entry too.</p>` : ''}
        </div>
      </div>
      ${f.done ? `<p class="mt-sb__ok"><i class="ti ti-check" aria-hidden="true"></i>Saved in Documents · Stand ${mtEsc(f.done)}</p>` : ''}
      <div class="cc-sec-foot">
        <span aria-hidden="true"></span>
        <span class="cc-foot-right">
          <button type="button" class="cc-foot-btn" data-mt="sbCancel"${busy ? ' disabled' : ''}>${f.done ? 'Close' : 'Cancel'}</button>
          <button type="button" class="cc-foot-btn mt-save" data-mt="sbMake" data-cc-pdf="1"${busy ? ' disabled' : ''}>${busy ? 'Creating PDF…' : (f.done ? 'PDF again' : 'PDF erstellen')}</button>
        </span>
      </div>
    </div>`;
}
function mtSbRoomChanged() {
  const s = MT.sel, c = s && !s.isNew ? mtCase(s.id) : null, f = s && s.sb;
  if (!c || !f || !f.ready) return;
  mtSbCapture();
  if (f.mieterAuto || !String(f.mieter || '').trim()) { f.mieter = mtSbTenant(c, f.room); f.mieterAuto = true; }
  mtRenderPanel();
}

/* Photo sheet: bigger photo · in the report yes / no · Beschreibung (saved to the photo) */
function mtSbPhotoSheet(id) {
  const p = MT.docs.find(x => String(x.id) === String(id));
  if (!p) return;
  mtSbCapture();
  document.getElementById('mtSbSheet')?.remove();
  const url = mtLinkNow(p.file_path) || mtLinkNow(mtThumbPath(p.file_path)) || '';
  const h = document.createElement('div');
  h.id = 'mtSbSheet';
  h.className = 'mt-cf';
  h.innerHTML = `<div class="mt-cf__bg" data-v="0"></div>
    <div class="mt-cf__s mt-sbs" role="dialog" aria-modal="true" aria-label="Photo">
      <div class="mt-sbs__img">${url ? `<img src="${mtEsc(url)}" alt=""/>` : '<span class="mt-mu">…</span>'}</div>
      <label class="mt-chk mt-sbs__in"><input type="checkbox" id="mtSbsIn"${p.in_report === false ? '' : ' checked'}/><span>In the report</span></label>
      <label class="mt-k" for="mtSbsCap">Beschreibung <span class="mt-mu">(optional)</span></label>
      <input class="mt-in" id="mtSbsCap" type="text" maxlength="120" autocomplete="off" placeholder="z. B. Wand hinter dem WC" value="${mtEsc(p.caption || '')}"/>
      <div class="mt-cf__b">
        <button type="button" class="mt-btn mt-btn--p" data-v="1">Done</button>
        <button type="button" class="mt-btn mt-btn--s" data-v="0">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(h);
  if (!url) mtPrepareLinks([p.file_path]).then(() => { const u = mtLinkNow(p.file_path), box = h.querySelector('.mt-sbs__img'); if (u && box) box.innerHTML = `<img src="${mtEsc(u)}" alt=""/>`; });
  const done = async save => {
    document.removeEventListener('keydown', key, true);
    const inRep = h.querySelector('#mtSbsIn').checked, cap = h.querySelector('#mtSbsCap').value.trim();
    h.remove();
    if (!save || (inRep === (p.in_report !== false) && cap === String(p.caption || ''))) return;
    const old = { in_report: p.in_report, caption: p.caption };
    p.in_report = inRep; p.caption = cap || null;
    mtRenderPanel();
    const r = await mtTry(() => _ctlSupa.from('maint_docs').update({ in_report: inRep, caption: cap || null }).eq('id', p.id));
    if (r.error) { Object.assign(p, old); mtRenderPanel(); mtSay('Not saved. Check the connection and try again.'); }
  };
  const key = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); done(false); } };
  document.addEventListener('keydown', key, true);
  h.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { e.stopPropagation(); done(b.dataset.v === '1'); } });
  h.querySelector('#mtSbsCap').addEventListener('keydown', e => { if (e.key === 'Enter') done(true); });
}

/* "Foto" in the form: camera or library → saved to the entry (with the time it was taken), in the report */
function mtSbAddPhoto() {
  const c = mtOpenCase(), f = MT.sel && MT.sel.sb;
  if (!c || !f || f.busy || MT.up) return;
  mtSbCapture();
  mtFileInput('mtSbPhotoInput', 'image/*', true, async files => {
    const c2 = mtOpenCase();
    if (!c2 || String(c2.id) !== String(c.id)) return;
    const imgs = files.filter(mtIsImage);
    if (!imgs.length) { mtSay('Choose photos (JPG, PNG or HEIC).'); return; }
    MT.up = { caseId: c.id, total: imgs.length, done: 0, where: 'docs' };
    let ok = 0;
    for (const x of imgs) {
      if (await mtUploadOne(c, x, { type: 'photo', amount: null, date: mtFileDay(x) }, await mtPhotoExtra(x))) ok++;
      MT.up.done++;
    }
    MT.up = null;
    mtRefresh(c.id);
    if (ok < imgs.length) mtSay(`${ok} of ${imgs.length} photos saved. Add the others again.`);
  });
}
/* When a photo was taken (from the photo itself) → saved with it (D5) */
async function mtPhotoExtra(file) {
  if (!MT.d5 || typeof _ccUbExifTime !== 'function') return {};
  try { const t = await _ccUbExifTime(file); return t ? { taken_at: new Date(t.ts).toISOString() } : {}; }
  catch (e) { return {}; }
}

/* ── the PDF ── */
function mtLoadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
async function mtSbLibs() {
  if (typeof html2canvas === 'undefined') await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if (!window.jspdf) await mtLoadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  if (!document.getElementById('mtPdfFonts')) {
    const l = document.createElement('link');
    l.id = 'mtPdfFonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Lato:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';
    document.head.appendChild(l);
  }
  try { await Promise.all(['400 26px "Playfair Display"', '400 12px "Lato"', '700 12px "Lato"', 'italic 400 10px "Lato"'].map(x => document.fonts.load(x))); } catch (e) {}
}
/* The data for the template (maint-schaden-pdf.js) — only what the Hausverwaltung needs */
function mtSbData(c, f, photoCount) {
  const S = (typeof appSettings !== 'undefined' && appSettings) || {};
  const casa = mtIsCasa(c.property_id), apt = casa ? null : mtSbApt(c);
  const adresse = casa ? [S.objekt_adresse, S.objekt_plz_ort].filter(Boolean).join(', ')
                       : (apt ? [apt.adresse, apt.plz_ort].filter(Boolean).join(', ') : '');
  const room = casa && f.room && f.room !== MT_SB_ALL ? f.room : '';
  const unit = casa ? (room ? ['Zimmer', room] : ['Bereich', c.area || 'Gemeinschaftsfläche'])
                    : (apt && apt.wohnungsnummer ? ['Wohnung', String(apt.wohnungsnummer)] : ['', '']);
  // "WHG 10" stays as it is; only a bare number gets "Wohnung" ("Wohnung 3")
  const nr = apt && apt.wohnungsnummer ? String(apt.wohnungsnummer).trim() : '';
  const einheit = casa ? (room ? 'Zimmer ' + room : 'Gemeinschaftsfläche')
                       : (nr ? (/^(whg|wohnung|app\.?|apartment|we)(\s|\d|$)/i.test(nr) ? nr : 'Wohnung ' + nr) : '');
  // the Zimmer is already named → the Area only when it adds something ("Zimmer Oslo" → nothing)
  const raum = casa && room && new RegExp('(^|[^a-zäöüß0-9])' + room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zäöüß0-9])', 'i').test(c.area || '') ? '' : (c.area || '');
  const found = c.festgestellt_am || c.case_date;
  const mieter = String(f.mieter || '').trim();
  const art = c.schadensart || '';
  const wort = (typeof MT_SB_TITEL !== 'undefined' && art in MT_SB_TITEL) ? MT_SB_TITEL[art] : art;
  const files = mtCaseDocs(c.id).filter(d => d.doc_type !== 'photo' && d.doc_type !== 'receipt' && !d.generated)
    .sort((a, b) => String(a.doc_date || '').localeCompare(String(b.doc_date || '')));
  const anlagen = [];
  if (photoCount) anlagen.push('Fotodokumentation (' + (photoCount === 1 ? '1 Foto' : photoCount + ' Fotos') + ', am Ende des Berichts)');
  files.forEach(d => anlagen.push([MT_DOC_DE[d.doc_type] || 'Dokument', d.file_name, mtDate(d.doc_date)].filter(Boolean).join(' · ')));
  String(f.anlagen || '').split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(x => anlagen.push(x));
  const stand = mtDate(ccTodayISO());
  return {
    family: casa ? 'casa' : 'rentals',
    objektName: casa ? 'Casa Castel' : ((apt && apt.name) || mtPropName(c)),
    einheitLabel: unit[0], einheitWert: unit[1], einheitKurz: casa ? '' : String((apt && apt.wohnungsnummer) || ''),
    titel: 'Schadensbericht' + (wort ? ' – ' + wort : ''),
    subtitle: (casa ? ['Stand ' + stand] : ['an die Hausverwaltung', 'Stand ' + stand]).join(' · '),
    stand,
    dringend: String(f.dringend || '').trim(),
    adresse, einheit, raum,
    schadenstag: c.case_date && found && c.case_date !== found ? mtDate(c.case_date) : '',
    feststellung: [mtDate(found), mieter ? 'gemeldet von ' + mieter : ''].filter(Boolean).join(' · '),
    besichtigung: c.besichtigung || '',
    behoben: mtDate(c.end_date),
    schadennummer: c.schadennummer || '',
    polizei: /Einbruch/.test(art) ? (c.polizei_az || '') : '',
    schadensbild: c.description || '',
    ursache: c.ursache || '',
    massnahmen: c.massnahmen || '',
    bitteHv: casa ? '' : (c.bitte_hv || ''),
    anlagen,
    ort: String(f.ort || '').trim(),
    vermieter: S.vermieter_name || '', kontakt: S.vermieter_email || '',
    footerAdresse: adresse,
  };
}
/* The photos in the report → as the Übergabe photo pages expect them */
async function mtSbPhotoData(c) {
  const out = [];
  for (const p of mtSbPhotos(c).filter(x => x.in_report !== false)) {
    let blob = null;
    for (let i = 0; i < 2 && !blob; i++) {
      try { const r = await _ctlSupa.storage.from(MT_BUCKET).download(p.file_path); if (!r.error) blob = r.data; } catch (e) {}
    }
    if (!blob) throw new Error('A photo could not be loaded.');
    const img = await _ccUbLoadImage(blob);
    out.push({ ...img, ts: Date.parse(p.taken_at || p.created_at) || Date.now(), when: mtSbWhen(p), taken: true, caption: p.caption || '' });
  }
  return out;
}
/* Keep the PDF in Documents (a new version each time) */
async function mtSbStore(c, blob, name) {
  const sb = _ctlSupa, id = mtUuid(), path = `${c.id}/${id}.pdf`;
  const up = await mtTry(() => sb.storage.from(MT_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' }));
  if (up.error) { console.error('[maintenance] report upload failed:', up.error); return false; }
  const row = { id, case_id: c.id, doc_type: 'schadenbericht', file_path: path, file_name: name, doc_date: ccTodayISO(), generated: true };
  const ins = await mtTry(() => sb.from('maint_docs').insert(row));
  if (ins.error) {
    console.error('[maintenance] report row failed:', ins.error);
    try { await sb.storage.from(MT_BUCKET).remove([path]); } catch (e) {}
    return false;
  }
  MT.docs.push({ ...row, created_at: new Date().toISOString() });
  return true;
}
/* Remember the report no. and the choices of the form for next time */
async function mtSbRemember(c, f) {
  const patch = { report_no: f.reportNo, report_room: f.room || null, report_mieter: String(f.mieter || '').trim() || null };
  if (MT.d6) Object.assign(patch, {
    report_ort: String(f.ort || '').trim() || null,
    report_dringend: String(f.dringend || '').trim() || null,
    report_anlagen: String(f.anlagen || '').trim() || null,
  });
  const r = await mtTry(() => _ctlSupa.from('maint_cases').update(patch).eq('id', c.id));
  if (!r.error) Object.assign(c, patch); else console.warn('[maintenance] report choices not saved:', r.error);
}
async function mtSbMake() {
  const s = MT.sel, c = s && !s.isNew ? mtCase(s.id) : null, f = s && s.sb;
  const stop = msg => { if (typeof ccCancelPdf === 'function') ccCancelPdf(); if (msg) mtSay(msg); };
  if (!c || !f || !f.ready || f.busy || MT.busy || MT.up) return stop();
  mtSbCapture();
  if (mtIsCasa(c.property_id) && !f.room) { stop('Choose the Zimmer (or Gemeinschaftsfläche).'); document.getElementById('mtSb-room')?.focus(); return; }
  if (typeof mtSbHTML !== 'function' || typeof ccRenderPagesToPdf !== 'function' || typeof ccUbAddPhotoPages !== 'function') return stop('The PDF files are missing. Upload all files of this update.');
  f.busy = true; f.done = '';
  mtRenderPanel();
  let box = null;
  try {
    await mtSbLibs();
    f.reportNo = c.report_no || mtSbNextNo();
    const photos = f.photosOn ? await mtSbPhotoData(c) : [];
    const d = mtSbData(c, f, photos.length);
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:0;left:-9999px;width:794px;background:#fff;z-index:-1;font-size:11.33px;';
    box.innerHTML = mtSbHTML(d);
    document.body.appendChild(box);
    await document.fonts.ready;
    await new Promise(r => setTimeout(r, 300));
    _ccUb['mt-sb'] = { on: photos.length > 0, photos };
    await ccUbAddPhotoPages('mt-sb', box, { sub: 'Schadensbericht · ' + [c.title, d.objektName].filter(Boolean).join(' · ') });
    // casa-castel.css "img { display:block }" moves html2canvas' text-measuring image off the line,
    // which drops text a few px under its tick box → keep that image inline while the PDF is drawn
    const fix = document.createElement('style');
    fix.textContent = 'body > div[style*="visibility: hidden"] > img { display:inline !important; }';
    document.head.appendChild(fix);
    let pdf;
    try { pdf = await ccRenderPagesToPdf(box, { strict: true }); }
    finally { fix.remove(); }
    const name = `Schadensbericht ${f.reportNo} Stand ${d.stand}.pdf`;
    if (!(await mtSbStore(c, pdf.output('blob'), name))) throw new Error('store');
    await mtSbRemember(c, f);
    f.busy = false; f.done = d.stand;
    mtRefresh(c.id);
    await ccOpenPdf(pdf, ccPdfFileName('Schadensbericht', f.reportNo, d.objektName, 'Stand ' + d.stand));
  } catch (e) {
    console.error('[maintenance] Schadensbericht:', e);
    f.busy = false;
    if (MT.sel && MT.sel.sb === f) mtRenderPanel();
    const m = String((e && e.message) || '');
    stop(/did not fit/.test(m) ? m : /photo/i.test(m) ? 'A photo could not be loaded. Check the connection and try again.'
      : 'The Schadensbericht could not be created. Check the connection and try again.');
  } finally {
    if (box) box.remove();
    try { delete _ccUb['mt-sb']; } catch (e) {}
  }
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
    else if (a === 'fold') {
      const k = b.dataset.key, cur = MT.open[k] === undefined ? b.dataset.auto === '1' : !!MT.open[k];
      MT.open[k] = !cur;
      mtRender();
    }
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
    else if (a === 'costReturn') mtCostNewReturn();
    else if (a === 'sbOpen') mtSbOpen();
    else if (a === 'sbCancel') { if (MT.sel && MT.sel.sb && !MT.sel.sb.busy) { MT.sel.sb = null; mtRenderPanel(); } }
    else if (a === 'sbFotos') { const f = MT.sel && MT.sel.sb; if (f && !f.busy) { mtSbCapture(); f.photosOn = b.dataset.v === '1'; mtRenderPanel(); } }
    else if (a === 'sbPhoto') { if (MT.sel && MT.sel.sb && !MT.sel.sb.busy) mtSbPhotoSheet(b.dataset.id); }
    else if (a === 'sbAddPhoto') mtSbAddPhoto();
    else if (a === 'sbMake') mtSbMake();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (!t) return;
    if (t.id === 'mtF-kind') mtKindChanged();
    else if (t.id === 'mtF-prop' || t.id === 'mtF-art') mtSbVis();
    else if (t.id === 'mtSb-room') mtSbRoomChanged();
    else if (t.dataset && t.dataset.docType) mtDocTypeChanged(t.dataset.docType);
  });
  document.addEventListener('input', e => {             // the Mieter typed by hand is kept when the Zimmer changes
    if (e.target && e.target.id === 'mtSb-mieter' && MT.sel && MT.sel.sb) MT.sel.sb.mieterAuto = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && MT.sel && !document.getElementById('mtConfirm') && !document.getElementById('ccCal')
        && !document.getElementById('mtSbSheet') && !document.getElementById('ccPdfSheet')) mtClose();
  });
}

/* ── Link from Controlling: #cost=<cost id> · #c=<entry id> → open that entry ── */
function mtOpenLink() {
  const h = String(location.hash || '').replace(/^#/, '');
  if (!h) return;
  const q = {};
  h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!q.cost && !q.c) return;
  const r = q.cost ? mtCostById(q.cost) : null;
  const c = mtCase(r ? r.case_id : q.c);
  if (!c) { mtSay('This entry is no longer in Maintenance.'); return; }
  mtSwitchTab(c.kind);
  mtOpen(c.id).then(() => setTimeout(() => {
    const sel = r && (window.CSS && CSS.escape ? CSS.escape(String(r.id)) : String(r.id));
    const row = sel ? document.querySelector(`#mtCosts .mt-cr[data-id="${sel}"]`) : null;
    (row || document.getElementById('mtCosts'))?.scrollIntoView({ block: 'center' });
    if (row) { row.classList.add('is-flash'); setTimeout(() => row.classList.remove('is-flash'), 1600); }
  }, 60));
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
    mtOpenLink();
  } catch (e) {
    console.error('[maintenance] boot failed:', e);
    MT.loadError = e;
    document.getElementById('appShell').style.display = 'block';
    mtSwitchTab(MT.tab);
  } finally {
    ctlShowLoading(false);
  }
}
