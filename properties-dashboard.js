'use strict';

/* ══════════════════════════════════════════════════════
   properties-dashboard.js
   Renders the Dashboard tab.
   Reads from window._props (set by properties.html after fetch).
   Identical layout to mockup-v3.
══════════════════════════════════════════════════════ */

function renderDashboard() {
  const props = window._props || [];

  const tRate = props.reduce((s,p) => s + n(p.rate), 0);
  const tTilg = props.reduce((s,p) => s + n(p.tilgung), 0);
  const tZins = props.reduce((s,p) => s + n(p.zinsen), 0);
  const tRest = props.reduce((s,p) => s + n(p.restschuld), 0);
  const tAbb  = props.reduce((s,p) => s + n(p.abbezahlt), 0);
  const tDar  = props.reduce((s,p) => s + n(p.darlehen), 0);
  const tMw   = props.reduce((s,p) => s + n(p.marktwert), 0);
  const tKP   = props.reduce((s,p) => s + n(p.kaufpreis), 0);
  const tNK   = props.reduce((s,p) => s + n(p.nebenkosten), 0);
  const tM2   = props.reduce((s,p) => s + n(p.m2), 0);
  const equity = tMw - tRest;
  const p2    = v => Math.round(v * 100) / 100;                       // German %, 2 decimals (17,14 %)
  const pct   = tDar > 0 ? p2(tAbb / tDar * 100) : 0;
  const tPct  = tRate > 0 ? p2(tTilg / tRate * 100) : 0;
  const zPct  = tRate > 0 ? p2(100 - tPct) : 0;

  /* ── Alerts ── */
  const urgent = props
    .filter(p => p.zb_status === 'red' || p.zb_status === 'amber')
    .sort((a, b) => (a.zb_status === 'red' ? 0 : 1) - (b.zb_status === 'red' ? 0 : 1));

  document.getElementById('navDot').classList.toggle('show', urgent.length > 0);

  document.getElementById('dash-alerts').innerHTML = urgent.length ? `
    <div class="alert-strip">
      ${urgent.map(p => `
        <div class="alert-card alert-card--${p.zb_status}" onclick="openDetail(${p.id})">
          <span class="ac-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <div class="ac-body">
            <div class="ac-name">${p.name}</div>
            <div class="ac-desc">${p.bank} · ${p.zinssatz.toFixed(2).replace('.', ',')} % · ${p.zb_status === 'red' ? 'Negotiate refinancing immediately' : 'Request new terms'}</div>
          </div>
          <span class="ac-tag">${p.zb} →</span>
        </div>`).join('')}
    </div>` : '';

  /* ── Object line ── */
  document.getElementById('dash-obj-line').innerHTML =
    `<strong>${props.length} properties</strong> · ${de(tM2)} m² · Purchase period 2020–2026`;

  /* ── KPI Cards ── */
  document.getElementById('dash-kpis').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-card__lbl">Total purchase price</div>
      <div class="kpi-card__val">${mio(tKP)}</div>
      <div class="kpi-card__sub">all ${props.length} properties</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__lbl">Acquisition costs</div>
      <div class="kpi-card__val">${mio(tNK)}</div>
      <div class="kpi-card__sub">Notary · Land tax · Agent</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__lbl">Paid off</div>
      <div class="kpi-card__val">${mio(tAbb)}</div>
      <div class="kpi-card__sub">${ccFmtPct(pct)} of loan</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-card__lbl">Restschuld</div>
      <div class="kpi-card__val">${mio(tRest)}</div>
      <div class="kpi-card__sub">outstanding</div>
    </div>
    `;

  /* ── Rate Card ── */
  const rateHTML = `
    <div class="rate-card">
      <div class="rate-card__lbl">Total monthly payment</div>
      <div class="rate-card__total">${eur(tRate)}</div>
      <div class="rate-card__sub">${props.length} loans combined</div>
      <div class="rate-split">
        <div class="rate-part rate-part--t">
          <div class="rate-part__lbl">Tilgung</div>
          <div class="rate-part__val">${eur(tTilg)}</div>
        </div>
        <div class="rate-part rate-part--z">
          <div class="rate-part__lbl">Zinsen</div>
          <div class="rate-part__val">${eur(tZins)}</div>
        </div>
      </div>
      <div class="rate-bar-bg">
        <div class="rb-t" style="width:${tPct}%"></div>
        <div class="rb-z" style="width:${zPct}%"></div>
      </div>
      <div class="rate-bar-legend">
        <div class="rbl-item">
          <div class="rbl-dot rbl-dot--t"></div>
          <span class="rbl-text"><strong>${ccFmtPct(tPct)}</strong> Tilgung · builds equity</span>
        </div>
        <div class="rbl-item">
          <div class="rbl-dot rbl-dot--z"></div>
          <span class="rbl-text"><strong>${ccFmtPct(zPct)}</strong> Zinsen · bank costs</span>
        </div>
      </div>
    </div>`;

  /* ── Progress Card ── */
  const progHTML = `
    <div class="prog-card">
      <div class="prog-card__lbl">Debt overview</div>
      <div class="prog-hero">${mio(tRest)}</div>
      <div class="prog-ctx">outstanding · of <strong>${mio(tDar)}</strong> total loan</div>
      <div class="prog-spacer"></div>
      <div class="prog-bar-row">
        <div class="prog-bar-wrap">
          <div class="prog-bar-fill" style="width:${Math.max(pct, 0.5)}%"></div>
        </div>
        <span class="prog-bar-pct">${ccFmtPct(pct)}</span>
      </div>
      <div class="prog-summary"><strong>${mio(tAbb)}</strong> repaid across ${props.length} loans</div>
    </div>`;

  /* ── Market Value Card ── */
  const mwHTML = `
    <div class="mw-card">
      <div class="mw-card__lbl">Market value today</div>
      <div class="mw-card__val">${mio(tMw)}</div>
      <div class="mw-card__sub">Equity ${mio(equity)}</div>
    </div>`;

  document.getElementById('dash-rate').innerHTML = rateHTML;
  document.getElementById('dash-prog').innerHTML = progHTML;
  document.getElementById('dash-mw').innerHTML   = mwHTML;

  /* ── Strategic Insights ── */
  const withRate = props.filter(p => n(p.rate) > 0);
  const highestZ = withRate.length
    ? withRate.reduce((a, b) => n(a.zinsen) > n(b.zinsen) ? a : b)
    : null;
  const bestTilg = withRate.length
    ? withRate.reduce((a, b) => (n(a.tilgung) / n(a.rate)) > (n(b.tilgung) / n(b.rate)) ? a : b)
    : null;
  const wAvg = tDar > 0
    ? props.reduce((s, p) => s + n(p.zinssatz) * n(p.darlehen), 0) / tDar
    : 0;
  const sparvProps = props.filter(p => p.sparv);

  document.getElementById('dash-insights').innerHTML = `
    <div class="ins-card">
      <div class="ins-card__lbl">Highest interest cost</div>
      <div class="ins-card__val">${highestZ ? highestZ.name : '—'}</div>
      <div class="ins-card__sub">${highestZ ? eur(highestZ.zinsen) + '/mo interest' : '—'}</div>
    </div>
    <div class="ins-card">
      <div class="ins-card__lbl">Best repayment ratio</div>
      <div class="ins-card__val">${bestTilg ? bestTilg.name : '—'}</div>
      <div class="ins-card__sub">${bestTilg ? ccFmtPct(n(bestTilg.tilgung) / n(bestTilg.rate) * 100) + ' repayment' : '—'}</div>
    </div>
    <div class="ins-card">
      <div class="ins-card__lbl">Avg. interest rate</div>
      <div class="ins-card__val">${wAvg.toFixed(2).replace('.', ',')} %</div>
      <div class="ins-card__sub">weighted by loan</div>
    </div>
    <div class="ins-card">
      <div class="ins-card__lbl">Savings contracts</div>
      <div class="ins-card__val">${sparvProps.length} properties</div>
      <div class="ins-card__sub">No. ${sparvProps.map(p => p.sort_order).join(' · ')}</div>
    </div>`;
}
