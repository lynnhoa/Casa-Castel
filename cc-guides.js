/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — HOUSE GUIDES (tenant + landlord Lounge)
   cc-guides.js

   One slim row in the Lounge ("House guides · App · Müll · Rund ums Haus")
   opens a pop-up with the house guides as PDFs:
   · Deine Haus-App — DE | EN like a translation (phone language first,
     then the last choice, kept on this phone)
   · Mülltrennung (Hausmüll + Glas) — plus "Glas-Trolley" as a small extra
   · Rund ums Haus — Bus, Bahn & Supermärkte
   The PDFs open on top of the app (normal link in a new tab → the phone's
   PDF viewer). The app page itself is never replaced or reloaded, so the
   login stays exactly as it is — nobody gets logged out.
   New version of a PDF: replace the file and change V below.
   ───────────────────────────────────────────────────────────── */
(function () {
  const V = '?v=2026-10-15-G1';
  const F = {
    appde: 'Casa-Castel-Guide-DE.pdf', appen: 'Casa-Castel-Guide-EN.pdf',
    muell: 'Casa-Castel-Muell.pdf', glas: 'Casa-Castel-Glas-Box.pdf', rund: 'Casa-Castel-Rund-ums-Haus.pdf',
  };
  const KEY = 'cc_guide_lang';
  const getLang = () => {
    try { const v = localStorage.getItem(KEY); if (v === 'de' || v === 'en') return v; } catch (e) {}
    return /^de/i.test(navigator.language || '') ? 'de' : 'en';
  };
  const setLang = v => { try { localStorage.setItem(KEY, v); } catch (e) {} };
  const svg = (d, s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const P = {
    phone: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M11 4h2M12 17v.01"/>',
    bin: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    bus: '<circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/><path d="M4 17H2V6a1 1 0 0 1 1-1h14a5 7 0 0 1 5 7v5h-2m-4 0H8M16 5l1.5 7H22M2 10h15M7 5v5M12 5v5"/>',
    bottle: '<path d="M10 5h4V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v2zM14 5c0 1.4.5 2.8 1.4 4l.1.1A8 8 0 0 1 17 13.6V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5.4a8 8 0 0 1 1.5-4.5l.1-.1C9.5 7.8 10 6.4 10 5"/>',
    go: '<path d="M17 7L7 17M8 7h9v9"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
  };
  const APP = {
    de: { t: 'Deine Haus-App', s: 'Login, Lounge, Putzen & Küche · 2 Seiten' },
    en: { t: 'Your house app', s: 'Login, Lounge, cleaning & kitchen · 2 pages' },
  };
  const link = (file, cls, inner) => `<a class="${cls}" href="${file + V}" target="_blank" rel="noopener">${inner}</a>`;

  /* The slim row in the Lounge (mobile: between the notice and the House chat · desktop: left column) */
  window.ccGuidesRowHTML = where => `<button type="button" class="cg-row cg-row--${where === 'dsk' ? 'dsk' : 'mob'}" data-cc-guides aria-haspopup="dialog">
      <span class="cg-dots" aria-hidden="true"><span class="cg-dot cg-c1">${svg(P.phone, 13)}</span><span class="cg-dot cg-c2">${svg(P.bin, 13)}</span><span class="cg-dot cg-c3">${svg(P.bus, 13)}</span></span>
      <span class="cg-row__t"><b>House guides</b><span> · App · Müll · Rund ums Haus</span></span>
      <span class="cg-row__go" aria-hidden="true">${svg(P.chev, 16)}</span>
    </button>`;

  function sheetHTML() {
    const l = getLang();
    return `<div class="cg-bg" data-cg-close></div>
      <div class="cg-sheet" role="dialog" aria-modal="true" aria-labelledby="cgT">
        <div class="cg-hdr">
          <div><p class="cg-k">Casa Castel</p><p class="cg-t" id="cgT">House guides</p><p class="cg-s">Everything about the house, as PDF</p></div>
          <button type="button" class="cg-x" data-cg-close aria-label="Close">${svg(P.x, 14)}</button>
        </div>
        <div class="cg-body">
          <div class="cg-card cg-c1">
            <span class="cg-ic">${svg(P.phone, 24)}</span>
            <div class="cg-m"><p class="cg-ct" id="cgAppT">${APP[l].t}</p><p class="cg-cs" id="cgAppS">${APP[l].s}</p>
              <div class="cg-r2">
                <span class="cg-seg" role="group" aria-label="Language">${['de', 'en'].map(x =>
                  `<button type="button" data-cg-lang="${x}" class="${x === l ? 'is-on' : ''}" aria-pressed="${x === l}">${x.toUpperCase()}</button>`).join('')}</span>
                <a class="cg-open" id="cgAppOpen" href="${F['app' + l] + V}" target="_blank" rel="noopener">Open${svg(P.go, 14)}</a>
              </div></div>
          </div>
          <div class="cg-card cg-c2">
            <span class="cg-ic">${svg(P.bin, 24)}</span>
            <div class="cg-m"><p class="cg-ct">Mülltrennung</p><p class="cg-cs">Was in welche Tonne · Weg zu den Tonnen · Glas</p>
              <div class="cg-r2">${link(F.glas, 'cg-ext', svg(P.bottle, 14) + 'Glas-Trolley')}${link(F.muell, 'cg-open', 'Open' + svg(P.go, 14))}</div></div>
          </div>
          <div class="cg-card cg-c3">
            <span class="cg-ic">${svg(P.bus, 24)}</span>
            <div class="cg-m"><p class="cg-ct">Rund ums Haus</p><p class="cg-cs">Bus, Bahn &amp; Supermärkte in der Nähe</p>
              <div class="cg-r2">${link(F.rund, 'cg-open', 'Open' + svg(P.go, 14))}</div></div>
          </div>
        </div>
        <div class="cg-ft"><span>Opens the PDF · save or share from there</span><button type="button" class="cg-close" data-cg-close>Close</button></div>
      </div>`;
  }
  function open() {
    if (document.getElementById('ccGuides')) return;
    const el = document.createElement('div');
    el.id = 'ccGuides';
    el.className = 'cg-ov';
    el.innerHTML = sheetHTML();
    document.body.appendChild(el);
    setTimeout(() => el.querySelector('.cg-x')?.focus(), 0);
  }
  function close() { document.getElementById('ccGuides')?.remove(); }
  function lang(l) {                                           // the app guide in the other language (same card)
    setLang(l);
    const g = id => document.getElementById(id);
    if (g('cgAppT')) g('cgAppT').textContent = APP[l].t;
    if (g('cgAppS')) g('cgAppS').textContent = APP[l].s;
    if (g('cgAppOpen')) g('cgAppOpen').href = F['app' + l] + V;
    document.querySelectorAll('#ccGuides [data-cg-lang]').forEach(b => { const on = b.dataset.cgLang === l; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
  }
  window.ccGuidesOpen = open;

  document.addEventListener('click', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-cc-guides]')) { e.preventDefault(); open(); return; }
    const m = document.getElementById('ccGuides');
    if (!m || !m.contains(t)) return;
    if (t.closest('[data-cg-close]')) { close(); return; }
    const lb = t.closest('[data-cg-lang]');
    if (lb) lang(lb.dataset.cgLang);
    /* links (Open / Glas-Trolley) open the PDF in a new tab — the app stays as it is */
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('ccGuides')) close(); });

  const st = document.createElement('style');
  st.textContent = `
.cg-row{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:9px 16px;flex-shrink:0;border:0;border-bottom:.5px solid var(--cc-rule,#E0DAD0);
  background:var(--cc-white,#FDFCFA);font:inherit;text-align:left;color:var(--cc-charcoal,#3A3530);cursor:pointer;-webkit-tap-highlight-color:transparent;}
.cg-row:active{background:#F7F3EC;}
.cg-row--dsk{margin:0 0 12px;padding:10px 14px;border:.5px solid var(--cc-rule,#E0DAD0);border-radius:var(--cc-r-lg,14px);}
@media(min-width:701px){#tab-lounge .cg-row--mob{display:none !important;}}
.cg-dots{display:flex;flex-shrink:0;}
.cg-dot{width:24px;height:24px;margin-left:-6px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid var(--cc-white,#FDFCFA);}
.cg-dot:first-child{margin-left:0;}
.cg-c1{background:#F6EEDF;color:#8B6F47;} .cg-c2{background:#E4EFE3;color:#2F6B3E;} .cg-c3{background:#E3ECF5;color:#2F5F8F;}
.cg-row__t{flex:1;min-width:0;font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cg-row__t b{font-weight:500;color:var(--cc-ink,#1E1B18);} .cg-row__t span{color:var(--cc-taupe,#9A8E7E);}
.cg-row__go{display:flex;color:var(--cc-gold,#B8956A);}
.cg-ov{position:fixed;inset:0;z-index:450;display:flex;align-items:flex-end;justify-content:center;}
.cg-bg{position:absolute;inset:0;background:rgba(30,27,24,.5);}
.cg-sheet{position:relative;width:100%;max-width:480px;max-height:88vh;max-height:88svh;display:flex;flex-direction:column;
  background:var(--cc-white,#FDFCFA);border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);color:var(--cc-charcoal,#3A3530);
  animation:cgUp .24s cubic-bezier(.32,.72,0,1);}
@keyframes cgUp{from{transform:translateY(32px);opacity:0;}to{transform:none;opacity:1;}}
@media(min-width:701px){.cg-ov{align-items:center;}.cg-sheet{max-width:520px;border-radius:20px;padding-bottom:0;}}
.cg-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 12px;border-bottom:.5px solid var(--cc-rule,#E0DAD0);flex-shrink:0;}
.cg-k{margin:0;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--cc-gold,#B8956A);}
.cg-t{margin:2px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:400;line-height:1.1;color:var(--cc-ink,#1E1B18);}
.cg-s{margin:2px 0 0;font-size:12px;color:var(--cc-taupe,#9A8E7E);}
.cg-x{width:30px;height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;border:.5px solid var(--cc-rule,#E0DAD0);
  border-radius:50%;background:#EFEAE2;color:var(--cc-taupe,#9A8E7E);cursor:pointer;}
.cg-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;padding:14px 14px 6px;}
.cg-card{display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:16px;}
.cg-ic{width:46px;height:46px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--cc-white,#FDFCFA);}
.cg-m{flex:1;min-width:0;}
.cg-ct{margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:21px;font-weight:400;line-height:1.1;color:var(--cc-ink,#1E1B18);}
.cg-cs{margin:3px 0 0;font-size:12px;line-height:1.4;}
.cg-r2{display:flex;align-items:center;gap:8px;margin-top:10px;}
.cg-seg{display:inline-flex;gap:2px;padding:2px;border-radius:999px;background:rgba(255,255,255,.75);}
.cg-seg button{margin:0;padding:5px 12px;border:0;border-radius:999px;background:none;font:inherit;font-size:12px;font-weight:500;color:var(--cc-taupe,#9A8E7E);cursor:pointer;}
.cg-seg button.is-on{background:var(--cc-ink,#1E1B18);color:#fff;}
.cg-open{display:inline-flex;align-items:center;gap:5px;margin-left:auto;padding:7px 13px;border-radius:999px;font-size:12px;font-weight:500;color:#fff;text-decoration:none;white-space:nowrap;}
.cg-c1 .cg-open{background:#8B6F47;} .cg-c2 .cg-open{background:#2F6B3E;} .cg-c3 .cg-open{background:#2F5F8F;}
.cg-ext{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;background:var(--cc-white,#FDFCFA);border:.5px solid #C9DCC9;
  color:#2F5D3A;font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap;}
.cg-ft{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 18px 16px;flex-shrink:0;font-size:11px;color:var(--cc-taupe,#9A8E7E);}
.cg-close{padding:8px 18px;border-radius:999px;border:.5px solid var(--cc-rule,#E0DAD0);background:none;font:inherit;font-size:12px;font-weight:500;color:#6B645C;cursor:pointer;}
`;
  document.head.appendChild(st);
})();
