/* ─────────────────────────────────────────────────────────────
   CONTROLLING — DASHBOARD TAB  (executive view)
   controlling-tab-dashboard.js

   Read top to bottom, no switches:
     1  Gesamt   — Cashflow of the month (big) · Rein vs. Raus as a bar ·
                   status: all properties captured / X open
     2  Je Immobilie — Cashflow, small "rein · raus"; tap → details
                   (Warmmiete, Nebenkosten, Hausgeld, Einmalig) + Erfassen
     3  Jahr bisher — one number
   ‹ › steps through the months of the loaded year.

   Definitions (unchanged, from controlling-data.js):
     Rein     = Kaltmiete                                (s.kalt)
     Raus     = laufende Ausgaben ohne Hausgeld          (s.exp_net)
     Cashflow = Rein − Raus                              (s.netto_kalt)
   Hausgeld and Nebenkosten are pass-through and one-time costs are
   separate — both shown in the property details, not in the headline.

   Depends on: controlling-data.js, controlling-tab-entry.js
               (ctlOpenEntry, hasEntriesFor)
   ───────────────────────────────────────────────────────────── */

'use strict';

let _ctlDashMonth = (function () {
  try { return Number(localStorage.getItem('ctl_month')) || (new Date().getMonth() + 1); }
  catch (e) { return new Date().getMonth() + 1; }
})();
let _ctlDashOpen = null;                                   // property id whose details are open

document.getElementById('tab-dashboard').innerHTML = `
  <div class="ct-page cd">
    <section class="cd-card cd-hero" aria-label="Gesamt">
      <div class="cd-per">
        <button class="cd-arw" id="cdPrev" aria-label="Vorheriger Monat"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>
        <span class="cd-lbl" id="cdPer">—</span>
        <button class="cd-arw" id="cdNext" aria-label="Nächster Monat"><i class="ti ti-chevron-right" aria-hidden="true"></i></button>
      </div>
      <div class="cd-big" id="cdCash">—</div>
      <div class="cd-cap" id="cdCap">Cashflow diesen Monat</div>
      <div class="cd-bar" aria-hidden="true"><div id="cdBarOut"></div></div>
      <div class="cd-io">
        <div><div class="cd-lbl"><span class="cd-sw cd-sw--in"></span>Rein</div><div class="cd-io__v" id="cdIn">—</div></div>
        <div style="text-align:right"><div class="cd-lbl"><span class="cd-sw cd-sw--out"></span>Raus</div><div class="cd-io__v" id="cdOut">—</div></div>
      </div>
      <div class="cd-stat" id="cdStat"></div>
    </section>

    <div class="cd-head" aria-hidden="true"><span class="cd-lbl">Immobilie</span><span class="cd-lbl">Cashflow</span></div>
    <div class="cd-card cd-list" id="cdProps"></div>

    <section class="cd-card cd-year" aria-label="Jahr">
      <span class="cd-lbl" id="cdYearLbl">Jahr bisher</span>
      <span class="cd-year__v" id="cdYear">—</span>
    </section>
  </div>
`;

document.getElementById('cdPrev').addEventListener('click', () => { if (_ctlDashMonth > 1)  { _ctlDashMonth--; _ctlDashSave(); window.renderDashboard(); } });
document.getElementById('cdNext').addEventListener('click', () => { if (_ctlDashMonth < 12) { _ctlDashMonth++; _ctlDashSave(); window.renderDashboard(); } });
function _ctlDashSave() { try { localStorage.setItem('ctl_month', String(_ctlDashMonth)); } catch (e) {} }

const _cdMonths = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const _cdWhole  = v => Math.round(Math.abs(Number(v) || 0)).toLocaleString('de-DE') + '\u202f€';
const _cdSigned = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : n > 0 ? '+\u202f' : '') + _cdWhole(n); };
const _cdEsc    = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function _cdIsFuture(m) {
  const y = window._ctrl.year, now = new Date();
  return y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1);
}

/* ── Public entrypoint ──────────────────────────────────────── */
window.renderDashboard = function () {
  const y = window._ctrl.year, m = _ctlDashMonth;
  const future = _cdIsFuture(m);
  const props  = window._ctrl.properties.filter(x => x.active);
  const $ = id => document.getElementById(id);

  // 1 · Gesamt
  const s = ctlPortfolioMonth(m);
  const rein = Number(s.kalt) || 0, raus = Number(s.exp_net) || 0, cash = Number(s.netto_kalt) || 0;
  $('cdPer').textContent  = _cdMonths[m - 1] + ' ' + y + ' · Gesamt';
  $('cdPrev').disabled = m <= 1;  $('cdNext').disabled = m >= 12;
  $('cdCash').textContent = future ? '—' : _cdSigned(cash);
  $('cdCash').classList.toggle('neg', !future && cash < 0);
  $('cdCap').textContent  = future ? 'Monat liegt in der Zukunft' : 'Cashflow diesen Monat';
  $('cdIn').textContent   = future ? '—' : _cdWhole(rein);
  $('cdOut').textContent  = future ? '—' : _cdWhole(raus);
  const outPct = future ? 0 : rein > 0 ? Math.min(100, raus / rein * 100) : (raus > 0 ? 100 : 0);
  $('cdBarOut').style.width = outPct + '%';
  $('cdBarOut').classList.toggle('over', !future && raus > rein);

  const st = $('cdStat');
  if (future) {
    st.className = 'cd-stat cd-stat--muted'; st.innerHTML = '<span class="cd-dot"></span>Noch nicht fällig';
  } else {
    const open = props.filter(p => !(typeof hasEntriesFor === 'function' && hasEntriesFor(p.id, m)));
    st.className = 'cd-stat ' + (open.length ? 'cd-stat--open' : 'cd-stat--ok');
    st.innerHTML = '<span class="cd-dot"></span>' + (open.length
      ? (open.length === 1 ? '1 Immobilie noch nicht erfasst' : open.length + ' von ' + props.length + ' Immobilien noch nicht erfasst')
      : 'Alle ' + props.length + ' Immobilien erfasst');
  }

  // 2 · Je Immobilie
  $('cdProps').innerHTML = props.map(p => {
    const ps = ctlPropertyMonth(p.id, m);
    const pIn = Number(ps.kalt) || 0, pOut = Number(ps.exp_net) || 0, pCash = Number(ps.netto_kalt) || 0;
    const done = typeof hasEntriesFor === 'function' && hasEntriesFor(p.id, m);
    const open = _ctlDashOpen === p.id;
    const eur = v => ctlEur(v);
    return `
      <div class="cd-prop${open ? ' open' : ''}" data-pid="${p.id}">
        <button class="cd-prop__row" onclick="ctlDashToggle(${p.id})" aria-expanded="${open}">
          <span class="cd-prop__l">
            <span class="cd-prop__n">${_cdEsc(p.name)}</span>
            <span class="cd-prop__s">${future ? 'noch nicht fällig' : (!done && !pIn && !pOut) ? '<span class="cd-open">noch nicht erfasst</span>' : 'rein ' + _cdWhole(pIn) + ' · raus ' + _cdWhole(pOut) + (done ? '' : ' · <span class="cd-open">offen</span>')}</span>
          </span>
          <span class="cd-prop__v${!future && pCash < 0 ? ' neg' : ''}">${(future || (!done && !pIn && !pOut)) ? '—' : _cdSigned(pCash)}</span>
        </button>
        ${open ? `
        <div class="cd-prop__d">
          <div class="cd-d"><span>Kaltmiete</span><span>${eur(pIn)}</span></div>
          <div class="cd-d"><span>Nebenkosten (rein)</span><span>${eur(ps.neben)}</span></div>
          <div class="cd-d"><span>Warmmiete</span><span>${eur(ps.warm)}</span></div>
          <div class="cd-d"><span>Laufende Ausgaben ohne Hausgeld</span><span>${eur(pOut)}</span></div>
          <div class="cd-d"><span>Hausgeld (raus)</span><span>${eur(ps.exp_passthru)}</span></div>
          <div class="cd-d"><span>Einmalig</span><span>${eur(ps.one_time)}</span></div>
          <button class="cd-erf" onclick="ctlOpenEntry(${p.id}, ${m})"><i class="ti ti-pencil" aria-hidden="true"></i> Erfassen</button>
        </div>` : ''}
      </div>`;
  }).join('');

  // 3 · Jahr bisher (up to the current month in the current year)
  const now = new Date();
  const last = y < now.getFullYear() ? 12 : y > now.getFullYear() ? 0 : now.getMonth() + 1;
  let yearCash = 0;
  for (let i = 1; i <= last; i++) yearCash += Number(ctlPortfolioMonth(i).netto_kalt) || 0;
  $('cdYearLbl').textContent = y + (last === 12 ? '' : ' bisher');
  $('cdYear').textContent = _cdSigned(yearCash);
  $('cdYear').classList.toggle('neg', yearCash < 0);
};

window.ctlDashToggle = function (pid) {
  _ctlDashOpen = _ctlDashOpen === pid ? null : pid;
  window.renderDashboard();
};
