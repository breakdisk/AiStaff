"use client";

import { Star, Clock, Users } from "lucide-react";

export interface MentorProfile {
  id:                 string;
  user_id:            string;
  bio:                string;
  specializations:    string[];
  max_mentees:        number;
  current_mentees:    number;
  availability_tz:    string;
  accepting_requests: boolean;
  session_rate_cents: number;
}

interface Props {
  mentor:    MentorProfile;
  onRequest: (mentorId: string) => void;
}

export default function MentorCard({ mentor, onRequest }: Props) {
  const spotsLeft = mentor.max_mentees - mentor.current_mentees;
  const isFree    = mentor.session_rate_cents === 0;

  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            <span className="text-xs text-zinc-300 font-medium">Mentor</span>
          </div>
          <p className="text-xs text-zinc-400 line-clamp-2">{mentor.bio || "No bio provided."}</p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-sm shrink-0
            ${isFree ? "bg-emerald-400/10 text-emerald-400" : "bg-amber-400/10 text-amber-400"}`}
        >
          {isFree ? "Free" : `$${(mentor.session_rate_cents / 100).toFixed(0)}/hr`}
        </span>
      </div>

      {/* Specializations */}
      {mentor.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mentor.specializations.slice(0, 4).map((s) => (
            <span key={s} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-sm">
              {s}
            </span>
          ))}
          {mentor.specializations.length > 4 && (
            <span className="text-[10px] text-zinc-500">+{mentor.specializations.length - 4}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Users size={11} />
            {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
          </span>
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {mentor.availability_tz}
          </span>
        </div>
        <button
          onClick={() => onRequest(mentor.user_id)}
          disabled={!mentor.accepting_requests || spotsLeft <= 0}
          className={`text-xs font-medium px-3 py-1 rounded-sm transition-colors
            ${mentor.accepting_requests && spotsLeft > 0
              ? "bg-amber-400 text-zinc-950 hover:bg-amber-300"
              : "bg-zinc-800 text-zinc-500 cursor-default"
            }`}
        >
          {!mentor.accepting_requests ? "Closed" : spotsLeft <= 0 ? "Full" : "Request"}
        </button>
      </div>
    </div>
  );
}
