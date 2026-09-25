# Casa Castel v2

Property management app — Alsenstraße 60, 55252 Mainz-Kastel.

---

## Files

```
casa-castel-v2/
├── landlord.html         ← Landlord PWA (Management)
├── tenant.html           ← Tenant PWA
├── manifest.json         ← Management app "LT Real Estate" (all 4 management apps)
├── manifest-tenant.json  ← Tenant PWA manifest
├── icon-192.png
├── icon-512.png
│
├── css/
│   └── casa-castel.css   ← Global design system + v2 additions. Edit here only.
│
├── js/
│   ├── constants.js      ← SB_URL, SB_KEY, LANDLORD_PASS, rooms, rotation dates
│   ├── supabase-client.js← Single sbL client shared by both apps
│   ├── utils.js          ← Pure helpers: esc, uid, fmtTs, kWeekInfo, scrollToBottom…
│   ├── storage.js        ← localStorage wrapper S.get/set + vacancy helpers
│   ├── auth.js           ← doLandlordLogin, doTenantLogin, logout, detectPWAMode
│   ├── chat-viewport.js  ← iOS keyboard fix for Lounge + Kitchen chats
│   ├── layout.js         ← showApp, switchTab, shell lock
│   ├── nav.js            ← Profile menu, lang toggle, preview-tenant, logout wiring
│   │
│   ├── tab-lounge.js         ← Landlord: Lounge tab
│   ├── tab-cleaning.js       ← Landlord: Cleaning tab
│   ├── tab-kitchen.js        ← Landlord: Kitchen tab
│   ├── tab-rooms.js          ← Landlord: Rooms tab (room config)
│   ├── tab-tenants.js        ← Landlord: Tenants tab (tenant profiles, vacancy)
│   │
│   ├── tab-lounge-tenant.js    ← Tenant: Lounge tab
│   ├── tab-cleaning-tenant.js  ← Tenant: Cleaning tab
│   └── tab-kitchen-tenant.js   ← Tenant: Kitchen tab (KITCHEN_ROOMS only)
│
├── sql/
│   ├── schema.sql              ← lounge_data table + RLS
│   └── schema-kitchen.sql      ← kitchen_weeks + kitchen_feed
│
└── design/
    └── design-system.html      ← Visual token reference
```

---

## Rules

1. All colours, spacing, typography → `css/casa-castel.css` tokens only. Never hardcode.
2. All app constants → `js/constants.js`. Set `SB_URL`, `SB_KEY`, `LANDLORD_PASS` before deploy.
3. One tab = one JS file. Tab JS files may only touch their own `#tab-*` element.
4. `scrollToBottom(feed)` — never write `feed.scrollTop = feed.scrollHeight` directly.
5. Both compose inputs (`#lounge-input`, `#k-mob-msg-input`) must call `wireComposeBlur()`.

---

## Deploy (Vercel / GitHub)

Flat structure — zero build step. Push to GitHub → Vercel auto-deploys.
Both `landlord.html` and `tenant.html` are served as static files.

Add to Vercel environment variables (or fill directly in `js/constants.js` for private repos):
- `SB_URL` — Supabase project URL
- `SB_KEY` — Supabase anon key
- `LANDLORD_PASS` — landlord password

---

## iOS PWA — Add to Home Screen

**Management ("LT Real Estate"):** delete the old icon first, then open `https://<domain>/management` in Safari → Share → Add to Home Screen ("Open as Web App" on). Log in once. From then on the app opens straight in the last app and tab you used; the login form only appears after Logout.
**Tenant:** Open `tenant.html` in Safari → Share → Add to Home Screen

The two apps have separate manifests with their own `id`, so they never merge.
