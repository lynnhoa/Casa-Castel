// ─────────────────────────────────────────────────────────────
// ManagerApp — nav shell for manager role
// Tabs:        Dashboard · Clients · Projects · Calculator
// Avatar menu: Creator Profile · Change Password ·
//              Service Catalog (incl. Rate Card PDF) · Invoices
// Desktop + iPad + PWA iOS responsive
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { C, SANS, TYPE, BREAKPOINT } from "./constants";
import { currentQuote, contractNo } from "./docs";
import AppLogo from "./AppLogo";
import { AvatarMenu, NavTab, appItems } from "./AppNav";
import type { Role } from "./types";

// ── Page imports (placeholders until built) ───────────────────
import Dashboard      from "./Dashboard";
import ClientList     from "./ClientList";
import ProjectsTab    from "./ProjectsTab";
import Calculator     from "./Calculator";
import ServiceCatalog from "./ServiceCatalog";
import Invoices       from "./Invoices";
import Licenses       from "./LicensesPage";
import CreatorProfile from "./CreatorProfile";
import ChangePassword from "./ChangePassword";

// ── Nav indices ───────────────────────────────────────────────
const NAV_DASHBOARD  = 0;
const NAV_CLIENTS    = 1;
const NAV_CALCULATOR = 2;
const NAV_PROJECTS   = 3;
const NAV_PROFILE    = 4;
const NAV_PASSWORD   = 5;
const NAV_CATALOG    = 6;
const NAV_INVOICES   = 8;
const NAV_LICENSES   = 9;

interface ManagerAppProps {
  settings:        any;
  updateSettings:  (u: any) => Promise<string | null>;
  clientsHook:     any;
  rateCardsHook:   any;
  signOut:         () => Promise<void>;
  switchTo:        (r: Role) => void;
  banners?:        ReactNode;
}

export default function ManagerApp({
  settings,
  updateSettings,
  clientsHook,
  rateCardsHook,
  signOut,
  switchTo,
  banners,
}: ManagerAppProps) {
  // another app can ask to open a page here (Planner → Service Catalog)
  const [nav,      setNav]      = useState(() => {
    try {
      const k = sessionStorage.getItem("lh_manager_open");
      sessionStorage.removeItem("lh_manager_open");
      if (k === "catalog") return NAV_CATALOG;
    } catch { /* ignore */ }
    return NAV_DASHBOARD;
  });
  const [winW,     setWinW]     = useState(() => window.innerWidth);

  // ── Prefill state — passed to Calculator from other pages ──
  const [prefill,         setPrefill]         = useState<any>(null);
  const [pendingClientName, setPendingClientName] = useState<string | null>(null);
  const [pendingProjectQNo, setPendingProjectQNo] = useState<string | null>(null);
  const [clientSel,       setClientSel]       = useState<string | null>(null);
  const [clientSelReset,  setClientSelReset]  = useState(0);
  const [fromDrill,       setFromDrill]       = useState<string | null>(null);
  const [dashDrill,       setDashDrill]       = useState<any>(null);
  const [invoiceFilter,   setInvoiceFilter]   = useState<any>(null);   // from a dashboard tile
  const [projectFilter,   setProjectFilter]   = useState<string | null>(null);
  const [dashReset,       setDashReset]       = useState(0);

  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  const isMobile = winW < BREAKPOINT;

  // ── Navigation helpers ────────────────────────────────────
  const goTo = (n: number) => {
    if (n === NAV_CLIENTS) setClientSelReset(p => p + 1);
    if (n !== NAV_CALCULATOR) setPrefill(null);   // leaving the Calculator ends Revise / Amend mode
    setNav(n);
  };

  // Navigation by the user (tabs, menu) also ends a dashboard drill context
  const navTo = (n: number) => { setFromDrill(null); setInvoiceFilter(null); setProjectFilter(null); goTo(n); };

  const goToDash = () => {
    setFromDrill(null);
    setPrefill(null);
    setNav(NAV_DASHBOARD);
    setDashReset(p => p + 1);
    setDashDrill(null);
  };

  // New quote for a client (optionally for one of its leads)
  const goToCalc = (clientName: string, leadId?: string) => {
    const c = (clientsHook.clients || []).find((x: any) => x.name === clientName);
    setPrefill({ brand: clientName, contact: c?.contact || "", cid: c?.id, pid: leadId });
    setNav(NAV_CALCULATOR);
  };

  // Revision — open Calculator pre-filled with existing quote lines
  const onRevise = (pr: any, cl: any) => {
    const q = pr.qd;
    if (!q) return;
    const cur = currentQuote(pr);
    setPrefill({
      brand:     q.brand   || cl.name || "",
      contact:   q.contact || cl.contact || "",
      qNo:       q.qNo,
      ctab:      q.ctab || "influencer",
      isRev:     true,
      // a draft quote is updated in place; a sent one gets the next revision
      revN:      cur && cur.status === "draft" ? cur.revision : (cur ? cur.revision : (q.rev || 0)) + 1,
      origLines: q.lines || [],
      retainer:  !!q.retainer,
      retMo:     q.retMo,
      validDays: q.validUntil && q.date ? Math.max(1, Math.round((new Date(q.validUntil).getTime() - new Date(q.date).getTime()) / 864e5)) : 14,
      projectName: pr.name,
      pid:       pr.id,
      cid:       cl.id,
    });
    setNav(NAV_CALCULATOR);
  };

  // Amendment — open Calculator in amendment mode
  const onAmend = (pr: any, cl: any) => {
    const q = pr.qd;
    if (!q) return;
    setPrefill({
      brand:     q.brand   || cl?.name || "",
      contact:   q.contact || cl?.contact || "",
      qNo:       q.qNo,
      ctab:      q.ctab || "influencer",
      isAmend:   true,
      amendN:    (pr.amendments || []).length + 1,
      origLines: q.lines || [],
      origTotal: pr.amount,
      contractNo: pr.projectNo ? contractNo(pr.projectNo) : "",
      pid:       pr.id,
      cid:       cl?.id,
    });
    setNav(NAV_CALCULATOR);
  };

  const goToProjects = (projectIdOrQNo?: string) => {
    setPendingProjectQNo(projectIdOrQNo ?? null);
    setNav(NAV_PROJECTS);
  };

  const goToClients = (brand?: string, qNo?: string) => {
    setPendingClientName(brand ?? null);
    setPendingProjectQNo(qNo ?? null);
    setNav(NAV_CLIENTS);
  };

  // ── Avatar menu + tabs (shared with the Creator app) ─────
  const MENU_ITEMS: [string, number][] = [
    ["Creator Profile",  NAV_PROFILE],
    ["Change Password",  NAV_PASSWORD],
    ["Service Catalog",  NAV_CATALOG],
    ["Invoices",         NAV_INVOICES],
    ["Licenses",         NAV_LICENSES],
  ];
  const avatar = (dropLeft: boolean) => (
    <AvatarMenu
      settings={settings}
      roleLabel="Manager"
      dropLeft={dropLeft}
      items={MENU_ITEMS.map(([label, idx]) => ({ key: String(idx), label, active: nav === idx, onClick: () => navTo(idx) }))}
      apps={appItems("manager", switchTo)}
      onSignOut={() => { signOut(); }}
    />
  );

  const PRIMARY_TABS = [
    { label: "Dashboard",  idx: NAV_DASHBOARD  },
    { label: "Clients",    idx: NAV_CLIENTS    },
    { label: "Projects",   idx: NAV_PROJECTS   },
    { label: "Calculator", idx: NAV_CALCULATOR },
  ];

  // ── Content max-width — wider when client detail open ─────
  const contentMaxW =
    nav === NAV_CLIENTS && clientSel && !isMobile ? 1200 : 860;

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: "100dvh", fontFamily: SANS, color: C.black }}>

      {/* ── NAVBAR ── */}
      <div
        style={{
          borderBottom: `1px solid ${C.rule}`,
          position:     "sticky",
          top:          0,
          background:   C.bg,
          zIndex:       100,
        }}
      >
        {isMobile ? (
          // ── MOBILE NAV ──────────────────────────────────
          <>
            <div style={{ textAlign: "center", padding: "8px 20px 6px" }}>
              <AppLogo size="nav" onClick={goToDash} />
            </div>
            <div
              style={{
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                padding:        "0 44px 0 6px",      // room for the avatar on the right
                borderTop:      `1px solid ${C.rule}`,
                position:       "relative",
              }}
            >
              <div style={{ display: "flex" }}>
                {PRIMARY_TABS.map(t => (
                  <NavTab key={t.idx} label={t.label} active={nav === t.idx} onClick={() => navTo(t.idx)} height={40} px={8} />
                ))}
              </div>
              <div style={{ position: "absolute", right: 8 }}>
                {avatar(false)}
              </div>
            </div>
          </>
        ) : (
          // ── DESKTOP / IPAD NAV ───────────────────────────
          <div
            style={{
              display:     "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems:  "center",
              padding:     "0 28px",
              height:      56,
            }}
          >
            {/* Left — avatar */}
            <div style={{ display: "flex", alignItems: "center" }}>
              {avatar(true)}
            </div>

            {/* Center — logo */}
            <AppLogo size="web" onClick={goToDash} />

            {/* Right — primary tabs */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {PRIMARY_TABS.map(t => (
                <NavTab key={t.idx} label={t.label} active={nav === t.idx} onClick={() => navTo(t.idx)} height={56} px={14} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div
        style={{
          maxWidth:  contentMaxW,
          margin:    "0 auto",
          padding:   isMobile ? "14px 14px" : "24px 20px",
        }}
      >
        {banners}
        {nav === NAV_DASHBOARD && (
          <Dashboard
            clients={clientsHook.clients}
            isMobile={isMobile}
            settings={settings}
            onOpenInvoices={(f: any) => { setInvoiceFilter(f); goTo(NAV_INVOICES); }}
            onOpenProjects={(f: string) => { setProjectFilter(f); goTo(NAV_PROJECTS); }}
            onOpenLicenses={() => goTo(NAV_LICENSES)}
          />
        )}

        {nav === NAV_CLIENTS && (
          <ClientList
            clients={clientsHook.clients}
            isMobile={isMobile}
            settings={settings}
            rc={rateCardsHook.rc}
            selReset={clientSelReset}
            onSelChange={setClientSel}
            pendingClientName={pendingClientName}
            pendingProjectQNo={pendingProjectQNo}
            onPendingClear={() => {
              setPendingClientName(null);
              setPendingProjectQNo(null);
            }}
            onGoToCalc={goToCalc}
            onRevise={onRevise}
            onAmend={onAmend}
            goTo={goTo}
            clientsHook={clientsHook}
          />
        )}

        {nav === NAV_PROJECTS && (
          <ProjectsTab
            clients={clientsHook.clients}
            isMobile={isMobile}
            settings={settings}
            rc={rateCardsHook.rc}
            initialFilter={projectFilter}
            pendingProjectQNo={pendingProjectQNo}
            onPendingClear={() => setPendingProjectQNo(null)}
            onGoToCalc={goToCalc}
            onRevise={onRevise}
            onAmend={onAmend}
            clientsHook={clientsHook}
          />
        )}

        {nav === NAV_CALCULATOR && (
          <Calculator
            isMobile={isMobile}
            settings={settings}
            rc={rateCardsHook.rc}
            prefill={prefill}
            clearPrefill={() => setPrefill(null)}
            onAfterSave={(projectId: string) => {
              // Closing the saved document → Projects tab with the project expanded
              setPrefill(null);
              goToProjects(projectId);
            }}
            clientsHook={clientsHook}
          />
        )}

        {nav === NAV_CATALOG && (
          <ServiceCatalog
            rc={rateCardsHook.rc}
            upsertCard={rateCardsHook.upsertCard}
            deleteCard={rateCardsHook.deleteCard}
            settings={settings}
            isMobile={isMobile}
          />
        )}

        {nav === NAV_INVOICES && (
          <Invoices
            clients={clientsHook.clients}
            settings={settings}
            isMobile={isMobile}
            filterTab={invoiceFilter || undefined}
          />
        )}

        {nav === NAV_LICENSES && (
          <Licenses
            clients={clientsHook.clients}
            clientsHook={clientsHook}
            settings={settings}
            rc={rateCardsHook.rc}
            isMobile={isMobile}
            onAfterRenew={(pid: string) => goToProjects(pid)}
          />
        )}

        {nav === NAV_PROFILE && (
          <CreatorProfile
            settings={settings}
            updateSettings={updateSettings}
            isMobile={isMobile}
          />
        )}

        {nav === NAV_PASSWORD && (
          <ChangePassword />
        )}
      </div>

      {/* ── BACK TO ACTIVE PROJECTS PILL (drill context) ── */}
      {nav === NAV_CLIENTS && fromDrill && (
        <button
          onClick={() => { setFromDrill(null); setNav(NAV_DASHBOARD); }}
          style={{
            position:     "fixed",
            bottom:       24,
            right:        24,
            zIndex:       999,
            background:   C.bg,
            border:       `1px solid ${C.rule}`,
            borderRadius: 20,
            padding:      "8px 20px",
            fontFamily:   SANS,
            fontSize:     TYPE.label.size,
            color:        C.muted,
            letterSpacing:"0.06em",
            cursor:       "pointer",
            boxShadow:    "0 2px 12px rgba(0,0,0,0.10)",
            whiteSpace:   "nowrap" as const,
          }}
        >
          ← Active Projects
        </button>
      )}
    </div>
  );
}
