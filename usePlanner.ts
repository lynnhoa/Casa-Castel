// ─────────────────────────────────────────────────────────────
// usePlanner — the Planner's data (tables planner_stages,
// planner_tasks, planner_entries, planner_snapshots, planner_items,
// planner_notes) plus new Outreach contacts per week. Rows that
// count themselves (contacts, ideas, posts, pieces, first set,
// kit handover) read from here.
// Ticks and numbers save right away; the app-wide toast shows
// Saving… / Saved ✓, and a failed save reloads what is stored.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./useSupabase";
import { registerReloader } from "./saveStatus";
import { today, monthStart, ymd } from "./formatters";
import { addDays, entryKey, snapKey, mondayOf, periodOf, rowState, taskAccounts, NO_DAYS } from "./planner";
import type { Stage, Task, Entry, TaskStatus, Snapshot, Account, Item, ItemStatus, Note, NoteKind, Auto } from "./planner";

// a new Outreach contact, as far as the Planner needs it
export interface NewContact { id: string; category: string; tier: string; week: string; }

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

const rowToSnap = (r: any): Snapshot => ({
  id:         r.id,
  account:    r.account,
  weekStart:  String(r.week_start).slice(0, 10),
  followers:  r.followers ?? null,
  views:      r.views ?? null,
  engagement: r.engagement == null ? null : Number(r.engagement),
});

const rowToItem = (r: any): Item => ({
  id:          r.id,
  account:     r.account,
  list:        r.list,
  title:       r.title ?? "",
  format:      r.format ?? "",
  status:      r.status ?? "idea",
  plannedOn:   r.planned_on ? String(r.planned_on).slice(0, 10) : null,
  postedOn:    r.posted_on ? String(r.posted_on).slice(0, 10) : null,
  direction:   r.direction ?? "",
  portfolio:   !!r.portfolio,
  link:        r.link ?? "",
  views:       r.views ?? null,
  sort:        Number(r.sort) || 0,
  createdAt:   r.created_at ?? "",
  createdWeek: mondayOf(ymd(r.created_at ? new Date(r.created_at) : new Date())),
});
const itemToRow = (p: Partial<Item>) => {
  const row: any = {};
  if (p.account   !== undefined) row.account    = p.account;
  if (p.list      !== undefined) row.list       = p.list;
  if (p.title     !== undefined) row.title      = p.title.trim();
  if (p.format    !== undefined) row.format     = p.format;
  if (p.status    !== undefined) row.status     = p.status;
  if (p.plannedOn !== undefined) row.planned_on = p.plannedOn || null;
  if (p.postedOn  !== undefined) row.posted_on  = p.postedOn || null;
  if (p.direction !== undefined) row.direction  = p.direction;
  if (p.portfolio !== undefined) row.portfolio  = p.portfolio;
  if (p.link      !== undefined) row.link       = p.link.trim();
  if (p.views     !== undefined) row.views      = p.views;
  return row;
};
const rowToNote = (r: any): Note => ({
  id: r.id, account: r.account, kind: r.kind, periodStart: r.period_start ? String(r.period_start).slice(0, 10) : null,
  title: r.title ?? "", body: r.body ?? "", link: r.link ?? "",
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

export type EntryPatch = Partial<Pick<Entry, "target" | "actual" | "days" | "done" | "note" | "data">>;

export function usePlanner(userId: string | null, monday: string) {
  const [stages,    setStages]    = useState<Stage[]>([]);
  const [tasks,     setTasks]     = useState<Task[]>([]);
  const [entries,   setEntries]   = useState<Record<string, Entry>>({});
  const [snaps,     setSnaps]     = useState<Record<string, Snapshot>>({});
  const [contacts,  setContacts]  = useState<NewContact[]>([]);
  const [items,     setItems]     = useState<Item[]>([]);
  const [notes,     setNotes]     = useState<Note[]>([]);
  const [outreachError, setOutreachError] = useState<string | null>(null);
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
    if (!userId) { setEntries({}); setSnaps({}); return; }
    const [res, sn]: any[] = await Promise.all([
      supabase.from("planner_entries").select("*").eq("user_id", userId).gte("period_start", from).lte("period_start", monday),
      // snapshots: 6 weeks back + 1 (the Overview's trend and "vs last week")
      supabase.from("planner_snapshots").select("*").eq("user_id", userId).gte("week_start", addDays(monday, -42) < addDays(from, -7) ? addDays(monday, -42) : addDays(from, -7)).lte("week_start", monday),
    ]);
    const err = res?.error || sn?.error;
    if (err) { setLoadError(isMissing(err.message) ? MISSING : err.message); return; }
    const m: Record<string, Entry> = {};
    (res?.data || []).forEach((r: any) => { const e = rowToEntry(r); m[entryKey(e.taskId, e.periodStart)] = e; });
    setEntries(m);
    const k: Record<string, Snapshot> = {};
    (sn?.data || []).forEach((r: any) => { const x = rowToSnap(r); k[snapKey(x.account, x.weekStart)] = x; });
    setSnaps(k);
  }, [userId, from, monday]);

  // Creator lists and notes, plus new Outreach contacts (per week)
  const loadOutside = useCallback(async () => {
    if (!userId) { setContacts([]); setItems([]); setNotes([]); return; }
    const since = new Date(`${from}T00:00:00`).toISOString();
    const [oc, it, nt]: any[] = await Promise.all([
      supabase.from("outreach_contacts").select("id, category, tier, created_at").eq("user_id", userId).gte("created_at", since),
      supabase.from("planner_items").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("planner_notes").select("*").eq("user_id", userId),
    ]);
    if (oc?.error) setOutreachError(oc.error.message);
    else {
      setOutreachError(null);
      setContacts((oc?.data || []).map((r: any) => ({ id: r.id, category: r.category || "others", tier: r.tier || "now", week: mondayOf(ymd(new Date(r.created_at))) })));
    }
    const err = it?.error || nt?.error;
    if (err) setLoadError(isMissing(err.message) ? MISSING : err.message);
    else {
      setItems((it?.data || []).map(rowToItem));
      setNotes((nt?.data || []).map(rowToNote));
    }
  }, [userId, from]);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  useEffect(() => { loadOutside(); }, [loadOutside]);
  useEffect(() => registerReloader(() => { loadBase(); loadEntries(); loadOutside(); }), [loadBase, loadEntries, loadOutside]);

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
    if ("data"   in patch) row.data   = patch.data;
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

  // ── account snapshot (followers, views, engagement) ────────
  const snapsRef = useRef(snaps); snapsRef.current = snaps;
  const saveSnapshot = useCallback(async (acc: Account, week: string, patch: Partial<Pick<Snapshot, "followers" | "views" | "engagement">>) => {
    const key = snapKey(acc, week);
    const prev = snapsRef.current[key];
    setSnaps(m => ({ ...m, [key]: { id: prev?.id || "", account: acc, weekStart: week, followers: prev?.followers ?? null, views: prev?.views ?? null, engagement: prev?.engagement ?? null, ...patch } }));
    const row: any = { account: acc, week_start: week };
    if ("followers"  in patch) row.followers  = patch.followers;
    if ("views"      in patch) row.views      = patch.views;
    if ("engagement" in patch) row.engagement = patch.engagement;
    const { data, error } = await supabase.from("planner_snapshots").upsert({ user_id: userId, ...row }, { onConflict: "user_id,account,week_start" }).select().single();
    fail(error);
    if (data) setSnaps(m => ({ ...m, [key]: rowToSnap(data) }));
  }, [userId]);

  // ── Creator lists ───────────────────────────────────────────
  const itemsRef = useRef(items); itemsRef.current = items;
  const createItem = useCallback(async (fields: Partial<Item>): Promise<Item> => {
    const { data, error } = await supabase.from("planner_items").insert(itemToRow(fields)).select().single();
    fail(error);
    const it = rowToItem(data);
    setItems(prev => [...prev, it]);
    return it;
  }, []);
  const updateItem = useCallback(async (id: string, patch: Partial<Item>) => {
    setItems(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("planner_items").update(itemToRow(patch)).eq("id", id).eq("user_id", userId);
    fail(error);
  }, [userId]);
  // Posted / In kit get today's date (once); back to idea, planned or shot clears it
  const setItemStatus = useCallback(async (it: Item, status: ItemStatus) => {
    const posted = status === "posted" || status === "in_kit";
    const postedOn = posted ? (it.postedOn || today()) : null;
    await updateItem(it.id, { status, postedOn });
  }, [updateItem]);
  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase.from("planner_items").delete().eq("id", id).eq("user_id", userId);
    fail(error);
    setItems(prev => prev.filter(x => x.id !== id));
  }, [userId]);

  // ── notes: concept, offer, weekly learning (one per account / week) ─
  const notesRef = useRef(notes); notesRef.current = notes;
  const noteOf = useCallback((acc: Account, kind: NoteKind, period: string | null = null) =>
    notes.find(n => n.account === acc && n.kind === kind && (n.periodStart || null) === (period || null)), [notes]);
  const saveNote = useCallback(async (acc: Account, kind: NoteKind, period: string | null, patch: Partial<Pick<Note, "title" | "body" | "link">>) => {
    const prev = notesRef.current.find(n => n.account === acc && n.kind === kind && (n.periodStart || null) === (period || null));
    if (prev) {
      setNotes(m => m.map(n => (n.id === prev.id ? { ...n, ...patch } : n)));
      const { error } = await supabase.from("planner_notes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", prev.id).eq("user_id", userId);
      fail(error);
    } else {
      const { data, error } = await supabase.from("planner_notes").insert({ account: acc, kind, period_start: period, ...patch }).select().single();
      fail(error);
      if (data) setNotes(m => [...m, rowToNote(data)]);
    }
  }, [userId]);

  const waiting = items.filter(i => i.portfolio && i.status === "posted");

  // ── what a row shows: its entry plus what is filled in elsewhere ─
  const newContacts = useCallback((week: string) => contacts.filter(c => c.week === week), [contacts]);
  const autoOf = useCallback((t: Task, period: string): Auto | undefined => {
    const accs = taskAccounts(t);
    const mine = items.filter(i => accs.includes(i.account));
    const inWeek = (d: string | null) => !!d && d >= period && d <= addDays(period, 6);
    switch (t.source) {
      case "outreach": return { actual: contacts.filter(c => c.week === period).length };
      case "snapshot": {
        const sn = t.account === "both" ? null : snaps[snapKey(t.account, period)];
        return { done: !!sn && (sn.followers != null || sn.views != null || sn.engagement != null) };
      }
      case "ideas":  return { actual: mine.filter(i => i.list === "idea" && i.createdWeek === period).length };
      case "posts":  return { actual: mine.filter(i => (i.status === "posted" || i.status === "in_kit") && inWeek(i.postedOn)).length };
      case "pieces": return { actual: mine.filter(i => i.portfolio && (i.status === "posted" || i.status === "in_kit") && inWeek(i.postedOn)).length };
      case "portfolio_total": {
        const n = mine.filter(i => i.portfolio && (i.status === "posted" || i.status === "in_kit")).length;
        return { actual: n, target: t.target, done: t.target != null && n >= t.target };
      }
      case "kit_waiting": {
        const n = mine.filter(i => i.portfolio && i.status === "posted").length;
        return { actual: n, done: n === 0 };
      }
    }
    return undefined;
  }, [contacts, snaps, items]);
  const stateOf = useCallback((t: Task, monday_: string) => {
    const period = periodOf(t, monday_);
    return rowState(t, entries[entryKey(t.id, period)], autoOf(t, period));
  }, [entries, autoOf]);
  // done for stage gates (one-time tasks; the first set counts itself)
  const doneOf = useCallback((t: Task) => stateOf(t, monday).done, [stateOf, monday]);

  const reload = useCallback(() => { loadBase(); loadEntries(); loadOutside(); }, [loadBase, loadEntries, loadOutside]);

  return {
    stages, tasks, entries, snaps, items, notes, waiting, loading, loadError, outreachError, reload,
    setTaskStatus, updateTask, createTask, deleteTask,
    saveEntry, planTargets, updateStage, startNextStage,
    saveSnapshot, newContacts, autoOf, stateOf, doneOf,
    createItem, updateItem, setItemStatus, deleteItem, noteOf, saveNote,
  };
}

export type PlannerHook = ReturnType<typeof usePlanner>;
