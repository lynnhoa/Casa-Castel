/* ─────────────────────────────────────────────────────────────
   CASA CASTEL — "GET THE APP" CARD ON THE START PAGE (Oct 2026)
   cc-install-guide.js · tenant.html (tenant app) + service.html (CC Service)

   Opened in the BROWSER on a phone (not from the Home Screen icon) and
   nobody logged in → the login box steps aside for a small card with the
   steps from the App-Anleitung:
     iPhone · Safari   Teilen → Zum Home-Bildschirm
     Android · Chrome  ⋮ Menü → App installieren
   Why first: on iPhone a login (or a password request) made in Safari
   stays in Safari — the Home Screen app starts without it.
   "Use in the browser instead" shows the normal login (for this visit).

   Never shown: on a computer, in the Home Screen app, in the landlord
   preview, with a guest link, when already logged in, or while a
   password request waits on this phone (the caller's skip()).

   ccInstallGuide({ screen, app: 'tenant' | 'provider', name, icon, pdf, skip })
   ───────────────────────────────────────────────────────────── */
(function () {
  const SKIP_KEY = 'cc_install_skip';                 // sessionStorage: "use in the browser" for this visit
  const LANG_KEY = 'cc_guide_lang';                   // same choice as the house guides (EN | DE)
  const ua = navigator.userAgent || '';
  const mobile = /iPhone|iPad|iPod|Android/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
  function standalone() {
    try {
      return ['standalone', 'fullscreen', 'minimal-ui'].some(m => matchMedia('(display-mode: ' + m + ')').matches) || navigator.standalone === true;
    } catch (e) { return navigator.standalone === true; }
  }
  const ICO_ARROW = '<svg class="cig-a" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 18l6-6M13 6l6 6"/></svg>';
  const TXT = {
    en: { t: 'Get the app', share: 'Share', add: 'Add to Home Screen', menu: '⋮ Menu', inst: 'Install app', skip: 'Use in the browser instead',
          note: n => `Needs iOS 16.4+ or an up-to-date Chrome. Then always open ${n} from your home screen.` },
    de: { t: 'App runterladen', share: 'Teilen', add: 'Zum Home-Bildschirm', menu: '⋮ Menü', inst: 'App installieren', skip: 'Lieber im Browser nutzen',
          note: n => `Ab iOS 16.4 bzw. mit aktuellem Chrome. Danach ${n} immer vom Home-Bildschirm öffnen.` },
  };
  const CSS = `
.cig { padding:22px 20px 20px !important; }
.cig p { margin:0; }
.cig-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.cig-ico { width:44px; height:44px; border-radius:12px; display:block; border:.5px solid var(--cc-rule,#E0DAD0); }
.cig-tg { display:inline-flex; border:.5px solid var(--cc-rule,#E0DAD0); border-radius:20px; overflow:hidden; }
.cig-tg button { background:none; border:0; cursor:pointer; font-family:inherit; font-size:10px; font-weight:600; letter-spacing:.08em; padding:6px 12px; color:var(--cc-taupe,#9A8E7E); }
.cig-tg button.on { background:var(--cc-ink,#1E1B18); color:var(--cc-white,#FDFCFA); }
.cig .cig-k { font-size:9px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--cc-ink,#1E1B18); margin-top:14px; }
.cig .cig-t { font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; font-weight:400; color:var(--cc-ink,#1E1B18); line-height:1.15; }
.cig .cig-sub { font-size:11px; color:var(--cc-stone,#C8BFB0); letter-spacing:.04em; margin-top:2px; }
.cig .cig-l { font-size:9.5px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cc-taupe,#9A8E7E); margin:16px 0 7px; }
.cig-r { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.cig-r + .cig-r { margin-top:6px; }
.cig-p { border:1px solid #6B645C; border-radius:9px; padding:3px 9px; font-size:9.5px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--cc-ink,#1E1B18); white-space:nowrap; }
.cig-p2 { border-color:#D6CEC2; color:var(--cc-taupe,#9A8E7E); }
.cig-a { color:var(--cc-charcoal,#3A3530); flex-shrink:0; }
.cig-r2 .cig-a { color:var(--cc-taupe,#9A8E7E); }
.cig .cig-n { margin-top:18px; border:1px dashed #D6CEC2; border-radius:10px; padding:10px 12px; font-size:12px; line-height:1.5; color:var(--cc-charcoal,#3A3530); }
.cig-n2 { display:block; color:var(--cc-taupe,#9A8E7E); margin-top:4px; }
.cig-pdf { display:block; text-align:center; margin-top:14px; font-size:12px; color:var(--cc-taupe,#9A8E7E); text-decoration:underline; text-underline-offset:3px; }
.cig-skip { display:block; margin:16px auto 0; background:none; border:0; padding:4px 2px; font-family:inherit; font-size:12px; color:var(--cc-taupe,#9A8E7E); text-decoration:underline; text-underline-offset:3px; cursor:pointer; }`;

  window.ccInstallGuide = function (o) {
    try {
      if (!mobile || standalone()) return;
      if (sessionStorage.getItem(SKIP_KEY) === '1') return;
      if (typeof o.skip === 'function' && o.skip()) return;
    } catch (e) { return; }
    const screen = document.querySelector(o.screen);
    const box = screen && screen.querySelector('.login-box');
    if (!box || document.getElementById('ccInstallGuide')) return;

    if (!document.getElementById('cigCss')) {
      const st = document.createElement('style');
      st.id = 'cigCss';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const card = document.createElement('div');
    card.className = 'login-box cig';
    card.id = 'ccInstallGuide';
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'cig-skip';
    const icon = o.icon ? `<img class="cig-ico" src="${o.icon}" alt="" width="44" height="44">` : '';

    if (o.app === 'provider') {                       // CC Service: German and English together (like its login page)
      const de = TXT.de, en = TXT.en;
      card.innerHTML = `
        <div class="cig-top">${icon}</div>
        <p class="cig-k">Start</p>
        <p class="cig-t">App installieren</p>
        <p class="cig-sub">Get the app</p>
        <p class="cig-l">iPhone · Safari</p>
        <div class="cig-r"><span class="cig-p">${de.share}</span>${ICO_ARROW}<span class="cig-p">${de.add}</span></div>
        <div class="cig-r cig-r2"><span class="cig-p cig-p2">${en.share}</span>${ICO_ARROW}<span class="cig-p cig-p2">${en.add}</span></div>
        <p class="cig-l">Android · Chrome</p>
        <div class="cig-r"><span class="cig-p">${de.menu}</span>${ICO_ARROW}<span class="cig-p">${de.inst}</span></div>
        <div class="cig-r cig-r2"><span class="cig-p cig-p2">${en.menu}</span>${ICO_ARROW}<span class="cig-p cig-p2">${en.inst}</span></div>
        <p class="cig-n">${de.note(o.name)}<span class="cig-n2">${en.note(o.name)}</span></p>
        ${o.pdf ? `<a class="cig-pdf" href="${o.pdf}" target="_blank" rel="noopener">PDF-Anleitung · PDF guide</a>` : ''}`;
      skip.textContent = 'Lieber im Browser · Use in the browser';
    } else {                                          // tenant app: EN | DE toggle (same choice as the house guides)
      let lang = 'en';
      try { const v = localStorage.getItem(LANG_KEY); lang = v === 'de' || v === 'en' ? v : (/^de/i.test(navigator.language || '') ? 'de' : 'en'); } catch (e) {}
      card.innerHTML = `
        <div class="cig-top">${icon}<span class="cig-tg" role="group" aria-label="Language"><button type="button" data-l="en">EN</button><button type="button" data-l="de">DE</button></span></div>
        <p class="cig-k">Start</p>
        <p class="cig-t" data-k="t"></p>
        <p class="cig-l">iPhone · Safari</p>
        <div class="cig-r"><span class="cig-p" data-k="share"></span>${ICO_ARROW}<span class="cig-p" data-k="add"></span></div>
        <p class="cig-l">Android · Chrome</p>
        <div class="cig-r"><span class="cig-p" data-k="menu"></span>${ICO_ARROW}<span class="cig-p" data-k="inst"></span></div>
        <p class="cig-n" data-k="note"></p>`;
      const paint = l => {
        lang = l;
        const T = TXT[l];
        card.querySelectorAll('[data-k]').forEach(el => { const v = T[el.dataset.k]; el.textContent = typeof v === 'function' ? v(o.name) : v; });
        card.querySelectorAll('.cig-tg button').forEach(b => b.classList.toggle('on', b.dataset.l === l));
        skip.textContent = T.skip;
      };
      card.querySelectorAll('.cig-tg button').forEach(b => b.addEventListener('click', () => {
        paint(b.dataset.l);
        try { localStorage.setItem(LANG_KEY, b.dataset.l); } catch (e) {}
      }));
      paint(lang);
    }

    skip.addEventListener('click', () => {
      try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}
      card.remove();
      skip.remove();
      box.style.display = '';
    });
    box.style.display = 'none';
    box.parentNode.insertBefore(card, box);
    card.after(skip);
  };
})();
