// ─────────────────────────────────────────────────────────────
// PlannerWindows — the Planner's windows (one level, like the
// Outreach contact window) and the small pieces they share.
//   Task window   read view → Edit → Save returns to the read view
//   Plan week     this week's numbers in one go
//   Stage window  goal, done-when checklist, Start next stage
// Extra actions (Delete …) sit in the ⋯ menu; one main button.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { C, SANS, SERIF, TYPE, Z } from "./constants";
import { fmtD } from "./formatters";
import { B, I, S, Lbl, Tick, ConfirmDialog, BAR_BTN } from "./atoms";
import {
  ACCOUNTS, PHASES, OWNERS, RHYTHMS, STATUSES, STAGE_SHORT, DAY_SHORT,
  accLook, phaseLabel, ownerLabel, rhythmLabel, rowKind, entryKey, periodOf, snapKey,
  addDays, isoWeek, weekRange, weekLabel, thisMonday, monthName, todayIndex, gateOf, stageNumOf, taskAccounts, isVisible, byOrder,
  fmtInt, fmtPct2, parseDec, parseIntDe,
  ITEM_STATUSES, FORMATS, CLASSIC, formatLook, itemStatusLabel,
} from "./planner";
import type { Task, Stage, TaskAccount, AccountFilter, Phase, Rhythm, Item, ItemList, Account, NoteKind } from "./planner";
import { OUTREACH_CATEGORIES, OUTREACH_TIERS, catOf } from "./outreach";
import type { PlannerHook } from "./usePlanner";

// ── small line icons (same drawing style as Outreach) ─────────
export const Ico = ({ d, size = 14, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d={d} /></svg>
);
export const IC = {
  filter: "M4 5h16l-6 7.5V19l-4 1v-7.5z",
  plus:   "M12 5v14M5 12h14",
  left:   "M15 6l-6 6 6 6",
  right:  "M9 6l6 6-6 6",
  more:   "M5 12h.01M12 12h.01M19 12h.01",
  link:   "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  lock:   "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  arrow:  "M5 12h14M13 6l6 6-6 6",
};

// ── pieces ────────────────────────────────────────────────────
export const AccChip = ({ acc, s }: { acc: TaskAccount; s?: any }) => {
  const l = accLook(acc);
  return <span style={{ fontSize: TYPE.micro.size, padding: "1px 7px", borderRadius: 10, border: `1px solid ${l.border}`, background: l.bg, color: l.color, whiteSpace: "nowrap" as const, flexShrink: 0, ...s }}>{l.label}</span>;
};

export const Bar = ({ value, max, done, s }: { value: number; max: number; done?: boolean; s?: any }) => {
  const w = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <div style={{ height: 3, background: C.rule, marginTop: 6, ...s }}>
      <div style={{ height: 3, width: `${w}%`, background: done ? C.green : C.black }} />
    </div>
  );
};

// display-only tick (rows whose box ticks itself)
export const Box = ({ on, size = 18 }: { on: boolean; size?: number }) => (
  <span aria-label={on ? "Done" : "Not done yet"} style={{ width: size, height: size, borderRadius: 3, border: `1.5px solid ${on ? C.green : C.light}`, background: on ? C.green : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxSizing: "border-box" as const }}>
    {on && <span style={{ fontSize: Math.round(size * 0.55), color: C.white, lineHeight: 1, fontWeight: 500 }}>✓</span>}
  </span>
);

const microLabel: any = { fontSize: TYPE.micro.size, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: C.muted };

// 5 steps: done stages full, the current one filled by its gate progress
export const StageTrack = ({ stages, current, progress }: { stages: Stage[]; current?: Stage; progress: number }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 3, marginTop: 8 }}>
    {[1, 2, 3, 4, 5].map(n => {
      const st = stages.find(s => s.num === n);
      const isCur = current?.num === n;
      const fill = st?.status === "done" ? 100 : isCur ? Math.round(progress * 100) : 0;
      return (
        <div key={n} style={{ minWidth: 0 }}>
          <div style={{ height: 4, background: C.rule }}><div style={{ height: 4, width: `${fill}%`, background: C.black }} /></div>
          <div style={{ fontSize: TYPE.micro.size, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginTop: 4, color: isCur || st?.status === "done" ? C.black : C.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {st?.shortName || STAGE_SHORT[n - 1]}
          </div>
        </div>
      );
    })}
  </div>
);

// ── the slim toolbar every Planner tab shares: Account ▾ · ‹ Week › (+ extra) ─
export function Toolbar({ acc, setAcc, monday, setMonday, isMobile, children }: {
  acc: AccountFilter; setAcc: (a: AccountFilter) => void; monday: string; setMonday: (m: string) => void; isMobile: boolean; children?: any;
}) {
  const ctl: any = { height: 28, border: `1px solid ${C.rule}`, borderRadius: 2, background: "transparent", display: "inline-flex", alignItems: "center", boxSizing: "border-box" as const, color: C.black, fontFamily: SANS };
  const arrowBtn: any = { width: 28, height: 26, border: "none", background: "none", cursor: "pointer", color: C.muted, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 };
  const isThisWeek = monday === thisMonday();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
      <S value={acc} onChange={(e: any) => setAcc(e.target.value)} aria-label="Account"
        s={{ height: 28, flex: isMobile ? 1 : "0 0 170px", width: isMobile ? "auto" : 170, minWidth: 0, padding: "0 26px 0 8px", backgroundPosition: "right 8px center" }}>
        <option value="all">All accounts</option>
        {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
      </S>
      <div style={{ ...ctl, flexShrink: 0 }}>
        <button onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week" style={arrowBtn}><Ico d={IC.left} size={13} /></button>
        <button onClick={() => setMonday(thisMonday())} title={isThisWeek ? "This week" : "Back to this week"}
          style={{ height: 26, border: "none", background: "none", cursor: "pointer", fontFamily: SANS, fontSize: 13, color: C.black, padding: "0 2px", whiteSpace: "nowrap" as const }}>
          {weekLabel(monday)}
        </button>
        <button onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week" style={arrowBtn}><Ico d={IC.right} size={13} /></button>
      </div>
      {children}
    </div>
  );
}

// Small coloured counts (Outreach categories / tiers)
export const CountChip = ({ label, n, look }: { label: string; n: number; look?: { color: string; bg: string; border: string } }) => (
  <span style={{ fontSize: TYPE.micro.size, padding: "1px 7px", borderRadius: 10, border: `1px solid ${look?.border || C.rule}`, background: look?.bg || "transparent", color: look?.color || C.muted, whiteSpace: "nowrap" as const }}>{label} {n}</span>
);

// ── one-level window: full screen on the phone, centred elsewhere ─
export function Window({ title, isMobile, onClose, children, footer }: { title: string; isMobile: boolean; onClose: () => void; children: any; footer?: any }) {
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: Z.modal, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", background: isMobile ? C.bg : "rgba(250,249,247,0.85)", fontFamily: SANS, color: C.black }}>
      <div style={{ width: "100%", maxWidth: isMobile ? "none" : 480, maxHeight: isMobile ? "none" : "88vh", background: C.bg, border: isMobile ? "none" : `1px solid ${C.rule}`, borderRadius: isMobile ? 0 : 2, boxShadow: isMobile ? "none" : "0 8px 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", paddingTop: isMobile ? "env(safe-area-inset-top)" : 0 }}>
        <div style={{ height: 44, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 2px", borderBottom: `1px solid ${C.rule}`, flexShrink: 0 }}>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20, flexShrink: 0 }}>✕</button>
          <span style={{ fontFamily: SERIF, fontSize: 15, color: C.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{title}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 16px" }}>{children}</div>
        {footer && <div style={{ padding: `10px 14px ${isMobile ? "calc(10px + env(safe-area-inset-bottom))" : "10px"}`, borderTop: `1px solid ${C.rule}`, flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ⋯ menu: extra actions in a small dropdown (opens upwards from the footer)
export function MoreMenu({ items }: { items: { label: string; danger?: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />}
      <button onClick={() => setOpen(o => !o)} aria-label="More" title="More"
        style={{ width: 36, height: 36, border: `1px solid ${C.rule}`, borderRadius: 2, background: "transparent", color: C.black, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2 }}>
        <Ico d={IC.more} size={18} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", left: 0, bottom: "calc(100% + 6px)", minWidth: 170, background: C.bg, border: `1px solid ${C.rule}`, borderRadius: 2, boxShadow: "0 6px 20px rgba(0,0,0,0.10)", padding: "4px 0", zIndex: 3 }}>
          {items.map(it => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              style={{ display: "flex", alignItems: "center", width: "100%", height: 34, padding: "0 12px", border: "none", background: "none", color: it.danger ? C.red : C.black, fontFamily: SANS, fontSize: 13, cursor: "pointer", textAlign: "left" as const }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const textBlock = (label: string, text: string) => !text ? null : (
  <>
    <Lbl>{label}</Lbl>
    <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" as const }}>{text}</p>
  </>
);
const area: any = { width: "100%", minHeight: 72, padding: "8px 10px", border: `1px solid ${C.rule}`, background: C.bg, fontFamily: SANS, fontSize: 16, color: C.black, borderRadius: 2, outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const };
const int = (v: string): number | null => { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return Number.isFinite(n) ? n : null; };

// ═════════════════════════════════════════════════════════════
// TASK WINDOW
// ═════════════════════════════════════════════════════════════
const EMPTY_DRAFT: Partial<Task> = { title: "", account: "both", owner: "creator", phase: "maintain", rhythm: "weekly", stageNum: 1, measure: null, how: "", doneWhen: "", link: "" };

export function TaskWindow({ planner, taskId, draft, monday, isMobile, onClose, openOutreach }: {
  planner: PlannerHook; taskId?: string; draft?: Partial<Task>; monday: string; isMobile: boolean; onClose: () => void; openOutreach?: () => void;
}) {
  const [id, setId]       = useState<string | undefined>(taskId);
  const task              = planner.tasks.find(t => t.id === id);
  const [edit, setEdit]   = useState(!taskId);
  const [f, setF]         = useState<Partial<Task>>(task || { ...EMPTY_DRAFT, ...draft });
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  useEffect(() => { if (!edit && task) setF(task); }, [task, edit]);

  // a task that was deleted elsewhere closes its window
  useEffect(() => { if (id && !task && !planner.loading) onClose(); }, [id, task, planner.loading]);

  const set = (patch: Partial<Task>) => setF(prev => {
    const n = { ...prev, ...patch };
    // setup and refine are one-time; maintain repeats
    if (patch.phase && patch.phase !== "maintain") n.rhythm = "once";
    if (patch.phase === "maintain" && n.rhythm === "once") n.rhythm = "weekly";
    if (patch.rhythm && patch.rhythm !== "once" && n.phase !== "maintain") n.phase = "maintain";
    if (patch.rhythm === "once" && n.phase === "maintain") n.phase = "setup";
    return n;
  });

  const save = async () => {
    setErr(null);
    if (!String(f.title || "").trim()) { setErr("Give the task a name."); return; }
    setBusy(true);
    try {
      const fields: Partial<Task> = {
        title: f.title, account: f.account, owner: f.owner, phase: f.phase, rhythm: f.rhythm, stageNum: Number(f.stageNum) || 1,
        measure: f.phase === "maintain" ? (f.measure || null) : (task?.measure ?? null),
        how: f.how || "", doneWhen: f.doneWhen || "", link: f.link || "",
      };
      if (task) await planner.updateTask(task.id, fields);
      else { const t = await planner.createTask(fields); setId(t.id); }
      setEdit(false);
    } catch (e: any) { setErr(e?.message || "Couldn't save."); }
    finally { setBusy(false); }
  };
  const del = async () => {
    setAskDelete(false);
    if (!task) return;
    try { await planner.deleteTask(task.id); onClose(); }
    catch (e: any) { setErr(e?.message || "Couldn't delete."); }
  };

  const title = edit ? (task ? "Edit task" : "New task") : (task?.title || "Task");

  return (
    <>
      {askDelete && task && <ConfirmDialog title={`Delete “${task.title}”?`} text="The task and its weekly ticks and numbers are removed." okLabel="Delete" danger onOk={del} onCancel={() => setAskDelete(false)} />}
      <Window title={title} isMobile={isMobile} onClose={() => { if (edit && task) { setEdit(false); setErr(null); } else onClose(); }}
        footer={edit ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <B v="sec" onClick={() => { if (task) { setEdit(false); setErr(null); } else onClose(); }}>Cancel</B>
            <B onClick={save} s={{ opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</B>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <MoreMenu items={[{ label: "Delete task", danger: true, onClick: () => setAskDelete(true) }]} />
            <B onClick={() => { setF(task!); setEdit(true); }}>Edit</B>
          </div>
        )}>
        {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
        {edit ? <TaskForm f={f} set={set} stages={planner.stages} /> : task ? <TaskRead task={task} planner={planner} monday={monday} openOutreach={openOutreach} /> : null}
      </Window>
    </>
  );
}

function TaskRead({ task, planner, monday, openOutreach }: { task: Task; planner: PlannerHook; monday: string; openOutreach?: () => void }) {
  const period = periodOf(task, monday);
  const entry  = planner.entries[entryKey(task.id, period)];
  const st     = planner.stateOf(task, monday);
  const kind   = rowKind(task);
  const ti     = todayIndex(monday);
  const [num, setNum] = useState(st.actual == null ? "" : String(st.actual));
  useEffect(() => { setNum(st.actual == null ? "" : String(st.actual)); }, [st.actual]);
  const quiet = (p: Promise<any>) => p.catch(() => { /* the save toast reports it */ });

  const saveNum = () => {
    const v = num.trim() === "" ? null : int(num);
    if (v === st.actual) return;
    quiet(planner.saveEntry(task.id, period, { actual: v }));
  };
  const periodWord = task.rhythm === "monthly" ? `in ${monthName(period)}` : `in week ${isoWeek(monday)}`;

  // last 4 weeks (this one included) for weekly and daily tasks
  // (the kit handover has no history: it only knows what is waiting now)
  const history = (task.rhythm === "daily" || task.rhythm === "weekly") && task.source !== "kit_waiting"
    ? [-21, -14, -7, 0].map(off => {
        const p = addDays(monday, off);
        const s = planner.stateOf(task, p);
        const value = kind === "number" ? `${s.actual ?? 0}/${s.target ?? "–"}` : kind === "days" ? `${s.daysDone}/7` : s.done ? "✓" : "–";
        return { p, s, value, current: off === 0 };
      })
    : [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
        <span style={microLabel}>{phaseLabel(task.phase)} · {rhythmLabel(task.rhythm)} · {ownerLabel(task.owner)}{task.stageNum > 1 ? ` · Stage ${task.stageNum}` : ""}</span>
        <AccChip acc={task.account} />
      </div>

      {/* ── the work: one control per kind ── */}
      {task.source === "portfolio_total" ? (
        <>
          {bigLine(`${st.actual ?? 0} / ${st.target ?? "–"}`, `${task.measure || "pieces"} posted or in the kit`)}
          <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} s={{ marginTop: 8 }} />
          <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>Counted from your editorial lists in Creator: portfolio pieces set to Posted or In kit. Ticks itself at {st.target}.</p>
        </>
      ) : task.source === "kit_waiting" ? (
        <KitWaitingBlock task={task} planner={planner} />
      ) : (task.source === "ideas" || task.source === "posts" || task.source === "pieces") ? (
        <>
          {bigLine(`${st.actual ?? 0} / ${st.target ?? "–"}`, `${task.measure} in week ${isoWeek(monday)}`)}
          <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} s={{ marginTop: 8 }} />
          <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
            {task.source === "ideas" ? "Counted from Creator: ideas added this week." : task.source === "posts" ? "Counted from Creator: items set to Posted this week." : "Counted from Creator: portfolio pieces set to Posted this week."}
            {" "}{st.target == null ? "Set the target in Plan week." : `Target: ${st.target} (Plan week).`}
          </p>
        </>
      ) : task.rhythm === "once" ? (
        <>
          <Lbl>Status</Lbl>
          <S value={task.status} onChange={(e: any) => quiet(planner.setTaskStatus(task, e.target.value))}>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </S>
          {task.target != null && <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>Goal: {task.target} {task.measure || ""}{task.doneOn && task.status === "done" ? ` · done on ${fmtD(task.doneOn)}` : ""}</p>}
          {task.target == null && task.doneOn && task.status === "done" && <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>Done on {fmtD(task.doneOn)}</p>}
        </>
      ) : task.source === "snapshot" ? (
        <SnapshotBlock task={task} planner={planner} monday={monday} />
      ) : task.source === "following" ? (
        <FollowingBlock task={task} planner={planner} monday={monday} />
      ) : task.source === "outreach" ? (
        <OutreachBlock task={task} planner={planner} monday={monday} openOutreach={openOutreach} />
      ) : kind === "number" ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
            <span style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1 }}>{st.actual ?? 0} / {st.target ?? "–"}</span>
            <span style={microLabel}>{task.measure} {periodWord}</span>
          </div>
          <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} s={{ marginTop: 8 }} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8, alignItems: "end" }}>
            <div><Lbl>So far</Lbl>
              <I inputMode="numeric" value={num} placeholder="0" onChange={(e: any) => setNum(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={saveNum} onKeyDown={(e: any) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            </div>
            <div><Lbl>Target</Lbl>
              <div style={{ height: 36, display: "flex", alignItems: "center", fontSize: 13, color: st.target == null ? C.muted : C.black }}>{st.target == null ? "Set in Plan week" : `${st.target} ${task.measure}`}</div>
            </div>
          </div>
        </>
      ) : kind === "days" ? (
        <>
          <Lbl>Week {isoWeek(monday)} · {st.daysDone} of 7 days</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
            {DAY_SHORT.map((d, i) => {
              const on = st.days[i];
              return (
                <button key={d} onClick={() => { const days = [...st.days]; days[i] = !days[i]; quiet(planner.saveEntry(task.id, period, { days })); }}
                  aria-pressed={on} aria-label={`${d}${on ? ", done" : ""}`}
                  style={{ height: 48, border: `1px solid ${i === ti ? C.black : on ? C.green : C.rule}`, background: on ? C.green : "transparent", color: on ? C.white : C.black, borderRadius: 2, cursor: "pointer", fontFamily: SANS, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, padding: 0 }}>
                  <span style={{ fontSize: TYPE.micro.size, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: on ? C.white : i === ti ? C.black : C.muted }}>{d}</span>
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 14 }}>
          <Tick on={st.done} color={C.green} size={22} label={task.rhythm === "monthly" ? `Done for ${monthName(period)}` : `Done in week ${isoWeek(monday)}`}
            onClick={() => quiet(planner.saveEntry(task.id, period, { done: !st.done }))} />
        </div>
      )}

      {textBlock("How", task.how)}
      {textBlock("Done when", task.doneWhen)}
      {task.link && (
        <>
          <Lbl>Link</Lbl>
          <a href={task.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.black, display: "inline-flex", alignItems: "center", gap: 5, overflowWrap: "anywhere" as const }}><Ico d={IC.link} size={13} />{task.link}</a>
        </>
      )}

      {history.length > 0 && (
        <>
          <Lbl>Last weeks</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 6 }}>
            {history.map(h => {
              const past = !h.current;
              const color = h.s.done ? C.green : past && (kind !== "number" || h.s.target != null) ? C.red : C.black;
              return (
                <div key={h.p} style={{ border: `1px solid ${h.current ? C.black : C.rule}`, borderRadius: 2, padding: "6px 4px", textAlign: "center" as const }}>
                  <div style={{ ...microLabel, color: h.current ? C.black : C.muted }}>W{isoWeek(h.p)}</div>
                  <div style={{ fontSize: 13, marginTop: 2, color }}>{h.value}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Work blocks for tasks whose numbers come from somewhere specific ─
const bigLine = (value: any, unit: string) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14, flexWrap: "wrap" as const }}>
    <span style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1 }}>{value}</span>
    <span style={microLabel}>{unit}</span>
  </div>
);
const targetLine = (target: number | null, unit: string) => (
  <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>{target == null ? "Set the target in Plan week." : `Target: ${target} ${unit} (Plan week)`}</p>
);

// A number field that saves when you leave it (or press Enter)
function NumField({ label, value, onSave, decimal }: { label: string; value: number | null; onSave: (v: number | null) => void; decimal?: boolean }) {
  // German format in the field too: 1.180 · 4,85
  const show = (v: number | null) => (v == null ? "" : decimal
    ? v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString("de-DE"));
  const [t, setT] = useState(show(value));
  useEffect(() => { setT(show(value)); }, [value]);
  const commit = () => {
    const v = t.trim() === "" ? null : decimal ? parseDec(t) : parseIntDe(t);
    if (v !== value) onSave(v);
  };
  return (
    <div><Lbl>{label}</Lbl>
      <I inputMode={decimal ? "decimal" : "numeric"} value={t} placeholder="–" aria-label={label}
        onChange={(e: any) => setT(e.target.value.replace(/[^\d,.]/g, ""))}
        onBlur={commit} onKeyDown={(e: any) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
const grid3: any = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 };
const quietP = (p: Promise<any>) => p.catch(() => { /* the save toast reports it */ });

function FollowingBlock({ task, planner, monday }: { task: Task; planner: PlannerHook; monday: string }) {
  const period = periodOf(task, monday);
  const entry  = planner.entries[entryKey(task.id, period)];
  const st     = planner.stateOf(task, monday);
  const data   = entry?.data || {};
  const num = (v: any): number | null => (v == null || v === "" ? null : Number(v));
  return (
    <>
      {bigLine(`${st.actual ?? 0} / ${st.target ?? "–"}`, `follow-backs in week ${isoWeek(monday)}`)}
      <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} s={{ marginTop: 8 }} />
      <div style={grid3}>
        <NumField label="Followed" value={num(data.followed)} onSave={v => quietP(planner.saveEntry(task.id, period, { data: { ...data, followed: v } }))} />
        <NumField label="Followed back" value={st.actual} onSave={v => quietP(planner.saveEntry(task.id, period, { actual: v }))} />
        <NumField label="Unfollowed" value={num(data.unfollowed)} onSave={v => quietP(planner.saveEntry(task.id, period, { data: { ...data, unfollowed: v } }))} />
      </div>
      {targetLine(st.target, "follow-backs")}
    </>
  );
}

function SnapshotBlock({ task, planner, monday }: { task: Task; planner: PlannerHook; monday: string }) {
  if (task.account === "both") return <p style={{ fontSize: 13, color: C.muted, marginTop: 14 }}>Pick one account for a snapshot task (Edit → Account).</p>;
  const acc  = task.account;
  const sn   = planner.snaps[snapKey(acc, monday)];
  const prev = planner.snaps[snapKey(acc, addDays(monday, -7))];
  const save = (patch: any) => quietP(planner.saveSnapshot(acc, monday, patch));
  const entered = !!sn && (sn.followers != null || sn.views != null || sn.engagement != null);
  const diff = sn?.followers != null && prev?.followers != null ? sn.followers - prev.followers : null;
  return (
    <>
      <Lbl>Week {isoWeek(monday)} · from the account insights</Lbl>
      <div style={grid3}>
        <NumField label="Followers" value={sn?.followers ?? null} onSave={v => save({ followers: v })} />
        <NumField label="Views" value={sn?.views ?? null} onSave={v => save({ views: v })} />
        <NumField label="Engagement %" decimal value={sn?.engagement ?? null} onSave={v => save({ engagement: v })} />
      </div>
      <p style={{ fontSize: 12, margin: "8px 0 0", color: entered ? C.green : C.muted }}>
        {entered ? `Entered ✓${diff != null ? ` · ${diff >= 0 ? "+" : "−"}${fmtInt(Math.abs(diff))} followers since last week` : ""}` : "Not entered yet."}
      </p>
      {prev && <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 0" }}>Last week: {fmtInt(prev.followers)} followers · {fmtInt(prev.views)} views · {fmtPct2(prev.engagement)}</p>}
    </>
  );
}

function OutreachBlock({ task, planner, monday, openOutreach }: { task: Task; planner: PlannerHook; monday: string; openOutreach?: () => void }) {
  const period = periodOf(task, monday);
  const st     = planner.stateOf(task, monday);
  const list   = planner.newContacts(period);
  const byCat  = OUTREACH_CATEGORIES.map(c => ({ c, n: list.filter(x => x.category === c.key).length })).filter(x => x.n);
  const byTier = OUTREACH_TIERS.map(t => ({ t, n: list.filter(x => x.tier === t.key).length })).filter(x => x.n);
  return (
    <>
      {bigLine(`${st.actual ?? 0} / ${st.target ?? "–"}`, `new contacts in week ${isoWeek(monday)}`)}
      <Bar value={st.actual ?? 0} max={st.target ?? 0} done={st.done} s={{ marginTop: 8 }} />
      {byCat.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, marginTop: 10 }}>{byCat.map(x => <CountChip key={x.c.key} label={x.c.label} n={x.n} look={x.c} />)}</div>}
      {byTier.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap" as const, alignItems: "center", marginTop: 6 }}><span style={microLabel}>Tiers</span>{byTier.map(x => <CountChip key={x.t.key} label={x.t.label} n={x.n} />)}</div>}
      <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0", lineHeight: 1.5 }}>Counted from Outreach: contacts added this week. {st.target == null ? "Set the target in Plan week." : `Target: ${st.target} contacts (Plan week).`}</p>
      {planner.outreachError && <p style={{ fontSize: 12, color: C.red, margin: "4px 0 0" }}>Outreach couldn't be read ({planner.outreachError}).</p>}
      {openOutreach && <B v="sec" onClick={openOutreach} s={{ ...BAR_BTN, height: 28, minHeight: 28, color: C.black, marginTop: 10, gap: 5 }}><Ico d={IC.link} size={12} />Open Outreach</B>}
    </>
  );
}

// Pieces posted but not yet in the media kits / pitch deck: one tap each
function KitWaitingBlock({ task, planner }: { task: Task; planner: PlannerHook }) {
  const accs = taskAccounts(task);
  const list = planner.waiting.filter(i => accs.includes(i.account));
  return (
    <>
      <Lbl>Waiting for the kits · {list.length}</Lbl>
      {list.length === 0 ? (
        <p style={{ fontSize: 13, color: C.green, margin: 0 }}>Nothing waiting ✓</p>
      ) : (
        <div style={{ borderTop: `1px solid ${C.rule}` }}>
          {list.map(it => (
            <div key={it.id} style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                <span style={{ fontSize: 14 }}>{it.title}</span>
                <AccChip acc={it.account} />
              </div>
              <B v="sec" onClick={() => quietP(planner.setItemStatus(it, "in_kit"))} s={{ ...BAR_BTN, height: 28, minHeight: 28, color: C.black, flexShrink: 0 }}>In kit</B>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>Add each piece to the media kit or pitch deck, then tap In kit.</p>
    </>
  );
}

export const FormatChip = ({ f }: { f: string }) => {
  const l = formatLook(f);
  return <span style={{ fontSize: TYPE.micro.size, padding: "1px 7px", borderRadius: 10, border: `1px solid ${l.border}`, background: l.bg, color: l.color, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{l.label}</span>;
};

// ═════════════════════════════════════════════════════════════
// ITEM WINDOW — an idea or an editorial (portfolio piece)
// Status by dropdown right in the read view; Edit → Save → read view
// ═════════════════════════════════════════════════════════════
export function ItemWindow({ planner, itemId, draft, isMobile, onClose }: {
  planner: PlannerHook; itemId?: string; draft?: Partial<Item>; isMobile: boolean; onClose: () => void;
}) {
  const [id, setId]     = useState<string | undefined>(itemId);
  const it              = planner.items.find(x => x.id === id);
  const [edit, setEdit] = useState(!itemId);
  const [f, setF]       = useState<Partial<Item>>(it || draft || {});
  const [err, setErr]   = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  useEffect(() => { if (!edit && it) setF(it); }, [it, edit]);
  useEffect(() => { if (id && !it && !planner.loading) onClose(); }, [id, it, planner.loading]);

  const isEditorial = (it?.list || f.list) === "editorial";
  const kind = isEditorial ? "Editorial" : "Idea";
  const save = async () => {
    setErr(null);
    if (!String(f.title || "").trim()) { setErr(`Give the ${kind.toLowerCase()} a name.`); return; }
    setBusy(true);
    try {
      const fields: Partial<Item> = {
        title: f.title, account: f.account, list: f.list, format: f.format || "", plannedOn: f.plannedOn || null,
        direction: f.direction || "", portfolio: !!f.portfolio, link: f.link || "", views: f.views ?? null,
      };
      if (it) {
        // a planned date on an idea makes it Planned
        if (fields.plannedOn && it.status === "idea") fields.status = "planned";
        await planner.updateItem(it.id, fields);
      } else {
        const n = await planner.createItem({ ...fields, status: fields.plannedOn ? "planned" : "idea" });
        setId(n.id);
      }
      setEdit(false);
    } catch (e: any) { setErr(e?.message || "Couldn't save."); }
    finally { setBusy(false); }
  };
  const del = async () => {
    setAskDelete(false);
    if (!it) return;
    try { await planner.deleteItem(it.id); onClose(); }
    catch (e: any) { setErr(e?.message || "Couldn't delete."); }
  };
  const acc = (f.account || it?.account || "createbylynn") as Account;
  const formats = [...FORMATS[acc], CLASSIC];

  return (
    <>
      {askDelete && it && <ConfirmDialog title={`Delete “${it.title}”?`} text={`The ${kind.toLowerCase()} is removed from your list.`} okLabel="Delete" danger onOk={del} onCancel={() => setAskDelete(false)} />}
      <Window title={edit ? (it ? `Edit ${kind.toLowerCase()}` : `New ${kind.toLowerCase()}`) : (it?.title || kind)} isMobile={isMobile}
        onClose={() => { if (edit && it) { setEdit(false); setErr(null); } else onClose(); }}
        footer={edit ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <B v="sec" onClick={() => { if (it) { setEdit(false); setErr(null); } else onClose(); }}>Cancel</B>
            <B onClick={save} s={{ opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</B>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <MoreMenu items={[{ label: `Delete ${kind.toLowerCase()}`, danger: true, onClick: () => setAskDelete(true) }]} />
            <B onClick={() => { setF(it!); setEdit(true); }}>Edit</B>
          </div>
        )}>
        {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
        {!edit && it ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
              <span style={microLabel}>{kind}{it.portfolio ? " · portfolio piece" : ""}</span>
              <AccChip acc={it.account} />
              {it.format && <FormatChip f={it.format} />}
            </div>
            <Lbl>Status</Lbl>
            <S value={it.status} onChange={(e: any) => quietP(planner.setItemStatus(it, e.target.value))}>
              {ITEM_STATUSES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </S>
            <p style={{ fontSize: 12, color: C.muted, margin: "6px 0 0" }}>
              {it.postedOn ? `Posted on ${fmtD(it.postedOn)}` : it.plannedOn ? `Planned for ${fmtD(it.plannedOn)}` : "No date yet"}
              {it.portfolio && it.status === "posted" ? " · waiting for the kits" : ""}
              {it.status === "in_kit" ? " · in the kit" : ""}
            </p>
            {textBlock(isEditorial ? "Creative direction" : "Notes", it.direction)}
            {isEditorial && !it.direction && <p style={{ fontSize: 12, color: "#b07a4a", margin: "10px 0 0" }}>No creative direction yet — tap Edit to write it.</p>}
            {it.link && (
              <>
                <Lbl>Post link</Lbl>
                <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.black, display: "inline-flex", alignItems: "center", gap: 5, overflowWrap: "anywhere" as const }}><Ico d={IC.link} size={13} />{it.link}</a>
              </>
            )}
            {it.views != null && textBlock("Views", fmtInt(it.views))}
          </div>
        ) : (
          <div>
            <Lbl>{kind}</Lbl>
            <I value={f.title || ""} onChange={(e: any) => setF({ ...f, title: e.target.value })} placeholder={isEditorial ? "e.g. Golden water editorial" : "e.g. Espresso makeup"} autoFocus={!it} />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
              <div><Lbl>Account</Lbl>
                <S value={acc} onChange={(e: any) => { const a = e.target.value as Account; setF({ ...f, account: a, format: f.format && ![...FORMATS[a], CLASSIC].includes(f.format) ? (isEditorial ? FORMATS[a][0] : CLASSIC) : f.format }); }}>
                  {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </S>
              </div>
              <div><Lbl>Format</Lbl>
                <S value={f.format || CLASSIC} onChange={(e: any) => setF({ ...f, format: e.target.value })}>
                  {formats.map(x => <option key={x} value={x}>{x}</option>)}
                </S>
              </div>
              <div><Lbl>Planned for</Lbl>
                <I type="date" value={f.plannedOn || ""} onChange={(e: any) => setF({ ...f, plannedOn: e.target.value || null })} />
              </div>
              <div><Lbl>Views</Lbl>
                <I inputMode="numeric" value={f.views == null ? "" : String(f.views)} placeholder="–" onChange={(e: any) => setF({ ...f, views: parseIntDe(e.target.value) })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Tick on={!!f.portfolio} color={C.green} label="Portfolio piece (counts toward the first set)" onClick={() => setF({ ...f, portfolio: !f.portfolio })} />
            </div>
            <Lbl>{isEditorial ? "Creative direction" : "Notes"}</Lbl>
            <textarea value={f.direction || ""} onChange={(e) => setF({ ...f, direction: e.target.value })} style={{ ...area, minHeight: isEditorial ? 110 : 72 }}
              placeholder={isEditorial ? "Mood, look, products, shots" : ""} />
            <Lbl>Post link</Lbl>
            <I value={f.link || ""} onChange={(e: any) => setF({ ...f, link: e.target.value })} placeholder="https://" inputMode="url" />
          </div>
        )}
      </Window>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
// NOTE WINDOW — concept, offer or this week's learning
// Linked To-do task (if any) shows its status as a dropdown.
// ═════════════════════════════════════════════════════════════
export function NoteWindow({ planner, acc, kind, period, task, title, action, isMobile, onClose }: {
  planner: PlannerHook; acc: Account; kind: NoteKind; period: string | null; task?: Task; title: string;
  action?: { label: string; onClick: () => void }; isMobile: boolean; onClose: () => void;
}) {
  const note = planner.noteOf(acc, kind, period);
  const empty = !note || (!note.body && !note.title);
  const [edit, setEdit] = useState(empty);
  const [f, setF]       = useState({ title: note?.title || "", body: note?.body || "" });
  const [err, setErr]   = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!edit) setF({ title: note?.title || "", body: note?.body || "" }); }, [note, edit]);
  const isLearning = kind === "learning";

  const save = async () => {
    setErr(null); setBusy(true);
    try { await planner.saveNote(acc, kind, period, isLearning ? { title: f.title, body: f.body } : { body: f.body }); setEdit(false); }
    catch (e: any) { setErr(e?.message || "Couldn't save."); }
    finally { setBusy(false); }
  };

  return (
    <Window title={title} isMobile={isMobile} onClose={() => { if (edit && !empty) { setEdit(false); setErr(null); } else onClose(); }}
      footer={edit ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <B v="sec" onClick={() => { if (!empty) { setEdit(false); setErr(null); } else onClose(); }}>Cancel</B>
          <B onClick={save} s={{ opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</B>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          {action ? <B v="sec" onClick={action.onClick} s={{ gap: 5 }}><Ico d={IC.link} size={12} />{action.label}</B> : <span />}
          <B onClick={() => setEdit(true)}>Edit</B>
        </div>
      )}>
      {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
      <AccChip acc={acc} />
      {edit ? (
        <div>
          {isLearning && (
            <>
              <Lbl>Top post</Lbl>
              <I value={f.title} onChange={(e: any) => setF({ ...f, title: e.target.value })} placeholder="e.g. Lip liner that stays put · 8.420 views" />
            </>
          )}
          <Lbl>{isLearning ? "One learning" : kind === "offer" ? "What this account sells" : "Concept"}</Lbl>
          <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ ...area, minHeight: isLearning ? 72 : 140 }} autoFocus />
        </div>
      ) : (
        <div>
          {isLearning && textBlock("Top post", note?.title || "")}
          {textBlock(isLearning ? "Learning" : kind === "offer" ? "What this account sells" : "Concept", note?.body || "")}
        </div>
      )}
      {task && (
        <>
          <Lbl>{task.title} · To-do</Lbl>
          <S value={task.status} onChange={(e: any) => quietP(planner.setTaskStatus(task, e.target.value))}>
            {STATUSES.map(x => <option key={x.key} value={x.key}>{task.phase === "refine" && x.key === "done" ? "Settled" : x.label}</option>)}
          </S>
        </>
      )}
    </Window>
  );
}

function TaskForm({ f, set, stages }: { f: Partial<Task>; set: (p: Partial<Task>) => void; stages: Stage[] }) {
  const stageNames = (n: number) => stages.find(s => s.num === n)?.shortName || STAGE_SHORT[n - 1];
  return (
    <div>
      <Lbl>Task</Lbl>
      <I value={f.title || ""} onChange={(e: any) => set({ title: e.target.value })} placeholder="What needs doing" autoFocus={!f.id} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
        <div><Lbl>Account</Lbl>
          <S value={f.account} onChange={(e: any) => set({ account: e.target.value as TaskAccount })}>
            <option value="both">Both</option>
            {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </S>
        </div>
        <div><Lbl>Who</Lbl>
          <S value={f.owner} onChange={(e: any) => set({ owner: e.target.value })}>
            {OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </S>
        </div>
        <div><Lbl>Phase</Lbl>
          <S value={f.phase} onChange={(e: any) => set({ phase: e.target.value as Phase })}>
            {PHASES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </S>
        </div>
        <div><Lbl>Rhythm</Lbl>
          <S value={f.rhythm} onChange={(e: any) => set({ rhythm: e.target.value as Rhythm })}>
            {RHYTHMS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </S>
        </div>
        <div><Lbl>Stage</Lbl>
          <S value={String(f.stageNum || 1)} onChange={(e: any) => set({ stageNum: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {stageNames(n)}</option>)}
          </S>
        </div>
        {f.phase === "maintain" && (
          <div><Lbl>Counted in</Lbl>
            <I value={f.measure || ""} onChange={(e: any) => set({ measure: e.target.value })} placeholder="e.g. posts" />
          </div>
        )}
      </div>
      {f.phase === "maintain" && <p style={{ fontSize: 11, color: C.light, margin: "4px 0 0", lineHeight: 1.4 }}>With a unit it's a number row with a weekly target. Empty: a tick.</p>}
      <Lbl>How</Lbl>
      <textarea value={f.how || ""} onChange={(e) => set({ how: e.target.value })} style={area} />
      <Lbl>Done when</Lbl>
      <textarea value={f.doneWhen || ""} onChange={(e) => set({ doneWhen: e.target.value })} style={{ ...area, minHeight: 52 }} />
      <Lbl>Link</Lbl>
      <I value={f.link || ""} onChange={(e: any) => set({ link: e.target.value })} placeholder="https://" inputMode="url" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// PLAN WEEK — this week's numbers (set at the check-in)
// ═════════════════════════════════════════════════════════════
export function PlanWeekWindow({ planner, monday, isMobile, onClose }: { planner: PlannerHook; monday: string; isMobile: boolean; onClose: () => void }) {
  const rows = useMemo(() => planner.tasks
    .filter(t => t.phase === "maintain" && rowKind(t) === "number" && isVisible(t, planner.stages, "all"))
    .sort(byOrder), [planner.tasks, planner.stages]);
  const current = (t: Task) => planner.entries[entryKey(t.id, periodOf(t, monday))]?.target ?? null;
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    rows.forEach(t => { const c = current(t); v[t.id] = c == null ? "" : String(c); });
    return v;
  });
  const [err, setErr]   = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const copyLast = () => {
    const v = { ...vals }; let n = 0;
    rows.forEach(t => {
      const prevPeriod = t.rhythm === "monthly" ? null : addDays(monday, -7);
      const last = prevPeriod ? planner.entries[entryKey(t.id, prevPeriod)]?.target : null;
      if (last != null) { v[t.id] = String(last); n++; }
    });
    setVals(v);
    setNote(n ? `${n} ${n === 1 ? "number" : "numbers"} copied from last week.` : "Last week has no numbers yet.");
  };

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const list = rows
        .map(t => ({ taskId: t.id, period: periodOf(t, monday), target: vals[t.id]?.trim() ? int(vals[t.id]) : null, was: current(t) }))
        .filter(x => x.target !== x.was)
        .map(({ taskId, period, target }) => ({ taskId, period, target }));
      await planner.planTargets(list);
      onClose();
    } catch (e: any) { setErr(e?.message || "Couldn't save."); setBusy(false); }
  };

  const groups = OWNERS.map(o => ({ ...o, list: rows.filter(t => t.owner === o.key) })).filter(g => g.list.length);

  return (
    <Window title={`Plan week ${isoWeek(monday)}`} isMobile={isMobile} onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <B v="sec" onClick={onClose}>Cancel</B>
          <B onClick={save} s={{ opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</B>
        </div>
      }>
      {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={microLabel}>Targets · {weekRange(monday)}</span>
        <B v="sec" onClick={copyLast} s={{ ...BAR_BTN, height: 28, minHeight: 28, flexShrink: 0 }}>Copy last week</B>
      </div>
      {note && <p style={{ fontSize: 12, color: C.muted, margin: "8px 0 0" }}>{note}</p>}
      {rows.length === 0 && <p style={{ fontSize: 13, color: C.muted, marginTop: 16 }}>No tasks with numbers this week.</p>}
      {groups.map(g => (
        <div key={g.key}>
          <div style={{ ...microLabel, marginTop: 14, paddingBottom: 6, borderBottom: `1px solid ${C.rule}` }}>{g.key === "creator" ? "You" : g.label}</div>
          {g.list.map(t => (
            <div key={t.id} style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${C.rule}` }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                <span style={{ fontSize: 14 }}>{t.title}</span>
                <AccChip acc={t.account} />
                <span style={{ fontSize: 11, color: C.muted }}>{t.measure}</span>
              </div>
              <I inputMode="numeric" value={vals[t.id] ?? ""} placeholder="–" aria-label={`Target for ${t.title}`}
                onChange={(e: any) => setVals(v => ({ ...v, [t.id]: e.target.value.replace(/[^\d]/g, "") }))}
                s={{ width: 64, height: 32, textAlign: "right" as const, flexShrink: 0 }} />
            </div>
          ))}
        </div>
      ))}
      <p style={{ fontSize: 11, color: C.light, margin: "10px 0 0" }}>Daily and one-time tasks need no numbers.</p>
    </Window>
  );
}

// ═════════════════════════════════════════════════════════════
// STAGE WINDOW — goal, done-when checklist, Start next stage
// ═════════════════════════════════════════════════════════════
// readOnly: opened from Overview — read the gate, change stages in To-do
export function StageWindow({ planner, stageId, isMobile, onClose, readOnly }: { planner: PlannerHook; stageId: string; isMobile: boolean; onClose: () => void; readOnly?: boolean }) {
  const stage = planner.stages.find(s => s.id === stageId);
  const [edit, setEdit]   = useState(false);
  const [f, setF]         = useState<Partial<Stage>>(stage || {});
  const [err, setErr]     = useState<string | null>(null);
  const [busy, setBusy]   = useState(false);
  const [askStart, setAskStart] = useState(false);
  useEffect(() => { if (!edit && stage) setF(stage); }, [stage, edit]);
  if (!stage) return null;

  const mine = planner.stages.filter(s => s.account === stage.account);
  const next = mine.find(s => s.num === stage.num + 1);
  const gate = gateOf(stage, planner.tasks, planner.doneOf);
  const isCurrent = stageNumOf(planner.stages, stage.account) === stage.num && stage.status !== "done";
  const canStart = isCurrent && !!next && gate.ready;

  const save = async () => {
    setErr(null);
    if (!String(f.name || "").trim()) { setErr("Give the stage a name."); return; }
    setBusy(true);
    try {
      await planner.updateStage(stage.id, { name: f.name, goal: f.goal || "", doneWhen: f.doneWhen || "", ...(stage.num === 2 ? { sprintWeeks: f.sprintWeeks ? Number(f.sprintWeeks) : null } : {}) });
      setEdit(false);
    } catch (e: any) { setErr(e?.message || "Couldn't save."); }
    finally { setBusy(false); }
  };
  const start = async () => {
    setAskStart(false);
    try { await planner.startNextStage(stage); onClose(); }
    catch (e: any) { setErr(e?.message || "Couldn't start the next stage."); }
  };

  return (
    <>
      {askStart && next && <ConfirmDialog title={`Start Stage ${next.num} · ${next.name}?`} text={`Stage ${stage.num} is marked done for ${accLook(stage.account).label}. Its maintain tasks keep running.`} okLabel={`Start Stage ${next.num}`} onOk={start} onCancel={() => setAskStart(false)} />}
      <Window title={`Stage ${stage.num} · ${stage.name}`} isMobile={isMobile} onClose={() => { if (edit) { setEdit(false); setErr(null); } else onClose(); }}
        footer={readOnly ? (
          <p style={{ fontSize: 12, color: C.muted, margin: 0, textAlign: "right" as const }}>{canStart ? `Ready · start Stage ${next!.num} in To-do` : "Tick tasks off in To-do"}</p>
        ) : edit ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <B v="sec" onClick={() => { setEdit(false); setErr(null); }}>Cancel</B>
            <B onClick={save} s={{ opacity: busy ? 0.5 : 1 }}>{busy ? "Saving…" : "Save"}</B>
          </div>
        ) : canStart ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
            <MoreMenu items={[{ label: "Edit stage", onClick: () => setEdit(true) }]} />
            <B onClick={() => setAskStart(true)}>Start Stage {next!.num}</B>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <B onClick={() => setEdit(true)}>Edit</B>
          </div>
        )}>
        {err && <p style={{ fontSize: TYPE.label.size, color: C.red, margin: "0 0 8px" }}>{err}</p>}
        <AccChip acc={stage.account} />
        <StageTrack stages={mine} current={isCurrent ? stage : undefined} progress={gate.total ? gate.done / gate.total : 0} />
        {edit ? (
          <div>
            <Lbl>Name</Lbl>
            <I value={f.name || ""} onChange={(e: any) => setF({ ...f, name: e.target.value })} />
            <Lbl>Goal</Lbl>
            <textarea value={f.goal || ""} onChange={(e) => setF({ ...f, goal: e.target.value })} style={area} />
            <Lbl>Done when · extra notes</Lbl>
            <textarea value={f.doneWhen || ""} onChange={(e) => setF({ ...f, doneWhen: e.target.value })} style={{ ...area, minHeight: 52 }} placeholder="e.g. numbers you want to reach first" />
            {stage.num === 2 && (
              <>
                <Lbl>Sprint length (weeks)</Lbl>
                <I inputMode="numeric" value={f.sprintWeeks == null ? "" : String(f.sprintWeeks)} onChange={(e: any) => setF({ ...f, sprintWeeks: int(e.target.value) })} s={{ width: 90 }} />
              </>
            )}
          </div>
        ) : (
          <div>
            {textBlock("Goal", stage.goal)}
            {stage.num === 2 && stage.sprintWeeks != null && textBlock("Sprints", `${stage.sprintWeeks} ${stage.sprintWeeks === 1 ? "week" : "weeks"} each`)}
            {textBlock("Notes", stage.doneWhen)}
            <Lbl>Done when · {gate.done} of {gate.total}</Lbl>
            {gate.total === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>No setup or refine tasks for this stage yet. Add them with + Task (Phase: Setup or Refine, Stage {stage.num}).</p>
            ) : (
              <div style={{ borderTop: `1px solid ${C.rule}` }}>
                {gate.items.map(t => (
                  <div key={t.id} style={{ minHeight: 36, display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${C.rule}`, fontSize: 14 }}>
                    <Box on={planner.doneOf(t)} />
                    <span style={{ flex: 1, minWidth: 0, color: planner.doneOf(t) ? C.muted : C.black }}>{t.title}</span>
                    {taskAccounts(t).length > 1 && <AccChip acc="both" />}
                    <span style={{ ...microLabel, flexShrink: 0 }}>{t.status === "in_progress" ? "In progress" : phaseLabel(t.phase)}</span>
                  </div>
                ))}
              </div>
            )}
            {stage.status === "done" && stage.doneOn && <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>Done on {fmtD(stage.doneOn)}.</p>}
            {canStart && <p style={{ fontSize: 12, color: C.green, margin: "10px 0 0" }}>Everything is ticked. Start Stage {next!.num} · {next!.name} when you're ready.</p>}
            {isCurrent && !gate.ready && next && <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>{readOnly ? `When all are ticked, Stage ${next.num} can begin from To-do.` : `When all are ticked, Start Stage ${next.num} appears here.`}</p>}
          </div>
        )}
      </Window>
    </>
  );
}

