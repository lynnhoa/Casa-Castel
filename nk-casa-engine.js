/* ─────────────────────────────────────────────────────────────
   NK ENGINE · CASA CASTEL  (day-exact Nebenkosten split)
   nk-casa-engine.js

   Pure calculation — no screen, no database writes. Used by
   Settlements › Casa Castel (phase 4). Same method as the Excel
   "Nebenkostenabrechnung Tool" (WG sheets), tested against it.

   Rules
     · every day of the period on its own
     · Personen  each day's cost ÷ tenants living there that day
     · Flaeche   each day's cost × room m² ÷ m² of the rooms lived in that day
                 (Gas / Heizung)
     · booking   month = counts in the days of its month
                 year  = spread evenly over all days of the period
                 from  = from its date to the end of the period
                         (NK one-offs: tenants who already left pay nothing)
     · Pauschal tenants count as people / m² — their share stays with the landlord
     · a day with nobody (or no m²) → that day's cost stays with the landlord
     · each tenant line is rounded to cents (half away from zero, like Excel);
       the rounding difference goes to the landlord, so the check always adds up
     · per tenant line: range = how many people (Personen) or how many m² (Fläche)
       shared the cost on that tenant's days → shown as "1/6" or "1/5 – 1/8" in the letter

   Input  NkCasa.calc({ period:{from,to}, tenancies:[…], lines:[…] })
     tenancy  { key, tenantId, name, room, m2, from, to, mode:'nk'|'pauschal',
                vz (paid €, optional) | vzMonthly (€/month, optional) }
     line     { id, label, group:'running'|'hausgeld'|'oneoff', key:'personen'|'flaeche',
                parts:[{ amount, spread:'month'|'year'|'from', month:'YYYY-MM', date:'YYYY-MM-DD' }] }
   Output { days, lines:[{…, total, byTenant, landlord}], tenants:[{…, lines, sum, vz, saldo}],
            landlord:{ total, pauschal, vacancy, rounding }, check:{ total, allocated, landlord, diff, ok } }

   Adapter NkCasa.fromControlling(year) builds the input from Controlling + Casa data.
   ───────────────────────────────────────────────────────────── */

'use strict';

const NkCasa = (() => {
  /* ── dates ── */
  const D = iso => String(iso || '').slice(0, 10);
  const toDate = iso => new Date(D(iso) + 'T12:00:00Z');
  const fromDate = d => d.toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return fromDate(d); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5) + 1;
  const daysInMonth = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();

  /* ── money: cents, half away from zero (Excel ROUND) ── */
  const r2 = v => { const n = Number(v) || 0, s = n < 0 ? -1 : 1; return s * Math.round(Math.abs(n) * 100 + 1e-9) / 100; };

  /* ── the calculation ── */
  function calc(input) {
    const per = { from: D(input.period.from), to: D(input.period.to) };
    const N = daysBetween(per.from, per.to);
    const days = Array.from({ length: N }, (_, i) => addDays(per.from, i));
    const ten = (input.tenancies || []).map((t, i) => ({
      key: t.key || String(i), tenantId: t.tenantId ?? null, name: t.name || '', room: t.room || '',
      m2: Number(t.m2) || 0, mode: t.mode === 'pauschal' ? 'pauschal' : 'nk',
      from: D(t.from) < per.from ? per.from : D(t.from), to: !t.to || D(t.to) > per.to ? per.to : D(t.to),
      vz: t.vz, vzMonthly: t.vzMonthly,
    })).filter(t => t.from <= t.to);

    // who lives there each day (indexes into ten)
    const present = days.map(d => ten.map((t, i) => (t.from <= d && d <= t.to ? i : -1)).filter(i => i >= 0));

    // daily cost of one booking part
    const partDaily = (p) => {
      const out = new Float64Array(N), amt = Number(p.amount) || 0;
      if (!amt) return out;
      if (p.spread === 'year') { for (let i = 0; i < N; i++) out[i] = amt / N; return out; }
      if (p.spread === 'from') {
        const start = D(p.date) < per.from ? per.from : D(p.date);
        if (start > per.to) return out;
        const n = daysBetween(start, per.to);
        for (let i = 0; i < N; i++) if (days[i] >= start) out[i] = amt / n;
        return out;
      }
      // month (default): the month's days inside the period
      const ym = String(p.month || D(p.date).slice(0, 7));
      const dim = daysInMonth(ym);
      for (let i = 0; i < N; i++) if (days[i].slice(0, 7) === ym) out[i] = amt / dim;
      return out;
    };

    const lines = [];
    const exact = ten.map(() => ({}));                         // exact (unrounded) per tenancy per line
    const land = { pauschal: 0, vacancy: 0 };
    for (const ln of (input.lines || [])) {
      const daily = new Float64Array(N);
      for (const p of (ln.parts || [])) { const d = partDaily(p); for (let i = 0; i < N; i++) daily[i] += d[i]; }
      let total = 0, lp = 0, lv = 0;
      const by = new Float64Array(ten.length);
      const rng = ten.map(() => null);                       // { lo, hi } people (Personen) or m² (Fläche) sharing it
      const seen = (k, v) => { const r = rng[k] || (rng[k] = { lo: v, hi: v }); if (v < r.lo) r.lo = v; if (v > r.hi) r.hi = v; };
      for (let i = 0; i < N; i++) {
        const c = daily[i]; if (!c) continue;
        total += c;
        const who = present[i];
        if (ln.key === 'flaeche') {
          const m2 = who.reduce((s, k) => s + ten[k].m2, 0);
          if (!m2) { lv += c; continue; }
          for (const k of who) { by[k] += c * ten[k].m2 / m2; seen(k, Math.round(m2 * 100) / 100); }
        } else {
          if (!who.length) { lv += c; continue; }
          for (const k of who) { by[k] += c / who.length; seen(k, who.length); }
        }
      }
      const range = {};
      const byTenant = {};
      ten.forEach((t, k) => {
        if (t.mode === 'pauschal') { lp += by[k]; return; }
        if (!by[k]) return;
        exact[k][ln.id] = by[k];
        byTenant[t.key] = r2(by[k]);
        if (rng[k]) range[t.key] = rng[k];
      });
      const totalR = r2(total);
      const alloc = r2(Object.values(byTenant).reduce((s, v) => s + v, 0));
      land.pauschal += lp; land.vacancy += lv;
      lines.push({ id: ln.id, label: ln.label, group: ln.group || 'running', key: ln.key === 'flaeche' ? 'flaeche' : 'personen',
                   total: totalR, byTenant, range, landlord: r2(totalR - alloc), info: ln.info || null, catId: ln.catId ?? null });
    }

    // per tenancy: lines, sum, prepayments, result
    const monthsShare = t => {                                  // Excel "Monate (tagesanteilig)"
      let m = 0; for (let d = t.from; d <= t.to; d = addDays(d, 1)) m += 1 / daysInMonth(d.slice(0, 7)); return m;
    };
    const tenants = ten.map((t, k) => {
      const tl = lines.filter(l => l.byTenant[t.key] !== undefined).map(l => ({
        id: l.id, label: l.label, group: l.group, key: l.key, total: l.total, amount: l.byTenant[t.key],
        share: l.total ? l.byTenant[t.key] / l.total : 0, range: l.range[t.key] || null, catId: l.catId,
      }));
      const sum = r2(tl.reduce((s, l) => s + l.amount, 0));
      const months = monthsShare(t);
      const vz = t.mode === 'pauschal' ? 0 : r2(t.vz !== undefined && t.vz !== null ? t.vz : (Number(t.vzMonthly) || 0) * months);
      return { key: t.key, tenantId: t.tenantId, name: t.name, room: t.room, m2: t.m2, mode: t.mode,
               from: t.from, to: t.to, days: daysBetween(t.from, t.to), months, lines: tl, sum, vz,
               saldo: t.mode === 'pauschal' ? 0 : r2(sum - vz) };            // > 0 Nachzahlung · < 0 Guthaben
    });

    const total = r2(lines.reduce((s, l) => s + l.total, 0));
    const allocated = r2(tenants.reduce((s, t) => s + t.sum, 0));
    const landTotal = r2(total - allocated);
    const pauschal = r2(land.pauschal), vacancy = r2(land.vacancy);
    const rounding = r2(landTotal - pauschal - vacancy);
    return {
      period: per, days: N, lines, tenants,
      landlord: { total: landTotal, pauschal, vacancy, rounding },
      check: { total, allocated, landlord: landTotal, diff: r2(total - allocated - landTotal), ok: Math.abs(total - allocated - landTotal) < 0.005 },
    };
  }

  /* ── adapter: Controlling + Casa data → input ──
     costs     Controlling › Casa Castel › Expenses (confirmed amounts) per cost type with nk_key / nk_spread (Setup)
               + One-off entries with the NK switch: Hausgeld (kind Versorger) → its cost type, over the year;
                 any other → its cost type (or general house costs), from its invoice date
     tenants   Controlling settlement model (Casa Castel tenant records, Pauschal spans already split)
     m²        Casa Castel › Rooms
     paid NK   Controlling › Casa Castel › Income, per room and month; a month shared by two tenants is split by days */
  function fromControlling(year, src) {
    // src (optional): the year's own rows { castel_expenses, one_time, income } — Settlements loads last year
    // separately, so Controlling's current year stays untouched
    const W = window, S = W._src || {};
    const C0 = W._ctrl || {};
    if (!src && Number(C0.year) !== Number(year)) return { error: 'load', message: 'Load ' + year + ' in Controlling first' };
    const C = src ? { categories: C0.categories, castel_expenses: src.castel_expenses || [], one_time: src.one_time || [], income: src.income || [] } : C0;
    const CASA = typeof CASA_PROP_ID !== 'undefined' ? CASA_PROP_ID : 7;
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    // the period comes from Casa's "beginnt am" (Controlling › Setup) — never assumed to be 01.01.–31.12.
    const period = src && src.period ? { from: D(src.period.from), to: D(src.period.to) } : { from: year + '-01-01', to: year + '-12-31' };
    // Running year (Oct 2026): a preview counts everything only up to src.cutoff (end of the last completed month)
    //   · monthly costs: months up to the cutoff · yearly amounts (nk_spread year): the full-year amount
    //     (booked + still due per Setup) × the elapsed share · single invoices / Jahresabrechnungen: dated up to the
    //     cutoff, × the share of their own spread that has passed · lived days and NK paid: up to the cutoff
    const full = { from: period.from, to: period.to };
    const cut = src && src.cutoff ? D(src.cutoff) : '';
    const preview = !!cut && cut >= period.from && cut < period.to;
    if (preview) period.to = cut;
    const shareYear = preview ? daysBetween(period.from, cut) / daysBetween(full.from, full.to) : 1;
    const shareFrom = d => (preview && d <= cut) ? daysBetween(d, cut) / daysBetween(d, full.to) : 1;
    const nextYm = ym => { const y0 = Number(ym.slice(0, 4)), m0 = Number(ym.slice(5, 7)); return (m0 === 12 ? y0 + 1 : y0) + '-' + String(m0 === 12 ? 1 : m0 + 1).padStart(2, '0'); };
    const months = [];                                         // every month the period touches: 'YYYY-MM'
    for (let ym = period.from.slice(0, 7); ym <= period.to.slice(0, 7); ) {
      months.push(ym);
      const y0 = Number(ym.slice(0, 4)), m0 = Number(ym.slice(5, 7));
      ym = (m0 === 12 ? y0 + 1 : y0) + '-' + String(m0 === 12 ? 1 : m0 + 1).padStart(2, '0');
    }
    const warn = [];

    // cost types
    const cats = (C.categories || []);
    const catOf = id => cats.find(c => Number(c.id) === Number(id)) || null;
    const keyOf = () => 'personen';                            // Oct 2026: Casa Castel no longer splits anything by m² (Gas included)
    const inNk = c => !!c && c.code !== 'RATE' && c.nk_key !== 'none';
    const lines = [];
    const byCat = {};
    for (const e of (C.castel_expenses || [])) {
      const ym = e.year + '-' + String(e.month).padStart(2, '0');
      if (!months.includes(ym)) continue;
      const c = catOf(e.category_id);
      if (!inNk(c)) continue;
      const amt = Number(e.amount) || 0; if (!amt) continue;
      const L = byCat[c.id] || (byCat[c.id] = { id: 'cat:' + c.id, label: c.name, group: 'running', key: keyOf(c), parts: [], catId: c.id });
      if (preview && c.nk_spread === 'year') { L.booked = (L.booked || 0) + amt; continue; }   // preview: scaled below
      L.parts.push(c.nk_spread === 'year' ? { amount: amt, spread: 'year' } : { amount: amt, spread: 'month', month: ym });
    }
    if (preview) {
      // yearly cost types: full-year amount = booked so far + what is still due after the cutoff (booked early, else Setup) → × elapsed share
      for (const c of cats) {
        if (!inNk(c) || c.nk_spread !== 'year' || c.active === false) continue;
        const freq = c.frequency || 'monatlich', dm = Array.isArray(c.due_months) ? c.due_months.map(Number) : [];
        const asNeeded = /sporad|bedarf/i.test(String(freq));
        let rest = 0;
        for (let ym = nextYm(cut.slice(0, 7)); ym <= full.to.slice(0, 7); ym = nextYm(ym)) {
          const yy = Number(ym.slice(0, 4)), mm = Number(ym.slice(5, 7));
          const bk = (C.castel_expenses || []).filter(e => Number(e.category_id) === Number(c.id) && Number(e.year) === yy && Number(e.month) === mm);
          if (bk.length) { rest += bk.reduce((a, e) => a + (Number(e.amount) || 0), 0); continue; }
          const due = asNeeded ? dm.includes(mm) : freq === 'monatlich' ? (!dm.length || dm.includes(mm)) : dm.includes(mm);
          if (due && typeof ctlCastelAmountAt === 'function') rest += Number(ctlCastelAmountAt(c, yy, mm).amount) || 0;
        }
        const L = byCat[c.id] || null, booked = L ? (L.booked || 0) : 0, yearAmt = booked + rest;
        if (!yearAmt) continue;
        const LL = L || (byCat[c.id] = { id: 'cat:' + c.id, label: c.name, group: 'running', key: keyOf(c), parts: [], catId: c.id });
        LL.parts.push({ amount: r2(yearAmt * shareYear), spread: 'year' });
      }
    }
    Object.values(byCat).forEach(l => { delete l.booked; if (l.parts.length) lines.push(l); });

    // one-offs with the NK switch (Casa Castel only, settlement results excluded)
    const ABR = typeof CX_ABR_KINDS !== 'undefined' ? CX_ABR_KINDS : ['NK-Abrechnung', 'Hausgeldabrechnung'];
    for (const o of (C.one_time || [])) {
      if (Number(o.property_id) !== CASA || !o.nk_umlage || ABR.includes(o.kind)) continue;
      const d = D(o.invoice_date); if (d < period.from || d > period.to) continue;
      const c = catOf(o.nk_category_id);
      const amt = (Number(o.direction) === 1 ? -1 : 1) * (Number(o.amount) || 0);      // Guthaben / refund lowers the costs
      const hg = o.kind === 'Versorger' || /jahresabrechnung/i.test(String(o.item || ''));   // Strom · Gas · Wasser yearly result
      lines.push({ id: 'ot:' + o.id, label: [hg ? (c ? c.name + ' · Jahresabrechnung' : 'Jahresabrechnung') : (o.item || 'Rechnung')].join(''),
                   group: hg ? 'hausgeld' : 'oneoff', key: keyOf(c),
                   parts: [hg ? { amount: r2(amt * shareYear), spread: 'year' } : { amount: r2(amt * shareFrom(d)), spread: 'from', date: d }], catId: hg && c ? c.id : null,
                   info: { date: d, company: o.company || '', item: o.item || '', amount: amt } });
      if (hg && !c) warn.push('Hausgeld entry ' + d + ' has no cost type – split by person');
    }

    // tenants (spans of equal type) from the settlement model
    // src.tenancies: the expected lines of exactly this period (ctlTenanciesFor) — running years and years past the Frist included
    const exp = (src && src.tenancies ? src.tenancies : (typeof ctlExpectedSettlements === 'function' ? ctlExpectedSettlements() : []))
      .filter(e => Number(e.property_id) === CASA && e.kind === 'nk_tenant' && e.tenant_id && D(e.period_from) <= period.to && D(e.period_to) >= period.from);
    const rooms = S.rooms || [];
    const m2Of = name => { const r = rooms.find(x => norm(x.name) === norm(name)); return r ? Number(r.flaeche_m2) || 0 : 0; };
    const tenRec = id => (S.casaTen || []).find(t => String(t.id) === String(id)) || {};
    const units = typeof ctlUnitsOf === 'function' ? ctlUnitsOf(CASA) : [];
    const tenancies = exp.map(e => {
      const t = tenRec(e.tenant_id);
      const m2 = m2Of(e.unit_name);
      return { key: e.tenant_id + '|' + D(e.period_from), tenantId: String(e.tenant_id),
               name: [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Tenant', room: e.unit_name || '', m2,
               from: D(e.period_from), to: D(e.period_to), mode: e.note === 'Pauschal' ? 'pauschal' : 'nk',
               unitId: (units.find(u => norm(u.name) === norm(e.unit_name)) || {}).id ?? null, _exp: e };
    });

    // paid NK per tenancy: the room's NK income per month, split by days among its Kalt + NK tenants that month
    const missing = {};
    for (const t of tenancies) { t.vz = 0; t.vzMissing = []; }
    for (const ym of months) {
      const m = Number(ym.slice(5, 7)), yy = Number(ym.slice(0, 4)), dim = daysInMonth(ym);
      const mFrom = ym + '-01', mTo = ym + '-' + String(dim).padStart(2, '0');
      const groups = {};
      for (const t of tenancies) {
        if (t.mode !== 'nk' || t.unitId === null) continue;
        const a = t.from > mFrom ? t.from : mFrom, b = t.to < mTo ? t.to : mTo;
        if (a > b) continue;
        (groups[t.unitId] = groups[t.unitId] || []).push({ t, days: daysBetween(a, b) });
      }
      for (const uid of Object.keys(groups)) {
        const row = (C.income || []).find(r => String(r.unit_id) === String(uid) && Number(r.year) === yy && Number(r.month) === m);
        const g = groups[uid], sumDays = g.reduce((s, x) => s + x.days, 0);
        if (!row) { g.forEach(x => x.t.vzMissing.push(m)); missing[uid] = true; continue; }
        const nk = Number(row.nebenkosten) || 0;
        g.forEach(x => { x.t.vz += nk * x.days / sumDays; });
      }
    }
    for (const t of tenancies) { t.vz = r2(t.vz); if (t.vzMissing.length) warn.push(t.name + ': NK paid missing in Controlling for ' + t.vzMissing.length + ' month(s)'); }

    return { period, fullPeriod: full, preview: preview ? { cutoff: cut, share: shareYear } : null, months, lines, tenancies, warn };
  }

  /* ── Kostenquote (Oct 2026) ─────────────────────────────────
     The even method: all house costs of the period ÷ all months lived by everybody
     (Personenmonate, move-in / move-out months by day, Pauschal tenants included)
     = one rate per month, the same for everyone. Each tenant pays rate × own months.
     Vacant months are not counted at all — the costs sit on the months people lived there.
     Pauschal tenants' months are in the pool; their part stays with the landlord.
     Each tenant's amount is split over the cost lines in proportion to the line totals,
     so the letter can still list every cost type (the lines add up exactly to rate × months).
     Input: the result of calc() → same shape back, with .method = 'quota' and .quota{…}. */
  function quota(R) {
    if (!R || !R.tenants) return R;
    const monthsOf = (a, b) => { let m = 0; for (let d = a; d <= b; d = addDays(d, 1)) m += 1 / daysInMonth(d.slice(0, 7)); return m; };
    const m2d = v => Math.round(v * 100) / 100;                       // months as shown (2 decimals)
    const total = r2(R.lines.reduce((s, l) => s + l.total, 0));
    const M = m2d(R.tenants.reduce((s, t) => s + m2d(t.months), 0));
    const perMonths = m2d(monthsOf(R.period.from, R.period.to));
    const rate = M ? r2(total / M) : 0;
    const lines = R.lines.map(l => Object.assign({}, l, { byTenant: {}, range: {} }));
    let pauschal = 0;
    const tenants = R.tenants.map(t => {
      const months = m2d(t.months), share = r2(rate * months);
      if (t.mode === 'pauschal') { pauschal += share; return Object.assign({}, t, { months, lines: [], sum: 0, saldo: 0, quotaShare: share }); }
      // split the share over the lines (largest remainder → exact sum)
      const base = Math.abs(total) > 0.004 ? lines.map(l => share * l.total / total) : lines.map(() => 0);
      const amts = base.map(v => r2(v));
      let diff = r2(share - amts.reduce((s, v) => s + v, 0));
      if (Math.abs(diff) >= 0.005 && amts.length) {
        const i = base.reduce((bi, v, k) => Math.abs(v) > Math.abs(base[bi]) ? k : bi, 0);
        amts[i] = r2(amts[i] + diff); diff = 0;
      }
      const tl = [];
      lines.forEach((l, k) => {
        if (!amts[k] && !l.total) return;
        l.byTenant[t.key] = amts[k];
        tl.push({ id: l.id, label: l.label, group: l.group, key: l.key, total: l.total, amount: amts[k],
                  share: l.total ? amts[k] / l.total : 0, range: null, catId: l.catId });
      });
      const sum = r2(tl.reduce((s, x) => s + x.amount, 0));
      return Object.assign({}, t, { months, lines: tl, sum, saldo: r2(sum - t.vz), quotaShare: share });
    });
    lines.forEach(l => { l.landlord = r2(l.total - Object.values(l.byTenant).reduce((s, v) => s + v, 0)); });
    const allocated = r2(tenants.reduce((s, t) => s + t.sum, 0));
    const landTotal = r2(total - allocated);
    pauschal = r2(pauschal);
    return Object.assign({}, R, {
      method: 'quota', lines, tenants,
      quota: { total, months: M, rate, perMonths, persons: perMonths ? Math.round(M / perMonths * 10) / 10 : 0 },
      landlord: { total: landTotal, pauschal, vacancy: 0, rounding: r2(landTotal - pauschal) },
      check: { total, allocated, landlord: landTotal, diff: r2(total - allocated - landTotal), ok: Math.abs(total - allocated - landTotal) < 0.005 },
    });
  }

  return { calc, quota, fromControlling, r2, daysBetween, addDays };
})();

if (typeof module !== 'undefined') module.exports = NkCasa;     // node tests
