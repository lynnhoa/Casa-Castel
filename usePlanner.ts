// ─────────────────────────────────────────────────────────────
// usePlanner — the Planner's data (tables planner_stages,
// planner_tasks, planner_entries). Ticks and numbers save right
// away; the app-wide toast shows Saving… / Saved ✓, and a failed
// save reloads what is really stored.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./useSupabase";
import { registerReloader } from "./saveStatus";
import { today, monthStart } from "./formatters";
import { addDays, entryKey, NO_DAYS } from "./planner";
import type { Stage, Task, Entry, TaskStatus } from "./planner";

const rowToStage = (r: any): Stage => ({
  id:          r.id,
  account:     r.account,
  num:         Number(r.num) || 1,
  shortName:   r.short_name ?? "",
  name:        r.name ?? "",
  goal:        r.goal ?? "",
  doneWhen:    r.done_when ?? "",
  status:      r.status ?? "upcoming",
  sprintWeeks: r.sprint_weeks ?? null,
  startedOn:   r.started_on ?? null,
  doneOn:      r.done_on ?? null,
});

const rowToTask = (r: any): Task => ({
  id:       r.id,
  account:  r.account,
  stageNum: Number(r.stage_num) || 1,
  phase:    r.phase,
  owner:    r.owner,
  rhythm:   r.rhythm,
  area:     r.area ?? "other",
  title:    r.title ?? "",
  how:      r.how ?? "",
  doneWhen: r.done_when ?? "",
  measure:  r.measure || null,
  source:   r.source ?? "manual",
  target:   r.target ?? null,
  link:     r.link ?? "",
  status:   r.status ?? "open",
  doneOn:   r.done_on ?? null,
  sort:     Number(r.sort) || 0,
  active:   r.active !== false,
});

const rowToEntry = (r: any): Entry => ({
  id:          r.id,
  taskId:      r.task_id,
  periodStart: String(r.period_start).slice(0, 10),
  target:      r.target ?? null,
  actual:      r.actual ?? null,
  days:        Array.isArray(r.days) && r.days.length === 7 ? r.days.map(Boolean) : NO_DAYS,
  done:        !!r.done,
  data:        r.data || {},
  note:        r.note ?? "",
});

// Only the fields that are set go to the database
const taskToRow = (p: Partial<Task>) => {
  const row: any = {};
  if (p.account  !== undefined) row.account   = p.account;
  if (p.stageNum !== undefined) row.stage_num = p.stageNum;
  if (p.phase    !== undefined) row.phase     = p.phase;
  if (p.owner    !== undefined) row.owner     = p.owner;
  if (p.rhythm   !== undefined) row.rhythm    = p.rhythm;
  if (p.area     !== undefined) row.area      = p.area;
  if (p.title    !== undefined) row.title     = p.title.trim();
  if (p.how      !== undefined) row.how       = p.how;
  if (p.doneWhen !== undefined) row.done_when = p.doneWhen;
  if (p.measure  !== undefined) row.measure   = p.measure ? p.measure.trim() : null;
  if (p.target   !== undefined) row.target    = p.target;
  if (p.link     !== undefined) row.link      = p.link.trim();
  if (p.status   !== undefined) row.status    = p.status;
  if (p.doneOn   !== undefined) row.done_on   = p.doneOn;
  if (p.sort     !== undefined) row.sort      = p.sort;
  if (p.active   !== undefined) row.active    = p.active;
  return row;
};

const MISSING = "The Planner tables don't exist yet — run the Phase 1 SQL in Supabase once.";
const isMissing = (m: string) => /planner_/.test(m || "") && /exist|schema cache|relation/i.test(m || "");
const fail = (error: any) => { if (error) throw new Error(error.message || "Couldn't save."); };

export type EntryPatch = Partial<Pick<Entry, "target" | "actual" | "days" | "done" | "note">>;

export function usePlanner(userId: string | null, monday: string) {
  const [stages,    setStages]    = useState<Stage[]>([]);
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [entries,   setEntries]   = useState<Record<string, Entry>>({});
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const tasksRef   = useRef(tasks);   tasksRef.current   = tasks;
  const stagesRef  = useRef(stages);  stagesRef.current  = stages;
  const entriesRef = useRef(entries); entriesRef.current = entries;

  // entries of this week, the 3 weeks before (history) and this month
  const back = addDays(monday, -21);
  const ms   = monthStart(monday);
  const from = back < ms ? back : ms;

  const loadBase = useCallback(async () => {
    if (!userId) { setStages([]); setTasks([]); setLoading(false); return; }
    const [s, t]: any[] = await Promise.all([
      supabase.from("planner_stages").select("*").eq("user_id", userId).order("account").order("num"),
      supabase.from("planner_tasks").select("*").eq("user_id", userId).order("sort").order("created_at"),
    ]);
    const err = s?.error || t?.error;
    if (err) setLoadError(isMissing(err.message) ? MISSING : err.message);
    else {
      setLoadError(null);
      setStages((s?.data || []).map(rowToStage));
      setTasks((t?.data || []).map(rowToTask));
    }
    setLoading(false);
  }, [userId]);

  const loadEntries = useCallback(async () => {
    if (!userId) { setEntries({}); return; }
    const res: any = await supabase.from("planner_entries").select("*").eq("user_id", userId)
      .gte("period_start", from).lte("period_start", monday);
    if (res?.error) { setLoadError(isMissing(res.error.message) ? MISSING : res.error.message); return; }
    const m: Record<string, Entry> = {};
    (res?.data || []).forEach((r: any) => { const e = rowToEntry(r); m[entryKey(e.taskId, e.periodStart)] = e; });
    setEntries(m);
  }, [userId, from, monday]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => registerReloader(() => { loadBase(); loadEntries(); }), [loadBase, loadEntries]);

  // ── tasks ───────────────────────────────────────────────────
  const setTaskStatus = useCallback(async (t: Task, status: TaskStatus) => {
    const doneOn = status === "done" ? today() : null;
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, status, doneOn } : x)));
    const { error } = await supabase.from("planner_tasks").update({ status, done_on: doneOn }).eq("id", t.id).eq("user_id", userId);
    fail(error);
  }, [userId]);

  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("planner_tasks").update(taskToRow(patch)).eq("id", id).eq("user_id", userId);
    fail(error);
    setTasks(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
  }, [userId]);

  const createTask = useCallback(async (fields: Partial<Task>): Promise<Task> => {
    const sort = tasksRef.current.reduce((m, t) => Math.max(m, t.sort), 0) + 1;
    const { data, error } = await supabase.from("planner_tasks").insert({ ...taskToRow(fields), sort }).select().single();
    fail(error);
    const t = rowToTask(data);
    setTasks(prev => [...prev, t]);
    return t;
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from("planner_tasks").delete().eq("id", id).eq("user_id", userId);
    fail(error);
    setTasks(prev => prev.filter(x => x.id !== id));
    setEntries(prev => {
      const m = { ...prev };
      Object.keys(m).forEach(k => { if (k.startsWith(id + "|")) delete m[k]; });
      return m;
    });
  }, [userId]);

  // ── week entries (ticks, days, numbers) ─────────────────────
  const saveEntry = useCallback(async (taskId: string, period: string, patch: EntryPatch) => {
    const key  = entryKey(taskId, period);
    const prev = entriesRef.current[key];
    const next: Entry = {
      id: prev?.id || "", taskId, periodStart: period,
      target: prev?.target ?? null, actual: prev?.actual ?? null, days: prev?.days || NO_DAYS,
      done: prev?.done ?? false, data: prev?.data || {}, note: prev?.note ?? "",
      ...patch,
    };
    setEntries(m => ({ ...m, [key]: next }));
    const row: any = { task_id: taskId, period_start: period };
    if ("target" in patch) row.target = patch.target;
    if ("actual" in patch) row.actual = patch.actual;
    if ("days"   in patch) row.days   = patch.days;
    if ("done"   in patch) row.done   = patch.done;
    if ("note"   in patch) row.note   = patch.note;
    const { data, error } = await supabase.from("planner_entries").upsert(row, { onConflict: "task_id,period_start" }).select().single();
    fail(error);
    if (data) setEntries(m => ({ ...m, [key]: rowToEntry(data) }));
  }, []);

  // Plan week: this week's targets in one go
  const planTargets = useCallback(async (list: { taskId: string; period: string; target: number | null }[]) => {
    if (!list.length) return;
    const rows = list.map(x => ({ task_id: x.taskId, period_start: x.period, target: x.target }));
    const { data, error } = await supabase.from("planner_entries").upsert(rows, { onConflict: "task_id,period_start" }).select();
    fail(error);
    setEntries(m => {
      const n = { ...m };
      (data || []).forEach((r: any) => { const e = rowToEntry(r); n[entryKey(e.taskId, e.periodStart)] = e; });
      return n;
    });
  }, []);

  // ── stages ──────────────────────────────────────────────────
  const updateStage = useCallback(async (id: string, patch: Partial<Stage>) => {
    const row: any = {};
    if (patch.name        !== undefined) row.name         = patch.name.trim();
    if (patch.goal        !== undefined) row.goal         = patch.goal;
    if (patch.doneWhen    !== undefined) row.done_when    = patch.doneWhen;
    if (patch.sprintWeeks !== undefined) row.sprint_weeks = patch.sprintWeeks;
    const { error } = await supabase.from("planner_stages").update(row).eq("id", id).eq("user_id", userId);
    fail(error);
    setStages(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  }, [userId]);

  const startNextStage = useCallback(async (stage: Stage) => {
    const next = stagesRef.current.find(s => s.account === stage.account && s.num === stage.num + 1);
    const t = today();
    const a = await supabase.from("planner_stages").update({ status: "done", done_on: t }).eq("id", stage.id).eq("user_id", userId);
    fail(a.error);
    if (next) {
      const b = await supabase.from("planner_stages").update({ status: "active", started_on: t }).eq("id", next.id).eq("user_id", userId);
      fail(b.error);
    }
    setStages(prev => prev.map(s =>
      s.id === stage.id ? { ...s, status: "done", doneOn: t } :
      next && s.id === next.id ? { ...s, status: "active", startedOn: t } : s));
  }, [userId]);

  const reload = useCallback(() => { loadBase(); loadEntries(); }, [loadBase, loadEntries]);

  return {
    stages, tasks, entries, loading, loadError, reload,
    setTaskStatus, updateTask, createTask, deleteTask,
    saveEntry, planTargets, updateStage, startNextStage,
  };
}

export type PlannerHook = ReturnType<typeof usePlanner>;
