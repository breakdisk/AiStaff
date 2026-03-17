"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquare, Paperclip, GitBranch, Figma, Send, File, Image, Archive, ExternalLink, Clock, X } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

interface ChatMessage {
  id:          string;
  author:      string;
  role:        "talent" | "client" | "system";
  body:        string;
  ts:          string;
  file?:       string;
  // fields present in API response (used during mapping)
  sender_id?:   string;
  sender_name?: string;
  file_name?:   string | null;
}

interface SharedFile {
  id:       string;
  name:     string;
  type:     "code" | "doc" | "image" | "archive";
  size:     string;
  uploaded: string;
  uploader: string;
  version:  number;
}

interface Integration {
  id:       string;
  provider: "github" | "figma";
  name:     string;
  url:      string;
  last_event: string;
  last_event_at: string;
  status:   "connected" | "disconnected";
}

const DEMO_MESSAGES: ChatMessage[] = [
  { id: "m1", author: "System",    role: "system",  body: "Project started — DataSync Pipeline Automation", ts: "Feb 14 09:00" },
  { id: "m2", author: "Acme Corp", role: "client",  body: "Hey Marcus, the initial brief doc is attached. Let me know if you need anything clarified before kickoff.", ts: "Feb 14 09:12", file: "brief_v1.pdf" },
  { id: "m3", author: "Marcus T.", role: "talent",  body: "Got it, thanks. One question on the audit log requirement — should it be append-only at the DB level or enforced via the API layer?", ts: "Feb 14 10:30" },
  { id: "m4", author: "Acme Corp", role: "client",  body: "API layer is fine for now, we can harden at DB level in Phase 4.", ts: "Feb 14 11:05" },
  { id: "m5", author: "Marcus T.", role: "talent",  body: "Phase 2 complete — agent.wasm uploaded and test suite attached. All 24 tests green.", ts: "Mar 01 11:28", file: "test_results_phase2.txt" },
  { id: "m6", author: "Acme Corp", role: "client",  body: "Reviewed — looks solid. Approving Phase 2. New requirement: audit log needs tamper-evidence (hash chain). Can we scope that?", ts: "Mar 07 14:22" },
  { id: "m7", author: "Marcus T.", role: "talent",  body: "Scoped it — ~8hrs extra work. Blake3 hash chain, append-only table, verification endpoint. Can roll into Phase 3 for +$400.", ts: "Mar 08 09:15" },
];

const DEMO_FILES: SharedFile[] = [
  { id: "f1", name: "brief_v1.pdf",           type: "doc",     size: "142 KB", uploaded: "Feb 14", uploader: "Acme Corp", version: 1 },
  { id: "f2", name: "agent.wasm",             type: "archive", size: "1.2 MB", uploaded: "Mar 01", uploader: "Marcus T.", version: 1 },
  { id: "f3", name: "test_results_phase2.txt",type: "doc",     size: "18 KB",  uploaded: "Mar 01", uploader: "Marcus T.", version: 1 },
  { id: "f4", name: "architecture_diagram.png",type:"image",   size: "394 KB", uploaded: "Feb 15", uploader: "Marcus T.", version: 2 },
  { id: "f5", name: "deployment_runbook.md",  type: "doc",     size: "22 KB",  uploaded: "Mar 05", uploader: "Marcus T.", version: 3 },
  { id: "f6", name: "env_config.toml",        type: "code",    size: "3 KB",   uploaded: "Feb 20", uploader: "Marcus T.", version: 4 },
];

const DEMO_INTEGRATIONS: Integration[] = [
  {
    id: "int-1", provider: "github", name: "aistaff/datasync-agent",
    url: "https://github.com/aistaff/datasync-agent",
    last_event: "Push: feat/jwt-refresh — 4 commits", last_event_at: "2026-03-08 09:10",
    status: "connected",
  },
  {
    id: "int-2", provider: "figma", name: "DataSync — UI Specs",
    url: "https://figma.com/file/xK9p...",
    last_event: "Frame updated: Auth Flow v3", last_event_at: "2026-03-07 16:44",
    status: "connected",
  },
];

// ── Sidebar nav ───────────────────────────────────────────────────────────────

const SIDEBAR_NAV = [
  { label: "Dashboard",   href: "/dashboard"   },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Matching",    href: "/matching"    },
  { label: "Profile",     href: "/profile"     },
];

const WORKSPACE_NAV = [
  { label: "Work Diaries",  href: "/work-diaries"            },
  { label: "Async Collab",  href: "/async-collab"            },
  { label: "Collaboration", href: "/collab",    active: true },
  { label: "Success Layer", href: "/success-layer"           },
  { label: "Quality Gate",  href: "/quality-gate"            },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const FILE_ICON: Record<SharedFile["type"], React.ElementType> = {
  code: File, doc: File, image: Image, archive: Archive,
};

const FILE_COLOR: Record<SharedFile["type"], string> = {
  code: "text-sky-400", doc: "text-amber-400", image: "text-green-400", archive: "text-purple-400",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollabPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const deploymentId = searchParams.get("deployment_id");

  const profileId   = (session?.user as { profileId?: string })?.profileId ?? "";
  const displayName = session?.user?.name ?? "You";

  const [tab,      setTab]      = useState<"chat" | "files" | "integrations">("chat");
  const [input,    setInput]    = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attached, setAttached] = useState<string | null>(null);
  const [files,    setFiles]    = useState<SharedFile[]>(DEMO_FILES);
  const [sending,  setSending]  = useState(false);

  const chatFileRef   = useRef<HTMLInputElement>(null);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);

  // ── Poll for messages every 3 seconds ────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!deploymentId) return;
    try {
      const r = await fetch(`/api/collab/messages?deployment_id=${deploymentId}`);
      if (!r.ok) return;
      const data: ChatMessage[] = await r.json();
      setMessages(data.map(m => ({
        id:     m.id,
        author: m.sender_name,
        role:   m.sender_id === profileId ? "talent" : "client",
        body:   m.body,
        ts:     m.ts,
        file:   m.file_name,
      } as ChatMessage)));
    } catch { /* network error — keep last state */ }
  }, [deploymentId, profileId]);

  useEffect(() => {
    if (!deploymentId) {
      setMessages(DEMO_MESSAGES); // show demo when no deployment selected
      return;
    }
    fetchMessages();
    const id = setInterval(fetchMessages, 3000);
    return () => clearInterval(id);
  }, [deploymentId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleChatFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setAttached(f.name);
    e.target.value = "";
  }

  function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    const type: SharedFile["type"] =
      ["png","jpg","jpeg","gif","webp","svg"].includes(ext) ? "image" :
      ["zip","tar","gz","wasm","dmg"].includes(ext)         ? "archive" :
      ["ts","js","rs","toml","json","py","sh","md"].includes(ext) ? "code" : "doc";
    const size = f.size > 1_048_576
      ? `${(f.size / 1_048_576).toFixed(1)} MB`
      : `${Math.round(f.size / 1024)} KB`;
    setFiles(prev => [...prev, {
      id:       `f${Date.now()}`,
      name:     f.name,
      type,
      size,
      uploaded: "Just now",
      uploader: "You",
      version:  1,
    }]);
    e.target.value = "";
  }

  async function sendMessage() {
    if ((!input.trim() && !attached) || sending) return;
    setSending(true);
    const body = input.trim() || "(file attached)";
    setInput("");
    setAttached(null);

    if (!deploymentId || !profileId) {
      // No deployment — optimistic local only (demo mode)
      setMessages(prev => [...prev, {
        id: `m${Date.now()}`, author: "You", role: "talent",
        body, ts: "Just now", file: attached ?? undefined,
      }]);
      setSending(false);
      return;
    }

    try {
      await fetch("/api/collab/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployment_id: deploymentId,
          sender_id:     profileId,
          sender_name:   displayName,
          body,
          file_name:     attached ?? null,
        }),
      });
      await fetchMessages(); // refresh immediately after send
    } catch { /* silent — poll will catch up */ }
    setSending(false);
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {SIDEBAR_NAV.map(({ label, href }) => (
            <Link key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</Link>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Workspace</p>
          {WORKSPACE_NAV.map(({ label, href, active }) => (
            <Link key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</Link>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col pb-16 lg:pb-0 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <div>
            <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">Collaboration</h1>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Chat · Files · GitHub · Figma</p>
          </div>
          <MessageSquare className="w-5 h-5 text-amber-500" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 px-4">
          {[
            { key: "chat"         as const, label: "Chat"               },
            { key: "files"        as const, label: `Files (${files.length})` },
            { key: "integrations" as const, label: "Integrations"       },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-2.5 font-mono text-xs border-b-2 transition-colors ${
                tab === key ? "border-amber-500 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >{label}</button>
          ))}
        </div>

        {/* Chat tab */}
        {tab === "chat" && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px]">
              {!deploymentId && (
                <div className="text-center pt-4">
                  <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-3 py-1 rounded-full">
                    Demo mode — open from an engagement to load real messages
                  </span>
                </div>
              )}
              {messages.map((msg) => {
                if (msg.role === "system") {
                  return (
                    <div key={msg.id} className="text-center">
                      <span className="font-mono text-[9px] text-zinc-600 border border-zinc-800 px-2 py-0.5 rounded-full">
                        {msg.body} · {msg.ts}
                      </span>
                    </div>
                  );
                }
                const isMe = msg.role === "talent";
                return (
                  <div key={msg.id} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-[9px] font-medium ${
                      isMe ? "bg-sky-950 text-sky-400 border border-sky-800" : "bg-purple-950 text-purple-400 border border-purple-800"
                    }`}>
                      {msg.author[0]}
                    </div>
                    <div className={`max-w-[75%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <span className="font-mono text-[9px] text-zinc-500">{msg.author}</span>
                        <span className="font-mono text-[9px] text-zinc-700">{msg.ts}</span>
                      </div>
                      <div className={`border rounded-sm px-2.5 py-2 font-mono text-xs leading-relaxed ${
                        isMe
                          ? "border-sky-900/50 bg-sky-950/20 text-zinc-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400"
                      }`}>
                        {msg.body}
                      </div>
                      {msg.file && (
                        <div className="flex items-center gap-1.5 border border-zinc-800 rounded-sm px-2 py-1 bg-zinc-900/60">
                          <Paperclip className="w-2.5 h-2.5 text-zinc-500" />
                          <span className="font-mono text-[9px] text-zinc-400">{msg.file}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 p-3 space-y-2">
              {attached && (
                <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-sm w-fit">
                  <Paperclip className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-zinc-300 max-w-[200px] truncate">{attached}</span>
                  <button onClick={() => setAttached(null)} className="text-zinc-600 hover:text-zinc-300">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="file" ref={chatFileRef} onChange={handleChatFile} className="hidden" />
                <button
                  onClick={() => chatFileRef.current?.click()}
                  className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-sm border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Message…"
                  className="flex-1 h-9 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && !attached) || sending}
                  className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-sm border border-amber-900 bg-amber-950/30 text-amber-400 hover:border-amber-700 transition-colors disabled:opacity-30"
                >
                  <Send className={`w-3.5 h-3.5 ${sending ? "opacity-40" : ""}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Files tab */}
        {tab === "files" && (
          <div className="p-4 space-y-2">
            <div className="border border-zinc-800 rounded-sm overflow-hidden">
              <div className="hidden sm:grid grid-cols-5 gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
                {["Name", "Size", "Uploaded", "By", "Ver"].map(h => (
                  <p key={h} className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{h}</p>
                ))}
              </div>
              <div className="divide-y divide-zinc-800/60">
                {files.map(f => {
                  const Icon = FILE_ICON[f.type];
                  return (
                    <div key={f.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-3 py-2.5 items-center hover:bg-zinc-900/30 transition-colors">
                      <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${FILE_COLOR[f.type]}`} />
                        <span className="font-mono text-[10px] text-zinc-300 truncate">{f.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">{f.size}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{f.uploaded}</span>
                      <span className="font-mono text-[10px] text-zinc-500 hidden sm:block">{f.uploader}</span>
                      <span className="font-mono text-[10px] text-zinc-600">v{f.version}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <input type="file" ref={uploadFileRef} onChange={handleUploadFile} className="hidden" />
            <button
              onClick={() => uploadFileRef.current?.click()}
              className="w-full h-9 rounded-sm border border-dashed border-zinc-700 text-zinc-500
                         font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors
                         flex items-center justify-center gap-2"
            >
              <Paperclip className="w-3.5 h-3.5" /> Upload File
            </button>
          </div>
        )}

        {/* Integrations tab */}
        {tab === "integrations" && (
          <div className="p-4 space-y-3">
            {DEMO_INTEGRATIONS.map(int => (
              <div key={int.id} className="border border-zinc-700 rounded-sm p-3 bg-zinc-900/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      {int.provider === "github"
                        ? <GitBranch className="w-4 h-4 text-zinc-300" />
                        : <Figma     className="w-4 h-4 text-zinc-300" />}
                    </div>
                    <div>
                      <p className="font-mono text-xs font-medium text-zinc-100">{int.name}</p>
                      <p className="font-mono text-[9px] text-zinc-600 capitalize">{int.provider}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-[9px] text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Connected
                    </span>
                    <a href={int.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors">
                      <ExternalLink className="w-2.5 h-2.5" /> Open
                    </a>
                  </div>
                </div>

                <div className="mt-2.5 flex items-start gap-2 border border-zinc-800 rounded-sm px-2.5 py-2 bg-zinc-950/40">
                  <Clock className="w-3 h-3 text-zinc-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-mono text-[10px] text-zinc-300">{int.last_event}</p>
                    <p className="font-mono text-[9px] text-zinc-600">{int.last_event_at}</p>
                  </div>
                </div>
              </div>
            ))}

            {/* Connect more */}
            <div className="border border-dashed border-zinc-800 rounded-sm p-3 text-center">
              <p className="font-mono text-[10px] text-zinc-600">Connect more: Linear · Notion · GitLab · Jira</p>
              <button className="mt-2 h-8 px-3 rounded-sm border border-zinc-700 text-zinc-400 font-mono text-[9px] uppercase tracking-widest hover:border-zinc-500 transition-colors">
                Browse Integrations
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 flex items-center border-t border-zinc-800 bg-zinc-950">
        {[
          { label: "Dash",    href: "/dashboard"   },
          { label: "Market",  href: "/marketplace" },
          { label: "Matching",href: "/matching"    },
          { label: "Profile", href: "/profile"     },
        ].map(({ label, href }) => (
          <Link key={label} href={href} className="nav-tab">
            <span className="text-[10px]">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
