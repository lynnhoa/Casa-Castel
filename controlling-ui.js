/* ─────────────────────────────────────────────────────────────
   CONTROLLING — SHARED UI
   controlling-ui.js

   One set of building blocks for every tab, so Dashboard, Einnahmen,
   Ausgaben, Einmalig and Setup look and behave identically:
     · month selector (same place on every tab, "Stand" date)
     · pills (one colour = one meaning, everywhere)
     · Soll │ → │ Ist row
     · summary card, property card with fold-up
     · money formatting / parsing (German)
   ───────────────────────────────────────────────────────────── */

'use strict';

/* ── Design system styles (injected once, so the look is right even if an
      older controlling.html is still being served) ── */
const _CX_CSS = `
    /* ════════ Controlling design system (cx) ════════
       Inter everywhere (wordmark excepted) · brown / beige tones, no black ·
       one pill colour = one meaning · 34 px fields, 13 px text.            */
    :root { --cc-ink:#3D3027; }                                   /* #23: espresso brown, no black on this page */
    :root { --cx-ink:#3D3027; --cx-txt:var(--cc-charcoal,#3A3530); --cx-amt:#3D3027; --cx-mut:var(--cc-taupe,#9A8E7E);
            --cx-sub:var(--cc-stone,#C8BFB0); --cx-acc:var(--cc-gold,#B8956A); --cx-neg:#A0533A; --cx-line:#EDE8E0;
            --cx-rule:var(--cc-rule,#E0DAD0); --cx-card:var(--cc-white,#FDFCFA); --cx-bg:var(--cc-bg,#F5F2ED); }   /* = Rentals */
    /* Nov 2026 (CP1): money to you green, money from you red — the Settlements tokens */
    :root { --cx-in:#16801F; --cx-in-s:#11691A; --cx-in-bg:#DDEFD3; --cx-out:#C42B14; --cx-out-s:#A3230E; --cx-out-bg:#F9DCD3; }
    .cx-m--in { color:var(--cx-in); font-weight:700; } .cx-m--out { color:var(--cx-out); font-weight:700; }
    .cx-ot-mt__kv .cx-m--in { color:var(--cx-in); } .cx-ot-mt__kv .cx-m--out { color:var(--cx-out); }   /* beats maint-link's ".cx-ot-mt__kv span" */
    .cx-pill--in  { background:var(--cx-in-bg); color:var(--cx-in-s); border-color:#9AC87A; }
    .cx-pill--out { background:var(--cx-out-bg); color:var(--cx-out-s); border-color:#E7A797; }
    body.is-landlord { color:var(--cx-ink); }
    .cx-page { max-width:560px; margin:0 auto; padding:4px 0 48px; display:flex; flex-direction:column; gap:8px;
               font-family:'Inter',system-ui,sans-serif; color:var(--cx-ink); }
    .cx-lbl { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); }
    .cx-head { display:flex; justify-content:space-between; padding:6px 4px 0; }
    .cx-row-sb { display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .cx-card { background:var(--cx-card); border:.5px solid var(--cx-rule); border-radius:12px; overflow:hidden; }
    .cx-title { font-family:'Cormorant Garamond',Georgia,serif; font-size:32px; font-weight:300; color:var(--cx-ink); }   /* = .rp-title */
    .cx-title__s { font-size:11px; color:var(--cx-mut); margin:-4px 0 4px; }
    .cx-empty { padding:14px; font-size:12px; color:var(--cx-mut); text-align:center; }
    /* month selector */
    .cx-month { display:flex; justify-content:space-between; align-items:center; padding:2px 0 4px; }
    .cx-month__t { text-align:center; }
    .cx-month__m { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:400; color:var(--cx-ink); line-height:1.15; }
    .cx-month__s { font-size:10px; color:var(--cx-sub); margin-top:2px; }
    .cx-arw { width:32px; height:32px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut);
              display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    /* pills */
    .cx-pill { display:inline-block; font-size:9px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; padding:2px 7px;
               border-radius:20px; border:.5px solid; white-space:nowrap; line-height:1.5; }
    .cx-pill--open  { background:#FDF0D8; color:#633806; border-color:#E8C97A; }
    .cx-pill--ok    { background:#EAF3DE; color:#27500A; border-color:#9AC87A; }
    .cx-pill--diff  { background:#F7E4DC; color:#8A3B22; border-color:#D9957C; }
    .cx-pill--grey  { background:#EFE9E0; color:var(--cx-mut); border-color:var(--cx-rule); }
    .cx-pill--beige { background:#F3EADC; color:var(--cx-acc); border-color:#D4B896; }
    /* ── Area sub-tabs (Rentals / Casa Castel → Income · Expenses · One-off) ── */
    .cx-subnav { max-width:560px; margin:0 auto 10px; display:flex; border:.5px solid var(--cx-rule); border-radius:10px; overflow:hidden; background:var(--cx-card); height:36px; }
    .cx-subnav button { flex:1; border:none; background:transparent; font-family:'Inter',system-ui,sans-serif; font-size:12.5px; color:var(--cx-mut); cursor:pointer; }
    .cx-subnav button.on { background:var(--cx-ink); color:#fff; }
    /* ── Dashboard v2 (hybrid: big number · one bar · calculation on tap · per property) ── */
    .cxd-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .cxd-top .cx-seg { width:150px; flex-shrink:0; }
    .cxd-per { display:flex; align-items:center; gap:6px; }
    .cxd-per__t { font-family:'Cormorant Garamond',Georgia,serif; font-size:26px; font-weight:500; color:var(--cx-ink); line-height:1.1; }
    .cxd-hero { text-align:center; padding:14px 0 4px; }
    .cxd-hero__l { font-size:12px; color:var(--cx-mut); }
    .cxd-hero__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:54px; font-weight:500; line-height:1.05; color:var(--cx-ink); }
    .cxd-hero__v.neg { color:var(--cx-neg); }
    .cxd-hero__s { font-size:12.5px; color:#6B5E4E; }
    .cxd-hero__s b { font-weight:500; color:var(--cx-ink); }
    .cxd-hero__t { font-size:11.5px; color:var(--cx-mut); margin-top:4px; }
    .cxd-open { display:block; width:100%; margin-top:8px; border:none; background:none; font-family:inherit; font-size:12.5px; color:#854F0B; cursor:pointer; text-align:center; }
    .cxd-open u { text-underline-offset:2px; }
    .cxd-bar { display:flex; height:34px; border-radius:8px; overflow:hidden; margin:8px 0 2px; background:var(--cx-line); }
    .cxd-bar span { display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:500; color:#fff; white-space:nowrap; overflow:hidden; min-width:0; }
    .cxd-kalt { position:relative; height:16px; }
    .cxd-kalt i { position:absolute; top:4px; border-top:1.5px solid var(--cx-ink); }
    .cxd-kalt span { position:absolute; right:0; top:5px; font-size:10px; color:var(--cx-ink); }
    .cxd-leg { display:grid; grid-template-columns:1fr 1fr; gap:5px 10px; font-size:11.5px; color:#6B5E4E; margin-top:6px; }
    .cxd-leg i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:5px; vertical-align:-1px; }
    .cxd-hint { display:block; width:100%; margin-top:8px; border:none; background:none; padding:0; font-family:inherit; font-size:11.5px; color:#854F0B; text-align:left; cursor:pointer; }
    .cxd-calcbtn { display:flex; width:100%; align-items:center; justify-content:space-between; margin-top:12px; padding:10px 0 0; border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; font-size:13px; color:var(--cx-ink); cursor:pointer; text-align:left; }
    .cxd-calcbtn small { display:block; font-size:11px; color:var(--cx-mut); }
    .cxd-calcbtn i { color:var(--cx-sub); }
    .cxd-tbl { margin-top:6px; }
    .cxd-tr { display:grid; grid-template-columns:1fr 76px 76px; align-items:center; column-gap:6px; }
    .cxd-tr > span:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; }
    .cxd-th { font-size:9.5px; font-weight:500; letter-spacing:.12em; color:var(--cx-mut); padding:8px 0 4px; }
    .cxd-st { padding:4px 0 4px 10px; font-size:12px; color:var(--cx-mut); }
    .cxd-res { padding:10px 0; border-top:.5px solid var(--cx-line); }
    .cxd-res > span:first-child { font-size:13.5px; font-weight:500; color:var(--cx-ink); }
    .cxd-res > span:first-child small { display:block; font-size:11px; font-weight:400; color:var(--cx-mut); }
    .cxd-res > span:not(:first-child) { font-family:'Cormorant Garamond',Georgia,serif; font-size:21px; font-weight:500; color:var(--cx-ink); }
    .cxd-fin { background:#F6FAF1; margin:2px -14px -10px; padding:11px 14px; border-top:1px solid #97C459; border-radius:0 0 12px 12px; }
    .cxd-fin > span:first-child { color:#27500A; }
    .cxd-tnote { font-size:11px; color:var(--cx-mut); margin-top:12px; line-height:1.45; }
    .cxd-pr { display:grid; grid-template-columns:128px 1fr 64px; align-items:center; gap:8px; width:100%; padding:7px 0; border:none; background:none; font-family:inherit; font-size:12.5px; color:var(--cx-ink); text-align:left; cursor:pointer; }
    .cxd-pr__n { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cxd-pr__v { text-align:right; font-weight:500; font-variant-numeric:tabular-nums; }
    .cxd-pr__v.neg { color:var(--cx-neg); }
    .cxd-track { height:10px; border-radius:5px; background:var(--cx-line); position:relative; overflow:hidden; }
    .cxd-track i { position:absolute; left:0; top:0; bottom:0; border-radius:5px; background:var(--cx-acc); }
    .cxd-track i.neg { background:#C0785A; }
    .cxd-pdet { padding:0 0 8px; border-bottom:.5px solid var(--cx-line); }
    .cxd-prow { display:flex; align-items:center; gap:10px; width:100%; padding:10px 0; border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; text-align:left; cursor:pointer; color:var(--cx-ink); }
    .cxd-prow:first-child { border-top:none; }
    .cxd-prow__l { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .cxd-prow__n { font-size:14px; font-weight:500; line-height:1.25; }
    .cxd-prow__s { font-size:11.5px; color:var(--cx-mut); }
    .cxd-prow__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:500; white-space:nowrap; }
    .cxd-prow__v.pos { color:#3B6D11; }
    .cxd-prow__v.neg { color:var(--cx-neg); }
    .cxd-prow__c { color:var(--cx-sub); font-size:14px; }
    .cx-nkset { margin-top:8px; padding-top:8px; border-top:.5px dashed var(--cx-line); }
    .cx-nkset__k { display:block; font-size:9.5px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:#3E6E69; margin-bottom:5px; }
    .cx-nkset__v { font-size:12px; color:var(--cx-mut); }
    .cx-pill--nk { background:#E3EFEE; color:#3E6E69; border-color:#9CC5C0; }   /* Casa cost umgelegt in die NK-Abrechnung */
    .cx-ot-nk { display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px; border-radius:10px; border:0.5px solid var(--cx-rule); background:var(--cx-card); font-family:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-ot-nk.on { border:1px solid #9CC5C0; background:#EEF6F5; }
    .cx-ot-nk__sw { position:relative; width:38px; height:22px; flex-shrink:0; border-radius:11px; background:#D9D2C7; transition:background .15s; }
    .cx-ot-nk__sw::after { content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s; }
    .cx-ot-nk.on .cx-ot-nk__sw { background:#3E6E69; }
    .cx-ot-nk.on .cx-ot-nk__sw::after { transform:translateX(16px); }
    .cx-ot-nk__t { display:flex; flex-direction:column; gap:2px; }
    .cx-ot-nk__t b { font-size:13px; font-weight:500; color:var(--cx-ink); }
    .cx-ot-nk.on .cx-ot-nk__t b { color:#2F5753; }
    .cx-ot-nk__t small { font-size:11px; color:var(--cx-mut); }
    /* buttons */
    .cx-btn { height:36px; padding:0 16px; border-radius:8px; font-family:inherit; font-size:11px; font-weight:500; letter-spacing:.07em;
              text-transform:uppercase; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;
              border:.5px solid transparent; -webkit-tap-highlight-color:transparent; }
    .cx-btn--p { background:var(--cx-ink); color:var(--cx-card); border-color:var(--cx-ink); }
    .cx-btn--s { background:transparent; color:var(--cx-mut); border-color:var(--cx-rule); }
    .cx-btn--full { width:100%; }
    .cx-btn:disabled { opacity:.4; cursor:default; }
    .cx-link { background:none; border:none; font-family:inherit; font-size:11px; color:var(--cx-mut); padding:8px 4px; text-align:left; cursor:pointer; }
    /* summary + hero */
    .cx-sum { padding:14px 16px; }
    .cx-sum__v { display:flex; align-items:baseline; gap:6px; margin-top:6px; font-variant-numeric:tabular-nums; }
    .cx-sum__big { font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; font-weight:600; color:var(--cx-ink); }   /* CP1: bold, signed, green in / red out */
    .cx-sum__big .cx-m--in, .cx-sum__big .cx-m--out { font-weight:600; }
    .cx-sum__of { font-size:12px; color:var(--cx-mut); }
    .cx-sum__hint { font-size:10.5px; color:var(--cx-mut); text-align:center; margin-top:8px; }
    .cx-bar { height:10px; border-radius:5px; background:#E3D5BF; overflow:hidden; }
    .cx-bar > div { height:100%; background:var(--cx-acc); border-radius:5px 0 0 5px; transition:width .25s; }
    .cx-bar > div.over { background:var(--cx-neg); border-radius:5px; }
    .cx-bar--thin { height:6px; margin:8px 0 12px; background:var(--cx-line); }
    .cx-hero { padding:16px; }
    .cx-hero__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:46px; font-weight:400; line-height:1.1; text-align:center; margin-top:4px; color:var(--cx-ink);
                  font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-hero__v.neg { color:var(--cx-neg); }
    .cx-hero__c { font-size:11px; color:var(--cx-mut); text-align:center; margin:4px 0 14px; }
    .cx-io { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:10px; }
    .cx-io__v { font-size:15px; font-weight:500; color:var(--cx-ink); margin-top:2px; font-variant-numeric:tabular-nums; }
    .cx-sw { display:inline-block; width:7px; height:7px; border-radius:2px; margin-right:5px; }
    .cx-sw--in { background:#E3D5BF; border:.5px solid #D4B896; } .cx-sw--out { background:var(--cx-acc); }
    .cx-stat { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; margin-top:14px; padding:12px 0 0;
               border:none; border-top:.5px solid var(--cx-line); background:none; font-family:inherit; font-size:12px; text-align:left; }
    button.cx-stat { cursor:pointer; }
    .cx-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:8px; vertical-align:0; }
    .cx-stat--open { color:#633806; } .cx-stat--open .cx-dot { background:#E8C97A; }
    .cx-stat--ok { color:#27500A; }   .cx-stat--ok .cx-dot { background:#9AC87A; }
    .cx-stat--muted { color:var(--cx-mut); } .cx-stat--muted .cx-dot { background:var(--cx-rule); }
    .cx-stat__go { font-size:11px; font-weight:500; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; }
    /* property card */
    .cx-ph { width:100%; display:flex; justify-content:space-between; align-items:center; gap:10px; padding:14px 16px; background:none; border:none;
             font-family:inherit; text-align:left; cursor:pointer; color:inherit; -webkit-tap-highlight-color:transparent; }
    .cx-ph__l { display:flex; flex-direction:column; min-width:0; }
    .cx-ph__r { display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .cx-ph__sum { font-size:12px; color:var(--cx-txt); font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-pn { font-family:'Cormorant Garamond',Georgia,serif; font-size:22px; font-weight:400; color:var(--cx-ink); line-height:1.1; }   /* = .apt-hdr__name */
    .cx-pn--s { font-size:19px; }
    .cx-src { font-size:12px; color:var(--cx-txt); margin-top:4px; }   /* = .apt-hdr__rent */
    .cx-src--empty { color:var(--cx-sub); font-style:italic; }
    .cx-chev { color:var(--cx-sub); font-size:14px; }
    .cx-cf { font-size:14px; font-weight:500; color:var(--cx-acc); white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-cf.neg { color:var(--cx-neg); }
    .cx-det { padding:0 16px 12px; }
    .cx-kv { display:flex; justify-content:space-between; gap:10px; font-size:12px; padding:5px 0; border-top:.5px solid var(--cx-line); font-variant-numeric:tabular-nums; }
    .cx-kv span:first-child { color:var(--cx-mut); } .cx-kv span:last-child { color:var(--cx-txt); } .cx-kv--sub span { font-size:11px; color:var(--cx-sub) !important; }
    .cx-kv--open { color:#633806; }
    .cx-year { padding:14px 16px; display:flex; justify-content:space-between; align-items:baseline; }
    .cx-year__v { font-family:'Cormorant Garamond',Georgia,serif; font-size:24px; font-weight:400; color:var(--cx-ink); font-variant-numeric:tabular-nums; }
    .cx-year__v.neg { color:var(--cx-neg); }
    /* Soll │ → │ Ist row */
    .cx-r { display:block; padding:10px 16px; border-top:.5px solid var(--cx-line); }
    .cx-r__l { min-width:0; }
    .cx-r__top { display:flex; justify-content:space-between; align-items:center; gap:8px; min-height:18px; }
    .cx-r__top .cx-r__u { min-width:0; }
    .cx-r__mid { display:grid; grid-template-columns:minmax(0,1fr) 112px; gap:8px; align-items:center; margin-top:4px; }
    .cx-soll { justify-self:start; display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border-radius:6px;
               border:.5px solid #D4B896; background:#F5EFE6; font-family:inherit; font-size:14px; font-weight:600; color:var(--cx-amt);
               font-variant-numeric:tabular-nums; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-soll i { font-size:13px; color:var(--cx-acc); }
    .cx-soll.on { background:#EAF3DE; border-color:#9AC87A; } .cx-soll.on i { color:#27500A; }
    .cx-r__info { font-size:12px; color:#6E6357; margin-top:2px; }
    .cx-r--set { padding:10px 0; }
    .cx-r--set .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:6px 0 2px; }
    .cx-set-grp { border-top:.5px solid var(--cx-rule); margin-top:6px; }
    .cx-set-per { display:flex; justify-content:space-between; gap:8px; padding:10px 0 4px; font-size:10.5px; color:var(--cx-mut); border-top:.5px solid var(--cx-line); }
    .cx-bulk { margin-top:2px; padding:10px 12px; border:.5px solid #E8C97A; background:#FDF0D8; border-radius:8px; font-size:12px; color:#633806;
               display:flex; flex-direction:column; gap:8px; }
    .cx-bulk__s { color:var(--cx-mut); font-size:11px; }
    .cx-undo { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; font-size:12px; color:var(--cx-txt); }
    .cx-views { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-r__u { font-size:13px; color:#5F5649; }   /* CP1: 13 px · 7.0:1 (was 11 px #9A8E7E · 3.1:1) */
    .cx-r__s { font-size:14px; font-weight:600; color:var(--cx-ink); font-variant-numeric:tabular-nums; margin-top:1px; }
    .cx-r__sub { font-size:12px; color:#6E6357; margin-top:1px; }   /* CP1: 12 px · 5.7:1 (was 10 px · 3.1:1) */
    .cx-from { color:#786D60; }   /* CP1: the source stays a shade lighter, but readable (4.9:1) */
    .cx-r__note { font-size:12px; color:var(--cx-acc); margin-top:2px; }
    .cx-r__warn { font-size:10px; color:#633806; background:#FDF0D8; border:.5px solid #E8C97A; border-radius:6px; padding:3px 6px; margin-top:4px; line-height:1.35; }
    .cx-r__p { display:flex; justify-content:flex-end; gap:5px; flex-shrink:0; }
    .cx-take { width:30px; height:30px; border-radius:50%; border:.5px solid #D4B896; background:#F5EFE6; color:var(--cx-acc); padding:0;
               display:flex; align-items:center; justify-content:center; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-take.on { background:#EAF3DE; border-color:#9AC87A; color:#27500A; }
    .cx-take:disabled { opacity:.3; cursor:default; }
    .cx-f { display:flex; align-items:center; height:34px; box-sizing:border-box; padding:0 8px; border-radius:6px; border:1px solid var(--cx-rule); background:var(--cx-card); min-width:0; }
    .cx-f:focus-within { border-color:#B8956A; }
    html .cx-f input, html .cx-f select { flex:1; min-width:0; width:100%; height:100%; border:none !important; outline:none; background:transparent !important;
               padding:0 !important; margin:0; box-shadow:none !important; font-family:'Inter',system-ui,sans-serif; font-size:13px !important;
               font-weight:400; color:var(--cx-ink); text-align:right; font-variant-numeric:tabular-nums; -webkit-appearance:none; appearance:none; }
    html .cx-f--l input, html .cx-f--l select { text-align:left; }
    html .cx-f input::placeholder { color:#D6CBBB; }
    html .cx-f input.cc-cal { padding-right:24px !important; background-position:right 0 center !important; background-size:15px 15px !important; }
    .cx-f > span { font-size:11px; color:var(--cx-mut); margin-left:4px; }
    .cx-f > i { color:var(--cx-mut); font-size:13px; margin-left:4px; pointer-events:none; }
    .cx-f--s { width:120px; flex-shrink:0; }
    .cx-f--off { opacity:.6; }
    .cx-nd { display:flex; align-items:center; gap:8px; padding:10px 16px; border-top:.5px solid var(--cx-line); font-size:12px; color:#6E6357; }   /* CP1: as the sub lines */
    /* Einmalig */
    .cx-form { display:flex; flex-direction:column; gap:8px; margin-top:12px; padding-top:12px; border-top:.5px solid var(--cx-line); }
    .cx-grid2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .cx-chips { display:flex; flex-wrap:wrap; gap:6px; }
    .cx-chip { height:30px; padding:0 12px; border-radius:15px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit;
               font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-chip.on { background:var(--cx-ink); border-color:var(--cx-ink); color:var(--cx-card); }
    .cx-seg { display:flex; border:.5px solid var(--cx-rule); border-radius:8px; overflow:hidden; height:34px; }
    .cx-seg--view { background:var(--cx-card); margin-bottom:2px; }
    .cx-davon { margin-top:10px; padding-top:6px; border-top:.5px solid var(--cx-line); }
    .cx-davon .cx-kv { border-top:none; padding:3px 0; }
    .cx-davon .cx-kv span:first-child { color:var(--cx-txt); }
    .cx-davon__h { color:var(--cx-mut); }
    .cx-davon__t { color:var(--cx-acc) !important; font-weight:500; }
    .cx-seg button { flex:1; border:none; background:transparent; font-family:inherit; font-size:12px; color:var(--cx-mut); cursor:pointer; }
    .cx-seg button.on { background:var(--cx-ink); color:var(--cx-card); }
    .cx-sug { display:grid; grid-template-columns:minmax(0,1fr) auto 30px; gap:8px; align-items:center; padding:12px 16px; }
    .cx-it { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:12px 16px; }
    .cx-it__l { min-width:0; } .cx-it__t { font-size:13px; font-weight:500; color:var(--cx-ink); }
    .cx-it__p { margin-top:5px; }
    .cx-it__r { display:flex; align-items:center; gap:8px; flex-shrink:0; }
    .cx-amt { font-size:14px; font-weight:600; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .cx-amt.pos { color:var(--cx-acc); } .cx-amt.neg { color:var(--cx-neg); }
    .cx-del { width:30px; height:30px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut); cursor:pointer;
              display:flex; align-items:center; justify-content:center; padding:0; }
    /* Setup */
    .cx-set { padding:0 16px 14px; display:flex; flex-direction:column; gap:6px; }
    .cx-set__row { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px; }
    .cx-set__k { font-size:11px; color:var(--cx-mut); }
    .cx-set__sub { font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--cx-mut); margin-top:10px; padding-top:10px; border-top:.5px solid var(--cx-line); }
    .cx-mchips { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; }   /* CP1: Jan … Dec, 6 × 2 on the phone */
    @media (min-width:600px) { .cx-mchips { grid-template-columns:repeat(12,minmax(0,1fr)); gap:3px; } }
    .cx-mchip { height:30px; border-radius:6px; border:.5px solid var(--cx-rule); background:transparent; font-family:inherit; font-size:12px; color:#6E6357; cursor:pointer; padding:0; }
    .cx-mchip.on { background:#F3EADC; border-color:#D4B896; color:var(--cx-acc); font-weight:600; }
    .cx-cat { padding:12px 16px; border-top:.5px solid var(--cx-line); display:flex; flex-direction:column; gap:6px; }
    .cx-cat:first-child { border-top:none; }
    .cx-hint { display:grid; grid-template-columns:minmax(0,1fr) 28px; gap:8px; align-items:start; margin-top:6px; padding-top:6px;
               border-top:.5px solid var(--cx-line); font-size:12px; color:var(--cx-txt); line-height:1.45; }
    .cx-x { width:28px; height:28px; border-radius:50%; border:.5px solid var(--cx-rule); background:transparent; color:var(--cx-mut);
            display:flex; align-items:center; justify-content:center; padding:0; cursor:pointer; font-size:13px; -webkit-tap-highlight-color:transparent; }
    .cx-hint-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:0 4px; font-size:11px; color:var(--cx-mut); }
    .cx-hint-foot .cx-link { color:var(--cx-acc); font-weight:500; padding:4px 0; }
    .cx-abr { border-top:.5px solid var(--cx-rule); margin-top:2px; }
    .cx-abr-h { display:flex; justify-content:space-between; align-items:center; padding:10px 16px 0; }
    .cx-abr-h .cx-link { color:var(--cx-acc); font-weight:500; padding:4px 0; }
    .cx-abr--empty .cx-abr-h { padding-bottom:10px; }
    .cx-abr-form { margin:8px 16px 14px; }
    .cx-link--a { color:var(--cx-acc); font-weight:500; }
    .cx-link--in { display:inline; padding:0; font-size:10px; }
    /* One-off: same card and row pattern as Income / Expenses */
    .cx-ot-top { display:flex; justify-content:space-between; align-items:center; padding:8px 16px; border-top:.5px solid var(--cx-line); }
    .cx-ot-top .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:4px 0; }
    .cx-ot-m { width:100%; display:flex; justify-content:space-between; align-items:center; padding:10px 16px 6px; background:#FAF7F2; border:none;
               border-top:.5px solid var(--cx-line); font-family:inherit; font-size:9px; font-weight:500; letter-spacing:.14em; text-transform:uppercase;
               color:var(--cx-mut); cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .cx-ot-more { width:100%; padding:10px 16px; background:none; border:none; border-top:.5px solid var(--cx-line); font-family:inherit; font-size:12px;
                  font-weight:500; color:var(--cx-acc); cursor:pointer; text-align:center; }
    .cx-ot-ms { font-size:11px; letter-spacing:0; text-transform:none; font-weight:400; color:var(--cx-mut); font-variant-numeric:tabular-nums; }
    button.cx-ot-r { width:100%; background:none; border:none; border-top:.5px solid var(--cx-line); font-family:inherit; text-align:left; cursor:pointer;
                     color:inherit; -webkit-tap-highlight-color:transparent; }
    .cx-ot-r .cx-r__u { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cx-ot-r .cx-r__s { margin-top:4px; }
    .cx-ot-r .cx-r__s.pos { color:var(--cx-in); font-weight:700; }
    .cx-ot-r .cx-chev { font-size:13px; }
    .cx-ot-edit { padding:0 16px 12px; border-top:.5px solid var(--cx-line); }
    .cx-ot-edit--top { border-top:none; }
    .cx-ot-edit--top .cx-form { margin-top:0; }
    .cx-sum .cx-form { margin-top:12px; }
    @keyframes cxFlash { from { background:#F3EADC; } to { background:transparent; } }
    .cx-ot-flash { animation:cxFlash 1.8s ease-out; }
    @media (prefers-reduced-motion: reduce) { .cx-ot-flash { animation:none; background:#F7F1E6; } }
    .cx-ot-tot { font-size:14px; font-weight:600; color:var(--cx-amt); font-variant-numeric:tabular-nums; white-space:nowrap; }
    .cx-ot-q { background:var(--cx-card); }
    .cx-ot-exp__go { display:flex; gap:8px; }
    .cx-ot-exp__go > .cx-btn { flex:1; }
    #cxOtList { display:flex; flex-direction:column; gap:8px; }   /* same card spacing as the other tabs */
    .cx-btn--del { color:var(--cx-neg); border-color:#D9957C; }
    .cx-ot-del { color:var(--cx-neg); align-self:center; padding:6px 0 0; }
    .cx-su-u { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:.5px solid var(--cx-line); }
    .cx-set__sub + .cx-su-u { border-top:none; padding-top:2px; }
    .cx-su-n { font-size:13px; font-weight:500; color:var(--cx-ink); min-width:0; }
    .cx-su-a { display:flex; gap:14px; }
    .cx-su-a:empty { display:none; }
    .cx-su-a .cx-link { color:var(--cx-acc); font-weight:500; font-size:12px; padding:2px 0; }
    /* CP2 (#10): a difference you meant — "On purpose" (quiet button on the sub line, a mini sheet with reasons) */
    .cx-ph__st { display:flex; align-items:center; gap:4px 6px; }
    .cx-ph__gh { display:none; }
    @media (max-width:599px) { .cx-ph__st { flex-direction:column; align-items:flex-end; }   /* "1 open" over "1 difference" on the phone */
      /* the pills as they were before a mark, invisible and 0 px high: the status keeps its width, so the title never re-wraps */
      .cx-ph__gh { display:flex; flex-direction:column; align-items:flex-end; height:0; margin-top:-4px; overflow:hidden; visibility:hidden; } }
    button.cx-pill { font-family:inherit; margin:0; cursor:pointer; -webkit-appearance:none; appearance:none; -webkit-tap-highlight-color:transparent; }
    .cx-pill--mark { background:#EFE9E0; color:#5F5649; border-color:#D9D1C4; }   /* neutral grey, 6:1 */
    .cx-r__sub--dif { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cx-r__sub--dif > span { min-width:0; }
    /* 24 px to tap, drawn as a 20 px pill; its last 4 px reach into the row padding (margin −4 px), so the sub line stays 19.8 px:
       a row with a difference is exactly as high as without one — nothing below moves */
    .cx-dif { position:relative; z-index:0; flex-shrink:0; width:88px; height:24px; margin:-.5px 0 -4px; padding:0 0 4px; border:0; background:transparent; font-family:inherit;
              font-size:11.5px; line-height:1; color:#6E6357; white-space:nowrap; cursor:pointer; -webkit-tap-highlight-color:transparent; }   /* one width: On purpose · Undo · kept free */
    .cx-dif::before { content:''; position:absolute; z-index:-1; left:0; right:0; top:0; height:20px; box-sizing:border-box; border:.5px solid #D9D1C4; border-radius:10px; }
    .cx-dif:focus-visible { outline:none; } .cx-dif:focus-visible::before { outline:2px solid var(--cx-acc); outline-offset:1px; }
    .cx-dif--ph { visibility:hidden; }
    .cx-dif.on::before { background:#EFE9E0; }
    .cx-dif--undo { color:var(--cx-ink); } .cx-dif--undo::before { border-color:#D4B896; }   /* neutral: red / green mean money only */
    .cx-sum__dif { line-height:17px; }   /* a whole 25 px line (with its margin): the row you typed in is kept in place exactly */
    .cx-dif-sh { margin-top:8px; padding:10px; border-radius:8px; border:.5px solid var(--cx-rule); background:#FAF7F2; display:flex; flex-direction:column; gap:8px; }
    .cx-dif-sh .cx-chip { height:28px; padding:0 11px; color:#6E6357; background:var(--cx-card); }
    .cx-dif-sh .cx-chip.on { color:var(--cx-card); background:var(--cx-ink); }
`;
(function () {
  if (typeof document === 'undefined' || document.getElementById('cx-styles')) return;
  const s = document.createElement('style');
  s.id = 'cx-styles';
  s.textContent = _CX_CSS;
  (document.head || document.documentElement).appendChild(s);
})();

const CX = {
  month: (() => {
    try { const v = Number(localStorage.getItem('cx_month')); if (v >= 1 && v <= 12) return v; } catch (e) {}
    return new Date().getMonth() + 1;
  })(),
  open: {},            // fold state per card key
  tab: 'dashboard',
  area: null,          // null = Dashboard (everything) · 'rentals' · 'casa'
  sub: 'income',       // sub-tab inside Rentals / Casa Castel: income · expenses · onetime
  dif: null,           // CP2: the row whose "On purpose" sheet ({ id, sheet, pick }) or Undo ({ id, undo }) is open
};

/* Area filter (Rentals = all apartments · Casa Castel = the house) */
function cxAreaPid(pid) {
  if (!CX.area) return true;
  return CX.area === 'casa' ? Number(pid) === CASA_PROP_ID : Number(pid) !== CASA_PROP_ID;
}
const cxAreaOk = p => cxAreaPid(p.id);

const CX_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Money ── */
const cxR    = v => Math.round((Number(v) || 0) * 100) / 100;
const cxE2   = v => cxR(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cxEur  = v => cxE2(v) + '\u202f€';
const cxW    = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
const cxWS   = v => { const n = Math.round(Number(v) || 0); return (n < 0 ? '\u2212\u202f' : n > 0 ? '+\u202f' : '') + Math.abs(n).toLocaleString('de-DE') + '\u202f€'; };
/* CP1: a signed amount for money that moves — v > 0 in (green "+ 100 €"), v < 0 out (red "− 80 €"), 0 plain.
   fmt = cxW (whole euros, default) or cxEur (cents) */
function cxIO(v, fmt) {
  const f = fmt || cxW, n = cxR(v);
  if (!(f === cxW ? Math.round(n) : n)) return f(0);
  return '<span class="cx-m cx-m--' + (n > 0 ? 'in' : 'out') + '">' + (n > 0 ? '+' : '\u2212') + '\u202f' + f(Math.abs(n)) + '</span>';
}
const cxEsc  = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function cxParse(s) {
  if (typeof ccParseEUR === 'function') { const n = ccParseEUR(s); return (n === null || n === undefined || isNaN(n)) ? null : n; }
  s = String(s ?? '').replace(/[€\s\u202f]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function cxToday() {
  if (typeof ccTodayISO === 'function') return ccTodayISO();
  const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const cxFmtDate = iso => { const s = String(iso || '').slice(0, 10); return s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : ''; };

/* ── Pills: one colour = one meaning ── */
const cxPill = (cls, text) => '<span class="cx-pill cx-pill--' + cls + '">' + cxEsc(text) + '</span>';

/* \u2500\u2500 CP2 (#10): differences \u00b7 "On purpose" \u2500\u2500
   cxDiff = Ist \u2212 Soll (0 within half a cent). dir = whose money: +1 Income, \u22121 costs.
   For you: < 0 = less money (red), > 0 = more money (green) \u2014 a cost paid above its Soll is "\u2212 more".
   A mark { ok, reason } (controlling-data.js) makes it neutral grey; it is no longer a difference. */
const CX_DIFF_IN  = [['agreed', 'Agreed'], ['reduction', 'Rent reduction'], ['kaution', 'Kaution'], ['later', 'Pays later'], ['other', 'Other']];
const CX_DIFF_OUT = [['agreed', 'Agreed'], ['reduction', 'Reduction'], ['later', 'Paid later'], ['other', 'Other']];
const CX_DIFF_SHORT = { agreed: 'Agreed', reduction: 'Reduction', kaution: 'Kaution', later: 'later', other: 'Other' };
function cxDiff(soll, ist) {
  if (ist === null || ist === undefined) return 0;
  const d = cxR(Number(ist) - (Number(soll) || 0));
  return Math.abs(d) < 0.005 ? 0 : d;
}
const cxMarked = r => !!(r && r.mark && r.mark.ok);
const cxUnmarked = r => cxMarked(r) ? Object.assign({}, r, { mark: null }) : r;
const _cxSgn = (d, dir) => (d * (dir === -1 ? -1 : 1) < 0 ? '\u2212 ' : '+ ');
function cxMarkText(d, dir, mark) {
  const why = mark && mark.reason ? (mark.reason === 'later' ? (dir === -1 ? 'Paid later' : 'Pays later') : CX_DIFF_SHORT[mark.reason] || 'on purpose') : 'on purpose';
  return _cxSgn(d, dir) + cxEur(Math.abs(d)) + ' \u00b7 ' + why;
}
function cxStatus(soll, ist, emptyText, dir, mark) {
  if (!soll && (ist === null || ist === undefined)) return ['grey', emptyText || 'empty'];
  if (ist === null || ist === undefined) return ['open', 'open'];
  const d = cxDiff(soll, ist);
  if (!d) return ['ok', 'paid'];
  if (mark && mark.ok) return ['mark', cxMarkText(d, dir, mark)];
  const less = d * (dir === -1 ? -1 : 1) < 0;                         // less money for you
  const word = dir === -1 ? (d > 0 ? ' more' : ' less') : (d < 0 ? ' missing' : ' extra');
  return [less ? 'out' : 'in', _cxSgn(d, dir) + cxEur(Math.abs(d)) + word];
}
/* Card header: what is still unclear \u2014 open rows AND differences not marked, side by side
   (an overpayment never hides an open row). Red when one of them is less money, else green. */
function cxGroupStatus(rows, dir) {
  const has = v => v !== null && v !== undefined;
  const act = rows.filter(r => r.soll || has(r.ist));
  const open = act.filter(r => !has(r.ist)).length;
  let less = 0, more = 0;
  for (const r of act) {
    const d = cxDiff(r.soll, r.ist);
    if (!d || cxMarked(r)) continue;
    if (d * ((r.dir || dir) === -1 ? -1 : 1) < 0) less++; else more++;
  }
  const n = less + more, out = [];
  if (open) out.push(['open', open + ' open']);
  if (n) out.push([less ? 'out' : 'in', n + (n === 1 ? ' difference' : ' differences')]);
  if (out.length === 1) return out[0];
  if (out.length) return out;
  return act.length ? ['ok', 'done'] : ['grey', 'empty'];
}
/* Month summary: all differences and how many of them are on purpose */
function cxDiffCount(rows) {
  let n = 0, ok = 0;
  for (const r of rows) { if (!cxDiff(r.soll, r.ist)) continue; n++; if (cxMarked(r)) ok++; }
  return { n, ok };
}
function cxDiffLine(c) {
  if (!c || !c.n) return '';
  const t = c.n + (c.n === 1 ? ' difference' : ' differences');
  return c.ok ? t + ' \u00b7 ' + (c.ok === c.n ? (c.n === 1 ? 'on purpose' : 'all on purpose') : c.ok + ' on purpose') : t;
}
/* Is the month after the current one? (nothing is due yet) */
function cxFuture(y, m) {
  const t = cxToday(), cy = Number(t.slice(0, 4)), cm = Number(t.slice(5, 7));
  return y * 12 + m > cy * 12 + cm;
}

/* ── Month selector (same on every tab) ── */
function cxMonthBar() {
  const today = cxFmtDate(cxToday());
  return '<div class="cx-month">' +
    '<button class="cx-arw" data-cx="prev" aria-label="Previous month"><i class="ti ti-chevron-left" aria-hidden="true"></i></button>' +
    '<div class="cx-month__t"><div class="cx-month__m">' + CX_MONTHS[CX.month - 1] + ' ' + window._ctrl.year + '</div>' +
    '<div class="cx-month__s">As of ' + today + '</div></div>' +
    '<button class="cx-arw" data-cx="next" aria-label="Next month"><i class="ti ti-chevron-right" aria-hidden="true"></i></button></div>';
}
async function cxStepMonth(delta) {
  let m = CX.month + delta, y = window._ctrl.year;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }
  if (y !== window._ctrl.year) {                          // C1 #17: the other year loads first — if it fails, you stay where you were
    if (typeof ctlShowLoading === 'function') ctlShowLoading(true);
    let ok = true;
    try { await ctlLoadAll(y); } catch (e) { ok = false; cxToastLoad(y, e); }
    if (typeof ctlShowLoading === 'function') ctlShowLoading(false);
    if (!ok) return;
  }
  CX.month = m; CX.open = {}; CX.undo = null; CX.bulk = null; CX.dif = null;
  try { localStorage.setItem('cx_month', String(m)); } catch (e) {}
  cxRenderActive();
}
function cxRenderActive() {
  const f = { dashboard: 'renderDashboard', income: 'renderIncome', expenses: 'renderExpenses', onetime: 'renderOneTime', setup: 'renderSetup' }[CX.tab];
  if (f && typeof window[f] === 'function') window[f]();
}
/* C6: a save that ends after you left its screen does not draw that hidden screen and leaves CX.tab with the screen you
   are on (the month arrows drew the hidden one, and the next amount went into another month). The screen you are on is
   drawn again with the new figures — not while you fill in something there (Setup: once you leave the field,
   _cxSU.due · One-off: an open form keeps what you typed). Returns true when host is not on screen. */
function cxOffScreen(host) {
  if (!host || host.style.display !== 'none') return false;
  const on = document.getElementById('tab-' + CX.tab);
  if (!on || on === host || on.style.display === 'none') return true;
  if (CX.tab === 'onetime' && typeof _cxOt !== 'undefined' && (_cxOt.form !== null || _cxOt.bonus)) return true;
  if (typeof _cxFilling === 'function' && _cxFilling(on)) { if (CX.tab === 'setup' && typeof _cxSU !== 'undefined') _cxSU.due = true; return true; }
  cxRenderActive();
  return true;
}
function cxGoto(tab) { if (typeof switchTab === 'function') switchTab(tab); }

/* ── Summary card (Einnahmen / Ausgaben) ──
   #6: "Alle offenen wie geplant" asks first (count, sum, rows skipped for a data check)
   and offers "Rückgängig" afterwards. o.confirm = { n, sum, skipped } · o.undo = { n }        */
function cxSummary(o) {
  const pct = o.plan ? Math.min(100, o.done / o.plan * 100) : 0;
  const canBulk = (o.bulk !== undefined ? o.bulk : o.open) > 0;
  // CP2 (#4): a month after the current one — nothing is due yet, so no "Book all" (single rows stay editable)
  const bulkBtn = o.future ? '<div class="cx-sum__hint">Not due yet \u00b7 enter amounts one by one</div>'
    : '<button class="cx-btn cx-btn--s cx-btn--full" data-cx="all"' + (canBulk ? '' : ' disabled') + '><i class="ti ti-checks" aria-hidden="true"></i>Book all open as planned</button>';
  const undo = o.undo ? '<div class="cx-undo"><span>' + o.undo.n + (o.undo.n === 1 ? ' item' : ' items') + ' booked as planned</span>' +
    '<button class="cx-link" data-cx="undo" style="padding:4px 0;color:var(--cx-acc);font-weight:500">Undo</button></div>' : '';
  const action = o.confirm && !o.future
    ? '<div class="cx-bulk"><div>' + 'Book ' + o.confirm.n + (o.confirm.n === 1 ? ' item' : ' items') + ' as planned · ' + cxEur(o.confirm.sum) +
        (o.confirm.skipped ? '<div class="cx-bulk__s">' + o.confirm.skipped + ' skipped because of a check – please enter one by one</div>' : '') + '</div>' +
        '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="allNo">Cancel</button>' +
        '<button class="cx-btn cx-btn--p" data-cx="allYes"' + (o.confirm.n ? '' : ' disabled') + '>Book</button></div></div>'
    : bulkBtn;
  const dif = cxDiffLine(o.diffs);                        // CP2 (#10): "2 differences · 1 on purpose" — "all done" stays as it is
  return '<div class="cx-card cx-sum">' +
    '<div class="cx-row-sb"><span class="cx-lbl">' + cxEsc(o.label) + '</span>' + (o.open ? cxPill('open', o.open + ' open') : cxPill('ok', 'all done')) + '</div>' +
    '<div class="cx-sum__v"><span class="cx-sum__big">' + (o.dir ? cxIO(o.dir * o.done) : cxW(o.done)) + '</span><span class="cx-sum__of">of ' + cxW(o.plan) + ' planned</span></div>' +
    '<div class="cx-bar cx-bar--thin"><div style="width:' + pct + '%"></div></div>' +
    (o.split || '') +                                       // e.g. Kalt / NK / Warm table (Income)
    undo + action + (dif ? '<div class="cx-sum__hint cx-sum__dif">' + cxEsc(dif) + '</div>' : '') +
    (o.note ? '<div class="cx-sum__hint">' + o.note + '</div>' : '') +
    (o.partial && !o.confirm && !o.future ? '<div class="cx-sum__hint">' + (o.partial === 1 ? '1 partial month' : o.partial + ' partial months') + ' · please confirm one by one</div>' : '') +
  '</div>';
}
/* Pending undo for this tab and month? */
function cxUndoFor(tab) {
  const u = CX.undo;
  return u && u.tab === tab && u.y === window._ctrl.year && u.m === CX.month ? u : null;
}
/* C6: an amount you typed or took on a line (Income / Expenses). While its save is on its way every drawing shows it (a save
   waiting behind another one of its row does not flash back to the old amount), and 'Book all' / its Undo leave a line you
   changed since their tap alone (cxTouchedSince: id, year, month, the number taken at the tap) */
let _cxTouchSeq = 0;
const _cxTouched = {}, _cxPend = {};
async function cxMine(id, v, save) {
  const k = id + '|' + window._ctrl.year + '|' + CX.month, p = { v: v === null || v === undefined ? null : cxR(v) };
  _cxTouched[k] = ++_cxTouchSeq; _cxPend[k] = p;
  try { return await save(); } finally { if (_cxPend[k] === p) delete _cxPend[k]; }
}
const cxTouchedSince = (ids, y, m, s) => [].concat(ids).some(id => (_cxTouched[id + '|' + y + '|' + m] || 0) > s);
const cxPendIst = (id, ist) => { const p = _cxPend[id + '|' + window._ctrl.year + '|' + CX.month]; return p ? p.v : ist; };
/* C6: saves of one month row go out one after the other — each starts from the row the one before wrote
   (Zinsen then Tilgung, a mark then a new amount, two marks of one apartment) */
const _cxRowQ = {};
function cxRowQ(key, fn) {
  const job = (_cxRowQ[key] || Promise.resolve()).catch(() => {}).then(fn);
  _cxRowQ[key] = job;
  return job.finally(() => { if (_cxRowQ[key] === job) delete _cxRowQ[key]; });
}

/* ── Property card with fold-up ── */
function cxCard(o) {
  const g = o.status;
  const gs = !g ? [] : Array.isArray(g[0]) ? g : [g];        // CP2: one pill, or several side by side ("1 open" "1 difference")
  // CP2: o.statusWas = the status without the marks (cxGroupStatus) — kept as an invisible width on the phone, so marking moves nothing
  const gw = !o.statusWas ? [] : Array.isArray(o.statusWas[0]) ? o.statusWas : [o.statusWas];
  const gh = gw.length && gw.map(x => x.join('|')).join('/') !== gs.map(x => x.join('|')).join('/') ? gw : null;
  const isOpen = CX.open[o.key] !== undefined ? CX.open[o.key]
    : (o.defaultOpen !== undefined ? o.defaultOpen : gs.some(x => ['open', 'diff', 'in', 'out'].includes(x[0])));   // only what needs you
  // CP1 (#18): drawn open because something is open → remembered, so it does not fold up by itself once the
  // last amount is typed (the page would jump); it closes only when you tap its header (month change resets)
  if (isOpen && o.defaultOpen === undefined && CX.open[o.key] === undefined) CX.open[o.key] = true;   // = CX.open[key] ??= isOpen
  return '<div class="cx-card">' +
    '<button class="cx-ph" data-cx="fold" data-k="' + cxEsc(o.key) + '" aria-expanded="' + isOpen + '">' +
      '<span class="cx-ph__l"><span class="cx-pn">' + cxEsc(o.title) + '</span><span class="cx-src">' +
        (o.subHTML !== undefined ? o.subHTML :                  // CP1: a sub with a coloured amount (One-off "Income + 407 €")
        cxEsc([o.sub || '', o.sum !== undefined ? 'done ' + cxW(o.sum) + (o.plan ? ' of ' + cxW(o.plan) : '') : ''].filter(Boolean).join(' · '))) + '</span></span>' +
      '<span class="cx-ph__r">' + (o.extraPill || '') +
        (gs.length > 1 || gh ? '<span class="cx-ph__st">' + gs.map(x => cxPill(x[0], x[1])).join('') +
          (gh ? '<span class="cx-ph__gh" aria-hidden="true">' + gh.map(x => cxPill(x[0], x[1])).join('') + '</span>' : '') + '</span>'
          : gs.map(x => cxPill(x[0], x[1])).join('')) + '<i class="ti ti-chevron-' + (isOpen ? 'up' : 'down') + ' cx-chev" aria-hidden="true"></i></span>' +
    '</button>' + (isOpen ? o.body : '') + '</div>';
}

/* ── Soll │ Ist row (#19) ──
   line 1: label · pills + status      line 2: Soll (tap = take over) │ Ist field
   then sub line, change notes, info (grey) and data checks                                  */
function cxRow(o) {
  const s = cxStatus(o.soll, o.ist, o.emptyText, o.dir, o.mark);
  const can = !!o.soll || (o.ist !== null && o.ist !== undefined);
  // CP2 (#10): a difference on a row that can be marked (o.mark given, C1 SQL run) → "On purpose" on the sub line;
  // marked → the grey pill is a button that offers "Undo". The line keeps its height either way (no jump).
  const d = cxDiff(o.soll, o.ist), markable = !!d && o.mark !== undefined && o.mark !== null;
  // every row that can be marked keeps the button's place, with or without a difference: a long sub line
  // (e.g. Pauschal on the phone) wraps the same before and after you type — the rows below never move
  const slot = markable || (o.mark !== undefined && o.mark !== null && !!o.sub);
  const st = markable && CX.dif && CX.dif.id === o.id ? CX.dif : null;
  const idA = ' data-id="' + cxEsc(o.id) + '"';
  const pill = markable && s[0] === 'mark'
    ? '<button class="cx-pill cx-pill--mark" data-cx="difTap"' + idA + ' aria-expanded="' + !!(st && st.undo) + '" aria-label="' + cxEsc(s[1]) + ' – tap to undo">' + cxEsc(s[1]) + '</button>'
    : cxPill(s[0], s[1]);
  let difBtn = '', sheet = '';
  if (markable && !o.mark.ok) {
    difBtn = '<button class="cx-dif' + (st && st.sheet ? ' on' : '') + '" data-cx="difOpen"' + idA + ' aria-expanded="' + !!(st && st.sheet) + '">On purpose</button>';
    if (st && st.sheet) sheet = '<div class="cx-dif-sh" role="group" aria-label="Why on purpose?"><span class="cx-lbl">Reason · optional</span>' +
      '<div class="cx-chips">' + (o.dir === -1 ? CX_DIFF_OUT : CX_DIFF_IN).map(([v, t]) =>
        '<button class="cx-chip' + (st.pick === v ? ' on' : '') + '" data-cx="difPick"' + idA + ' data-r="' + v + '" aria-pressed="' + (st.pick === v) + '">' + t + '</button>').join('') + '</div>' +
      '<div class="cx-grid2"><button class="cx-btn cx-btn--s" data-cx="difCancel"' + idA + '>Cancel</button>' +
      '<button class="cx-btn cx-btn--p" data-cx="difSave"' + idA + (st.busy ? ' disabled' : '') + '>Save</button></div></div>';
  } else if (markable && st && st.undo) {
    difBtn = '<button class="cx-dif cx-dif--undo" data-cx="difUndo"' + idA + (st.busy ? ' disabled' : '') + '>Undo</button>';
  } else if (slot) difBtn = '<span class="cx-dif cx-dif--ph" aria-hidden="true"></span>';   // the place stays: the sub line wraps the same
  const subLine = slot
    ? '<div class="cx-r__sub cx-r__sub--dif"><span>' + (o.sub || '') + '</span>' + difBtn + '</div>'
    : (o.sub ? '<div class="cx-r__sub">' + o.sub + '</div>' : '');
  const took = o.ist !== null && o.ist !== undefined && o.soll && cxR(o.ist - o.soll) === 0;
  const soll = o.soll
    ? '<button class="cx-soll' + (took ? ' on' : '') + '" data-cx="take" data-id="' + cxEsc(o.id) + '" aria-label="Take Soll: ' + cxEsc(cxEur(o.soll)) + '">' +
        '<span>' + cxEur(o.soll) + '</span><i class="ti ti-' + (took ? 'check' : 'arrow-right') + '" aria-hidden="true"></i></button>'
    : '<span class="cx-r__s">\u2014</span>';
  return '<div class="cx-r">' +
    '<div class="cx-r__top"><span class="cx-r__u">' + cxEsc(o.label) + (o.badge ? ' ' + cxPill('beige', o.badge) : '') + '</span>' +
      '<span class="cx-r__p">' + (o.pills || '') + pill + '</span></div>' +
    '<div class="cx-r__mid">' + soll +
      '<label class="cx-f' + (can || o.allowEmpty ? '' : ' cx-f--off') + '"><input type="text" inputmode="decimal" data-cx-in="' + cxEsc(o.id) + '" value="' + (o.ist === null || o.ist === undefined ? '' : cxE2(o.ist)) + '" placeholder="' + (o.soll || o.allowEmpty ? 'Amount' : '\u2014') + '"' + (o.soll || o.allowEmpty || can ? '' : ' disabled') + ' aria-label="Ist amount ' + cxEsc(o.label) + '"><span>€</span></label>' +
    '</div>' +
    subLine + sheet +
    (o.notes || []).map(n => '<div class="cx-r__note"><i class="ti ti-arrow-up-right" aria-hidden="true"></i> ' + cxEsc(n) + '</div>').join('') +
    (o.info ? '<div class="cx-r__info">' + cxEsc(o.info) + '</div>' : '') +
    (o.warn ? '<div class="cx-r__warn"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ' + cxEsc(o.warn) + '</div>' : '') +
  '</div>';
}
function cxNotDue(list) {
  if (!list || !list.length) return '';
  return '<div class="cx-nd">' + cxPill('grey', 'not due') + '<span>' + list.map(n => cxEsc(n.label) + (n.next ? ' · next in ' + n.next : '')).join(' · ') + '</span></div>';
}

/* ── Toasts ── */
function cxToastErr(e) {
  console.error('[controlling]', e);
  // Short reason in the message, so a problem can be named from a screenshot
  const why = String((e && (e.message || e.details)) || e || '').replace(/\s+/g, ' ').slice(0, 70);
  if (typeof ctlToast === 'function') ctlToast('Saving failed – please try again' + (why ? ' · ' + why : ''));
}
/* C1 #17: another year could not be loaded (month / year arrows) — nothing was saved, so not "Saving failed" */
function cxToastLoad(y, e) {
  console.error('[controlling] load ' + y, e);
  if (typeof ctlToast === 'function') ctlToast('Could not load ' + y + ' – please try again');
}

/* ── Wire a tab host once: month arrows, fold, take-over, inputs ── */
/* ── B18: PAINT WITHOUT REBUILDING ─────────────────────────────
   The pages are written with cxPaint(host, html) instead of host.innerHTML.
   The new HTML is compared with what is on screen and only what really
   differs is changed:
   · reload with the same data (app back in front, tab switch) → nothing changes, no blink
   · after a save only that row / card changes — the rest stays exactly as it is
   · fields keep focus, typed text and scroll position (a field you are typing in is never touched)
   A field's value always follows the HTML, like after a full redraw. */
const _CX_CTRL = 'input,select,textarea';
function cxPaint(host, html) {
  if (!host) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const a = host.firstElementChild, b = tpl.content.firstElementChild, run = host._cxRun && host._cxRun.size ? host._cxRun : null;
  if (run) _cxRunFree(host, null);                        // C6: the drawing decides first …
  if (a && b && a.id !== b.id) host.replaceChildren(...tpl.content.childNodes);   // another page (e.g. Setup ↔ History)
  else _cxMorphKids(host, tpl.content);
  if (run) _cxRunKeep(host, run);                         // … then a button whose save is on its way stays off
}
/* C6: a button its handler turned off for a save (Add, Book, Save …) stays off until that save is done (cxWire).
   A drawing in between (a card opened, a chip, another save ending) follows the HTML and turned it on again:
   a second tap saved twice. The tap's key: the button's data-* (+ area / month on Income and Expenses, h.place). */
const _cxRunKey = (host, x) => JSON.stringify(x.dataset) + (host._cxPlace ? '|' + host._cxPlace() : '');
function _cxRunKeep(host, run) {
  for (const e of run.values()) if (!e.busy && e.b.disabled) e.busy = true;   // turned off after a question (e.g. 'duplicate?')
  host.querySelectorAll('[data-cx]').forEach(x => {
    const k = _cxRunKey(host, x), e = run.get(k);
    if (e && e.busy && !x.disabled) { x.disabled = true; x._cxRunOff = k; }
  });
}
function _cxRunFree(host, key) {                          // key null: every button kept off — the next drawing decides again
  host.querySelectorAll('[data-cx]').forEach(x => { if (x._cxRunOff && (key === null || x._cxRunOff === key)) { x._cxRunOff = null; x.disabled = false; } });
}
function _cxWant(t) {                                   // the value a field gets from its HTML
  if (t.tagName === 'SELECT') { const o = t.querySelector('option[selected]') || t.querySelector('option'); return o ? o.value : ''; }
  if (t.tagName === 'TEXTAREA') return t.textContent;
  if (t.type === 'checkbox' || t.type === 'radio') return t.hasAttribute('checked');
  return t.getAttribute('value') || '';
}
function _cxApply(c, want) {
  if (c.type === 'file') return;
  const typing = c === document.activeElement &&
    (c.tagName === 'TEXTAREA' || (c.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color)$/i.test(c.type)));
  if (typing) return;                                   // you are typing here — your text stays
  if (typeof want === 'boolean') { if (c.checked !== want) c.checked = want; }
  else if (c.value !== want) c.value = want;
}
/* German date / number fields (cc-german-format.js) are converted after drawing: type, placeholder,
   keyboard and the classes cc-date / cc-cal belong to that converter — a kept field keeps them
   (otherwise it would turn back into a plain field). Value and data attributes still follow the HTML. */
const _CX_OWN = /^(type|inputmode|autocomplete|placeholder|step|onclick|aria-invalid)$/;
function _cxKeepCls(x, v) {
  ['cc-date', 'cc-cal'].forEach(c => { if (x.classList.contains(c) && !(' ' + v + ' ').includes(' ' + c + ' ')) v = (v + ' ' + c).trim(); });
  return v;
}
function _cxSyncAttrs(x, y) {
  const own = !!(x._ccDate || x._ccNum || x._ccCal);
  for (const at of [...x.attributes]) {
    if (y.hasAttribute(at.name) || (own && (_CX_OWN.test(at.name) || at.name === 'class'))) continue;
    x.removeAttribute(at.name);
  }
  for (const at of [...y.attributes]) {
    if (own && _CX_OWN.test(at.name)) continue;
    const v = own && at.name === 'class' ? _cxKeepCls(x, at.value) : at.value;
    if (x.getAttribute(at.name) !== v) x.setAttribute(at.name, v);
  }
  if (own && !y.hasAttribute('class')) {
    const v = _cxKeepCls(x, '');
    if (v) { if (x.getAttribute('class') !== v) x.setAttribute('class', v); } else x.removeAttribute('class');
  }
}
function _cxMorphKids(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++) {
    const x = an[i], y = bn[i];
    if (!x) { a.appendChild(y); continue; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); continue; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.isEqualNode(y)) {                             // the same → left alone; only field values follow the HTML
      if (x.matches(_CX_CTRL)) _cxApply(x, _cxWant(y));
      else if (x.querySelector(_CX_CTRL)) {
        const xs = x.querySelectorAll(_CX_CTRL), ys = y.querySelectorAll(_CX_CTRL);
        xs.forEach((c, k) => { if (ys[k]) _cxApply(c, _cxWant(ys[k])); });
      }
      continue;
    }
    const isCtrl = x.matches(_CX_CTRL), want = isCtrl ? _cxWant(y) : null;
    _cxSyncAttrs(x, y);
    _cxMorphKids(x, y);
    if (isCtrl) _cxApply(x, want);
  }
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}

function cxWire(host, h) {
  if (host._cxWired) return;
  host._cxWired = true;
  if (h.place) host._cxPlace = h.place;
  host.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-cx]');
    if (!b || b.disabled) return;
    const a = b.dataset.cx;
    if (a === 'prev') return cxStepMonth(-1);
    if (a === 'next') return cxStepMonth(1);
    if (a === 'fold') {
      const k = b.dataset.k; const cur = b.getAttribute('aria-expanded') === 'true'; CX.open[k] = !cur;
      // Oct 2026: the tapped header stays where it is (no jump after the list is redrawn)
      return cxKeepPlace(b, () => h.render(), () => [...host.querySelectorAll('[data-cx="fold"]')].find(x => x.dataset.k === k));
    }
    // CP2 (#10): "On purpose" — open the mini sheet, pick a reason (optional), save; tap the grey pill → Undo
    if (/^dif/.test(a)) {
      const id = b.dataset.id, cur = CX.dif && CX.dif.id === id ? CX.dif : null;
      if (cur && cur.busy) return;                           // its save is on the way: the panel stays as it is
      let to = null;                                         // the control that gets the focus back after the redraw
      if (a === 'difOpen') CX.dif = cur && cur.sheet ? null : { id, sheet: true, pick: null };
      else if (a === 'difPick') { if (cur) cur.pick = cur.pick === b.dataset.r ? null : b.dataset.r; }
      else if (a === 'difCancel') { CX.dif = null; to = 'difOpen'; }
      else if (a === 'difTap') CX.dif = cur && cur.undo ? null : { id, undo: true };
      else if ((a === 'difSave' || a === 'difUndo') && h.mark) {
        const st = cur || (CX.dif = { id });
        st.busy = true; b.disabled = true;                   // one save per tap
        let ok = true;
        try { await h.mark(id, a === 'difSave' ? { ok: true, reason: st.pick || null } : null); } catch (err) { ok = false; cxToastErr(err); }
        st.busy = false;
        if (ok && CX.dif === st) CX.dif = null;              // not saved → the panel stays open (reason kept): try again
        to = ok ? (a === 'difSave' ? 'difTap' : 'difOpen') : a;
      }
      h.render();
      return ev.detail === 0 ? cxDifFocus(host, id, to) : undefined;   // keyboard (Enter / Space): a tap leaves no focus ring
    }
    if (h.click) {
      // C6: a tap whose button its handler turns off (a save) keeps it off until it is done, also across drawings (cxPaint)
      const run = host._cxRun || (host._cxRun = new Map()), key = _cxRunKey(host, b), cur = run.get(key);
      if (cur && cur.busy) return;                           // its save is still on its way
      const r = h.click(a, b, ev);
      if (r && typeof r.then === 'function') {
        const e = cur || { n: 0, busy: false };
        e.n++; e.b = b; run.set(key, e);
        const end = () => { if (--e.n) return; run.delete(key); _cxRunFree(host, key); };
        r.then(end, end);
        setTimeout(() => { if (b.disabled && run.get(key) === e) e.busy = true; }, 0);   // a chip or a fold stays tappable
      }
      return r;
    }
  });
  host.addEventListener('change', ev => {
    const id = ev.target && ev.target.dataset && ev.target.dataset.cxIn;
    if (id && CX.dif && CX.dif.id === id) CX.dif = null;     // a new amount: the old sheet / undo goes
    if (id && h.input) h.input(id, cxParse(ev.target.value), ev.target);
  });
  host.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.dataset && ev.target.dataset.cxIn) ev.target.blur();
    if (ev.key === 'Escape' && CX.dif && !CX.dif.busy) { const d = CX.dif; CX.dif = null; h.render(); cxDifFocus(host, d.id, d.undo ? 'difTap' : 'difOpen'); }
  });
}
/* CP2: after the redraw the tapped control may be gone (Save, Cancel, a chip) — the focus goes to this row's
   next control instead of the page start (keyboard and screen readers keep their place) */
function cxDifFocus(host, id, kind) {
  if (!kind) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.isConnected) return;
  const x = [...host.querySelectorAll('[data-cx="' + kind + '"]')].find(e => e.dataset.id === id);
  if (x) { try { x.focus({ preventScroll: true }); } catch (e) {} }
}

/* ── KEEP PLACE (Oct 2026) ─────────────────────────────────────
   A card that closes (or a list that redraws) keeps its header exactly where it is on screen.
   Without this the page gets shorter, the phone snaps back and the header jumps (lower cards).
   mutate() does the change (class toggle or redraw) · find() returns the header afterwards.
   A spacer at the end fills the missing height and shrinks away as soon as you scroll up.   */
function cxKeepPlace(el, mutate, find) {
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
  if (need > 0) _cxGlideToEnd(); else _cxEndSpaceWatch();   // Oct 2026 (B): at the end of the list the page then glides down — no empty space left
  return res;
}
/* CP2: the redraw after an amount keeps that row where it is — the month summary above can gain or lose
   a line ("1 difference"), which would otherwise push the row you just typed in up or down */
function cxKeepRow(id, render) {
  const f = () => [...document.querySelectorAll('[data-cx-in]')].find(x => x.dataset.cxIn === id) || null;
  return cxKeepPlace(f(), render, f);
}
/* The page glides (~0.35 s) from the kept place to its natural end; the spacer shrinks with it.
   A touch / wheel during the glide stops it (then the spacer shrinks as you scroll).          */
function _cxGlideToEnd() {
  const sp = document.getElementById('ccEndSpace'); if (!sp) return;
  const from = window.scrollY, spH = parseFloat(sp.style.height) || 0;
  const content = document.documentElement.scrollHeight - spH;              // the page without the spacer
  const to = Math.max(0, Math.min(from, content - window.innerHeight));
  if (from - to < 1) { sp.style.height = '0px'; return; }
  let stopped = false;
  const stop = () => { stopped = true; };
  window.addEventListener('touchstart', stop, { once: true, passive: true });
  window.addEventListener('wheel', stop, { once: true, passive: true });
  const t0 = performance.now(), dur = Math.min(550, 280 + (from - to) * 0.5), ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    if (stopped) { _cxEndSpaceWatch(); return; }
    const k = Math.min(1, (now - t0) / dur), y = from + (to - from) * ease(k);
    try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
    sp.style.height = Math.max(0, Math.ceil(y + window.innerHeight - content)) + 'px';
    if (k < 1) requestAnimationFrame(step);
    else { sp.style.height = '0px'; window.removeEventListener('touchstart', stop); window.removeEventListener('wheel', stop); }
  };
  requestAnimationFrame(step);
}
let _cxEndWatching = false;
function _cxEndSpaceWatch() {
  if (_cxEndWatching) return;
  _cxEndWatching = true;
  const trim = () => {
    const sp = document.getElementById('ccEndSpace'), h = sp ? (parseFloat(sp.style.height) || 0) : 0;
    if (!h) return stop();
    const content = document.documentElement.scrollHeight - h;     // the page without the spacer
    const need = Math.max(0, Math.ceil(window.scrollY + window.innerHeight - content));
    if (need < h) sp.style.height = need + 'px';
    if (!need) stop();
  };
  const stop = () => { window.removeEventListener('scroll', trim); window.removeEventListener('resize', trim); _cxEndWatching = false; };
  window.addEventListener('scroll', trim, { passive: true });
  window.addEventListener('resize', trim, { passive: true });
}
