"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GitBranch, Plus, X, ChevronDown, Loader2, Mail } from "lucide-react";
import { getMyOrg, listOrgDeployments, type OrgDeployment } from "@/lib/enterpriseApi";

type TaskStatus = "OPEN" | "ASSIGNED" | "SUBMITTED" | "APPROVED" | "PAID";

interface SubcontractTask {
  id:               string;
  deployment_id:    string;
  title:            string;
  description:      string | null;
  budget_cents:     number;
  status:           TaskStatus;
  freelancer_name:  string | null;
  freelancer_email: string | null;
  created_at:       string;
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  OPEN:      "text-zinc-400  border-zinc-700  bg-zinc-900",
  ASSIGNED:  "text-amber-400 border-amber-900 bg-amber-950/30",
  SUBMITTED: "text-sky-400   border-sky-900   bg-sky-950/30",
  APPROVED:  "text-emerald-400 border-emerald-900 bg-emerald-950/30",
  PAID:      "text-violet-400 border-violet-900 bg-violet-950/30",
};

const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  OPEN:      "ASSIGNED",
  SUBMITTED: "APPROVED",
  APPROVED:  "PAID",
};

function fmtUSD(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function SubcontractsPage() {
  const { data: session } = useSession();
  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  const [orgId,        setOrgId]        = useState("");
  const [deployments,  setDeployments]  = useState<OrgDeployment[]>([]);
  const [selectedDep,  setSelectedDep]  = useState("");
  const [tasks,        setTasks]        = useState<SubcontractTask[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);
  const [assignEmail,  setAssignEmail]  = useState("");
  const [form, setForm] = useState({ title: "", description: "", budget: "" });

  useEffect(() => {
    if (!profileId) return;
    getMyOrg(profileId)
      .then(org => {
        setOrgId(org.id);
        return listOrgDeployments(org.id);
      })
      .then(deps => {
        setDeployments(deps);
        if (deps.length > 0) setSelectedDep(deps[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileId]);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/enterprise/orgs/${orgId}/subcontracts${selectedDep ? `?deployment_id=${selectedDep}` : ""}`)
      .then(r => r.json())
      .then(d => setTasks(d.tasks ?? []))
      .catch(() => {});
  }, [orgId, selectedDep]);

  async function createTask() {
    if (!form.title || !form.budget || !selectedDep) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/enterprise/orgs/${orgId}/subcontracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment_id: selectedDep,
          title: form.title,
          description: form.description || undefined,
          budget_cents: Math.round(parseFloat(form.budget) * 100),
        }),
      });
      const d = await r.json();
      if (d.task) { setTasks(t => [d.task, ...t]); setShowForm(false); setForm({ title: "", description: "", budget: "" }); }
    } finally { setSubmitting(false); }
  }

  async function assignFreelancer(taskId: string) {
    if (!assignEmail) return;
    // Lookup profile by email first
    const lookupRes = await fetch(`/api/profile/by-email?email=${encodeURIComponent(assignEmail)}`);
    if (!lookupRes.ok) { alert("No user found with that email."); return; }
    const { profile_id } = await lookupRes.json();
    await fetch(`/api/enterprise/subcontracts/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ freelancer_id: profile_id, status: "ASSIGNED" }),
    });
    setTasks(ts => ts.map(t => t.id === taskId
      ? { ...t, status: "ASSIGNED", freelancer_email: assignEmail }
      : t));
    setAssignTaskId(null);
    setAssignEmail("");
  }

  async function advanceStatus(task: SubcontractTask) {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    await fetch(`/api/enterprise/subcontracts/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: next } : t));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
    </div>
  );

  if (!orgId) return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <p className="font-mono text-sm text-zinc-500">No organisation linked. <a href="/enterprise/setup" className="text-amber-400 underline">Set one up</a>.</p>
    </div>
  );

  return (
    <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-4 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <GitBranch className="w-4 h-4 text-amber-400" />
        <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
          Subcontracts
        </h1>
        <span className="font-mono text-xs text-zinc-600 ml-auto">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 h-7 rounded-sm border border-zinc-700
                     text-zinc-400 font-mono text-xs uppercase tracking-widest
                     hover:border-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Task
        </button>
      </div>

      {/* Deployment selector */}
      <div className="relative w-full sm:w-72">
        <select
          value={selectedDep}
          onChange={e => setSelectedDep(e.target.value)}
          className="w-full h-8 pl-3 pr-8 rounded-sm border border-zinc-700 bg-zinc-900
                     font-mono text-xs text-zinc-300 focus:outline-none focus:border-amber-400/60
                     appearance-none transition-colors"
        >
          <option value="">All deployments</option>
          {deployments.map(d => (
            <option key={d.id} value={d.id}>{d.listing_title ?? d.id.slice(0, 8)}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
      </div>

      {/* Add task form */}
      {showForm && (
        <div className="border border-amber-900 bg-amber-950/10 rounded-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">New Task</p>
            <button onClick={() => setShowForm(false)}><X className="w-3.5 h-3.5 text-zinc-500" /></button>
          </div>
          <input
            placeholder="Task title *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full h-8 px-3 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60"
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            className="w-full px-3 py-2 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60 resize-none"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-500">$</span>
            <input
              placeholder="Budget (USD) *"
              type="number"
              min="1"
              value={form.budget}
              onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
              className="w-32 h-8 px-3 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/60"
            />
            <button
              disabled={submitting || !form.title || !form.budget}
              onClick={createTask}
              className="ml-auto px-4 h-8 rounded-sm bg-amber-400 text-zinc-900 font-mono text-xs font-bold uppercase tracking-widest hover:bg-amber-300 transition-colors disabled:opacity-40"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
            </button>
          </div>
        </div>
      )}

      {/* Tasks table */}
      {tasks.length === 0 ? (
        <div className="border border-zinc-800 rounded-sm p-8 text-center">
          <p className="font-mono text-xs text-zinc-600">No tasks yet. Add a task to break this deployment into sub-contracts.</p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950">
                {["Task", "Budget", "Assignee", "Status", ""].map(h => (
                  <th key={h} className="px-3 py-2 font-mono text-[10px] text-zinc-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id} className="border-b border-zinc-800/50 hover:bg-zinc-900/40 transition-colors">
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-xs text-zinc-200 font-medium">{task.title}</p>
                    {task.description && <p className="font-mono text-[10px] text-zinc-600 mt-0.5 line-clamp-1">{task.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-amber-400 whitespace-nowrap">{fmtUSD(task.budget_cents)}</td>
                  <td className="px-3 py-2.5">
                    {task.freelancer_email ? (
                      <span className="font-mono text-xs text-zinc-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" />{task.freelancer_name ?? task.freelancer_email}
                      </span>
                    ) : (
                      assignTaskId === task.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            type="email"
                            placeholder="freelancer@email.com"
                            value={assignEmail}
                            onChange={e => setAssignEmail(e.target.value)}
                            className="w-40 h-6 px-2 rounded-sm border border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-200 focus:outline-none focus:border-amber-400/60"
                          />
                          <button onClick={() => assignFreelancer(task.id)} className="px-2 h-6 rounded-sm bg-amber-400 text-zinc-900 font-mono text-[10px] font-bold">Assign</button>
                          <button onClick={() => { setAssignTaskId(null); setAssignEmail(""); }}><X className="w-3 h-3 text-zinc-500" /></button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssignTaskId(task.id)}
                          className="font-mono text-[10px] text-zinc-600 hover:text-amber-400 transition-colors"
                        >
                          + Assign
                        </button>
                      )
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-sm border font-mono text-[10px] font-medium ${STATUS_STYLE[task.status]}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {NEXT_STATUS[task.status] && (
                      <button
                        onClick={() => advanceStatus(task)}
                        className="font-mono text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors whitespace-nowrap"
                      >
                        → {NEXT_STATUS[task.status]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
