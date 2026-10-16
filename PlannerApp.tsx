// ─────────────────────────────────────────────────────────────
// PlannerApp — Planner (tabs: Overview, To-do, Manager, Creator).
// Same frame as Outreach: logo header, nav tabs, account menu
// with all apps. Phone, iPad and desktop layouts.
// To-do, Manager and Creator are live. Overview follows in phase 5.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { C, SANS, SERIF, TYPE, BREAKPOINT, WIDE } from "./constants";
import AppLogo from "./AppLogo";
import { AvatarMenu, NavTab, appItems } from "./AppNav";
import { usePlanner } from "./usePlanner";
import { thisMonday } from "./planner";
import PlannerTodo, { DEFAULT_VIEW } from "./PlannerTodo";
import PlannerManager from "./PlannerManager";
import PlannerCreator from "./PlannerCreator";
import type { PlannerView } from "./PlannerTodo";
import type { Role } from "./types";

const TABS: { key: string; label: string; soon?: { phase: number; text: string } }[] = [
  { key: "overview", label: "Overview", soon: { phase: 5, text: "Your read-only scoreboard: stage tracks, audience, portfolio and the weekly goals met." } },
  { key: "todo",     label: "To-do" },
  { key: "manager",  label: "Manager" },
  { key: "creator",  label: "Creator" },
];

const VIEW_KEY = "lh_planner_view";
const loadView = (): PlannerView => { try { return { ...DEFAULT_VIEW, ...JSON.parse(sessionStorage.getItem(VIEW_KEY) || "{}") }; } catch { return DEFAULT_VIEW; } };

interface PlannerAppProps {
  userId:   string | null;
  settings: any;
  signOut:  () => Promise<void>;
  switchTo: (r: Role) => void;
  banners?: ReactNode;
}

export default function PlannerApp({ userId, settings, signOut, switchTo, banners }: PlannerAppProps) {
  const [view, setView]     = useState<PlannerView>(loadView);
  const [monday, setMonday] = useState<string>(thisMonday);
  const planner = usePlanner(userId, monday);

  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  useEffect(() => { try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* ignore */ } }, [view]);

  const isMobile = winW < BREAKPOINT;
  const isWide   = winW >= WIDE;
  const tab      = TABS.find(t => t.key === view.tab) || TABS[1];
  const goTab    = (key: string) => { setView({ ...view, tab: key }); window.scrollTo(0, 0); };
  const openOutreach = () => switchTo("outreach");
  // the Manager app opens straight on Service Catalog (rate cards inside)
  const openCatalog = () => { try { sessionStorage.setItem("lh_manager_open", "catalog"); } catch { /* ignore */ } switchTo("manager"); };

  const avatar = (
    <AvatarMenu settings={settings} roleLabel="Planner" items={[]} apps={appItems("planner", switchTo)} onSignOut={() => { signOut(); }} />
  );
  const tabs = (height: number, px: number) => TABS.map(t => (
    <NavTab key={t.key} label={t.label} active={tab.key === t.key} onClick={() => goTab(t.key)} height={height} px={px} />
  ));

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: SANS, color: C.black }}>
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.rule}` }}>
        {isMobile ? (
          <>
            <div style={{ textAlign: "center", padding: "8px 20px 6px" }}><AppLogo size="nav" /></div>
            <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 0 6px", borderTop: `1px solid ${C.rule}` }}>
              <div style={{ display: "flex", minWidth: 0, overflowX: "auto" }}>{tabs(40, 8)}</div>
              {avatar}
            </div>
          </>
        ) : (
          <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <AppLogo size="nav" />
              <div style={{ display: "flex" }}>{tabs(56, 10)}</div>
            </div>
            {avatar}
          </div>
        )}
      </div>
      <div style={{ maxWidth: isWide ? 1200 : 960, margin: "0 auto", padding: isMobile ? "14px 14px 28px" : "24px 20px 40px" }}>
        {banners}
        {tab.key === "todo" ? (
          <PlannerTodo planner={planner} view={view} setView={setView} monday={monday} setMonday={setMonday} isMobile={isMobile} openOutreach={openOutreach} />
        ) : tab.key === "manager" ? (
          <PlannerManager planner={planner} view={view} setView={setView} monday={monday} setMonday={setMonday} isMobile={isMobile} openOutreach={openOutreach} />
        ) : tab.key === "creator" ? (
          <PlannerCreator planner={planner} view={view} setView={setView} monday={monday} setMonday={setMonday} isMobile={isMobile} openCatalog={openCatalog} />
        ) : (
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>{tab.label}</h2>
            <p style={{ fontSize: TYPE.micro.size, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" as const, margin: "4px 0 0" }}>Coming in phase {tab.soon?.phase}</p>
            <p style={{ fontSize: TYPE.subtext.size, color: C.muted, margin: "14px 0 0", lineHeight: 1.5, maxWidth: 520 }}>{tab.soon?.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
