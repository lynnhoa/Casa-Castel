// ─────────────────────────────────────────────────────────────
// PlannerOverview — Planner › Overview: the scoreboard, read-only.
// Nothing to tick here; the work happens in the other tabs.
//   Stage      · track per account (tap: the gate, read-only)
//   Audience   · @lynnhoa revival → views; @createbylynn growth →
//                new followers; 6-week trend from the snapshots
//   Portfolio  · first set (9), then this month's goal
//   Weekly goals met · by manager / you / both
//   Pipeline (from Stage 2) · Money (from Stage 3)
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { C, SERIF, TYPE } from "./constants";
import {
  accountsOf, accLook, stageOf, stageNumOf, gateOf, isVisible, addDays, snapKey, entryKey, monthName,
  weekRange, isoWeek, fmtInt, fmtPct2,
} from "./planner";
import type { Account, Task } from "./planner";
import { monthStart, monthEnd } from "./formatters";
import type { PlannerHook } from "./usePlanner";
import type { PlannerView } from "./PlannerTodo";
import { Ico, IC, AccChip, Bar, StageTrack, Toolbar, StageWindow } from "./PlannerWindows";

const microLabel: any = { fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted };

// What "audience" means per account: revival → views come back; growth → new followers
const FOCUS: Record<Account, { label: string; what: string }> = {
  lynnhoa:      { label: "Revival", what: "Views this week" },
  createbylynn: { label: "Growth",  what: "New followers this week" },
};

interface PlannerOverviewProps {
  planner:   PlannerHook;
  view:      PlannerView;
  setView:   (v: PlannerView) => void;
  monday:    string;
  setMonday: (m: string) => void;
  isMobile:  boolean;
}

export default function PlannerOverview({ planner, view, setView, monday, setMonday, isMobile }: PlannerOverviewProps) {
  const { stages, tasks, items, loading, loadError } = planner;
  const [openStage, setOpenStage] = useState<string | null>(null);
  const accs    = accountsOf(view.acc);
  const visible = tasks.filter(t => isVisible(t, stages, view.acc));

  const head = (title: string, right: string) => (
    <div style={{ ...microLabel, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18, paddingBottom: 7, borderBottom: `1px solid ${C.rule}` }}>
      <span>{title}</span><span>{right}</span>
    </div>
  );
  const sub: any = { fontSize: 11, color: C.muted, marginTop: 2 };
  const locked = (text: string) => (
    <div style={{ padding: "9px 0", color: C.light, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Ico d={IC.lock} size={13} />{text}</div>
  );

  // ── stage rows ──────────────────────────────────────────────
  const stageRows = accs.map((acc, i) => {
    const mine = stages.filter(s => s.account === acc);
    const cur  = stageOf(stages, acc);
    if (!cur) return null;
    const gate = gateOf(cur, tasks, planner.doneOf);
    return (
      <div key={acc} className="lh-prow" role="button" tabIndex={0} onClick={() => setOpenStage(cur.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenStage(cur.id); }}
        style={{ padding: "9px 0", borderBottom: i === accs.length - 1 ? "none" : `1px solid ${C.rule}`, cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <AccChip acc={acc} />
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{cur.name}</span>
          </span>
          <span style={{ fontSize: 12, flexShrink: 0, color: gate.ready && gate.total ? C.green : C.black }}>{gate.total ? `${gate.done} / ${gate.total}${gate.ready ? " ✓" : ""}` : "–"}</span>
        </div>
        <StageTrack stages={mine} current={cur} progress={gate.total ? gate.done / gate.total : 0} />
      </div>
    );
  });

  // ── audience cards ──────────────────────────────────────────
  const card = (acc: Account) => {
    const f = FOCUS[acc];
    const snap = (w: string) => planner.snaps[snapKey(acc, w)];
    const newF = (w: string): number | null => {
      const a = snap(w)?.followers, b = snap(addDays(w, -7))?.followers;
      return a != null && b != null ? a - b : null;
    };
    const value = (w: string): number | null => (acc === "lynnhoa" ? snap(w)?.views ?? null : newF(w));
    const weeks = [-35, -28, -21, -14, -7, 0].map(o => addDays(monday, o));
    const cur  = value(monday);
    const prev = value(addDays(monday, -7));
    let delta: { text: string; color: string } | null = null;
    if (cur != null && prev != null) {
      if (acc === "lynnhoa") {
        if (prev > 0) {
          const pct = ((cur - prev) / prev) * 100;
          delta = { text: `${pct >= 0 ? "+" : "−"}${fmtPct2(Math.abs(pct))} vs last week`, color: pct > 0 ? C.green : pct < 0 ? C.red : C.muted };
        }
      } else {
        const d = cur - prev;
        delta = { text: `${d >= 0 ? "+" : "−"}${fmtInt(Math.abs(d))} vs last week`, color: d > 0 ? C.green : d < 0 ? C.red : C.muted };
      }
    }
    const vals = weeks.map(value);
    const max = Math.max(1, ...vals.map(v => Math.max(0, v ?? 0)));
    const now = snap(monday);
    const big = cur == null ? "–" : acc === "lynnhoa" ? fmtInt(cur) : `${cur >= 0 ? "+" : "−"}${fmtInt(Math.abs(cur))}`;
    return (
      <div key={acc} style={{ border: `1px solid ${C.rule}`, borderRadius: 2, padding: "9px 10px", minWidth: 0 }}>
        <AccChip acc={acc} />
        <div style={{ ...microLabel, marginTop: 8 }}>{f.label}</div>
        <div style={sub}>{f.what}</div>
        <div style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 1.1, marginTop: 3 }}>{big}</div>
        <div style={{ fontSize: 11, marginTop: 2, color: delta?.color || C.muted }}>{delta?.text || (cur == null ? "Not entered yet" : "No week before to compare")}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28, marginTop: 8 }} aria-label={`Last 6 weeks: ${vals.map(v => (v == null ? "–" : fmtInt(v))).join(", ")}`}>
          {vals.map((v, k) => (
            <i key={k} title={`W${isoWeek(weeks[k])}: ${v == null ? "–" : fmtInt(v)}`}
              style={{ flex: 1, height: v == null || v <= 0 ? 2 : `${Math.max(8, Math.round((v / max) * 100))}%`, background: k === 5 ? C.black : "#d6d1cb" }} />
          ))}
        </div>
        <div style={{ ...sub, marginTop: 6 }}>{now?.followers != null || now?.engagement != null ? `${fmtInt(now?.followers)} followers · ${fmtPct2(now?.engagement)}` : "No snapshot this week"}</div>
      </div>
    );
  };

  // ── portfolio rows ──────────────────────────────────────────
  const ms = monthStart(monday), me = monthEnd(monday);
  const monthTask = visible.find(t => t.rhythm === "monthly" && t.area === "portfolio");
  const goals = monthTask ? planner.entries[entryKey(monthTask.id, ms)]?.data?.goals || {} : {};
  const anyBuilding = accs.some(acc => {
    const fs = tasks.find(t => t.source === "portfolio_total" && t.account === acc && t.active);
    return fs && !planner.doneOf(fs);
  });
  const portfolioRows = accs.map((acc, i) => {
    const fs = tasks.find(t => t.source === "portfolio_total" && t.account === acc && t.active);
    const st = fs ? planner.stateOf(fs, monday) : null;
    const last = i === accs.length - 1;
    if (st && !st.done) {
      return (
        <div key={acc} style={{ padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.rule}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><AccChip acc={acc} /><span style={{ fontSize: 13 }}>First set {st.actual ?? 0} / {st.target ?? "–"}</span></div>
          <Bar value={st.actual ?? 0} max={st.target ?? 0} />
        </div>
      );
    }
    const done = items.filter(x => x.account === acc && x.portfolio && (x.status === "posted" || x.status === "in_kit") && x.postedOn && x.postedOn >= ms && x.postedOn <= me).length;
    const goal = goals[acc] ?? null;
    return (
      <div key={acc} style={{ padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.rule}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><AccChip acc={acc} /><span style={{ fontSize: 13, color: goal != null && done >= goal ? C.green : C.black }}>{monthName(monday)} {done} / {goal ?? "–"}</span></div>
        <Bar value={done} max={goal ?? 0} done={goal != null && done >= goal} />
      </div>
    );
  });

  // ── weekly goals met ────────────────────────────────────────
  const weekly = visible.filter(t => t.phase === "maintain" && (t.rhythm === "weekly" || t.rhythm === "daily"));
  const isMet = (t: Task) => planner.stateOf(t, monday).done;
  const met = weekly.filter(isMet).length;
  const byOwner = (["manager", "creator", "both"] as const).map(o => {
    const list = weekly.filter(t => t.owner === o);
    return { o, n: list.filter(isMet).length, of: list.length };
  }).filter(x => x.of > 0);
  const ownerName = (o: string) => (o === "manager" ? "Manager" : o === "creator" ? "You" : "Both");

  // ── pipeline (Stage 2+) ─────────────────────────────────────
  const stage2 = accs.some(a => stageNumOf(stages, a) >= 2);
  const stage3 = accs.some(a => stageNumOf(stages, a) >= 3);
  const pitching = visible.filter(t => t.area === "pitching" && t.phase === "maintain");

  const current = openStage ? stages.find(s => s.id === openStage) : undefined;

  return (
    <div>
      <style>{`.lh-prow:hover { background: rgba(0,0,0,0.02); }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>Overview</h2>
          <div style={{ ...microLabel, letterSpacing: "0.06em", marginTop: 4 }}>{weekRange(monday)}</div>
        </div>
        {!isMobile && <Toolbar acc={view.acc} setAcc={(acc) => setView({ ...view, acc })} monday={monday} setMonday={setMonday} isMobile={isMobile} />}
      </div>
      {isMobile && <div style={{ marginTop: 12 }}><Toolbar acc={view.acc} setAcc={(acc) => setView({ ...view, acc })} monday={monday} setMonday={setMonday} isMobile={isMobile} /></div>}

      {loading ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>Loading…</p>
      ) : loadError ? (
        <p style={{ fontSize: TYPE.label.size, color: C.red, marginTop: 16, lineHeight: 1.5 }}>{loadError}</p>
      ) : (
        <>
          {head("Stage", "Tap for gates")}
          {stageRows}

          {head("Audience", "Weekly snapshot")}
          <div style={{ display: "grid", gridTemplateColumns: accs.length > 1 ? "repeat(2, minmax(0,1fr))" : "minmax(0,1fr)", gap: 8, marginTop: 10 }}>
            {accs.map(card)}
          </div>

          {head(anyBuilding ? "Portfolio · first set" : `Portfolio · ${monthName(monday)}`, anyBuilding ? "Build phase" : "Month goal")}
          {portfolioRows}

          {head("Weekly goals", `${met} of ${weekly.length} met`)}
          <div style={{ padding: "9px 0" }}>
            <Bar value={met} max={weekly.length} done={weekly.length > 0 && met === weekly.length} s={{ marginTop: 2 }} />
            <div style={{ ...sub, marginTop: 6 }}>{byOwner.map(x => `${ownerName(x.o)} ${x.n} of ${x.of}`).join(" · ")}{byOwner.length ? " · " : ""}details in To-do</div>
          </div>

          {head("Pipeline", "From Stage 2")}
          {stage2 && pitching.length > 0 ? (
            pitching.map(t => {
              const st = planner.stateOf(t, monday);
              return (
                <div key={t.id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.rule}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>Pitches this week <AccChip acc={t.account} /></span>
                    <span style={{ fontSize: 14, color: st.done ? C.green : C.black }}>{st.actual ?? 0} / {st.target ?? "–"}</span>
                  </div>
                  <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} />
                  <div style={{ ...sub, marginTop: 4 }}>Replies, gifted and deals come with Outreach tracking.</div>
                </div>
              );
            })
          ) : locked("Pitched · replied · gifted · deals")}

          {head("Money", "From Stage 3")}
          {stage3 ? <div style={{ padding: "9px 0", fontSize: 13, color: C.muted }}>Revenue from your invoices comes with the Stage 3 build.</div> : locked("Revenue from your invoices")}
        </>
      )}

      {current && <StageWindow key={current.id} planner={planner} stageId={current.id} isMobile={isMobile} onClose={() => setOpenStage(null)} readOnly />}
    </div>
  );
}
