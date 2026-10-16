// ─────────────────────────────────────────────────────────────
// planner — ONE place for the Planner's names, colours, week
// maths and the rules for when a task counts as done. The To-do
// tab and its windows (and later Overview, Manager and Creator)
// all read from here, so they always agree.
// ─────────────────────────────────────────────────────────────

import { ymd, parseYMD, monthStart, today, fmtD } from "./formatters";

export type Account       = "lynnhoa" | "createbylynn";
export type TaskAccount   = Account | "both";
export type AccountFilter = "all" | Account;
export type Phase         = "setup" | "refine" | "maintain";
export type Owner         = "manager" | "creator" | "both";
export type Rhythm        = "once" | "daily" | "weekly" | "monthly";
export type TaskStatus    = "open" | "in_progress" | "done";
export type StageStatus   = "upcoming" | "active" | "done";

export interface Stage {
  id:          string;
  account:     Account;
  num:         number;           // 1–5
  shortName:   string;           // Setup, Sales, Business, Access, Luxury
  name:        string;           // e.g. Growth, branding and prep
  goal:        string;
  doneWhen:    string;           // extra gate notes
  status:      StageStatus;
  sprintWeeks: number | null;    // Stage 2
  startedOn:   string | null;
  doneOn:      string | null;
}

export interface Task {
  id:        string;
  account:   TaskAccount;
  stageNum:  number;
  phase:     Phase;
  owner:     Owner;
  rhythm:    Rhythm;
  area:      string;
  title:     string;
  how:       string;
  doneWhen:  string;
  measure:   string | null;      // unit of a number row (follow-backs …); empty = a tick
  source:    string;             // where the number will come from (phases 3–4)
  target:    number | null;      // fixed goal of a one-time count (first set = 9)
  link:      string;
  status:    TaskStatus;         // one-time tasks
  doneOn:    string | null;
  sort:      number;
  active:    boolean;
}

export interface Entry {
  id:          string;
  taskId:      string;
  periodStart: string;           // Monday of the week (1st of the month for monthly)
  target:      number | null;    // set in Plan week
  actual:      number | null;
  days:        boolean[];        // Mon–Sun
  done:        boolean;
  data:        any;
  note:        string;
}

// ── Accounts (chip colours match Outreach: Fashion / Beauty) ──
export interface Look { label: string; color: string; bg: string; border: string; }
export const ACCOUNTS: (Look & { key: Account })[] = [
  { key: "lynnhoa",      label: "@lynnhoa",      color: "#6a6aaa", bg: "#f0f0f5", border: "#c8c8e0" },
  { key: "createbylynn", label: "@createbylynn", color: "#a8804f", bg: "#fdf5ee", border: "#e8d8c8" },
];
export const BOTH_LOOK: Look = { label: "Both", color: "#6b655e", bg: "#f3f1ee", border: "#e8e4df" };
export const accLook = (k: TaskAccount): Look => ACCOUNTS.find(a => a.key === k) || BOTH_LOOK;

export const PHASES: { key: Phase; label: string; section: string }[] = [
  { key: "maintain", label: "Maintain", section: "Maintain · this week" },
  { key: "refine",   label: "Refine",   section: "Refine · until settled" },
  { key: "setup",    label: "Setup",    section: "Setup · once" },
];
export const OWNERS: { key: Owner; label: string }[] = [
  { key: "manager", label: "Manager" },
  { key: "creator", label: "You" },
  { key: "both",    label: "Both" },
];
export const RHYTHMS: { key: Rhythm; label: string }[] = [
  { key: "once",    label: "Once" },
  { key: "daily",   label: "Daily" },
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];
export const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "open",        label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "done",        label: "Done" },
];
export const STAGE_SHORT = ["Setup", "Sales", "Business", "Access", "Luxury"];

export const phaseLabel  = (p: Phase)  => PHASES.find(x => x.key === p)?.label || p;
export const ownerLabel  = (o: Owner)  => OWNERS.find(x => x.key === o)?.label || o;
export const rhythmLabel = (r: Rhythm) => RHYTHMS.find(x => x.key === r)?.label || r;

// ── Week maths (local dates, weeks start on Monday) ───────────
export const addDays = (d: string, n: number): string => {
  const dt = parseYMD(d) || new Date();
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
};
export const mondayOf = (d: string): string => {
  const dt = parseYMD(d) || new Date();
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return ymd(dt);
};
export const thisMonday = (): string => mondayOf(today());

// ISO week number (the week with the year's first Thursday is week 1)
export const isoWeek = (d: string): number => {
  const dt = parseYMD(d) || new Date();
  const thu = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const jan4 = new Date(thu.getFullYear(), 0, 4);
  return 1 + Math.round(((thu.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
};

const dayMonth = (d: string) => fmtD(d).slice(0, 6);                                  // "12.10."
export const weekLabel = (monday: string) => `Week ${isoWeek(monday)}`;
export const weekRange = (monday: string) => `${dayMonth(monday)}–${fmtD(addDays(monday, 6))}`;   // 12.10.–18.10.2026
export const monthName = (d: string) => (parseYMD(d) || new Date()).toLocaleString("en-GB", { month: "long" });
export const periodOf  = (t: Task, monday: string) => (t.rhythm === "monthly" ? monthStart(monday) : monday);
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// 0–6 when today lies in this week, otherwise -1
export const todayIndex = (monday: string): number => {
  const a = parseYMD(monday), b = parseYMD(today());
  if (!a || !b) return -1;
  const i = Math.round((b.getTime() - a.getTime()) / 864e5);
  return i >= 0 && i < 7 ? i : -1;
};

// ── Stages ────────────────────────────────────────────────────
export const accountsOf = (f: AccountFilter): Account[] => (f === "all" ? ["lynnhoa", "createbylynn"] : [f]);
export const taskAccounts = (t: { account: TaskAccount }): Account[] => (t.account === "both" ? ["lynnhoa", "createbylynn"] : [t.account]);

// The stage an account is in now (the active one; else the first not done; else the last)
export const stageOf = (stages: Stage[], acc: Account): Stage | undefined => {
  const mine = stages.filter(s => s.account === acc).sort((a, b) => a.num - b.num);
  return mine.find(s => s.status === "active") || mine.find(s => s.status !== "done") || mine[mine.length - 1];
};
export const stageNumOf = (stages: Stage[], acc: Account): number => stageOf(stages, acc)?.num ?? 1;

// Gate: the setup and refine tasks of this stage for this account (shared tasks count for both)
export function gateOf(stage: Stage, tasks: Task[]) {
  const items = tasks
    .filter(t => t.active && t.stageNum === stage.num && t.phase !== "maintain" && (t.account === stage.account || t.account === "both"))
    .sort((a, b) => (a.phase === b.phase ? a.sort - b.sort : a.phase === "setup" ? -1 : 1));
  const done = items.filter(t => t.status === "done").length;
  return { items, done, total: items.length, ready: done === items.length };
}

// ── Which tasks show in To-do ─────────────────────────────────
// Maintain tasks run from their stage on (they keep running later);
// setup and refine tasks show while their stage is the current one.
export function isVisible(t: Task, stages: Stage[], f: AccountFilter): boolean {
  if (!t.active) return false;
  const accs = taskAccounts(t).filter(a => accountsOf(f).includes(a));
  return accs.some(a => {
    const cur = stageNumOf(stages, a);
    return t.phase === "maintain" ? t.stageNum <= cur : t.stageNum === cur;
  });
}

// ── When does a row count as done? ────────────────────────────
// check  → tap the box (one-time tasks, check-in, monthly goal …)
// days   → a tick per day; done when all 7 are ticked
// number → done when this week's number reaches the target
export type RowKind = "check" | "days" | "number";
export const rowKind = (t: Task): RowKind =>
  t.rhythm === "once" ? "check" : t.measure ? "number" : t.rhythm === "daily" ? "days" : "check";

export const NO_DAYS = [false, false, false, false, false, false, false];

export interface RowState { done: boolean; actual: number | null; target: number | null; days: boolean[]; daysDone: number; }
export function rowState(t: Task, e: Entry | undefined): RowState {
  const days = e?.days?.length === 7 ? e.days : NO_DAYS;
  const daysDone = days.filter(Boolean).length;
  const actual = e?.actual ?? null;
  const target = e?.target ?? null;
  const kind = rowKind(t);
  const done =
    kind === "days"   ? daysDone === 7 :
    kind === "number" ? target != null && actual != null && actual >= target :
    t.rhythm === "once" ? t.status === "done" : !!e?.done;
  return { done, actual, target, days, daysDone };
}

export const entryKey = (taskId: string, period: string) => `${taskId}|${period}`;
export const byOrder = (a: Task, b: Task) => a.sort - b.sort;
