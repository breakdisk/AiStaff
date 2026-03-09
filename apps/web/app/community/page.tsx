"use client";

import { useEffect, useState } from "react";
import {
  fetchHubs,
  joinHub,
  fetchHubThreads,
  createThread,
  type Hub,
  type ForumThread,
} from "@/lib/api";
import CommunityHubCard from "@/components/CommunityHubCard";
import { MessageSquare, Plus, X } from "lucide-react";

const CATEGORIES = ["all", "aistaff", "aitalent", "airobot", "general"] as const;

export default function CommunityPage() {
  const [hubs,       setHubs]       = useState<Hub[]>([]);
  const [threads,    setThreads]    = useState<ForumThread[]>([]);
  const [activeHub,  setActiveHub]  = useState<Hub | null>(null);
  const [catFilter,  setCatFilter]  = useState<string>("all");
  const [joinedHubs, setJoinedHubs] = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [showNew,    setShowNew]    = useState(false);
  const [newTitle,   setNewTitle]   = useState("");
  const [newBody,    setNewBody]    = useState("");

  useEffect(() => {
    fetchHubs(catFilter === "all" ? undefined : catFilter)
      .then((d) => setHubs(d.hubs))
      .finally(() => setLoading(false));
  }, [catFilter]);

  const handleJoin = async (hubId: string) => {
    await joinHub(hubId, "demo-user-id");
    setJoinedHubs((prev) => new Set(prev).add(hubId));
  };

  const openHub = async (hub: Hub) => {
    setActiveHub(hub);
    const data = await fetchHubThreads(hub.id);
    setThreads(data.threads);
  };

  const handleNewThread = async () => {
    if (!activeHub || !newTitle || !newBody) return;
    await createThread(activeHub.id, { author_id: "demo-user-id", title: newTitle, body: newBody });
    const data = await fetchHubThreads(activeHub.id);
    setThreads(data.threads);
    setShowNew(false);
    setNewTitle("");
    setNewBody("");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-zinc-100">Community Hubs</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Join niche communities, attend events, and discuss in forums</p>
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`text-xs px-3 py-1 rounded-sm border transition-colors capitalize
                ${catFilter === cat
                  ? "border-amber-400 text-amber-400 bg-amber-400/10"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {activeHub ? (
          // ── Hub detail: forum threads ────────────────────────────────────
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setActiveHub(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                ← Back
              </button>
              <h2 className="text-sm font-semibold text-zinc-100">{activeHub.name}</h2>
              <button
                onClick={() => setShowNew(true)}
                className="ml-auto flex items-center gap-1 text-xs bg-amber-400 text-zinc-950 px-2 py-1 rounded-sm hover:bg-amber-300"
              >
                <Plus size={11} /> New Thread
              </button>
            </div>

            {showNew && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 rounded-sm p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold">New Thread</span>
                  <button onClick={() => setShowNew(false)}><X size={14} className="text-zinc-500" /></button>
                </div>
                <input
                  placeholder="Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-sm px-2 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
                />
                <textarea
                  placeholder="Body"
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={3}
                  className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-sm px-2 py-1.5 text-zinc-200 placeholder-zinc-500 resize-none focus:outline-none focus:border-amber-400/50"
                />
                <button
                  onClick={handleNewThread}
                  className="self-end text-xs bg-amber-400 text-zinc-950 px-3 py-1 rounded-sm hover:bg-amber-300"
                >
                  Post
                </button>
              </div>
            )}

            {threads.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-8">No threads yet. Start the conversation!</p>
            ) : (
              <div className="flex flex-col gap-2">
                {threads.map((t) => (
                  <div key={t.id} className="border border-zinc-800 bg-zinc-900 rounded-sm p-3 flex items-start gap-3">
                    <MessageSquare size={14} className="text-zinc-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-200 truncate">{t.title}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{t.body}</p>
                      <p className="text-[10px] text-zinc-600 mt-1">{t.reply_count} replies</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // ── Hub grid ─────────────────────────────────────────────────────
          loading ? (
            <p className="text-xs text-zinc-500 text-center py-8">Loading hubs…</p>
          ) : hubs.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">No hubs found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hubs.map((hub) => (
                <div key={hub.id} onClick={() => openHub(hub)} className="cursor-pointer">
                  <CommunityHubCard
                    hub={hub}
                    joined={joinedHubs.has(hub.id)}
                    onJoin={(id) => { handleJoin(id); }}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
