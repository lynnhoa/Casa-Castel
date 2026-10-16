// ─────────────────────────────────────────────────────────────
// PlannerTodo — Planner › To-do (shared by you and the manager)
// Header: title + week dates, [Plan week] [+ Task]
// Toolbar (28 px): Account ▾ · ‹ Week › · Filter
// Stage track per account (tap → stage window)
// Sections: Maintain · this week / Refine / Setup
// Rows, only three kinds:
//   check  → tap the box
//   days   → TODAY tick; the box fills after 7 of 7 days
//   number → the box ticks itself when the target is reached
// ─────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { B, S, Lbl, Tick, BAR_BTN } from "./atoms";
import {
  PHASES, OWNERS, accLook, ownerLabel, rhythmLabel, rowKind, periodOf,
  thisMonday, weekLabel, weekRange, monthName, todayIndex, stageOf, gateOf, accountsOf, isVisible, byOrder,
} from "./planner";
import type { Task, AccountFilter, Owner, Phase } from "./planner";
import type { PlannerHook } from "./usePlanner";
import { Ico, IC, AccChip, Bar, Box, StageTrack, Toolbar, TaskWindow, PlanWeekWindow, StageWindow } from "./PlannerWindows";

export interface PlannerView { tab: string; acc: AccountFilter; owner: "all" | Owner; phase: "all" | Phase; }
export const DEFAULT_VIEW: PlannerView = { tab: "todo", acc: "all", owner: "all", phase: "all" };

const microLabel: any = { fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted };

interface PlannerTodoProps {
  planner:   PlannerHook;
  view:      PlannerView;
  setView:   (v: PlannerView) => void;
  monday:    string;
  setMonday: (m: string) => void;
  isMobile:  boolean;
  openOutreach?: () => void;
}

export default function PlannerTodo({ planner, view, setView, monday, setMonday, isMobile, openOutreach }: PlannerTodoProps) {
  const { stages, tasks, entries, loading, loadError } = planner;
  const [openTask, setOpenTask]   = useState<string | null>(null);   // task id or "new"
  const [planOpen, setPlanOpen]   = useState(false);
  const [stageOpen, setStageOpen] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const set = (patch: Partial<PlannerView>) => setView({ ...view, ...patch });

  const isThisWeek = monday === thisMonday();
  const ti = todayIndex(monday);
  const quiet = (p: Promise<any>) => p.catch(() => { /* the save toast reports it */ });

  // ── what shows ──────────────────────────────────────────────
  const inScope = useMemo(() => tasks.filter(t => isVisible(t, stages, view.acc)), [tasks, stages, view.acc]);
  const shown = useMemo(() => inScope
    .filter(t => view.owner === "all" || t.owner === view.owner)
    .filter(t => view.phase === "all" || t.phase === view.phase)
    .sort(byOrder), [inScope, view.owner, view.phase]);
  const nFilters = (view.owner !== "all" ? 1 : 0) + (view.phase !== "all" ? 1 : 0);
  const stateOf = (t: Task) => planner.stateOf(t, monday);

  // ── toolbar ─────────────────────────────────────────────────
  const ctl: any = { height: 28, border: `1px solid ${C.rule}`, borderRadius: 2, background: "transparent", display: "inline-flex", alignItems: "center", boxSizing: "border-box" as const, color: C.black, fontFamily: SANS };

  const toolbar = (
    <Toolbar acc={view.acc} setAcc={(acc) => set({ acc })} monday={monday} setMonday={setMonday} isMobile={isMobile}>
      <div style={{ position: "relative" }}>
        <button onClick={() => setFilterOpen(o => !o)} aria-label="Filter" title="Filter"
          style={{ ...ctl, minWidth: 28, justifyContent: "center", gap: 5, padding: isMobile ? 0 : "0 9px", cursor: "pointer", position: "relative", border: `1px solid ${nFilters ? C.black : C.rule}`, background: nFilters ? C.black : "transparent", color: nFilters ? C.white : C.black, fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>
          <Ico d={IC.filter} />
          {!isMobile && <span>{nFilters ? `Filter · ${nFilters}` : "Filter"}</span>}
          {isMobile && nFilters > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 15, height: 15, borderRadius: 8, background: C.amber, color: C.white, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0 }}>{nFilters}</span>}
        </button>
        {filterOpen && !isMobile && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 280, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 2, boxShadow: "0 6px 20px rgba(0,0,0,0.10)", zIndex: Z.menu, padding: 14 }}>{filterBody()}</div>
        )}
      </div>
    </Toolbar>
  );

  function filterBody() {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: SERIF, fontSize: 17 }}>Filter</span>
          <button onClick={() => set({ owner: "all", phase: "all" })} style={{ background: "none", border: "none", color: C.muted, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.label.size }}>Reset</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
          <div><Lbl>Who</Lbl>
            <S value={view.owner} onChange={(e: any) => set({ owner: e.target.value })}>
              <option value="all">All</option>
              {OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </S>
          </div>
          <div><Lbl>Phase</Lbl>
            <S value={view.phase} onChange={(e: any) => set({ phase: e.target.value })}>
              <option value="all">All</option>
              {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </S>
          </div>
        </div>
        <B onClick={() => setFilterOpen(false)} s={{ width: "100%", marginTop: 14 }}>Show {shown.length} {shown.length === 1 ? "task" : "tasks"}</B>
      </>
    );
  }

  const tagStyle: any = { height: 22, padding: "0 6px 0 8px", border: `1px solid ${C.rule}`, background: "transparent", color: C.muted, borderRadius: 11, fontSize: TYPE.label.size, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: SANS };
  const tags = nFilters > 0 && (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 7 }}>
      {view.owner !== "all" && <button onClick={() => set({ owner: "all" })} style={tagStyle}>{ownerLabel(view.owner)} ✕</button>}
      {view.phase !== "all" && <button onClick={() => set({ phase: "all" })} style={tagStyle}>{PHASES.find(p => p.key === view.phase)?.label} ✕</button>}
    </div>
  );

  // ── stage track (one line per account in view) ──────────────
  const stageBox = (
    <div style={{ marginTop: 12, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "2px 10px" }}>
      {accountsOf(view.acc).map((acc, i) => {
        const st = stageOf(stages, acc);
        if (!st) return null;
        const g = gateOf(st, tasks, planner.doneOf);
        const mine = stages.filter(s => s.account === acc);
        const next = mine.find(s => s.num === st.num + 1);
        return (
          <div key={acc} role="button" tabIndex={0} onClick={() => setStageOpen(st.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStageOpen(st.id); } }}
            aria-label={`Stage ${st.num} for ${accLook(acc).label}`}
            style={{ display: "block", width: "100%", textAlign: "left" as const, borderTop: i ? `1px solid ${C.rule}` : "none", padding: "9px 0", cursor: "pointer", fontFamily: SANS, color: C.black }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {view.acc === "all" && <AccChip acc={acc} />}
                <span style={{ ...microLabel, color: view.acc === "all" ? C.black : C.muted, letterSpacing: view.acc === "all" ? "0.04em" : "0.1em", textTransform: view.acc === "all" ? "none" as const : "uppercase" as const, fontSize: view.acc === "all" ? 13 : TYPE.micro.size, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {view.acc === "all" ? st.name : `Stage ${st.num} · ${st.name}`}
                </span>
              </span>
              <span style={{ fontSize: 12, flexShrink: 0 }}>{g.total ? `${g.done} / ${g.total}` : "–"}</span>
            </div>
            <StageTrack stages={mine} current={st.status === "done" ? undefined : st} progress={g.total ? g.done / g.total : 0} />
            {g.ready && g.total > 0 && next && st.status !== "done" && <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>Ready · tap to start Stage {next.num}</div>}
          </div>
        );
      })}
    </div>
  );

  // ── one row ─────────────────────────────────────────────────
  const row = (t: Task, last: boolean) => {
    const kind   = rowKind(t);
    const st     = stateOf(t);
    const period = periodOf(t, monday);
    const chip   = view.acc === "all" || t.account === "both";
    const meta: string[] = [ownerLabel(t.owner)];
    if (t.source === "portfolio_total") {
      meta.push(`${st.actual ?? 0} / ${st.target ?? "–"} ${t.measure || "pieces"}`);
    } else if (t.source === "kit_waiting") {
      meta.push(`${rhythmLabel(t.rhythm)} · ${st.actual ? `${st.actual} ${st.actual === 1 ? "piece" : "pieces"} waiting` : "nothing waiting"}`);
    } else if (t.rhythm === "once") {
      if (t.status === "in_progress") meta.push("In progress");
      if (t.target != null) meta.push(`Goal ${t.target} ${t.measure || ""}`.trim());
    } else if (kind === "number") {
      meta.push(st.target == null ? `${st.actual ?? 0} ${t.measure} · target in Plan week` : `${st.actual ?? 0} / ${st.target} ${t.measure}`);
      if (t.source === "outreach" || t.source === "pitches") meta.push("from Outreach");
      if (t.source === "ideas" || t.source === "posts" || t.source === "pieces") meta.push("from Creator");
    } else if (kind === "auto") {
      meta.push(`${rhythmLabel(t.rhythm)} · ${st.done ? "entered" : "not entered yet"}`);
    } else if (kind === "days") {
      meta.push(`Daily · ${st.daysDone} / 7 days`);
    } else {
      meta.push(t.rhythm === "monthly" ? `Monthly · ${monthName(period)}` : rhythmLabel(t.rhythm));
    }
    const bar =
      (kind === "number" || t.source === "portfolio_total") && st.target ? <Bar value={st.actual ?? 0} max={st.target} done={st.done} /> :
      kind === "days" ? <Bar value={st.daysDone} max={7} done={st.done} /> : null;

    const toggleToday = () => { const days = [...st.days]; days[ti] = !days[ti]; quiet(planner.saveEntry(t.id, period, { days })); };
    const toggleCheck = () => t.rhythm === "once"
      ? quiet(planner.setTaskStatus(t, st.done ? "open" : "done"))
      : quiet(planner.saveEntry(t.id, period, { done: !st.done }));

    return (
      <div key={t.id} onClick={() => setOpenTask(t.id)} className="lh-prow"
        style={{ padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, color: t.rhythm === "once" && st.done ? C.muted : C.black }}>{t.title}</span>
            {chip && <AccChip acc={t.account} />}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{meta.join(" · ")}</div>
          {bar}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {kind === "days" && ti >= 0 && (
            <button onClick={toggleToday} aria-pressed={st.days[ti]}
              style={{ height: 28, padding: "0 9px", border: `1px solid ${st.days[ti] ? C.black : C.rule}`, background: st.days[ti] ? C.black : "transparent", color: st.days[ti] ? C.white : C.black, borderRadius: 2, cursor: "pointer", fontFamily: SANS, fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, display: "inline-flex", alignItems: "center", gap: 5 }}>
              {st.days[ti] ? "✓ Today" : "Today"}
            </button>
          )}
          {kind === "check" ? <Tick on={st.done} color={C.green} size={20} onClick={toggleCheck} /> : <Box on={st.done} size={20} />}
        </div>
      </div>
    );
  };

  const groups = PHASES.map(ph => ({ ...ph, list: shown.filter(t => t.phase === ph.key) })).filter(g => g.list.length);
  const sectionTitle = (key: string, fallback: string) =>
    key === "maintain" ? `Maintain · ${isThisWeek ? "this week" : weekLabel(monday).toLowerCase()}` : fallback;

  return (
    <div>
      <style>{`.lh-prow:hover { background: rgba(0,0,0,0.02); }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>To-do</h2>
          <div style={{ ...microLabel, letterSpacing: "0.06em", marginTop: 4 }}>{weekRange(monday)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const, justifyContent: "flex-end" }}>
          {!isMobile && toolbar}
          <B v="sec" onClick={() => setPlanOpen(true)} s={{ ...BAR_BTN, height: 28, minHeight: 28, color: C.black, marginLeft: isMobile ? 0 : 10 }}>Plan week</B>
          <B v="sec" onClick={() => setOpenTask("new")} s={{ ...BAR_BTN, height: 28, minHeight: 28, color: C.black, gap: 5, display: "inline-flex", alignItems: "center" }}><Ico d={IC.plus} size={12} />Task</B>
        </div>
      </div>

      {isMobile && <div style={{ marginTop: 12 }}>{toolbar}</div>}
      {tags}

      {/* ── CONTENT ── */}
      {loading ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>Loading…</p>
      ) : loadError ? (
        <p style={{ fontSize: TYPE.label.size, color: C.red, marginTop: 16, lineHeight: 1.5 }}>{loadError}</p>
      ) : tasks.length === 0 ? (
        <div style={{ marginTop: 18, padding: "18px 0", borderTop: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SERIF, fontSize: 15, color: C.muted, margin: "0 0 8px" }}>No tasks yet</p>
          <p style={{ fontSize: TYPE.label.size, color: C.muted, margin: 0, lineHeight: 1.7 }}>Run the Phase 1 SQL in Supabase → SQL editor, then come back. Or add your first task with + Task.</p>
        </div>
      ) : (
        <>
          {stageBox}
          {shown.length === 0 ? (
            <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>No tasks match. <button onClick={() => set({ owner: "all", phase: "all" })} style={{ background: "none", border: "none", padding: 0, color: C.black, textDecoration: "underline", cursor: "pointer", fontFamily: SANS, fontSize: TYPE.label.size }}>Clear filters</button></p>
          ) : groups.map(g => {
            const done = g.list.filter(t => stateOf(t).done).length;
            return (
              <div key={g.key}>
                <div style={{ ...microLabel, display: "flex", justifyContent: "space-between", marginTop: 16, paddingBottom: 7, borderBottom: `1px solid ${C.rule}` }}>
                  <span>{sectionTitle(g.key, g.section)}</span><span>{done} of {g.list.length}</span>
                </div>
                {g.list.map((t, i) => row(t, i === g.list.length - 1))}
              </div>
            );
          })}
        </>
      )}

      {/* click outside closes the filter popover (iPad / desktop) */}
      {filterOpen && !isMobile && <div onClick={() => setFilterOpen(false)} style={{ position: "fixed", inset: 0, zIndex: Z.menu - 1 }} />}

      {/* ── FILTER SHEET (phone) ── */}
      {filterOpen && isMobile && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: Z.modal }}>
          <div onClick={() => setFilterOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.25)" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: C.bg, borderTop: `1px solid ${C.rule}`, padding: "12px 14px calc(16px + env(safe-area-inset-bottom))", fontFamily: SANS, color: C.black }}>{filterBody()}</div>
        </div>, document.body)}

      {/* ── WINDOWS ── */}
      {openTask && (
        <TaskWindow key={openTask} planner={planner} monday={monday} isMobile={isMobile} onClose={() => setOpenTask(null)} openOutreach={openOutreach}
          taskId={openTask === "new" ? undefined : openTask}
          draft={openTask === "new" ? newDraft(view, planner) : undefined} />
      )}
      {planOpen && <PlanWeekWindow planner={planner} monday={monday} isMobile={isMobile} onClose={() => setPlanOpen(false)} />}
      {stageOpen && <StageWindow planner={planner} stageId={stageOpen} isMobile={isMobile} onClose={() => setStageOpen(null)} />}
    </div>
  );
}

// + Task starts in the account you're looking at, in its current stage
function newDraft(view: PlannerView, planner: PlannerHook): Partial<Task> {
  const acc = view.acc === "all" ? "both" : view.acc;
  const st = stageOf(planner.stages, view.acc === "all" ? "lynnhoa" : view.acc);
  return {
    title: "", account: acc, owner: view.owner !== "all" ? view.owner : "creator",
    phase: view.phase !== "all" ? view.phase : "maintain",
    rhythm: view.phase !== "all" && view.phase !== "maintain" ? "once" : "weekly",
    stageNum: st?.num || 1, measure: null, how: "", doneWhen: "", link: "",
  };
}
