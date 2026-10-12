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
html .cc-seg--sm { align-items:stretch !important; }
html .cc-seg--sm > .cc-seg__opt { height:auto !important; min-height:28px; align-self:stretch !important; font-size:12px !important; padding:0 12px !important; flex:0 0 auto !important; }   /* fill the whole box: no gap above/below the dark fill */

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

/* ═════════════════════════════════════════════════════════════
   TENANT CARDS — shorter card, same content (both apps)
   Less-used sections sit behind one row each ("Nebenkosten", "Details");
   a tap opens exactly the same section in a bottom sheet (same look as
   the tenant pop-up). Nothing changes in how a section works: it is the
   same HTML with the same ids and buttons, only shown in the sheet.
   ═════════════════════════════════════════════════════════════ */
function ccGroupHTML(label, rows) {
  if (!rows) return '';
  return label
    ? `<div class="tn-sec cc-grp"><div class="tn-sec-body" style="padding-top:10px;padding-bottom:2px">
    <div style="margin-bottom:2px"><span class="tn-sec-lbl">${label}</span></div>${rows}</div></div>`
    : `<div class="tn-sec cc-grp cc-grp--bare"><div class="tn-sec-body" style="padding-top:0;padding-bottom:0">${rows}</div></div>`;
}
/* o = { icon, title, meta (html), onclick } */
function ccRowHTML(o) {
  return `<button type="button" class="cc-grow" onclick="${o.onclick}">
    <i class="ti ti-${o.icon} cc-grow-ic" aria-hidden="true"></i>
    <span class="cc-grow-t">${o.title}</span>
    <span class="cc-grow-m">${o.meta || ''}</span>
    <i class="ti ti-chevron-right cc-grow-ch" aria-hidden="true"></i></button>`;
}

/* ── KEEP THE PAGE WHERE IT WAS (Oct 2026) ─────────────────────────────────
   On the iPhone the keyboard of a sheet / pop-up scrolls the page behind it and does not
   scroll back. When the first sheet opens we remember the card you tapped and where it sat
   on the screen; when the last sheet closes it is put back exactly there — right away, and
   once more after the keyboard has closed. Anchored on the card (found again by its id), so
   it also holds when the card was redrawn after a save. Your own scrolling is never fought. */
let _ccLastTap = null, _ccAnchor = null;
document.addEventListener('pointerdown', e => { _ccLastTap = e.target; }, true);
const _CC_ANCHOR_CARDS = '.tn-card, .apt-card, .pk-card, .rnt-card, .rc, [data-cc-anchor]';
const _CC_OPEN_SHEETS  = '.tn-overlay.open, .rm-overlay.open';
function _ccCardSel(card) {
  if (!card) return null;
  const q = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (card.id) return '[id="' + q(card.id) + '"]';
  if (card.dataset && card.dataset.id) return '.' + card.classList[0] + '[data-id="' + q(card.dataset.id) + '"]';
  return null;
}
function ccAnchorSet() {
  if (document.querySelector(_CC_OPEN_SHEETS)) return;             // a sheet is already open → keep the first anchor
  const t = _ccLastTap && _ccLastTap.isConnected ? _ccLastTap : null;
  const card = t && t.closest ? t.closest(_CC_ANCHOR_CARDS) : null;
  const sel = _ccCardSel(card);
  _ccAnchor = { sel, top: card ? card.getBoundingClientRect().top : null, y: window.scrollY };
}
function ccAnchorRestore() {
  const a = _ccAnchor; if (!a) return;
  if (document.querySelector(_CC_OPEN_SHEETS)) return;             // another sheet is still open → later
  _ccAnchor = null;
  let stopped = false;
  const stop = () => { stopped = true; };
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  window.addEventListener('wheel', stop, { once: true, passive: true });
  const fix = () => {
    if (stopped) return;
    const c = a.sel ? document.querySelector(a.sel) : null;
    if (c && a.top != null) {
      const dy = c.getBoundingClientRect().top - a.top;
      if (Math.abs(dy) > 1) window.scrollBy(0, dy);
    } else if (Math.abs(window.scrollY - a.y) > 1) window.scrollTo(0, a.y);
  };
  queueMicrotask(fix);                                             // after a redraw by the Save
  requestAnimationFrame(fix);
  [350, 700].forEach(ms => setTimeout(fix, ms));                   // after the keyboard has closed
  const vv = window.visualViewport;
  if (vv) {
    const onVv = () => setTimeout(fix, 60);
    vv.addEventListener('resize', onVv);
    setTimeout(() => vv.removeEventListener('resize', onVv), 1200);
  }
  setTimeout(() => { window.removeEventListener('touchstart', stop); window.removeEventListener('wheel', stop); }, 1300);
}

let _ccSheetCur = null;   // { title, kicker, build }
function _ccSheetEl() {
  let el = document.getElementById('ccSheetModal');
  if (el) return el;
  el = document.createElement('div');
  el.className = 'tn-overlay cc-sheet-ov'; el.id = 'ccSheetModal';
  el.innerHTML = `<div class="tn-sheet" role="dialog" aria-modal="true" aria-labelledby="ccSheetTitle">
    <div class="tn-sheet-hdr">
      <div style="flex:1;min-width:0"><div class="tn-sheet-name" id="ccSheetTitle"></div><div class="tn-sheet-sub" id="ccSheetSub"></div></div>
      <button type="button" class="tn-icon-btn" onclick="ccSheetClose()" aria-label="Close"><i class="ti ti-x"></i></button>
    </div>
    <div class="tn-sheet-body" id="ccSheetBody"></div></div>`;
  el.addEventListener('click', e => { if (e.target === el) ccSheetClose(); });
  document.body.appendChild(el);
  return el;
}
function ccSheetOpen(o) {
  const el = _ccSheetEl();
  if (!el.classList.contains('open')) ccAnchorSet();
  _ccSheetCur = o;
  document.getElementById('ccSheetTitle').textContent = o.title || '';
  document.getElementById('ccSheetSub').textContent = o.kicker || '';
  const body = document.getElementById('ccSheetBody');
  body.innerHTML = o.build() || '';
  _ccSheetTidy(body);
  body.scrollTop = 0;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function ccSheetClose() {
  const el = document.getElementById('ccSheetModal'); if (!el) return;
  el.classList.remove('open');
  _ccSheetCur = null;
  document.getElementById('ccSheetBody').innerHTML = '';
  if (!document.querySelector('.tn-overlay.open')) document.body.style.overflow = '';
  ccAnchorRestore();
}
/* After a card redraw: the open sheet shows the fresh data too — unless you are typing in it */
function ccSheetRefresh() {
  if (!_ccSheetCur) return;
  const body = document.getElementById('ccSheetBody'); if (!body) return;
  if (body.querySelector('input:focus, textarea:focus, select:focus, [data-cc-save="dirty"], .ccf-medit, .tn-nkv-add-form, .tn-nk-add-form, .cc-inline-panel, .cc-dlg')) return;
  const html = _ccSheetCur.build();
  if (!html) { ccSheetClose(); return; }
  const y = body.scrollTop;
  body.innerHTML = html;
  _ccSheetTidy(body);
  body.scrollTop = y;
}
/* The sheet's title already names the section → its own small label is not shown twice */
function _ccSheetTidy(body) {
  const t = String((_ccSheetCur && _ccSheetCur.title) || '').trim().toLowerCase();
  const l = body.querySelector('.tn-sec-lbl, .tn-msec-lbl');
  if (!l || l.textContent.trim().toLowerCase() !== t) return;
  const box = l.parentElement;
  (box && box.children.length === 1 ? box : l).style.display = 'none';
}
(function () {
  if (typeof document === 'undefined' || document.getElementById('cc-grp-style')) return;
  const s = document.createElement('style'); s.id = 'cc-grp-style';
  s.textContent = `
.cc-grow{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:8px 0;margin:0;background:none;border:none;border-top:var(--cc-border);font-family:inherit;text-align:left;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.cc-grp .tn-sec-body > .cc-grow:nth-child(2), .cc-grp .tn-sec-body > .cc-grow:first-child{border-top:none}
.cc-grow:active{background:var(--cc-surface)}
.cc-grow-ic{font-size:16px;width:18px;text-align:center;color:var(--cc-taupe);flex-shrink:0}
.cc-grow-t{flex:0 0 auto;font-size:14px;color:var(--cc-charcoal)}
.cc-grow-m{flex:1 1 auto;display:block;min-width:0;font-size:12px;color:var(--cc-taupe);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-grow-m .tnp{vertical-align:middle}
.cc-grow-ch{font-size:15px;color:var(--cc-stone);flex-shrink:0}
#ccSheetModal .tn-sheet-name{font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:400;line-height:1.1}
#ccSheetModal .tn-sheet-sub{margin-top:0;order:-1;font-size:10px;font-weight:500;letter-spacing:.09em;text-transform:uppercase}
#ccSheetModal .tn-sheet-hdr > div{display:flex;flex-direction:column;gap:4px}
#ccSheetModal .tn-sheet-body{padding-bottom:max(12px,env(safe-area-inset-bottom,12px))}
#ccSheetModal .tn-sheet-body > .tn-sec{border-top:none;border-bottom:none}
#ccSheetModal .cc-tl{border:none}
#ccSheetModal .cc-tl > summary{display:none}
`;
  document.head.appendChild(s);
})();

/* ── IN-APP DIALOG for apps without utils.js (Rentals) — same look and code as utils.js.
   Casa Castel keeps its own copy from utils.js (loaded first). ── */
if (typeof window.ccDialog !== 'function') {
window._ccDlgCss = function () {
  if (document.getElementById('cc-dlg-css')) return;
  const st = document.createElement('style'); st.id = 'cc-dlg-css';
  st.textContent = `
.cc-dlg-ov { position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center;
  padding:24px; background:rgba(30,27,24,.35); -webkit-tap-highlight-color:transparent; }
.cc-dlg { background:var(--cc-white,#FDFCFA); border-radius:var(--cc-r-lg,12px); padding:24px 20px 18px;
  width:100%; max-width:320px; box-shadow:0 10px 40px rgba(30,27,24,.18); font-family:'Inter',system-ui,sans-serif;
  animation:ccDlgPop .2s cubic-bezier(.32,.72,0,1); }
@keyframes ccDlgPop { from{transform:scale(.94);opacity:0} to{transform:scale(1);opacity:1} }
.cc-dlg__icon { font-size:26px; color:var(--cc-gold,#B8956A); margin-bottom:10px; }
.cc-dlg--danger .cc-dlg__icon { color:#C4705A; }
.cc-dlg__title { font-family:'Cormorant Garamond',Georgia,serif; font-size:20px; font-weight:400;
  color:var(--cc-ink,#1E1B18); margin:0 0 6px; }
.cc-dlg__body { font-size:13px; color:var(--cc-taupe,#9A8E7E); line-height:1.55; margin:0 0 18px; }
.cc-dlg__body strong { color:var(--cc-charcoal,#3A3530); font-weight:500; }
.cc-dlg__btns { display:flex; align-items:center; justify-content:flex-end; gap:8px; }
.cc-dlg__btn { height:36px; padding:0 14px; border-radius:18px; font:inherit; font-size:12px; font-weight:500;
  display:inline-flex; align-items:center; gap:5px; cursor:pointer; border:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); }
.cc-dlg__btn:active { opacity:.75; }
.cc-dlg__btn--primary { background:var(--cc-ink,#1E1B18); border-color:var(--cc-ink,#1E1B18); color:var(--cc-white,#FDFCFA); }
.cc-dlg__btn--danger  { background:none; color:#A32D2D; border-color:#F09595; }
.cc-dlg__pw { display:flex; align-items:center; gap:10px; margin:4px 0 12px; padding:12px 12px 12px 14px;
  background:var(--cc-surface,#EDE8E0); border-radius:var(--cc-r-md,8px); }
.cc-dlg__pwtxt { flex:1; font-size:19px; letter-spacing:.04em; color:var(--cc-ink,#1E1B18);
  font-variant-numeric:tabular-nums; user-select:all; -webkit-user-select:all; word-break:break-all; }
.cc-dlg__copy { flex-shrink:0; height:34px; padding:0 11px; border-radius:17px; border:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA); color:var(--cc-taupe,#9A8E7E); font:inherit; font-size:11px; font-weight:500;
  display:inline-flex; align-items:center; gap:5px; cursor:pointer; }
.cc-dlg__copy i { font-size:15px; }
.cc-dlg__copy.is-done { background:#EAF3DE; border-color:#97C459; color:#27500A; }`;
  document.head.appendChild(st);
}
window.ccDialog = function (opts) {
  _ccDlgCss();
  const o = opts || {};
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cc-dlg-ov';
    const acts = (o.actions && o.actions.length) ? o.actions : [{ label: 'OK', primary: true, value: true }];
    ov.innerHTML = `<div class="cc-dlg${o.tone === 'danger' ? ' cc-dlg--danger' : ''}" role="dialog" aria-modal="true">
      ${o.icon ? `<div class="cc-dlg__icon"><i class="ti ${o.icon}" aria-hidden="true"></i></div>` : ''}
      <p class="cc-dlg__title">${o.title || ''}</p>
      ${o.body ? `<div class="cc-dlg__body">${o.body}</div>` : ''}
      <div class="cc-dlg__btns">${acts.map((a, i) =>
        `<button type="button" class="cc-dlg__btn${a.primary ? ' cc-dlg__btn--primary' : ''}${a.danger ? ' cc-dlg__btn--danger' : ''}" data-i="${i}">${a.icon ? `<i class="ti ${a.icon}" aria-hidden="true"></i>` : ''}${a.label}</button>`).join('')}</div>
    </div>`;
    const close = v => { ov.remove(); resolve(v); };
    ov.addEventListener('click', e => { if (e.target === ov && !o.modal) close(null); });
    ov.querySelectorAll('.cc-dlg__btn').forEach(b => b.addEventListener('click', () => {
      const a = acts[+b.dataset.i]; close(a.value === undefined ? null : a.value);
    }));
    document.body.appendChild(ov);
    if (typeof o.onOpen === 'function') o.onOpen(ov);
  });
};
}

/* ── KEEP PLACE (Oct 2026) ─────────────────────────────────────
   A card that closes (or a list that redraws) keeps its header exactly where it is on screen.
   Without this the page gets shorter, the phone snaps back and the header jumps (lower cards).
   mutate() does the change (class toggle or redraw) · find() returns the header afterwards.
   A spacer at the end fills the missing height and shrinks away as soon as you scroll up.   */
function ccKeepPlace(el, mutate, find) {
  if (typeof mutate !== 'function') return;
  if (!el || !el.isConnected) return mutate();
  const before = el.getBoundingClientRect().top;
  const res = mutate();
  const now = (typeof find === 'function' ? find() : el) || null;
  if (!now || !now.isConnected) return res;
  const shift = now.getBoundingClientRect().top - before;          // > 0 → the page was pulled back
  if (Math.abs(shift) < 1) return res;
  let sp = document.getElementById('ccEndSpace');
  if (!sp) { sp = document.createElement('div'); sp.id = 'ccEndSpace'; sp.setAttribute('aria-hidden', 'true'); sp.style.cssText = 'height:0;pointer-events:none;'; document.body.appendChild(sp); }
  const target = Math.max(0, window.scrollY + shift);
  const need = Math.ceil(target + window.innerHeight - document.documentElement.scrollHeight);
  if (need > 0) sp.style.height = ((parseFloat(sp.style.height) || 0) + need) + 'px';
  try { window.scrollTo({ top: target, behavior: 'instant' }); } catch (e) { window.scrollTo(0, target); }
  _ccEndSpaceWatch();
  return res;
}
let _ccEndWatching = false;
function _ccEndSpaceWatch() {
  if (_ccEndWatching) return;
  _ccEndWatching = true;
  const trim = () => {
    const sp = document.getElementById('ccEndSpace'), h = sp ? (parseFloat(sp.style.height) || 0) : 0;
    if (!h) return stop();
    const content = document.documentElement.scrollHeight - h;     // the page without the spacer
    const need = Math.max(0, Math.ceil(window.scrollY + window.innerHeight - content));
    if (need < h) sp.style.height = need + 'px';
    if (!need) stop();
  };
  const stop = () => { window.removeEventListener('scroll', trim); window.removeEventListener('resize', trim); _ccEndWatching = false; };
  window.addEventListener('scroll', trim, { passive: true });
  window.addEventListener('resize', trim, { passive: true });
}
