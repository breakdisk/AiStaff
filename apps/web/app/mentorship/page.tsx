"use client";

import { useEffect, useState } from "react";
import {
  fetchMentors,
  requestMentorship,
  fetchMentorshipPairs,
  fetchCohorts,
  type MentorProfile,
  type MentorshipPair,
  type CohortGroup,
} from "@/lib/api";
import MentorCard from "@/components/MentorCard";
import { Users, BookOpen } from "lucide-react";

type Tab = "mentors" | "my-pairs" | "cohorts";

export default function MentorshipPage() {
  const [tab,     setTab]     = useState<Tab>("mentors");
  const [mentors, setMentors] = useState<MentorProfile[]>([]);
  const [pairs,   setPairs]   = useState<MentorshipPair[]>([]);
  const [cohorts, setCohorts] = useState<CohortGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (tab === "mentors") {
      fetchMentors().then((d) => setMentors(d.mentors)).finally(() => setLoading(false));
    } else if (tab === "my-pairs") {
      fetchMentorshipPairs("demo-user-id").then((d) => setPairs(d.pairs)).finally(() => setLoading(false));
    } else {
      fetchCohorts().then((d) => setCohorts(d.cohorts)).finally(() => setLoading(false));
    }
  }, [tab]);

  const handleRequest = async (mentorId: string) => {
    await requestMentorship({ mentor_id: mentorId, mentee_id: "demo-user-id", goal: "Skill development" });
    alert("Mentorship request sent!");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-zinc-100">Peer Mentorship</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Find a mentor, join a cohort, or track your pairs</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-zinc-800 pb-0">
          {([["mentors", "Find Mentor"], ["my-pairs", "My Pairs"], ["cohorts", "Cohorts"]] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-xs px-4 py-2 border-b-2 transition-colors
                ${tab === key
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Loading…</p>
        ) : tab === "mentors" ? (
          mentors.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">No mentors available right now.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mentors.map((m) => (
                <MentorCard key={m.user_id} mentor={m} onRequest={handleRequest} />
              ))}
            </div>
          )
        ) : tab === "my-pairs" ? (
          pairs.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">No active mentorship pairs. Find a mentor above!</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pairs.map((p) => (
                <div key={p.id} className="border border-zinc-800 bg-zinc-900 rounded-sm p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BookOpen size={14} className="text-amber-400" />
                      <span className="text-xs font-medium text-zinc-200">
                        Pair with {p.mentor_id.slice(0, 8)}…
                      </span>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-sm
                        ${p.status === "active"    ? "bg-emerald-400/10 text-emerald-400"
                        : p.status === "completed" ? "bg-zinc-700 text-zinc-400"
                        : "bg-amber-400/10 text-amber-400"}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{p.goal || "No goal set"}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Started {new Date(p.started_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : (
          cohorts.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">No cohorts available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cohorts.map((c) => (
                <div key={c.id} className="border border-zinc-800 bg-zinc-900 rounded-sm p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-200">{c.name}</h3>
                      <span className="text-[10px] text-zinc-500 capitalize">{c.cohort_type}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {c.member_count}/{c.max_members}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{c.description}</p>
                  <button className="text-xs bg-amber-400 text-zinc-950 px-3 py-1 rounded-sm hover:bg-amber-300">
                    Join Cohort
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
