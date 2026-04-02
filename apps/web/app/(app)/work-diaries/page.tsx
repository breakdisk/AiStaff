"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Clock, Code2, FileText, MessageSquare,
  Coffee, ChevronDown, ChevronUp, Zap, Plus, X, Check,
  Terminal,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Mood = "productive" | "steady" | "blocked";
type Category = "coding" | "testing" | "docs" | "meetings" | "review" | "break";

interface Session {
  id:         string;
  started_at: string;
  ended_at:   string | null;
  commits:    number;
  files:      number;
  open:       boolean;
}

interface Activity {
  category: Category;
  label:    string;
  hours:    number;
}

interface DiaryEntry {
  id:         string;
  mood:       Mood;
  notes:      string | null;
  ai_summary: string | null;
  activities: Activity[];
}

interface DiaryDay {
  date:     string;
  sessions: Session[];
  totals: {
    minutes:  number;
    commits:  number;
    files:    number;
    messages: string[];
  };
  entry: DiaryEntry | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_MAP: Record<Category, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  coding:   { icon: Code2,         color: "text-sky-400",    bg: "bg-sky-950/30",    label: "Coding"   },
  testing:  { icon: Zap,           color: "text-green-400",  bg: "bg-green-950/30",  label: "Testing"  },
  docs:     { icon: FileText,      color: "text-amber-400",  bg: "bg-amber-950/30",  label: "Docs"     },
  meetings: { icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-950/30", label: "Meetings" },
  review:   { icon: BookOpen,      color: "text-zinc-400",   bg: "bg-zinc-800/40",   label: "Review"   },
  break:    { icon: Coffee,        color: "text-zinc-600",   bg: "bg-zinc-900",      label: "Break"    },
};

const MOOD_MAP: Record<Mood, { label: string; dot: string; text: string; border: string }> = {
  productive: { label: "Productive", dot: "bg-green-400", text: "text-green-400", border: "border-green-800" },
  steady:     { label: "Steady",     dot: "bg-amber-400", text: "text-amber-400", border: "border-amber-800" },
  blocked:    { label: "Blocked",    dot: "bg-red-400",   text: "text-red-400",   border: "border-red-800"   },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return min === 0 ? `${h}h` : `${h}h ${min}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return new Date(dateStr + "T12:00:00").toLocaleDateString([], { weekday: "long" });
}

// ── FinaliseForm ──────────────────────────────────────────────────────────────

function FinaliseForm({
  day,
  onSaved,
}: {
  day: DiaryDay;
  onSaved: () => void;
}) {
  const existing = day.entry;
  const [mood, setMood]       = useState<Mood>(existing?.mood ?? "steady");
  const [notes, setNotes]     = useState(existing?.notes ?? "");
  const [activities, setActivities] = useState<Activity[]>(existing?.activities ?? []);
  const [saving, setSaving]   = useState(false);

  const addActivity = () =>
    setActivities(a => [...a, { category: "meetings", label: "", hours: 0.5 }]);

  const removeActivity = (i: number) =>
    setActivities(a => a.filter((_, idx) => idx !== i));

  const updateActivity = (i: number, patch: Partial<Activity>) =>
    setActivities(a => a.map((act, idx) => idx === i ? { ...act, ...patch } : act));

  const save = async () => {
    setSaving(true);
    await fetch("/api/work-diaries", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ date: day.date, mood, notes, activities }),
    }).catch(() => null);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
      {/* Mood */}
      <div>
        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Mood</p>
        <div className="flex gap-2">
          {(["productive", "steady", "blocked"] as Mood[]).map(m => (
            <button
              key={m}
              onClick={() => setMood(m)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded-sm border font-mono text-[9px] uppercase tracking-widest transition-colors ${
                mood === m
                  ? `${MOOD_MAP[m].border} ${MOOD_MAP[m].text} bg-zinc-900`
                  : "border-zinc-800 text-zinc-600 hover:border-zinc-600"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${mood === m ? MOOD_MAP[m].dot : "bg-zinc-700"}`} />
              {MOOD_MAP[m].label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes for the client — blockers, decisions, context…"
        rows={2}
        className="w-full px-2.5 py-2 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs
                   text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600 resize-none"
      />

      {/* Manual activities */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Non-git activities</p>
          <button
            onClick={addActivity}
            className="flex items-center gap-1 h-5 px-2 rounded-sm border border-zinc-700 text-zinc-500
                       font-mono text-[9px] hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus className="w-2.5 h-2.5" /> Add
          </button>
        </div>
        {activities.map((act, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1">
            <select
              value={act.category}
              onChange={e => updateActivity(i, { category: e.target.value as Category })}
              className="h-7 px-1.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-[9px]
                         text-zinc-400 focus:outline-none focus:border-zinc-600"
            >
              {(Object.keys(CAT_MAP) as Category[]).map(c => (
                <option key={c} value={c}>{CAT_MAP[c].label}</option>
              ))}
            </select>
            <input
              value={act.label}
              onChange={e => updateActivity(i, { label: e.target.value })}
              placeholder="Description…"
              className="flex-1 h-7 px-2 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-[9px]
                         text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
            />
            <input
              type="number" min="0.25" max="24" step="0.25"
              value={act.hours}
              onChange={e => updateActivity(i, { hours: parseFloat(e.target.value) || 0 })}
              className="w-14 h-7 px-2 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-[9px]
                         text-zinc-300 focus:outline-none focus:border-zinc-600 text-right"
            />
            <span className="font-mono text-[9px] text-zinc-700">h</span>
            <button onClick={() => removeActivity(i)} className="text-zinc-700 hover:text-zinc-400 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full h-8 rounded-sm border border-amber-800 bg-amber-950/20 text-amber-400
                   font-mono text-[10px] uppercase tracking-widest hover:border-amber-600 transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {saving
          ? <><span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" /> Saving…</>
          : <><Check className="w-3 h-3" /> Save Day</>}
      </button>
    </div>
  );
}

// ── DiaryCard ─────────────────────────────────────────────────────────────────

function DiaryCard({ day, onSaved }: { day: DiaryDay; onSaved: () => void }) {
  const label    = dayLabel(day.date);
  const isToday  = label === "Today";
  const mood     = day.entry?.mood as Mood | undefined;
  const moodMeta = mood ? MOOD_MAP[mood] : null;

  const [open, setOpen]         = useState(isToday || label === "Yesterday");
  const [editing, setEditing]   = useState(false);

  const totalMins     = day.totals.minutes;
  const manualMins    = (day.entry?.activities ?? []).reduce((s, a) => s + a.hours * 60, 0);
  const grandTotalMin = totalMins + manualMins;

  return (
    <div className={`border rounded-sm overflow-hidden ${
      isToday ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      {/* Header */}
      <div
        role="button" tabIndex={0}
        onClick={() => { setOpen(v => !v); setEditing(false); }}
        onKeyDown={e => e.key === "Enter" && setOpen(v => !v)}
        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-900/30 transition-colors"
      >
        <div className="flex-shrink-0 w-16 text-center">
          <p className={`font-mono text-[10px] uppercase tracking-widest ${isToday ? "text-amber-400" : "text-zinc-500"}`}>
            {label.length > 9 ? label.slice(0, 3) : label}
          </p>
          <p className="font-mono text-[9px] text-zinc-700">{day.date.slice(5)}</p>
        </div>

        <div className="flex-1 min-w-0">
          {day.entry?.notes ? (
            <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-1">{day.entry.notes}</p>
          ) : day.totals.messages.length > 0 ? (
            <p className="font-mono text-[10px] text-zinc-600 leading-relaxed line-clamp-1">
              {day.totals.messages[0]}
            </p>
          ) : (
            <p className="font-mono text-[10px] text-zinc-700 italic">No activity logged</p>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-3">
          {grandTotalMin > 0 && (
            <div className="text-right hidden sm:block">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">Total</p>
              <p className="font-mono text-xs font-medium text-zinc-200 tabular-nums">{fmtMinutes(grandTotalMin)}</p>
            </div>
          )}
          {day.totals.commits > 0 && (
            <div className="text-right hidden sm:block">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">Commits</p>
              <p className="font-mono text-xs font-medium text-zinc-200 tabular-nums">{day.totals.commits}</p>
            </div>
          )}
          {moodMeta && (
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${moodMeta.dot}`} />
              <span className={`font-mono text-[9px] hidden sm:inline ${moodMeta.text}`}>{moodMeta.label}</span>
            </div>
          )}
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />}
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          {/* Git sessions */}
          {day.sessions.length > 0 && (
            <div>
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Git Sessions</p>
              <div className="space-y-1">
                {day.sessions.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-[10px] font-mono">
                    <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                    <span className="text-zinc-400">{fmtTime(s.started_at)}</span>
                    <span className="text-zinc-700">→</span>
                    {s.ended_at
                      ? <span className="text-zinc-400">{fmtTime(s.ended_at)}</span>
                      : <span className="text-amber-500 animate-pulse">open</span>}
                    {s.ended_at && (
                      <span className="text-zinc-600">
                        ({fmtMinutes(Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000))})
                      </span>
                    )}
                    {s.commits > 0 && (
                      <span className="text-zinc-700">· {s.commits} commit{s.commits !== 1 ? "s" : ""} · {s.files} files</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commit messages */}
          {day.totals.messages.length > 0 && (
            <div>
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Commit Messages</p>
              <div className="space-y-0.5">
                {day.totals.messages.slice(0, 5).map((m, i) => (
                  <p key={i} className="font-mono text-[9px] text-zinc-500 truncate">· {m}</p>
                ))}
              </div>
            </div>
          )}

          {/* Manual activities */}
          {(day.entry?.activities ?? []).length > 0 && (
            <div>
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">Manual Activities</p>
              <div className="space-y-1">
                {day.entry!.activities.map((a, i) => {
                  const { icon: Icon, color, bg } = CAT_MAP[a.category as Category] ?? CAT_MAP.meetings;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0 ${bg}`}>
                        <Icon className={`w-2.5 h-2.5 ${color}`} />
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400 flex-1 truncate">{a.label}</span>
                      <span className="font-mono text-[10px] text-zinc-500 tabular-nums">{a.hours}h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Totals bar */}
          {grandTotalMin > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Git Time",   value: fmtMinutes(totalMins),                  color: "text-sky-400"   },
                { label: "Manual",     value: fmtMinutes(manualMins),                 color: "text-purple-400"},
                { label: "Total",      value: fmtMinutes(grandTotalMin),              color: "text-amber-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="border border-zinc-800 rounded-sm p-2">
                  <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
                  <p className={`font-mono text-sm font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Log / Edit button */}
          {!editing ? (
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="flex items-center gap-1.5 h-7 px-3 rounded-sm border border-zinc-700 text-zinc-500
                         font-mono text-[9px] uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {day.entry ? "Edit Day" : "Log Day"}
            </button>
          ) : (
            <FinaliseForm
              day={day}
              onSaved={() => { setEditing(false); onSaved(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WorkDiariesPage() {
  const [days, setDays]       = useState<DiaryDay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDays = useCallback(async () => {
    const res = await fetch("/api/work-diaries").catch(() => null);
    if (res?.ok) {
      const data = await res.json() as { days: DiaryDay[] };
      setDays(data.days);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchDays(); }, [fetchDays]);

  const totalWeekMin  = days.slice(0, 7).reduce((s, d) => s + d.totals.minutes, 0);
  const totalCommits  = days.slice(0, 7).reduce((s, d) => s + d.totals.commits, 0);
  const daysLogged    = days.filter(d => d.entry).length;

  return (
      <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Work Diaries</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Git-verified sessions · no screenshots</p>
          </div>
          <BookOpen className="w-5 h-5 text-amber-500" />
        </div>

        {/* Convention commit guide */}
        <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <p className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">How to log time</p>
          </div>
          <div className="space-y-1">
            <p className="font-mono text-[9px] text-zinc-500">Run in your repo terminal when starting:</p>
            <code className="block font-mono text-[10px] text-green-400 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-sm">
              git commit --allow-empty -m &quot;[START] what you&apos;re working on&quot;
            </code>
            <p className="font-mono text-[9px] text-zinc-500 mt-1">Run when done:</p>
            <code className="block font-mono text-[10px] text-red-400 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded-sm">
              git commit --allow-empty -m &quot;[END] what you completed&quot;
            </code>
            <p className="font-mono text-[9px] text-zinc-700 mt-1">
              Sessions are detected automatically via the GitHub integration. Push anytime.
            </p>
          </div>
        </div>

        {/* Privacy note */}
        <div className="border border-green-900/40 bg-green-950/10 rounded-sm px-3 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
          <p className="font-mono text-[10px] text-green-600">
            No screenshots, no keystroke logging — time verified from git commit timestamps only
          </p>
        </div>

        {/* Weekly summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Git Hours",  value: fmtMinutes(totalWeekMin), color: "text-amber-400" },
            { label: "Commits",    value: String(totalCommits),      color: "text-sky-400"   },
            { label: "Days Logged",value: String(daysLogged),        color: "text-green-400" },
            { label: "Days Active",value: String(days.filter(d => d.sessions.length > 0).length), color: "text-zinc-300" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
              <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Diary entries */}
        <div className="space-y-2">
          {loading ? (
            <div className="border border-zinc-800 rounded-sm p-8 flex items-center justify-center">
              <p className="font-mono text-[10px] text-zinc-600">Loading diary…</p>
            </div>
          ) : days.length === 0 ? (
            <div className="border border-dashed border-zinc-800 rounded-sm p-8 text-center space-y-2">
              <p className="font-mono text-xs text-zinc-600">No sessions yet</p>
              <p className="font-mono text-[10px] text-zinc-700">
                Connect your GitHub repo in the{" "}
                <a href="/collab" className="text-amber-500 hover:underline">Collaboration</a>{" "}
                tab, then use the commands above to start logging time
              </p>
            </div>
          ) : (
            days.map(day => (
              <DiaryCard key={day.date} day={day} onSaved={fetchDays} />
            ))
          )}
        </div>
      </main>
      );
}
