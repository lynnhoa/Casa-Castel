// ─────────────────────────────────────────────────────────────
// PlannerCreator — Planner › Creator (your workspace), per account:
//   Concept (on @lynnhoa: the social concept you share with him)
//   Offer → Service Catalog and Rate Cards
//   Portfolio: first set (9) and this month's goal
//   Editorial list (portfolio pieces, creative direction)
//   Content ideas (classic TikTok/Reels)
//   Weekly learning (top post + one learning, for the check-in)
// Status changes happen in the item window (dropdown); everything
// counts into the To-do by itself (ideas, posts, pieces, first set).
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { B, I, S, Lbl, BAR_BTN } from "./atoms";
import { parseYMD, monthStart, monthEnd } from "./formatters";
import {
  FORMATS, CLASSIC, accountsOf, accLook, stageOf, isVisible, itemOrder, monthName, weekRange, entryKey, isoWeek, parseIntDe,
} from "./planner";
import type { Account, Item, ItemList, Task } from "./planner";
import type { PlannerHook } from "./usePlanner";
import type { PlannerView } from "./PlannerTodo";
import { Ico, IC, AccChip, Bar, Toolbar, FormatChip, ItemWindow, NoteWindow, TaskWindow } from "./PlannerWindows";

const microLabel: any = { fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted };
const AMBER = "#b07a4a";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const shortDate = (d: string) => { const dt = parseYMD(d); return dt ? `${WD[dt.getDay()]} ${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.` : ""; };

type StatusFilter = "all" | "open" | "posted" | "in_kit";
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "open", label: "Open (idea, planned, shot)" }, { key: "posted", label: "Posted" }, { key: "in_kit", label: "In kit" },
];
const VIEW_KEY = "lh_planner_creator";

interface PlannerCreatorProps {
  planner:   PlannerHook;
  view:      PlannerView;
  setView:   (v: PlannerView) => void;
  monday:    string;
  setMonday: (m: string) => void;
  isMobile:  boolean;
  openCatalog?: () => void;
}

type Open =
  | { kind: "item"; id?: string; draft?: Partial<Item> }
  | { kind: "note"; acc: Account; note: "concept" | "offer" | "learning" }
  | { kind: "task"; id: string }
  | null;

export default function PlannerCreator({ planner, view, setView, monday, setMonday, isMobile, openCatalog }: PlannerCreatorProps) {
  const { tasks, stages, items, loading, loadError } = planner;
  const [open, setOpen]   = useState<Open>(null);
  const [filter, setFilter] = useState<StatusFilter>(() => { try { return (sessionStorage.getItem(VIEW_KEY) as StatusFilter) || "all"; } catch { return "all"; } });
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => { try { sessionStorage.setItem(VIEW_KEY, filter); } catch { /* ignore */ } }, [filter]);

  const accs = accountsOf(view.acc);
  const visible = tasks.filter(t => isVisible(t, stages, view.acc));
  const quiet = (p: Promise<any>) => p.catch(() => { /* the save toast reports it */ });
  const passes = (it: Item) =>
    filter === "all" ? true : filter === "open" ? ["idea", "planned", "shot"].includes(it.status) : it.status === filter;

  const newItem = (list: ItemList, acc: Account) => setOpen({
    kind: "item",
    draft: { list, account: acc, format: list === "editorial" ? FORMATS[acc][0] : CLASSIC, portfolio: list === "editorial", direction: "", link: "", plannedOn: null, views: null },
  });

  const filterBtn = (
    <div style={{ position: "relative" }}>
      <button onClick={() => setFilterOpen(o => !o)} aria-label="Filter" title="Filter"
        style={{ height: 28, minWidth: 28, padding: isMobile ? 0 : "0 9px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: `1px solid ${filter !== "all" ? C.black : C.rule}`, background: filter !== "all" ? C.black : "transparent", color: filter !== "all" ? C.white : C.black, borderRadius: 2, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, position: "relative", boxSizing: "border-box" as const }}>
        <Ico d={IC.filter} />
        {!isMobile && <span>{filter !== "all" ? "Filter · 1" : "Filter"}</span>}
        {isMobile && filter !== "all" && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 15, height: 15, borderRadius: 8, background: C.amber, color: C.white, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>}
      </button>
      {filterOpen && !isMobile && <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 260, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 2, boxShadow: "0 6px 20px rgba(0,0,0,0.10)", zIndex: Z.menu, padding: 14 }}>{filterBody()}</div>}
    </div>
  );
  function filterBody() {
    const n = items.filter(i => accs.includes(i.account) && passes(i)).length;
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: SERIF, fontSize: 17 }}>Filter</span>
          <button onClick={() => setFilter("all")} style={{ background: "none", border: "none", color: C.muted, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.label.size }}>Reset</button>
        </div>
        <Lbl>Status</Lbl>
        <S value={filter} onChange={(e: any) => setFilter(e.target.value)}>
          {STATUS_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </S>
        <B onClick={() => setFilterOpen(false)} s={{ width: "100%", marginTop: 14 }}>Show {n} {n === 1 ? "item" : "items"}</B>
      </>
    );
  }
  const toolbar = <Toolbar acc={view.acc} setAcc={(acc) => setView({ ...view, acc })} monday={monday} setMonday={setMonday} isMobile={isMobile}>{filterBtn}</Toolbar>;

  const head = (title: string, right?: any) => (
    <div style={{ ...microLabel, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 18, paddingBottom: 7, borderBottom: `1px solid ${C.rule}`, minHeight: 28 }}>
      <span>{title}</span>{right}
    </div>
  );
  const addBtn = (label: string, onClick: () => void) => (
    <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.black, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Ico d={IC.plus} size={12} />{label}
    </button>
  );
  const card = (label: string, right: any, text: string, empty: string, onClick: () => void, footer?: string) => (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }} className="lh-prow"
      style={{ marginTop: 12, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "10px 12px", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={microLabel}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{right}<Ico d={IC.right} size={13} color={C.muted} /></span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.45, marginTop: 5, color: text ? C.black : C.muted, whiteSpace: "pre-wrap" as const, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{text || empty}</div>
      {footer && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{footer}</div>}
    </div>
  );
  const taskState = (t?: Task) => !t ? null : (
    <span style={{ ...microLabel, color: planner.doneOf(t) ? C.green : C.muted }}>
      {planner.doneOf(t) ? (t.phase === "refine" ? "Settled ✓" : "Done ✓") : t.status === "in_progress" ? (t.phase === "refine" ? "Refining" : "In progress") : t.phase === "refine" ? "Refining" : "Open"}
    </span>
  );

  const statusCell = (it: Item) => {
    const st: any = { ...microLabel, letterSpacing: "0.08em", whiteSpace: "nowrap" as const, flexShrink: 0 };
    if (it.list === "editorial" && !it.direction && (it.status === "idea" || it.status === "planned")) return <span style={{ ...st, color: AMBER }}>Needs direction</span>;
    if (it.status === "in_kit") return <span style={{ ...st, color: C.green }}>In kit ✓</span>;
    if (it.status === "posted") return <span style={{ ...st, color: C.green }}>Posted</span>;
    if (it.status === "planned") return <span style={{ ...st, color: C.black }}>{it.plannedOn ? shortDate(it.plannedOn) : "Planned"}</span>;
    if (it.status === "shot") return <span style={{ ...st, color: C.black }}>Shot</span>;
    return <span style={st}>Idea</span>;
  };
  const itemRow = (it: Item, last: boolean) => (
    <div key={it.id} className="lh-prow" onClick={() => setOpen({ kind: "item", id: it.id })}
      style={{ padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{it.title}</div>
        {(it.list === "editorial" || (it.format && it.format !== CLASSIC)) && <div style={{ marginTop: 4, display: "flex", gap: 6 }}><FormatChip f={it.format} /></div>}
      </div>
      {statusCell(it)}
    </div>
  );

  // ── one account ─────────────────────────────────────────────
  const block = (acc: Account) => {
    const st = stageOf(stages, acc);
    const conceptTask = visible.find(t => t.area === "concept" && t.phase !== "maintain" && t.account === acc);
    const offerTask   = visible.find(t => t.area === "offer" && t.phase !== "maintain" && t.account === acc);
    const firstSet    = visible.find(t => t.source === "portfolio_total" && t.account === acc);
    const ideasTask   = visible.find(t => t.source === "ideas" && t.account === acc);
    const monthTask   = visible.find(t => t.rhythm === "monthly" && t.area === "portfolio");
    const concept = planner.noteOf(acc, "concept");
    const offer   = planner.noteOf(acc, "offer");
    const learn   = planner.noteOf(acc, "learning", monday);
    const mine    = items.filter(i => i.account === acc);
    const eds     = mine.filter(i => i.list === "editorial" && passes(i)).sort(itemOrder);
    const ideas   = mine.filter(i => i.list === "idea" && passes(i)).sort(itemOrder);
    const fs      = firstSet ? planner.stateOf(firstSet, monday) : null;
    const is      = ideasTask ? planner.stateOf(ideasTask, monday) : null;
    // this month's goal (kept on the monthly portfolio task) and pieces posted this month
    const ms = monthStart(monday), me = monthEnd(monday);
    const monthEntry = monthTask ? planner.entries[entryKey(monthTask.id, ms)] : undefined;
    const goal = monthEntry?.data?.goals?.[acc] ?? null;
    const doneMonth = mine.filter(i => i.portfolio && (i.status === "posted" || i.status === "in_kit") && i.postedOn && i.postedOn >= ms && i.postedOn <= me).length;
    const saveGoal = (v: number | null) => {
      if (!monthTask || v === goal) return;
      const data = monthEntry?.data || {};
      quiet(planner.saveEntry(monthTask.id, ms, { data: { ...data, goals: { ...(data.goals || {}), [acc]: v } } }));
    };
    const isLynn = acc === "lynnhoa";

    return (
      <div key={acc} style={{ marginTop: accs.length > 1 ? 22 : 0 }}>
        {accs.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <AccChip acc={acc} s={{ fontSize: 11, padding: "2px 9px" }} />
            {st && <span style={microLabel}>Stage {st.num} · {st.name}</span>}
          </div>
        )}

        {card(isLynn ? "Social concept · with your manager" : "Concept overview", taskState(conceptTask), concept?.body || "",
          isLynn ? "Not settled yet — tap to write the base concept and which TikTok." : "Not written yet — tap to write the concept overview.",
          () => setOpen({ kind: "note", acc, note: "concept" }))}
        {card("Offer", taskState(offerTask), offer?.body || "", "Not written yet — tap to write what this account sells.",
          () => setOpen({ kind: "note", acc, note: "offer" }), "Opens your Service Catalog and Rate Cards")}

        {head("Portfolio", <span>{st && st.num === 1 ? "Build phase" : "Maintain"}</span>)}
        {firstSet && fs && (
          <div className="lh-prow" onClick={() => setOpen({ kind: "task", id: firstSet.id })} style={{ padding: "9px 0", borderBottom: `1px solid ${C.rule}`, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 14 }}>First set</span><span style={{ fontSize: 14, color: fs.done ? C.green : C.black }}>{fs.actual ?? 0} / {fs.target ?? "–"}{fs.done ? " ✓" : ""}</span></div>
            <Bar value={fs.actual ?? 0} max={fs.target ?? 0} done={fs.done} />
          </div>
        )}
        {monthTask && (
          <div style={{ padding: "9px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>{monthName(monday)} goal</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                {doneMonth} of
                <GoalField value={goal} onSave={saveGoal} />
              </span>
            </div>
            <Bar value={doneMonth} max={goal ?? 0} done={goal != null && doneMonth >= goal} />
          </div>
        )}

        {head("Editorial list", addBtn("Add", () => newItem("editorial", acc)))}
        {eds.length === 0
          ? <p style={{ fontSize: 13, color: C.muted, margin: "10px 0 0" }}>{filter === "all" ? "No editorials yet. Add your first portfolio piece." : "Nothing with this status."}</p>
          : eds.map((it, i) => itemRow(it, i === eds.length - 1))}

        {head("Content ideas · TikTok/Reels", <span>{is ? `${is.actual ?? 0} / ${is.target ?? "–"} this week` : ""}</span>)}
        {ideas.length === 0
          ? <p style={{ fontSize: 13, color: C.muted, margin: "10px 0 0" }}>{filter === "all" ? "No ideas yet. Tap + Idea." : "Nothing with this status."}</p>
          : ideas.map((it, i) => itemRow(it, i === ideas.length - 1))}

        {head("Weekly learning", <span>For the check-in</span>)}
        <div className="lh-prow" onClick={() => setOpen({ kind: "note", acc, note: "learning" })} style={{ cursor: "pointer" }}>
          <div style={{ padding: "9px 0", borderBottom: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={microLabel}>Top post</span>
            <span style={{ fontSize: 13, textAlign: "right" as const, color: learn?.title ? C.black : C.muted }}>{learn?.title || "Add this week's top post"}</span>
          </div>
          <div style={{ padding: "9px 0", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={microLabel}>Learning</span>
            <span style={{ fontSize: 13, textAlign: "right" as const, color: learn?.body ? C.black : C.muted }}>{learn?.body || "One thing you learned"}</span>
          </div>
        </div>
      </div>
    );
  };

  // ── which window is open ────────────────────────────────────
  const noteTitle = (acc: Account, n: "concept" | "offer" | "learning") =>
    n === "learning" ? `Week ${isoWeek(monday)} · learning` : n === "offer" ? "Offer" : acc === "lynnhoa" ? "Social concept" : "Concept overview";
  const noteTask = (acc: Account, n: "concept" | "offer" | "learning") =>
    n === "learning" ? undefined : visible.find(t => t.area === n && t.phase !== "maintain" && t.account === acc);

  return (
    <div>
      <style>{`.lh-prow:hover { background: rgba(0,0,0,0.02); }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>Creator</h2>
          <div style={{ ...microLabel, letterSpacing: "0.06em", marginTop: 4 }}>{accs.length === 1 ? `${accLook(accs[0]).label} · ` : ""}{weekRange(monday)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!isMobile && toolbar}
          <B v="sec" onClick={() => newItem("idea", accs[0])} s={{ ...BAR_BTN, height: 28, minHeight: 28, color: C.black, gap: 5, display: "inline-flex", alignItems: "center", marginLeft: isMobile ? 0 : 10 }}><Ico d={IC.plus} size={12} />Idea</B>
        </div>
      </div>
      {isMobile && <div style={{ marginTop: 12 }}>{toolbar}</div>}
      {filter !== "all" && (
        <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
          <button onClick={() => setFilter("all")} style={{ height: 22, padding: "0 6px 0 8px", border: `1px solid ${C.rule}`, background: "transparent", color: C.muted, borderRadius: 11, fontSize: TYPE.label.size, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: SANS }}>
            {STATUS_FILTERS.find(f => f.key === filter)?.label.split(" (")[0]} ✕
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>Loading…</p>
      ) : loadError ? (
        <p style={{ fontSize: TYPE.label.size, color: C.red, marginTop: 16, lineHeight: 1.5 }}>{loadError}</p>
      ) : accs.map(block)}

      {filterOpen && !isMobile && <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: Z.menu - 1 }} />}
      {filterOpen && isMobile && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: Z.modal }}>
          <div onClick={() => setFilterOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.25)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: C.bg, borderTop: `1px solid ${C.rule}`, padding: "12px 14px calc(16px + env(safe-area-inset-bottom))", fontFamily: SANS, color: C.black }}>{filterBody()}</div>
        </div>, document.body)}

      {open?.kind === "item" && (
        <ItemWindow key={open.id || "new"} planner={planner} itemId={open.id} draft={open.draft} isMobile={isMobile} onClose={() => setOpen(null)} />
      )}
      {open?.kind === "note" && (
        <NoteWindow key={`${open.acc}-${open.note}`} planner={planner} acc={open.acc} kind={open.note} period={open.note === "learning" ? monday : null}
          task={noteTask(open.acc, open.note)} title={noteTitle(open.acc, open.note)} isMobile={isMobile} onClose={() => setOpen(null)}
          action={open.note === "offer" && openCatalog ? { label: "Service Catalog", onClick: openCatalog } : undefined} />
      )}
      {open?.kind === "task" && (
        <TaskWindow key={open.id} planner={planner} taskId={open.id} monday={monday} isMobile={isMobile} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

// The month's goal: a small number field that saves when you leave it
function GoalField({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [t, setT] = useState(value == null ? "" : String(value));
  useEffect(() => { setT(value == null ? "" : String(value)); }, [value]);
  return (
    <I inputMode="numeric" value={t} placeholder="–" aria-label="Goal this month"
      onChange={(e: any) => setT(e.target.value.replace(/[^\d]/g, ""))}
      onClick={(e: any) => e.stopPropagation()}
      onBlur={() => onSave(t.trim() === "" ? null : parseIntDe(t))}
      onKeyDown={(e: any) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      s={{ width: 52, height: 30, textAlign: "right" as const, padding: "0 8px" }} />
  );
}
