/* ═════════════════════════════════════════════════════════════
   CONTROLS STANDARD — one look and one behaviour for every choice
   and every switch, in both apps (landlord.html + rentals-index.html)

   AUSWAHL (choice)  — two or more named options, one always selected.
     All options are visible side by side; the selected one is filled
     dark with white text. Tap the option you want.
       · Mieter              Prefill | Manuell         (all generators)
       · Nebenkosten         Pauschal | Kalt + NK      (Rooms KZ generator, Rooms card)
       · Erster/Letzter Monat Anteilig | Voll          (Rooms generators)
       · Kaution Fälligkeit  Sofort | 5 Tage | Individuell
       · Laufzeit            1 | 2 | 3 | 4 Jahre
       · Szenario            S1 / S2 / S3 (stacked)
     Compact (28 px) on card faces:
       · Mietvertrag | Kurzzeit (Rooms header) · Einzug | Auszug

   SWITCH — a feature is on or off. Label = the feature, never changes;
     the grey line underneath says what is in effect. Switch on the right:
     off = light track, knob left · on = dark track, knob right.
     The whole row is tappable. No "Ja/Nein" text.

   How it works: the existing controls stay in the page (hidden where a
   choice replaces them) and keep doing the real work — saving, drafts,
   templates and PDFs use exactly the same code paths as before. A choice
   only "presses" the original control and mirrors its state.
   ═════════════════════════════════════════════════════════════ */

/* Rooms card (Nebenkosten): a choice backed by a hidden checkbox */
function ccSegCheck(btn, checked) {
  const seg = btn.closest('.cc-seg');
  const cb  = seg && seg.querySelector('input[type=checkbox]');
  if (!cb) return;
  seg.querySelectorAll('.cc-seg__opt').forEach(o => {
    const on = o === btn;
    o.classList.toggle('is-on', on);
    o.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  if (cb.checked !== checked) {
    cb.checked = checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

(function () {
  /* Two named options that used to be a switch (value in data-mode / data-state) */
  const PAIRS = {
    pauschal: [['pauschal', 'Pauschal'], ['kalt_nk', 'Kalt + NK']],
    kalt_nk:  [['pauschal', 'Pauschal'], ['kalt_nk', 'Kalt + NK']],
    anteilig: [['anteilig', 'Anteilig'], ['voll', 'Voll']],
    voll:     [['anteilig', 'Anteilig'], ['voll', 'Voll']],
  };
  const MIETER = [['room', 'Prefill'], ['manual', 'Manuell']];
  const CHIP_OPT = '.cm-fael-opt, .mv-fael-opt, .rm-fael-btn, .mv-mindest-opt, .apt-gw-szenario-btn';

  function sync(seg) {
    const v = seg._ccOriginal.getAttribute(seg._ccAttr);
    seg.querySelectorAll('.cc-seg__opt').forEach(o => {
      const on = o.dataset.ccOpt === v;
      o.classList.toggle('is-on', on);
      o.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /* A choice that mirrors an existing two-state control and presses it */
  function segFor(original, attr, options) {
    const seg = document.createElement('div');
    seg.className = 'cc-seg';
    seg.setAttribute('role', 'radiogroup');
    seg._ccOriginal = original;
    seg._ccAttr = attr;
    seg.innerHTML = options.map(([v, l]) =>
      `<button type="button" class="cc-seg__opt" role="radio" data-cc-opt="${v}">${l}</button>`).join('');
    seg.addEventListener('click', e => {
      const b = e.target.closest('.cc-seg__opt');
      if (!b) return;
      if (original.getAttribute(attr) !== b.dataset.ccOpt) original.click();   // the original does the real work
      sync(seg);
    });
    original._ccSeg = seg;
    sync(seg);
    return seg;
  }

  function enhanceMieter(p) {
    p.dataset.ccDone = '1';
    const row = p.parentElement;
    if (!row) return;
    const seg = segFor(p, 'data-state', MIETER);
    seg.classList.add('cc-seg--mieter');
    row.style.display = 'none';
    row.insertAdjacentElement('afterend', seg);
  }

  function enhancePill(t) {
    t.dataset.ccDone = '1';
    const row  = t.closest('.rm-toggle-row');
    const opts = PAIRS[t.dataset.mode];
    if (opts) {                                   // two named options → choice
      t.style.display = 'none';
      const seg = segFor(t, 'data-mode', opts);
      seg.classList.add('cc-seg--under');
      (row || t).insertAdjacentElement('afterend', seg);
    } else if (row) {                             // feature on/off → switch, whole row tappable
      row.classList.add('cc-switch-row');
    }
  }

  function enhanceChips(opt) {
    const box = opt.parentElement;
    if (!box || box.dataset.ccDone) return;
    box.dataset.ccDone = '1';
    box.classList.add('cc-seg');
    if (opt.matches('.apt-gw-szenario-btn')) box.classList.add('cc-seg--stack');
    const kids = [...box.children];
    kids.forEach(ch => { if (ch.matches(CHIP_OPT)) ch.classList.add('cc-seg__opt'); });
    // anything else in the row (e.g. the "Tage" field for Individuell) goes under the choice
    kids.filter(ch => !ch.matches(CHIP_OPT)).reverse().forEach(ch => {
      box.insertAdjacentElement('afterend', ch);
      ch.classList.add('cc-seg-extra');
    });
  }

  function enhanceCompact(box) {
    box.dataset.ccDone = '1';
    box.classList.add('cc-seg', 'cc-seg--sm');
    box.querySelectorAll(':scope > button').forEach(b => b.classList.add('cc-seg__opt'));
  }

  function process(root) {
    if (!root || !root.querySelectorAll) return;
    const q = sel => (root.matches && root.matches(sel) ? [root] : []).concat([...root.querySelectorAll(sel)]);
    q('.ub-mieter-pill:not([data-cc-done])').forEach(enhanceMieter);
    q('.rm-pill-toggle[data-mode]:not([data-cc-done])').forEach(enhancePill);
    q(CHIP_OPT).forEach(enhanceChips);
    q('.rc-price-toggle:not([data-cc-done]), .rc-doc-toggle:not([data-cc-done]), .apt-doc-toggle:not([data-cc-done])').forEach(enhanceCompact);
  }

  function start() {
    process(document.body);
    new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'attributes') { if (m.target._ccSeg) sync(m.target._ccSeg); continue; }
        m.addedNodes.forEach(n => { if (n.nodeType === 1) process(n); });
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-mode', 'data-state'] });

    // Switch rows: tapping the label or the grey line toggles too
    document.addEventListener('click', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      const gen = t.closest('.cc-switch-row');
      if (gen) {
        if (!t.closest('.rm-pill-toggle, a, input, select, textarea')) gen.querySelector('.rm-pill-toggle')?.click();
        return;
      }
      const card = t.closest('.rc-toggle-row, .apt-toggle-row, .tn-kaut-override-row');
      if (card && !t.closest('label, input, button, a, select, textarea')) {
        const cb = card.querySelector('input[type=checkbox]');
        if (cb && !cb.disabled) cb.click();
      }
    });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  /* ── STYLES (html-prefixed so they win over each tab's own rules) ── */
  const s = document.createElement('style');
  s.id = 'cc-controls-styles';
  s.textContent = `
/* AUSWAHL */
html .cc-seg { display:flex !important; flex-wrap:nowrap !important; gap:0 !important; width:100%; box-sizing:border-box;
  border:.5px solid var(--cc-rule) !important; border-radius:var(--cc-r-md) !important; overflow:hidden;
  background:var(--cc-white) !important; padding:0 !important; margin:0; }
html .cc-seg > .cc-seg__opt { flex:1 1 0 !important; min-width:0; height:38px !important; margin:0 !important; padding:0 6px !important;
  border:none !important; border-radius:0 !important; background:transparent !important; box-shadow:none !important;
  color:var(--cc-taupe) !important; font-family:inherit !important; font-size:13px !important; font-weight:400 !important;
  letter-spacing:0 !important; text-transform:none !important; line-height:1.2 !important;
  display:flex !important; align-items:center; justify-content:center; text-align:center;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; -webkit-tap-highlight-color:transparent; }
html .cc-seg > .cc-seg__opt + .cc-seg__opt { border-left:.5px solid var(--cc-rule) !important; }
html .cc-seg > .cc-seg__opt:is(.is-on, .active, .active-fael, .active-mindest, .active--mietvertrag, .active--kurzzeit) {
  background:var(--cc-ink) !important; color:#fff !important; font-weight:500 !important; }
html .cc-seg > .cc-seg__opt:is(.is-on, .active, .active-fael, .active-mindest, .active--mietvertrag, .active--kurzzeit) * { color:#fff !important; }
html .cc-seg > .cc-seg__opt:active { opacity:.8; }
html .cc-seg--under { margin-top:8px; }
html .cc-seg--mieter { margin-bottom:12px; }
html .cc-seg-extra { margin-top:8px !important; }
/* stacked (long options: Gewerbe Szenario) */
html .cc-seg--stack { flex-direction:column !important; }
html .cc-seg--stack > .cc-seg__opt { height:auto !important; min-height:44px; padding:8px 12px !important; justify-content:flex-start;
  text-align:left; white-space:normal; flex:0 0 auto !important; }
html .cc-seg--stack > .cc-seg__opt + .cc-seg__opt { border-left:none !important; border-top:.5px solid var(--cc-rule) !important; }
/* compact, on card faces */
html .cc-seg--sm { width:auto; display:inline-flex !important; flex-shrink:0; }
html .cc-seg--sm > .cc-seg__opt { height:28px !important; font-size:12px !important; padding:0 12px !important; flex:0 0 auto !important; }

/* SWITCH — 44×26, round knob 20, off = light, on = dark, always right */
html .cc-sw, html .tn-kaut-ovr-sw { width:44px !important; height:26px !important; flex-shrink:0; }
html .cc-sw__t, html .tn-kaut-ovr-sw__t { border-radius:13px !important; background:var(--cc-rule) !important; }
html .cc-sw__t::after, html .tn-kaut-ovr-sw__t::after { top:3px !important; left:3px !important; width:20px !important; height:20px !important;
  box-shadow:0 1px 3px rgba(30,27,24,.25) !important; }
html .cc-sw input:checked + .cc-sw__t, html .tn-kaut-ovr-sw input:checked + .tn-kaut-ovr-sw__t { background:var(--cc-ink) !important; }
html .cc-sw input:checked + .cc-sw__t::after, html .tn-kaut-ovr-sw input:checked + .tn-kaut-ovr-sw__t::after { transform:translateX(18px) !important; }
html .rm-pill-toggle__track { width:44px !important; height:26px !important; border-radius:13px !important; background:var(--cc-rule) !important; }
html .rm-pill-toggle__knob { top:3px !important; left:3px !important; width:20px !important; height:20px !important; box-shadow:0 1px 3px rgba(30,27,24,.25); }
html .rm-pill-toggle:is([data-mode="ja"], [data-mode="befristet"], [data-mode="voll"], [data-mode="kalt_nk"]) .rm-pill-toggle__track { background:var(--cc-ink) !important; }
html .rm-pill-toggle:is([data-mode="ja"], [data-mode="befristet"], [data-mode="voll"], [data-mode="kalt_nk"]) .rm-pill-toggle__knob { transform:translateX(18px) !important; }
html .rm-pill-toggle__lbl { display:none !important; }              /* no "Ja / Nein" — the switch is the answer */
html .cc-switch-row, html .rc-toggle-row, html .apt-toggle-row, html .tn-kaut-override-row {
  min-height:44px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
html .rc-toggle-row, html .apt-toggle-row { justify-content:space-between; }
/* Tenants: "Individuelle Kaution" — label + grey line left, switch right */
html .tn-kaut-override-row { justify-content:space-between; gap:12px; }
html .cc-sw-title { display:block; font-size:10px; font-weight:500; letter-spacing:.09em; text-transform:uppercase; color:var(--cc-taupe); }
html .cc-sw-sub { display:block; font-size:12px; color:var(--cc-stone); margin-top:2px; }

/* Card-face actions say what will happen — same neutral look */
html .rc-act--kitchen-on, html .rc-act--kitchen-off { color:var(--cc-taupe) !important; border:.5px solid var(--cc-rule) !important; }
html .rc-actions { flex-wrap:wrap; row-gap:8px; }   /* longer verb labels wrap to a second line instead of being cut off */
html .rc-act { max-width:100%; white-space:nowrap; }
  `;
  document.head.appendChild(s);
})();
