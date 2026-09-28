/* ─────────────────────────────────────────────────────────────
   CASA CASTEL v2 — CHAT VIEWPORT
   ───────────────────────────────────────────────────────────── */

function initChatViewport() {
  if (!window.visualViewport) return;

  function onViewportChange() {
    const vv       = window.visualViewport;
    const keyboardH = window.innerHeight - vv.height - vv.offsetTop;
    const isOpen   = keyboardH > 50;
    const headerH  = document.querySelector('.cc-header')?.offsetHeight || 0;
    // Compose card: no home-bar gap while the keyboard is open
    document.body.classList.toggle('cc-kb-open', isOpen);

    // tab-lounge: inside shell-lock flex column, header is part of the flex column
    // so vv.height covers the full visible area including header space
    const lounge = document.getElementById('tab-lounge');
    if (lounge && lounge.style.display !== 'none') {
      if (isOpen) {
        lounge.style.height    = vv.height + 'px';
        lounge.style.maxHeight = vv.height + 'px';
      } else {
        lounge.style.height    = '';
        lounge.style.maxHeight = '';
      }
    }

    // k-mob-chat: the flex:1 chat area inside k-mob-wrapper
    // Calculate available height = visible viewport minus header minus rot strip minus week card
    const wrapper = document.getElementById('k-mob-wrapper');
    const chat    = wrapper?.querySelector('.k-mob-chat');
    if (chat && wrapper && wrapper.style.display !== 'none') {
      if (isOpen) {
        const rotStrip   = wrapper.querySelector('.k-mob-rot');
        const weekCard   = wrapper.querySelector('.k-mob-week');
        const nudgeStrip = wrapper.querySelector('.k-mob-nudge-strip.visible');
        const rotH   = rotStrip?.offsetHeight   || 0;
        const weekH  = weekCard?.offsetHeight   || 0;
        const nudgeH = nudgeStrip?.offsetHeight || 0;
        const h = vv.height - headerH - rotH - weekH - nudgeH;
        chat.style.height    = Math.max(h, 100) + 'px';
        chat.style.maxHeight = Math.max(h, 100) + 'px';
      } else {
        chat.style.height    = '';
        chat.style.maxHeight = '';
      }
    }
  }

  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}

function wireComposeBlur(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener('blur', () => {
    if (window.innerWidth > 700) return;
    setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 300);
  });
}
