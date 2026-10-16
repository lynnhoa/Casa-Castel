// ─────────────────────────────────────────────────────────────
// PlannerManager — Planner › Manager (his workspace)
// The working tools behind his To-do rows, per account:
//   Account snapshot · Following log · Community (daily ticks)
//   Email list (counted from Outreach, by category and tier)
//   Sales kit (status, links) + new portfolio pieces to add (one tap: In kit)
//   Sales sprints (Stage 2): the running sprint per account with its
//   goals and results, past sprints, and this week's pitch log
// Every row opens the same task window as in To-do, and
// everything he logs here fills the To-do by itself.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { C, SANS, SERIF, TYPE } from "./constants";
import { B, BAR_BTN } from "./atoms";
import {
  DAY_SHORT, accountsOf, isVisible, byOrder, snapKey, entryKey, periodOf, stageNumOf, todayIndex,
  weekRange, fmtInt, fmtPct2, addDays, thisMonday, isoWeek,
} from "./planner";
import type { Task, Account } from "./planner";
import type { PlannerHook } from "./usePlanner";
import type { PlannerView } from "./PlannerTodo";
import { OUTREACH_CATEGORIES, OUTREACH_TIERS, catOf } from "./outreach";
import { fmtD, today } from "./formatters";
import { Ico, IC, AccChip, Bar, Box, Toolbar, CountChip, CatChip, TaskWindow, SprintWindow, sprintRange, sprintDay } from "./PlannerWindows";

const microLabel: any = { fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted };

interface PlannerManagerProps {
  planner:   PlannerHook;
  view:      PlannerView;
  setView:   (v: PlannerView) => void;
  monday:    string;
  setMonday: (m: string) => void;
  isMobile:  boolean;
  openOutreach?: () => void;
}

export default function PlannerManager({ planner, view, setView, monday, setMonday, isMobile, openOutreach }: PlannerManagerProps) {
  const { stages, tasks, loading, loadError } = planner;
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [openSprint, setOpenSprint] = useState<{ id?: string; acc?: Account } | null>(null);
  const quiet = (p: Promise<any>) => p.catch(() => { /* the save toast reports it */ });

  const accs    = accountsOf(view.acc);
  const visible = tasks.filter(t => isVisible(t, stages, view.acc));
  const find    = (source: string, acc: Account) => visible.find(t => t.source === source && t.account === acc);
  const email   = visible.find(t => t.source === "outreach");
  const kit     = visible.filter(t => t.area === "kit" && t.phase !== "maintain").sort(byOrder);
  const kitUpd  = visible.find(t => t.source === "kit_waiting");
  const waiting = planner.waiting.filter(w => accs.includes(w.account)).length;
  const ti      = todayIndex(monday);
  const stage2  = accs.some(a => stageNumOf(stages, a) >= 2);
  const sprintW = stages.find(s => s.num === 2 && accs.includes(s.account))?.sprintWeeks ?? 2;

  const toolbar = <Toolbar acc={view.acc} setAcc={(acc) => setView({ ...view, acc })} monday={monday} setMonday={setMonday} isMobile={isMobile} />;

  const head = (title: string, right: string) => (
    <div style={{ ...microLabel, display: "flex", justifyContent: "space-between", gap: 8, marginTop: 18, paddingBottom: 7, borderBottom: `1px solid ${C.rule}` }}>
      <span>{title}</span><span>{right}</span>
    </div>
  );
  const rowStyle = (last = false): any => ({ padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" });
  const sub: any = { fontSize: 11, color: C.muted, marginTop: 4 };
  const smallBtn: any = { ...BAR_BTN, height: 28, minHeight: 28, color: C.black };

  // ── sections ────────────────────────────────────────────────
  const snapshots = accs.map((acc, i) => {
    const t = find("snapshot", acc);
    if (!t) return null;
    const sn = planner.snaps[snapKey(acc, monday)];
    const done = planner.stateOf(t, monday).done;
    return (
      <div key={acc} className="lh-prow" onClick={() => setOpenTask(t.id)} style={rowStyle(i === accs.length - 1)}>
        <div style={{ minWidth: 0 }}>
          <AccChip acc={acc} />
          <div style={sub}>{done ? `${fmtInt(sn?.followers)} followers · ${fmtInt(sn?.views)} views · ${fmtPct2(sn?.engagement)}` : "Not entered yet"}</div>
        </div>
        {done ? <Box on size={20} /> : <B v="sec" s={smallBtn}>Enter</B>}
      </div>
    );
  });

  const following = accs.map((acc, i) => {
    const t = find("following", acc);
    if (!t) return null;
    const st = planner.stateOf(t, monday);
    const d = planner.entries[entryKey(t.id, periodOf(t, monday))]?.data || {};
    const logged = d.followed != null || st.actual != null || d.unfollowed != null;
    return (
      <div key={acc} className="lh-prow" onClick={() => setOpenTask(t.id)} style={rowStyle(i === accs.length - 1)}>
        <div style={{ minWidth: 0 }}>
          <AccChip acc={acc} />
          <div style={sub}>{logged ? `Followed ${d.followed ?? 0} · back ${st.actual ?? 0} · unfollowed ${d.unfollowed ?? 0}` : "Nothing logged yet"}</div>
        </div>
        <span style={{ fontSize: 14, flexShrink: 0, color: st.done ? C.green : C.black }}>{st.actual ?? 0} / {st.target ?? "–"}{st.done ? " ✓" : ""}</span>
      </div>
    );
  });

  const community = accs.map((acc, i) => {
    const t = visible.find(x => x.rhythm === "daily" && x.area === "community" && x.account === acc);
    if (!t) return null;
    const st = planner.stateOf(t, monday);
    const toggle = (k: number) => { const days = [...st.days]; days[k] = !days[k]; quiet(planner.saveEntry(t.id, periodOf(t, monday), { days })); };
    return (
      <div key={acc} className="lh-prow" onClick={() => setOpenTask(t.id)} style={rowStyle(i === accs.length - 1)}>
        <AccChip acc={acc} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
          {DAY_SHORT.map((dname, k) => {
            const on = st.days[k];
            return (
              <button key={dname} onClick={() => toggle(k)} aria-pressed={on} aria-label={`${dname}${on ? ", done" : ""}`} title={dname}
                style={{ width: 24, height: 24, padding: 0, borderRadius: 2, border: `1px solid ${k === ti ? C.black : on ? C.green : C.rule}`, background: on ? C.green : "transparent", color: on ? C.white : C.muted, fontFamily: SANS, fontSize: TYPE.micro.size, cursor: "pointer" }}>
                {dname[0]}
              </button>
            );
          })}
          <span style={{ fontSize: 12, marginLeft: 6, minWidth: 30, textAlign: "right" as const, color: st.done ? C.green : C.black }}>{st.daysDone}/7</span>
        </div>
      </div>
    );
  });

  const emailBlock = (() => {
    if (!email) return null;
    const st = planner.stateOf(email, monday);
    const list = planner.newContacts(periodOf(email, monday));
    const byCat  = OUTREACH_CATEGORIES.map(c => ({ c, n: list.filter(x => x.category === c.key).length })).filter(x => x.n);
    const byTier = OUTREACH_TIERS.map(t => ({ t, n: list.filter(x => x.tier === t.key).length }));
    return (
      <>
        <div className="lh-prow" onClick={() => setOpenTask(email.id)} style={rowStyle(true)}>
          <span style={{ fontSize: 14 }}>New this week</span>
          <span style={{ fontSize: 14, color: st.done ? C.green : C.black }}>{st.target == null ? `${st.actual ?? 0} · set the target in Plan week` : `${st.actual ?? 0} / ${st.target}${st.done ? " ✓" : ""}`}</span>
        </div>
        {byCat.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const }}>{byCat.map(x => <CountChip key={x.c.key} label={x.c.label} n={x.n} look={x.c} />)}</div>}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, alignItems: "center", marginTop: 8 }}>
          <span style={microLabel}>Tiers</span>
          {byTier.map(x => <CountChip key={x.t.key} label={x.t.label} n={x.n} />)}
        </div>
        {planner.outreachError && <p style={{ fontSize: 12, color: C.red, margin: "8px 0 0" }}>Outreach couldn't be read ({planner.outreachError}).</p>}
        {openOutreach && <B v="sec" onClick={openOutreach} s={{ ...smallBtn, marginTop: 10, gap: 5 }}><Ico d={IC.link} size={12} />Open Outreach</B>}
      </>
    );
  })();

  const kitDone = kit.filter(t => t.status === "done").length;
  const kitRows = kit.map((t, i) => (
    <div key={t.id} className="lh-prow" onClick={() => setOpenTask(t.id)} style={rowStyle(i === kit.length - 1)}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{t.title}</span>
        <AccChip acc={t.account} />
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {t.link && <span style={{ color: C.muted, display: "inline-flex" }} title="Has a link"><Ico d={IC.link} size={14} /></span>}
        {t.status === "done" ? <Box on size={20} /> : <span style={microLabel}>{t.status === "in_progress" ? "In progress" : "Not started"}</span>}
      </span>
    </div>
  ));

  // ── Stage 2: sprint per account + this week's pitch log ─────
  function sprintBlock(acc: Account) {
    const sp = planner.activeSprint(acc);
    const past = planner.sprints.filter(x => x.account === acc && x.status === "done").sort((a, b) => b.startOn.localeCompare(a.startOn)).slice(0, 3);
    const st = sp ? planner.sprintStats(sp) : null;
    const due = planner.followUpsDue(acc);
    const d = sp ? sprintDay(sp, today()) : null;
    return (
      <div key={acc}>
        {sp && st && d ? (
          <div role="button" tabIndex={0} className="lh-prow" onClick={() => setOpenSprint({ id: sp.id })} onKeyDown={(e) => { if (e.key === "Enter") setOpenSprint({ id: sp.id }); }}
            style={{ marginTop: 10, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "9px 10px", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><AccChip acc={acc} /><span style={{ fontSize: 14 }}>Sprint {sp.num}</span></span>
              <span style={microLabel}>Day {d.day} of {d.total}</span>
            </div>
            <div style={{ ...sub, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
              <span>{sprintRange(sp)} · Focus</span>{sp.focusCategory ? <CatChip k={sp.focusCategory} /> : <span>any category</span>}<span>· {OUTREACH_TIERS.find(t => t.key === sp.focusTier)?.label}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14 }}>
              <span>Pitches</span><span style={{ color: sp.pitchGoal != null && st.pitches >= sp.pitchGoal ? C.green : C.black }}>{st.pitches} / {sp.pitchGoal ?? "–"}</span>
            </div>
            <Bar value={st.pitches} max={sp.pitchGoal ?? 0} done={sp.pitchGoal != null && st.pitches >= sp.pitchGoal} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 14 }}>
              <span>Follow-ups</span>
              <span>{st.followUps} / {sp.followUpGoal ?? "–"}{due > 0 && <span style={{ color: C.amber }}> · {due} due</span>}</span>
            </div>
            <div style={{ ...sub, marginTop: 6 }}>Replied {st.replied} · Gifted {st.gifted} · Deals {st.deals}{st.rate != null ? ` · reply rate ${fmtPct2(st.rate)}` : ""}</div>
          </div>
        ) : (
          <div style={{ padding: "9px 0", borderBottom: `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}><AccChip acc={acc} /><span style={{ fontSize: 13, color: C.muted }}>No sprint running{due > 0 ? ` · ${due} follow-ups due` : ""}</span></span>
            <B v="sec" onClick={() => setOpenSprint({ acc })} s={smallBtn}>Start sprint</B>
          </div>
        )}
        {past.map(p => {
          const ps = planner.sprintStats(p);
          return (
            <div key={p.id} className="lh-prow" onClick={() => setOpenSprint({ id: p.id })} style={{ ...rowStyle(), alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>Sprint {p.num} <span style={{ color: C.muted }}>· {sprintRange(p)}</span></div>
                <div style={sub}>{ps.pitches} pitches · {ps.replied} replied · {ps.gifted} gifted · {ps.deals} {ps.deals === 1 ? "deal" : "deals"}</div>
              </div>
              <span style={{ ...microLabel, flexShrink: 0 }}>Done</span>
            </div>
          );
        })}
      </div>
    );
  }

  const weekPitches = planner.pitchesInWeek(accs, monday);
  const pitchN = weekPitches.filter(p => p.kind === "pitch").length;
  const pitchLog = (
    <>
      {head(`Pitch log · week ${isoWeek(monday)}`, `${pitchN} ${pitchN === 1 ? "pitch" : "pitches"} · ${weekPitches.length - pitchN} follow-ups`)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4, marginTop: 10 }}>
        {DAY_SHORT.map((dn, k) => {
          const n = weekPitches.filter(p => p.sentOn === addDays(monday, k)).length;
          return (
            <div key={dn} style={{ border: `1px solid ${k === ti ? C.black : C.rule}`, borderRadius: 2, padding: "5px 0", textAlign: "center" as const }}>
              <div style={{ ...microLabel, fontSize: 9 }}>{dn}</div>
              <div style={{ fontSize: 14, marginTop: 2, color: n ? C.black : C.light }}>{n}</div>
            </div>
          );
        })}
      </div>
      {weekPitches.length === 0 ? (
        <p style={{ fontSize: 13, color: C.muted, margin: "10px 0 0" }}>Nothing logged this week. Log pitches in Outreach.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {weekPitches.slice(0, 8).map((p, i, arr) => (
            <div key={p.id} style={{ padding: "7px 0", borderBottom: i === arr.length - 1 ? "none" : `1px solid ${C.rule}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{planner.contactName(p.contactId)} <span style={{ color: C.muted }}>· {p.kind === "follow_up" ? "Follow-up" : "Pitch"}</span></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}><AccChip acc={p.account} /><span style={{ fontSize: 12, color: C.muted }}>{fmtD(p.sentOn).slice(0, 6)}</span></span>
            </div>
          ))}
          {weekPitches.length > 8 && <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>+{weekPitches.length - 8} more in Outreach</p>}
        </div>
      )}
      {openOutreach && <B v="sec" onClick={openOutreach} s={{ ...smallBtn, marginTop: 10, gap: 5 }}><Ico d={IC.link} size={12} />Open Outreach</B>}
    </>
  );

  const current = openTask ? tasks.find(t => t.id === openTask) : undefined;

  return (
    <div>
      <style>{`.lh-prow:hover { background: rgba(0,0,0,0.02); }`}</style>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "flex-end", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: isMobile ? 22 : 24, fontWeight: "normal", margin: 0, lineHeight: 1.1 }}>Manager</h2>
          <div style={{ ...microLabel, letterSpacing: "0.06em", marginTop: 4 }}>His workspace · {weekRange(monday)}</div>
        </div>
        {!isMobile && toolbar}
      </div>
      {isMobile && <div style={{ marginTop: 12 }}>{toolbar}</div>}

      {loading ? (
        <p style={{ fontSize: TYPE.label.size, color: C.muted, marginTop: 16 }}>Loading…</p>
      ) : loadError ? (
        <p style={{ fontSize: TYPE.label.size, color: C.red, marginTop: 16, lineHeight: 1.5 }}>{loadError}</p>
      ) : (
        <>
          {snapshots.some(Boolean) && <>{head("Account snapshot", "Weekly")}{snapshots}</>}
          {following.some(Boolean) && <>{head("Following log", "Weekly")}{following}</>}
          {community.some(Boolean) && <>{head("Community", "Daily")}{community}</>}
          {email && <>{head("Email list · from Outreach", "Weekly")}{emailBlock}</>}

          {kit.length > 0 && <>{head("Sales kit", `${kitDone} of ${kit.length}`)}{kitRows}</>}
          {waiting > 0 && kitUpd && (
            <div role="button" tabIndex={0} onClick={() => setOpenTask(kitUpd.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenTask(kitUpd.id); }}
              style={{ marginTop: 10, border: "1px solid #e8d8c8", background: "#fdf5ee", borderRadius: 2, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span style={{ fontSize: 13, color: "#8a6a48" }}>{waiting} new portfolio {waiting === 1 ? "piece" : "pieces"} to add</span>
              <span style={{ color: "#8a6a48", display: "inline-flex" }}><Ico d={IC.arrow} size={15} /></span>
            </div>
          )}

          {head("Sales sprints", stage2 ? `${sprintW}-week sprints` : "Stage 2")}
          {!stage2 ? (
            <div style={{ padding: "9px 0", color: C.light }}>
              <div style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><Ico d={IC.lock} size={14} />Unlocks when Stage 1 is done</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>{sprintW}-week sprints: focus, pitch goal, follow-ups, review</div>
            </div>
          ) : planner.stage2Error ? (
            <p style={{ fontSize: 12, color: C.red, margin: "10px 0 0", lineHeight: 1.5 }}>{planner.stage2Error}</p>
          ) : (
            <>
              {accs.filter(a => stageNumOf(stages, a) >= 2).map(sprintBlock)}
              {pitchLog}
            </>
          )}
        </>
      )}

      {current && <TaskWindow key={current.id} planner={planner} taskId={current.id} monday={monday} isMobile={isMobile} onClose={() => setOpenTask(null)} openOutreach={openOutreach} />}
      {openSprint && (
        <SprintWindow key={openSprint.id || `new-${openSprint.acc}`} planner={planner} sprintId={openSprint.id} isMobile={isMobile} onClose={() => setOpenSprint(null)}
          draft={openSprint.acc ? { account: openSprint.acc, startOn: thisMonday(), endOn: addDays(thisMonday(), sprintW * 7 - 1), focusCategory: "", focusTier: "now", pitchGoal: null, followUpGoal: null, review: "" } : undefined} />
      )}
    </div>
  );
}
