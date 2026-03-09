"use client";

import {
  Github, Linkedin, Figma, ExternalLink,
  Award, Code2, Database, Cpu, Globe,
} from "lucide-react";

// ── Platform signal types ──────────────────────────────────────────────────────

export interface PlatformSignal {
  id:       string;
  platform: "github" | "linkedin" | "figma" | "behance" | "certification";
  label:    string;
  detail:   string;       // e.g. "42 public repos" or "Senior Rust Dev"
  url?:     string;
  verified: boolean;
}

export interface SkillTag {
  tag:         string;
  proficiency: 1 | 2 | 3 | 4 | 5;  // 1=Beginner … 5=Expert
  verified:    boolean;
}

// ── Icon map ─────────────────────────────────────────────────────────────────

const PLATFORM_ICON: Record<PlatformSignal["platform"], React.ElementType> = {
  github:        Github,
  linkedin:      Linkedin,
  figma:         Figma,
  behance:       Globe,
  certification: Award,
};

const PLATFORM_COLOR: Record<PlatformSignal["platform"], string> = {
  github:        "border-zinc-700  text-zinc-300",
  linkedin:      "border-sky-900   text-sky-400",
  figma:         "border-violet-900 text-violet-400",
  behance:       "border-blue-900  text-blue-400",
  certification: "border-amber-800 text-amber-400",
};

// ── Skill domain icons ────────────────────────────────────────────────────────

const SKILL_ICONS: Record<string, React.ElementType> = {
  rust:    Code2,
  wasm:    Cpu,
  kafka:   Database,
  python:  Code2,
  default: Code2,
};

const PROFICIENCY_LABEL = ["", "Beginner", "Intermediate", "Proficient", "Advanced", "Expert"];
const PROFICIENCY_BAR   = ["", "w-1/5", "w-2/5", "w-3/5", "w-4/5", "w-full"];

// ── Props ─────────────────────────────────────────────────────────────────────

interface VerifiedSkillsChipsProps {
  signals: PlatformSignal[];
  skills:  SkillTag[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VerifiedSkillsChips({ signals, skills }: VerifiedSkillsChipsProps) {
  return (
    <div className="space-y-3">
      {/* Platform signals */}
      {signals.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Connected Platforms
          </p>
          <div className="flex flex-col gap-1.5">
            {signals.map((sig) => {
              const Icon  = PLATFORM_ICON[sig.platform];
              const color = PLATFORM_COLOR[sig.platform];
              return (
                <div
                  key={sig.id}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm border ${color} bg-zinc-900/50`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs leading-none">{sig.label}</p>
                    <p className="font-mono text-[10px] text-zinc-500 mt-0.5 truncate">
                      {sig.detail}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {sig.verified && (
                      <span className="font-mono text-[9px] border border-green-800 text-green-500 px-1 py-0.5 rounded-sm">
                        VERIFIED
                      </span>
                    )}
                    {sig.url && (
                      <a
                        href={sig.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skill tags */}
      {skills.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
            Verified Skills
          </p>
          <div className="space-y-1">
            {skills.map((skill) => {
              const Icon = SKILL_ICONS[skill.tag] ?? SKILL_ICONS.default;
              return (
                <div key={skill.tag} className="flex items-center gap-2.5 group">
                  <Icon className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                  <span className="font-mono text-xs text-zinc-300 w-20 flex-shrink-0 truncate capitalize">
                    {skill.tag}
                  </span>
                  {/* Proficiency bar */}
                  <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        skill.proficiency >= 4 ? "bg-green-600" :
                        skill.proficiency >= 3 ? "bg-amber-600" :
                        "bg-zinc-600"
                      } ${PROFICIENCY_BAR[skill.proficiency]}`}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-600 w-20 text-right flex-shrink-0">
                    {PROFICIENCY_LABEL[skill.proficiency]}
                    {skill.verified && " ✓"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
