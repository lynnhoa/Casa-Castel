/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — HOUSE GUIDES (tenant + landlord Lounge)
   cc-guides.js

   One slim row in the Lounge ("House guides · App · Müll · Rund ums Haus")
   opens a pop-up with the house guides as PDFs:
   · Deine Haus-App — DE ◯ EN switch like a translation (phone language
     first, then the last choice, kept on this phone)
   · Mülltrennung (Hausmüll + Glas) — plus "Glas-Trolley" as a small extra
   · Rund ums Haus — Bus, Bahn & Supermärkte
   The PDFs open in the phone's PDF viewer WITH a close button: they come from
   Supabase Storage (another address than the app, like Documents) — a file
   from the app's own address would open inside the installed app, with no
   way back. The app page itself is never replaced → nobody gets logged out.
   · bucket "house-guides" (public, see HOUSE-GUIDES.sql), folder VF
   · the landlord app copies the PDFs there by itself (once, after an update)
   · not there yet → installed app: "ready soon" note · browser: the app's own file
   Class prefix "hgd-" (the contract generator already uses "cg-").
   New version of a PDF: replace the file and change V and VF below.
   ───────────────────────────────────────────────────────────── */
(function () {
  const V = '?v=2026-10-15-G1';
  const BUCKET = 'house-guides', VF = 'g1';                   // VF = folder of this version in Storage
  const STANDALONE = (() => { try { return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) { return false; } })();
  const pub = f => (typeof SB_URL !== 'undefined' ? SB_URL : '') + '/storage/v1/object/public/' + BUCKET + '/' + VF + '/' + encodeURIComponent(f);
  let ready = null;                                           // null = not checked yet · true / false
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
  const href = f => (ready === false ? f + V : pub(f));      // checked missing → the app's own file (browser only)
  const link = (file, cls, inner) => `<a class="${cls}" href="${href(file)}" data-hgd-file="${file}" target="_blank" rel="noopener">${inner}</a>`;

  /* The slim row in the Lounge — one line (mobile: between the notice and the House chat · desktop: left column) */
  window.ccGuidesRowHTML = where => `<button type="button" class="hgd-row hgd-row--${where === 'dsk' ? 'dsk' : 'mob'}" data-cc-guides aria-haspopup="dialog">
      <span class="hgd-dots" aria-hidden="true"><span class="hgd-dot hgd-c1">${svg(P.phone, 12)}</span><span class="hgd-dot hgd-c2">${svg(P.bin, 12)}</span><span class="hgd-dot hgd-c3">${svg(P.bus, 12)}</span></span>
      <span class="hgd-row__t"><b>House guides</b> · App · Müll · Rund ums Haus</span>
      <span class="hgd-row__go" aria-hidden="true">${svg(P.chev, 16)}</span>
    </button>`;

  function sheetHTML() {
    const l = getLang();
    return `<div class="hgd-bg" data-hgd-close></div>
      <div class="hgd-sheet" role="dialog" aria-modal="true" aria-labelledby="hgdT">
        <div class="hgd-hdr">
          <div><p class="hgd-k">Casa Castel</p><p class="hgd-t" id="hgdT">House guides</p><p class="hgd-s">Everything about the house, as PDF</p></div>
          <button type="button" class="hgd-x" data-hgd-close aria-label="Close">${svg(P.x, 14)}</button>
        </div>
        <div class="hgd-body">
          <div class="hgd-card hgd-c1">
            <span class="hgd-ic">${svg(P.phone, 24)}</span>
            <div class="hgd-m"><p class="hgd-ct" id="hgdAppT">${APP[l].t}</p><p class="hgd-cs" id="hgdAppS">${APP[l].s}</p>
              <div class="hgd-r2">
                <span class="hgd-lang">
                  <button type="button" class="hgd-lang__l${l === 'de' ? ' is-on' : ''}" data-hgd-lang="de">DE</button>
                  <button type="button" class="hgd-sw${l === 'en' ? ' is-en' : ''}" data-hgd-lang-sw role="switch" aria-checked="${l === 'en'}" aria-label="English"><span class="hgd-sw__k"></span></button>
                  <button type="button" class="hgd-lang__l${l === 'en' ? ' is-on' : ''}" data-hgd-lang="en">EN</button>
                </span>
                <a class="hgd-open" id="hgdAppOpen" href="${href(F['app' + l])}" data-hgd-file="${F['app' + l]}" target="_blank" rel="noopener">Open${svg(P.go, 14)}</a>
              </div></div>
          </div>
          <div class="hgd-card hgd-c2">
            <span class="hgd-ic">${svg(P.bin, 24)}</span>
            <div class="hgd-m"><p class="hgd-ct">Mülltrennung</p><p class="hgd-cs">Was in welche Tonne · Weg zu den Tonnen · Glas</p>
              <div class="hgd-r2">${link(F.glas, 'hgd-ext', svg(P.bottle, 14) + 'Glas-Trolley')}${link(F.muell, 'hgd-open', 'Open' + svg(P.go, 14))}</div></div>
          </div>
          <div class="hgd-card hgd-c3">
            <span class="hgd-ic">${svg(P.bus, 24)}</span>
            <div class="hgd-m"><p class="hgd-ct">Rund ums Haus</p><p class="hgd-cs">Bus, Bahn &amp; Supermärkte in der Nähe</p>
              <div class="hgd-r2">${link(F.rund, 'hgd-open', 'Open' + svg(P.go, 14))}</div></div>
          </div>
        </div>
        <p class="hgd-wait" id="hgdWait" hidden>The guides will be ready here soon.</p>
        <div class="hgd-ft"><span>Opens the PDF · save or share from there</span><button type="button" class="hgd-close" data-hgd-close>Close</button></div>
      </div>`;
  }
  function open() {
    if (document.getElementById('ccGuides')) return;
    const el = document.createElement('div');
    el.id = 'ccGuides';
    el.className = 'hgd-ov';
    el.innerHTML = sheetHTML();
    document.body.appendChild(el);
    setTimeout(() => el.querySelector('.hgd-x')?.focus(), 0);
    check();
  }
  /* Are the PDFs in Storage? (asked once per app start) */
  async function check() {
    if (ready === null) {
      try { const r = await fetch(pub(F.appde), { method: 'HEAD', cache: 'no-store' }); ready = r.ok; }
      catch (e) { ready = false; }
    }
    applyReady();
  }
  function applyReady() {
    const m = document.getElementById('ccGuides');
    if (!m) return;
    m.querySelectorAll('a[data-hgd-file]').forEach(a => {
      a.href = href(a.dataset.hgdFile);
      const off = ready === false && STANDALONE;                // installed app: never open the app's own file (no way back)
      a.classList.toggle('is-off', off);
      if (off) a.setAttribute('aria-disabled', 'true'); else a.removeAttribute('aria-disabled');
    });
    const w = document.getElementById('hgdWait');
    if (w) w.hidden = !(ready === false && STANDALONE);
  }
  /* Landlord app: put the PDFs into Storage once (after an update with a new VF) */
  async function sync() {
    if (!document.body.classList.contains('is-landlord') || typeof sbL === 'undefined' || !sbL || !sbL.storage) return;
    try {
      const ses = await sbL.auth.getSession();
      if (!ses || !ses.data || !ses.data.session) return;
      const st = sbL.storage.from(BUCKET);
      const { data: have, error } = await st.list(VF, { limit: 50 });
      if (error) { console.warn('[guides] Storage:', error.message, '— run HOUSE-GUIDES.sql'); return; }
      const names = new Set((have || []).map(x => x.name));
      let added = 0;
      for (const f of Object.values(F)) {
        if (names.has(f)) continue;
        const r = await fetch(f + V, { cache: 'no-store' });
        if (!r.ok) continue;
        const up = await st.upload(VF + '/' + f, await r.blob(), { contentType: 'application/pdf', upsert: true, cacheControl: '31536000' });
        if (up && up.error) { console.warn('[guides] upload', f, up.error.message); continue; }
        added++;
      }
      if (added) ready = null;                                  // ask again next time the pop-up opens
    } catch (e) { console.warn('[guides] sync:', e); }
  }
  if (document.readyState === 'complete') setTimeout(sync, 3000);
  else window.addEventListener('load', () => setTimeout(sync, 3000));
  function close() { document.getElementById('ccGuides')?.remove(); }
  function lang(l) {                                           // the app guide in the other language (same card)
    setLang(l);
    const g = id => document.getElementById(id);
    if (g('hgdAppT')) g('hgdAppT').textContent = APP[l].t;
    if (g('hgdAppS')) g('hgdAppS').textContent = APP[l].s;
    if (g('hgdAppOpen')) { g('hgdAppOpen').dataset.hgdFile = F['app' + l]; g('hgdAppOpen').href = href(F['app' + l]); }
    document.querySelectorAll('#ccGuides [data-hgd-lang]').forEach(b => b.classList.toggle('is-on', b.dataset.hgdLang === l));
    const sw = document.querySelector('#ccGuides [data-hgd-lang-sw]');
    if (sw) { sw.classList.toggle('is-en', l === 'en'); sw.setAttribute('aria-checked', l === 'en'); }
  }
  window.ccGuidesOpen = open;

  document.addEventListener('click', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-cc-guides]')) { e.preventDefault(); open(); return; }
    const m = document.getElementById('ccGuides');
    if (!m || !m.contains(t)) return;
    if (t.closest('[data-hgd-close]')) { close(); return; }
    const off = t.closest('a.is-off');
    if (off) { e.preventDefault(); return; }
    if (t.closest('[data-hgd-lang-sw]')) { lang(getLang() === 'en' ? 'de' : 'en'); return; }
    const lb = t.closest('[data-hgd-lang]');
    if (lb) lang(lb.dataset.hgdLang);
    /* links (Open / Glas-Trolley) open the PDF in a new tab — the app stays as it is */
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('ccGuides')) close(); });

  const st = document.createElement('style');
  st.textContent = `
.hgd-row{display:grid !important;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:10px;width:100%;height:auto !important;min-height:0 !important;
  margin:0;padding:9px 16px;flex-shrink:0;border:0;border-bottom:.5px solid var(--cc-rule,#E0DAD0);border-radius:0;background:var(--cc-white,#FDFCFA);
  font:inherit;text-align:left;color:var(--cc-charcoal,#3A3530);cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-appearance:none;appearance:none;}
.hgd-row:active{background:#F7F3EC;}
.hgd-row--dsk{margin:0 0 12px;padding:10px 14px;border:.5px solid var(--cc-rule,#E0DAD0);border-radius:var(--cc-r-lg,14px);}
@media(min-width:701px){#tab-lounge .hgd-row--mob{display:none !important;}}
.hgd-dots{display:flex;}
.hgd-dot{width:22px;height:22px;margin-left:-5px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:1.5px solid var(--cc-white,#FDFCFA);}
.hgd-dot:first-child{margin-left:0;}
.hgd-c1{background:#F6EEDF;color:#8B6F47;} .hgd-c2{background:#E4EFE3;color:#2F6B3E;} .hgd-c3{background:#E3ECF5;color:#2F5F8F;}
.hgd-row__t{min-width:0;font-size:12px !important;line-height:1.3;color:var(--cc-taupe,#9A8E7E);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;}
.hgd-row__t b{font-weight:500;color:var(--cc-ink,#1E1B18);}
.hgd-row__go{display:flex;color:var(--cc-gold,#B8956A);}
.hgd-ov{position:fixed;inset:0;z-index:450;display:flex;align-items:flex-end;justify-content:center;}
.hgd-bg{position:absolute;inset:0;background:rgba(30,27,24,.5);}
.hgd-sheet{position:relative;width:100%;max-width:480px;max-height:88vh;max-height:88svh;display:flex;flex-direction:column;
  background:var(--cc-white,#FDFCFA);border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom,0px);color:var(--cc-charcoal,#3A3530);
  animation:hgdUp .24s cubic-bezier(.32,.72,0,1);}
@keyframes hgdUp{from{transform:translateY(32px);opacity:0;}to{transform:none;opacity:1;}}
@media(min-width:701px){.hgd-ov{align-items:center;}.hgd-sheet{max-width:520px;border-radius:20px;padding-bottom:0;}}
.hgd-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 12px;border-bottom:.5px solid var(--cc-rule,#E0DAD0);flex-shrink:0;}
.hgd-k{margin:0;font-size:10px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--cc-gold,#B8956A);}
.hgd-t{margin:2px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:400;line-height:1.1;color:var(--cc-ink,#1E1B18);}
.hgd-s{margin:2px 0 0;font-size:12px;color:var(--cc-taupe,#9A8E7E);}
.hgd-x{width:30px;height:30px;min-height:0;flex-shrink:0;display:flex;align-items:center;justify-content:center;margin:0;padding:0;border:.5px solid var(--cc-rule,#E0DAD0);
  border-radius:50%;background:#EFEAE2;color:var(--cc-taupe,#9A8E7E);cursor:pointer;}
.hgd-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;padding:14px 14px 6px;}
.hgd-card{display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:16px;}
.hgd-ic{width:46px;height:46px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--cc-white,#FDFCFA);}
.hgd-m{flex:1;min-width:0;}
.hgd-ct{margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:21px;font-weight:400;line-height:1.1;color:var(--cc-ink,#1E1B18);}
.hgd-cs{margin:3px 0 0;font-size:12px;line-height:1.4;}
.hgd-r2{display:flex;align-items:center;gap:8px;margin-top:10px;}
/* DE ◯ EN — a classic switch: the knob shows the language */
.hgd-lang{display:inline-flex;align-items:center;gap:7px;}
.hgd-lang__l{margin:0;padding:2px 0;min-height:0;min-width:0;border:0;background:none;font:inherit;font-size:11px;font-weight:500;letter-spacing:.06em;
  color:var(--cc-taupe,#9A8E7E);cursor:pointer;}
.hgd-lang__l.is-on{color:var(--cc-ink,#1E1B18);}
.hgd-sw{position:relative;width:34px;height:20px;min-height:0;min-width:0;flex-shrink:0;margin:0;padding:0;border:0;border-radius:10px;background:#8B6F47;cursor:pointer;
  -webkit-tap-highlight-color:transparent;}
.hgd-sw__k{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#FDFCFA;transition:left .15s;}
.hgd-sw.is-en .hgd-sw__k{left:16px;}
.hgd-open{display:inline-flex;align-items:center;gap:5px;margin-left:auto;padding:7px 13px;border-radius:999px;font-size:12px;font-weight:500;color:#fff;text-decoration:none;white-space:nowrap;}
.hgd-c1 .hgd-open{background:#8B6F47;} .hgd-c2 .hgd-open{background:#2F6B3E;} .hgd-c3 .hgd-open{background:#2F5F8F;}
.hgd-ext{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;background:var(--cc-white,#FDFCFA);border:.5px solid #C9DCC9;
  color:#2F5D3A;font-size:12px;font-weight:500;text-decoration:none;white-space:nowrap;}
.hgd-open.is-off,.hgd-ext.is-off{opacity:.4;pointer-events:auto;}
.hgd-wait{margin:2px 18px 0;padding:8px 12px;border-radius:10px;background:#FBF6EC;font-size:12px;color:#8B6F47;}
.hgd-ft{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 18px 16px;flex-shrink:0;font-size:11px;color:var(--cc-taupe,#9A8E7E);}
.hgd-close{min-height:0;margin:0;padding:8px 18px;border-radius:999px;border:.5px solid var(--cc-rule,#E0DAD0);background:none;font:inherit;font-size:12px;font-weight:500;color:#6B645C;cursor:pointer;}
`;
  document.head.appendChild(st);
})();
