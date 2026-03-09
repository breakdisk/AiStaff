"use client";

import { useEffect, useState } from "react";
import {
  fetchCareerProfile,
  fetchMilestones,
  fetchSkillGaps,
  fetchLearningPaths,
  type CareerProfile,
  type CareerMilestone,
  type SkillGap,
  type LearningPath,
} from "@/lib/api";
import CareerProgressBar from "@/components/CareerProgressBar";
import SkillGapChart from "@/components/SkillGapChart";
import { Trophy, BookOpen, Target } from "lucide-react";

const DEMO_USER = "demo-user-id";

export default function CareerPage() {
  const [profile,    setProfile]    = useState<CareerProfile | null>(null);
  const [milestones, setMilestones] = useState<CareerMilestone[]>([]);
  const [gaps,       setGaps]       = useState<SkillGap[]>([]);
  const [paths,      setPaths]      = useState<LearningPath[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCareerProfile(DEMO_USER).catch(() => null),
      fetchMilestones(DEMO_USER).catch(() => ({ milestones: [] })),
      fetchSkillGaps(DEMO_USER).catch(() => ({ gaps: [] })),
      fetchLearningPaths(DEMO_USER).catch(() => ({ paths: [] })),
    ]).then(([prof, ms, sg, lp]) => {
      setProfile(prof);
      setMilestones(ms.milestones);
      setGaps(sg.gaps);
      setPaths(lp.paths);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-xs text-zinc-500">Loading career data…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-zinc-100">Career Growth</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Skill gaps, learning paths, milestones, and tier progression</p>
        </div>

        {/* Progress overview */}
        {profile ? (
          <div className="mb-5">
            <CareerProgressBar
              totalXp={profile.total_xp}
              milestoneCount={profile.milestone_count}
              currentTier={profile.current_tier}
              targetRole={profile.target_role ?? undefined}
            />
          </div>
        ) : (
          <div className="mb-5 rounded-sm border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">No career profile yet. Complete your first milestone to start tracking.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Skill Gaps */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} className="text-amber-400" />
              <h2 className="text-xs font-semibold text-zinc-200">Skill Gaps</h2>
            </div>
            <SkillGapChart gaps={gaps} />
          </div>

          {/* Learning Paths */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-amber-400" />
              <h2 className="text-xs font-semibold text-zinc-200">Learning Paths</h2>
            </div>
            {paths.length === 0 ? (
              <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">No learning paths assigned yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {paths.map((path) => (
                  <div key={path.id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">{path.title}</p>
                        <p className="text-[10px] text-zinc-500">Target: {path.skill_target}</p>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0">{path.progress_pct}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${path.progress_pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Milestones */}
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-amber-400" />
            <h2 className="text-xs font-semibold text-zinc-200">Milestones</h2>
          </div>
          {milestones.length === 0 ? (
            <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-500">No milestones yet. Complete deployments and identity verification to earn XP.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {milestones.map((m) => (
                <div key={m.id} className="rounded-sm border border-zinc-800 bg-zinc-900 p-3 flex items-start gap-2">
                  <Trophy size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{m.label}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      +{m.xp_awarded} XP · {new Date(m.achieved_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
