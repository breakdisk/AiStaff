"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock, CheckCircle, AlertTriangle, Plus, Bell,
  Calendar, Flame, Trash2, Loader2,
} from "lucide-react";
import {
  fetchReminders,
  createReminder,
  deleteReminder,
  type ReminderRow,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diff = new Date(isoString).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60_000);
  const hrs  = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);

  if (diff < -60_000)  return hrs > 0 ? `${days > 0 ? `${days}d ` : ""}${hrs % 24}h overdue` : `${mins}m overdue`;
  if (diff < 60_000)   return "Due now";
  if (hrs < 1)         return `in ${mins}m`;
  if (hrs < 24)        return `in ${hrs}h`;
  if (days === 1)      return `tomorrow ${new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `in ${days} days`;
}

function isDueSoon(isoString: string): boolean {
  const diff = new Date(isoString).getTime() - Date.now();
  return diff > 0 && diff < 3_600_000; // within 1 hour
}

// ── Add Reminder Form ─────────────────────────────────────────────────────────

function AddReminderForm({ onCreated }: { onCreated: (r: ReminderRow) => void }) {
  const [title,   setTitle]   = useState("");
  const [date,    setDate]    = useState("");
  const [hours,   setHours]   = useState(9);
  const [minutes, setMinutes] = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSaving(true);
    setError(null);
    try {
      const reminder = await createReminder(title.trim(), date, hours, minutes);
      onCreated(reminder);
      setTitle("");
      setDate("");
      setHours(9);
      setMinutes(0);
    } catch {
      setError("Failed to save reminder. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-zinc-800 rounded-[2px] p-3 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Plus className="w-3.5 h-3.5 text-amber-400" />
        <span className="font-mono text-xs text-zinc-300">Add Reminder</span>
      </div>

      <div>
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
          Title
        </label>
        <input
          className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-2.5 py-1.5
                     font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700
                     placeholder-zinc-700"
          placeholder="e.g. Follow up with client"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
          Date
        </label>
        <input
          type="date"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-2.5 py-1.5
                     font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
            Hour (UTC)
          </label>
          <select
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-2.5 py-1.5
                       font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">
            Minute
          </label>
          <select
            className="w-full bg-zinc-900 border border-zinc-700 rounded-[2px] px-2.5 py-1.5
                       font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="font-mono text-[10px] text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving || !title.trim() || !date}
        className="w-full h-8 rounded-[2px] bg-amber-950 border border-amber-800 text-amber-400
                   font-mono text-xs hover:bg-amber-900 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Add Reminder"}
      </button>
    </form>
  );
}

// ── Reminder List Item ────────────────────────────────────────────────────────

function ReminderItem({
  reminder,
  onDelete,
}: {
  reminder: ReminderRow;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const soon    = isDueSoon(reminder.remind_at);
  const overdue = !reminder.fired && new Date(reminder.remind_at) < new Date();

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteReminder(reminder.id);
      onDelete(reminder.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      className={`flex items-start justify-between gap-2 border rounded-[2px] p-3
        ${reminder.fired
          ? "border-zinc-800 opacity-60"
          : overdue
          ? "border-red-900 bg-red-950/20"
          : soon
          ? "border-amber-900 bg-amber-950/10"
          : "border-zinc-800"}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span className="mt-0.5 flex-shrink-0">
          {reminder.fired
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            : overdue
            ? <Flame className="w-3.5 h-3.5 text-red-400" />
            : soon
            ? <Bell className="w-3.5 h-3.5 text-amber-400" />
            : <Clock className="w-3.5 h-3.5 text-zinc-500" />}
        </span>
        <div className="min-w-0">
          <p className={`font-mono text-xs truncate ${reminder.fired ? "line-through text-zinc-600" : "text-zinc-200"}`}>
            {reminder.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`font-mono text-[10px] ${
              reminder.fired ? "text-zinc-600" : overdue ? "text-red-400" : soon ? "text-amber-400" : "text-zinc-500"
            }`}>
              {reminder.fired ? "Fired" : relativeTime(reminder.remind_at)}
            </span>
            {reminder.source === "system" && (
              <span className="font-mono text-[9px] px-1 py-0.5 bg-zinc-700 text-zinc-400 rounded-[2px]">
                Deployment
              </span>
            )}
            {!reminder.fired && soon && (
              <span className="font-mono text-[9px] px-1 py-0.5 bg-amber-950 text-amber-400 border border-amber-900 rounded-[2px]">
                Due soon
              </span>
            )}
          </div>
        </div>
      </div>

      {reminder.source === "user" && !reminder.fired && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Delete reminder"
          className="flex-shrink-0 p-1 text-zinc-700 hover:text-red-400 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReminders();
      setReminders(data);
    } catch {
      setError("Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCreated(r: ReminderRow) {
    setReminders((prev) => [r, ...prev]);
  }

  function handleDeleted(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }

  const active  = reminders.filter((r) => !r.fired);
  const fired   = reminders.filter((r) => r.fired);
  const slaAlerts = reminders.filter((r) => !r.fired && new Date(r.remind_at) < new Date());

  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-5 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Reminders
          </h1>
        </div>
        <span className="font-mono text-[10px] text-zinc-500">{active.length} active</span>
      </div>

      {/* Overdue banner */}
      {slaAlerts.length > 0 && (
        <div className="border border-red-900 bg-red-950/40 rounded-[2px] px-3 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-mono text-xs text-red-300 font-medium">
              {slaAlerts.length} overdue reminder{slaAlerts.length > 1 ? "s" : ""}
            </p>
            <p className="font-mono text-[10px] text-red-500 mt-0.5">
              Past due — escalation may be required
            </p>
          </div>
        </div>
      )}

      {/* Add form */}
      <AddReminderForm onCreated={handleCreated} />

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-[2px] bg-zinc-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <p className="font-mono text-xs text-red-400">{error}</p>
      )}

      {/* Active reminders */}
      {!loading && !error && active.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Bell className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Upcoming
            </span>
            <span className="font-mono text-[10px] text-zinc-700">({active.length})</span>
          </div>
          {active.map((r) => (
            <ReminderItem key={r.id} reminder={r} onDelete={handleDeleted} />
          ))}
        </div>
      )}

      {/* Fired reminders */}
      {!loading && !error && fired.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
              Completed
            </span>
            <span className="font-mono text-[10px] text-zinc-700">({fired.length})</span>
          </div>
          {fired.map((r) => (
            <ReminderItem key={r.id} reminder={r} onDelete={handleDeleted} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && reminders.length === 0 && (
        <p className="font-mono text-xs text-zinc-400 px-1">No reminders. Add one above.</p>
      )}
    </main>
  );
}
