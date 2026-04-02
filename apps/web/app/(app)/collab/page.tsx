"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { MessageSquare, Paperclip, GitBranch, Send, File, Image, Archive, ExternalLink, Clock, X, Plus, Loader2, Loader } from "lucide-react";

// ── Types & demo data ─────────────────────────────────────────────────────────

interface ReactionGroup {
  emoji:       string;
  count:       number;
  profile_ids: string[];
}

interface ChatMessage {
  id:             string;
  author:         string;
  role:           "talent" | "client" | "system";
  body:           string;
  ts:             string;
  file?:          string;
  file_path?:     string | null;
  edited_at?:     string | null;
  deleted_at?:    string | null;
  parent_msg_id?: string | null;
  reply_count?:   number;
  reactions?:     ReactionGroup[];
  sender_id?:     string;
  sender_name?:   string;
  file_name?:     string | null;
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

interface IntegrationEvent {
  id:          string;
  event_type:  string;
  title:       string;
  occurred_at: string;
}

interface Integration {
  id:            string;
  deployment_id: string;
  provider:      string;
  name:          string;
  external_url:  string;
  external_id:   string;
  status:        string;
  connected_at:  string;
  events:        IntegrationEvent[];
}

function mergeDedupe(prev: ChatMessage[], batch: ChatMessage[]): ChatMessage[] {
  const map = new Map(prev.map(m => [m.id, m]));
  for (const m of batch) map.set(m.id, m);
  return [...map.values()];
}

const ALLOWED_EMOJI = [
  "👍","👎","❤️","🔥","🎉","😂","😮","😢","🙏","✅",
  "❌","⚠️","🚀","💡","🐛","🔒","📎","📋","⏳","✏️",
  "💬","🔄","📌","🏆","💪","👀","🤔","😅","🎯","🛡️",
  "💰","📊","🔗","🧪","⚡","🌍","🤝","📢","🔔","💎",
];

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const FILE_ICON: Record<SharedFile["type"], React.ElementType> = {
  code: File, doc: File, image: Image, archive: Archive,
};

const FILE_COLOR: Record<SharedFile["type"], string> = {
  code: "text-sky-400", doc: "text-amber-400", image: "text-green-400", archive: "text-purple-400",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollabPage() {
  return (
    <Suspense>
      <CollabInner />
    </Suspense>
  );
}

function CollabInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const deploymentIdFromUrl = searchParams.get("deployment_id");

  const profileId   = (session?.user as { profileId?: string })?.profileId ?? "";
  const displayName = session?.user?.name ?? "You";

  // Allow manually entering a deployment_id when none is in the URL
  const [manualDeploymentId, setManualDeploymentId] = useState("");
  const deploymentId = deploymentIdFromUrl ?? (manualDeploymentId.trim() || null);

  const [tab,           setTab]          = useState<"chat" | "files" | "integrations">("chat");
  const [input,         setInput]        = useState("");
  const [messages,      setMessages]     = useState<ChatMessage[]>([]);
  const [files,         setFiles]        = useState<SharedFile[]>(DEMO_FILES);
  const [sending,       setSending]      = useState(false);
  const [integrations,   setIntegrations]  = useState<Integration[]>([]);
  const [repoInput,      setRepoInput]     = useState("");
  const [connecting,     setConnecting]    = useState(false);
  const [connectError,   setConnectError]  = useState<string | null>(null);
  const [myEngagements,  setMyEngagements] = useState<Array<{
    id: string; agent_name: string; state: string;
  }>>([]);
  const [engagementsLoading, setEngagementsLoading] = useState(false);

  // Task 11: edit/delete state
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editBody,    setEditBody]    = useState("");
  const [deleteAskId, setDeleteAskId] = useState<string | null>(null);

  // Task 12: emoji picker state
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);

  // Task 13: thread panel state
  const [threadMsgId,    setThreadMsgId]    = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [threadLoading,  setThreadLoading]  = useState(false);
  const [threadInput,    setThreadInput]    = useState("");
  const [threadSending,  setThreadSending]  = useState(false);

  // Task 14: attachment state (replaces old `attached` string)
  const [attachment, setAttachment] = useState<{
    file_name: string;
    file_path: string | null;
    error:     string | null;
    progress:  boolean;
  } | null>(null);

  const chatFileRef   = useRef<HTMLInputElement>(null);
  const uploadFileRef = useRef<HTMLInputElement>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);

  // ── Task 11: SSE replaces polling ───────────────────────────────────────────
  useEffect(() => {
    if (!deploymentId) {
      setMessages(DEMO_MESSAGES);
      return;
    }
    const es = new EventSource(`/api/collab/stream?deployment_id=${deploymentId}`);
    es.onmessage = (e: MessageEvent) => {
      try {
        const batch = (JSON.parse(e.data as string) as ChatMessage[]).map(m => ({
          id:            m.id,
          author:        m.sender_name ?? "Unknown",
          role:          (m.sender_id === profileId ? "talent" : "client") as ChatMessage["role"],
          body:          m.body,
          ts:            m.ts,
          file:          m.file_name ?? undefined,
          file_path:     m.file_path ?? undefined,
          edited_at:     m.edited_at,
          deleted_at:    m.deleted_at,
          parent_msg_id: m.parent_msg_id,
          reply_count:   m.reply_count ?? 0,
          reactions:     m.reactions ?? [],
          sender_id:     m.sender_id,
        }));
        setMessages(prev => mergeDedupe(prev, batch));
      } catch { /* malformed event */ }
    };
    es.onerror = () => { /* EventSource auto-reconnects */ };
    return () => es.close();
  }, [deploymentId, profileId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mark messages as read whenever chat tab is active and new messages arrive
  useEffect(() => {
    if (tab !== "chat" || !deploymentId) return;
    fetch("/api/collab/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deployment_id: deploymentId }),
    }).catch(() => {});
  }, [tab, deploymentId, messages]);

  // Fetch the user's engagements for the dropdown (when no deployment_id in URL)
  useEffect(() => {
    if (tab !== "integrations" || deploymentIdFromUrl) return;
    setEngagementsLoading(true);
    fetch("/api/marketplace/my-deployments")
      .then(r => r.ok ? r.json() : [])
      .then(data => setMyEngagements(data as Array<{ id: string; agent_name: string; state: string }>))
      .catch(() => setMyEngagements([]))
      .finally(() => setEngagementsLoading(false));
  }, [tab, deploymentIdFromUrl]);

  // Fetch integrations — scoped to deployment if known, else workspace-level
  const fetchIntegrations = useRef(async () => {
    try {
      const qs = deploymentId ? `deployment_id=${deploymentId}` : "";
      const r = await fetch(`/api/integrations${qs ? `?${qs}` : ""}`);
      if (r.ok) setIntegrations(await r.json() as Integration[]);
    } catch { /* keep last state */ }
  });
  fetchIntegrations.current = async () => {
    try {
      const qs = deploymentId ? `deployment_id=${deploymentId}` : "";
      const r = await fetch(`/api/integrations${qs ? `?${qs}` : ""}`);
      if (r.ok) setIntegrations(await r.json() as Integration[]);
    } catch { /* keep last state */ }
  };

  useEffect(() => {
    if (tab !== "integrations") return;
    void fetchIntegrations.current();
    const id = setInterval(() => void fetchIntegrations.current(), 10_000);
    return () => clearInterval(id);
  }, [tab, deploymentId]);

  async function connectGitHub() {
    if (!repoInput.trim() || connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const r = await fetch("/api/integrations/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deployment_id: deploymentId, repo_url: repoInput.trim() }),
      });
      if (r.ok) {
        setRepoInput("");
        await fetchIntegrations.current();
      } else {
        const data = await r.json().catch(() => ({})) as { error?: string };
        setConnectError(data.error ?? "Failed to connect repository");
      }
    } catch {
      setConnectError("Network error — please try again");
    }
    setConnecting(false);
  }

  // ── Task 11: edit/delete handlers ──────────────────────────────────────────
  async function saveEdit(msgId: string) {
    if (!editBody.trim()) return;
    await fetch(`/api/collab/messages/${msgId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ body: editBody }),
    });
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, body: editBody, edited_at: new Date().toISOString() } : m
    ));
    setEditingId(null);
  }

  async function confirmDelete(msgId: string) {
    await fetch(`/api/collab/messages/${msgId}`, { method: "DELETE" });
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, body: "[deleted]", deleted_at: new Date().toISOString() } : m
    ));
    setDeleteAskId(null);
  }

  // ── Task 12: reaction handler ──────────────────────────────────────────────
  async function toggleReaction(msgId: string, emoji: string) {
    const myId = profileId ?? "";
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = m.reactions ?? [];
      const group = reactions.find(r => r.emoji === emoji);
      if (group) {
        const alreadyReacted = group.profile_ids.includes(myId);
        return {
          ...m,
          reactions: alreadyReacted
            ? reactions.map(r => r.emoji !== emoji ? r : {
                ...r, count: r.count - 1,
                profile_ids: r.profile_ids.filter(id => id !== myId),
              }).filter(r => r.count > 0)
            : reactions.map(r => r.emoji !== emoji ? r : {
                ...r, count: r.count + 1,
                profile_ids: [...r.profile_ids, myId],
              }),
        };
      }
      return { ...m, reactions: [...reactions, { emoji, count: 1, profile_ids: [myId] }] };
    }));
    await fetch("/api/collab/reactions", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message_id: msgId, emoji }),
    });
    setEmojiPickerMsgId(null);
  }

  // ── Task 13: thread handlers ───────────────────────────────────────────────
  async function openThread(msgId: string) {
    setThreadMsgId(msgId);
    setThreadMessages([]);
    setThreadLoading(true);
    try {
      const r = await fetch(`/api/collab/messages/${msgId}/thread`);
      if (r.ok) {
        const data: ChatMessage[] = await r.json() as ChatMessage[];
        setThreadMessages(data.map(m => ({
          id:          m.id,
          author:      (m.sender_name ?? "Unknown") as string,
          role:        (m.sender_id === profileId ? "talent" : "client") as ChatMessage["role"],
          body:        m.body,
          ts:          m.ts,
          file:        (m.file_name ?? undefined) as string | undefined,
          file_path:   m.file_path ?? undefined,
          edited_at:   m.edited_at,
          deleted_at:  m.deleted_at,
          reactions:   m.reactions ?? [],
          sender_id:   m.sender_id,
        })));
      }
    } catch { /* keep empty */ }
    setThreadLoading(false);
  }

  async function sendThreadReply() {
    if (!threadInput.trim() || threadSending || !threadMsgId || !deploymentId || !profileId) return;
    setThreadSending(true);
    const body = threadInput.trim();
    setThreadInput("");
    try {
      await fetch("/api/collab/messages", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          deployment_id: deploymentId,
          sender_id:     profileId,
          sender_name:   displayName,
          body,
          parent_msg_id: threadMsgId,
        }),
      });
      await openThread(threadMsgId);
    } catch { /* silent */ }
    setThreadSending(false);
  }

  // ── Task 14: real file upload handler (chat attachment) ────────────────────
  async function handleChatFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !deploymentId) return;
    e.target.value = "";

    setAttachment({ file_name: f.name, file_path: null, error: null, progress: true });

    const form = new FormData();
    form.append("file", f);

    try {
      const r = await fetch(`/api/collab/upload?deployment_id=${deploymentId}`, {
        method: "POST",
        body:   form,
      });
      if (r.ok) {
        const data = await r.json() as { file_name: string; file_path: string; url: string };
        setAttachment({ file_name: data.file_name, file_path: data.file_path, error: null, progress: false });
      } else if (r.status === 413) {
        setAttachment(prev => prev ? { ...prev, error: "File exceeds 25 MB", progress: false } : null);
      } else {
        setAttachment(prev => prev ? { ...prev, error: "Upload failed", progress: false } : null);
      }
    } catch {
      setAttachment(prev => prev ? { ...prev, error: "Network error", progress: false } : null);
    }
  }

  // ── Task 14: real file upload handler (Files tab) ──────────────────────────
  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !deploymentId) return;
    e.target.value = "";

    const form = new FormData();
    form.append("file", f);

    const r = await fetch(`/api/collab/upload?deployment_id=${deploymentId}`, {
      method: "POST",
      body:   form,
    }).catch(() => null);

    if (r?.ok) {
      const data = await r.json() as { file_name: string; file_path: string };
      const ext  = data.file_name.split(".").pop()?.toLowerCase() ?? "";
      const type: SharedFile["type"] =
        ["png","jpg","jpeg","gif","webp","svg"].includes(ext) ? "image" :
        ["zip","tar","gz","wasm","dmg"].includes(ext)         ? "archive" :
        ["ts","js","rs","toml","json","py","sh","md"].includes(ext) ? "code" : "doc";
      setFiles(prev => [...prev, {
        id:       data.file_path,
        name:     data.file_name,
        type,
        size:     `${(f.size / 1024).toFixed(0)} KB`,
        uploaded: "Just now",
        uploader: "You",
        version:  1,
      }]);
    }
  }

  // ── Send message (updated for Task 14 attachment) ──────────────────────────
  async function sendMessage() {
    if ((!input.trim() && !attachment?.file_path) || sending || !!attachment?.progress) return;
    setSending(true);
    const body = input.trim() || "(file attached)";
    setInput("");
    const currentAttachment = attachment;
    setAttachment(null);

    if (!deploymentId || !profileId) {
      // No deployment — optimistic local only (demo mode)
      setMessages(prev => [...prev, {
        id: `m${Date.now()}`, author: "You", role: "talent",
        body, ts: "Just now", file: currentAttachment?.file_name ?? undefined,
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
          file_name:     currentAttachment?.file_name ?? null,
          file_path:     currentAttachment?.file_path ?? null,
        }),
      });
    } catch { /* silent — SSE will catch up */ }
    setSending(false);
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
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
              {messages.filter(m => !m.parent_msg_id).map((msg) => {
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
                  <div key={msg.id} className={`group flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-[9px] font-medium ${
                      isMe ? "bg-sky-950 text-sky-400 border border-sky-800" : "bg-purple-950 text-purple-400 border border-purple-800"
                    }`}>
                      {msg.author[0]}
                    </div>
                    <div className={`max-w-[75%] space-y-1 ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`flex items-center gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        <span className="font-mono text-[9px] text-zinc-500">{msg.author}</span>
                        <span className="font-mono text-[9px] text-zinc-700">{msg.ts}</span>
                        {msg.edited_at && !msg.deleted_at && (
                          <span className="font-mono text-[8px] text-zinc-600">(edited)</span>
                        )}
                      </div>

                      {/* Message bubble — edit mode or display */}
                      {editingId === msg.id ? (
                        <div className="w-full space-y-1">
                          <textarea
                            value={editBody}
                            onChange={e => setEditBody(e.target.value)}
                            className="w-full min-h-[60px] px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 resize-none"
                          />
                          <div className="flex gap-1">
                            <button onClick={() => void saveEdit(msg.id)}
                              className="font-mono text-[9px] text-amber-400 hover:text-amber-300 px-1.5 py-0.5 border border-amber-900 rounded-sm">Save</button>
                            <button onClick={() => setEditingId(null)}
                              className="font-mono text-[9px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 border border-zinc-700 rounded-sm">Cancel</button>
                          </div>
                        </div>
                      ) : msg.deleted_at ? (
                        <div className={`border rounded-sm px-2.5 py-2 font-mono text-xs leading-relaxed border-zinc-800 bg-zinc-900`}>
                          <span className="italic text-zinc-600">Message deleted</span>
                        </div>
                      ) : (
                        <div className={`border rounded-sm px-2.5 py-2 font-mono text-xs leading-relaxed ${
                          isMe
                            ? "border-sky-900/50 bg-sky-950/20 text-zinc-300"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400"
                        }`}>
                          {msg.body}
                        </div>
                      )}

                      {/* Hover toolbar */}
                      {!msg.deleted_at && editingId !== msg.id && (
                        <div className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 mt-0.5 ${isMe ? "justify-end" : ""}`}>
                          <button onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id)}
                            className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1">React</button>
                          <button onClick={() => void openThread(msg.id)}
                            className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1">Reply</button>
                          {isMe && (
                            <button onClick={() => { setEditingId(msg.id); setEditBody(msg.body); }}
                              className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1">Edit</button>
                          )}
                          {isMe && deleteAskId !== msg.id && (
                            <button onClick={() => setDeleteAskId(msg.id)}
                              className="font-mono text-[9px] text-zinc-600 hover:text-red-400 px-1">Delete</button>
                          )}
                          {isMe && deleteAskId === msg.id && (
                            <span className="flex items-center gap-1">
                              <span className="font-mono text-[9px] text-zinc-500">Delete?</span>
                              <button onClick={() => void confirmDelete(msg.id)} className="font-mono text-[9px] text-red-400 hover:text-red-300 px-1">Yes</button>
                              <button onClick={() => setDeleteAskId(null)} className="font-mono text-[9px] text-zinc-600 hover:text-zinc-400 px-1">No</button>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Reaction bar */}
                      {((msg.reactions ?? []).length > 0 || emojiPickerMsgId === msg.id) && !msg.deleted_at && (
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          {(msg.reactions ?? []).filter(r => r.count > 0).map(r => {
                            const iMine = r.profile_ids.includes(profileId ?? "");
                            return (
                              <button key={r.emoji} onClick={() => void toggleReaction(msg.id, r.emoji)}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-mono text-[10px] transition-colors ${
                                  iMine ? "border-amber-700 bg-amber-950/30 text-amber-400"
                                        : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
                                }`}>
                                {r.emoji} {r.count}
                              </button>
                            );
                          })}
                          {emojiPickerMsgId === msg.id ? (
                            <div className="flex flex-wrap gap-0.5 p-2 border border-zinc-700 bg-zinc-900 rounded-sm max-w-[224px] z-10">
                              {ALLOWED_EMOJI.map(e => (
                                <button key={e} onClick={() => void toggleReaction(msg.id, e)}
                                  className="text-sm hover:bg-zinc-800 rounded px-0.5">{e}</button>
                              ))}
                            </div>
                          ) : (
                            <button onClick={() => setEmojiPickerMsgId(msg.id)}
                              className="px-1.5 py-0.5 border border-zinc-800 rounded-sm font-mono text-[10px] text-zinc-600 hover:text-zinc-400 hover:border-zinc-700">+</button>
                          )}
                        </div>
                      )}

                      {/* Thread reply count link */}
                      {!msg.deleted_at && (msg.reply_count ?? 0) > 0 && (
                        <button onClick={() => void openThread(msg.id)}
                          className="font-mono text-[9px] text-zinc-500 hover:text-amber-400 transition-colors flex items-center gap-1 mt-0.5">
                          {msg.reply_count} {msg.reply_count === 1 ? "reply" : "replies"}
                        </button>
                      )}

                      {msg.file && !msg.deleted_at && (
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
              {attachment && (
                <div className="flex items-center gap-2 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-sm w-fit max-w-[280px]">
                  <Paperclip className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                  <span className="font-mono text-[10px] text-zinc-300 truncate flex-1">{attachment.file_name}</span>
                  {attachment.progress && <Loader2 className="w-2.5 h-2.5 animate-spin text-zinc-500 flex-shrink-0" />}
                  {attachment.error && <span className="font-mono text-[9px] text-red-400">{attachment.error}</span>}
                  {!attachment.progress && !attachment.error && (
                    <span className="font-mono text-[9px] text-emerald-500">done</span>
                  )}
                  <button onClick={() => setAttachment(null)} className="text-zinc-600 hover:text-zinc-300 flex-shrink-0">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="file" ref={chatFileRef} onChange={e => void handleChatFile(e)} className="hidden" />
                <button
                  onClick={() => chatFileRef.current?.click()}
                  className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-sm border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                  placeholder="Message…"
                  className="flex-1 h-9 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <button
                  onClick={() => void sendMessage()}
                  disabled={(!input.trim() && !attachment?.file_path) || sending || !!attachment?.progress}
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
                        <a href={`/api/collab/files/${f.id}`} download={f.name}
                           className="font-mono text-[10px] text-zinc-300 hover:text-amber-400 truncate transition-colors">
                          {f.name}
                        </a>
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

            <input type="file" ref={uploadFileRef} onChange={e => void handleUploadFile(e)} className="hidden" />
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
            {/* Engagement selector — shown when no deployment_id in URL */}
            {!deploymentIdFromUrl && (
              <div className="border border-amber-900/50 bg-amber-950/20 rounded-sm p-3 space-y-2">
                <p className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">Select Engagement</p>
                {engagementsLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader className="w-3 h-3 animate-spin text-zinc-500" />
                    <span className="font-mono text-[9px] text-zinc-500">Loading your engagements…</span>
                  </div>
                ) : myEngagements.length > 0 ? (
                  <select
                    value={manualDeploymentId}
                    onChange={e => { setManualDeploymentId(e.target.value); setIntegrations([]); }}
                    className="w-full h-8 px-2.5 bg-zinc-900 border border-zinc-700 rounded-sm font-mono text-xs text-zinc-100 focus:outline-none focus:border-amber-700 cursor-pointer"
                  >
                    <option value="">— pick an engagement —</option>
                    {myEngagements.map(eng => (
                      <option key={eng.id} value={eng.id}>
                        {eng.agent_name} · {eng.state} · {eng.id.slice(0, 8)}…
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="font-mono text-[9px] text-zinc-500">
                    No engagements found. Deploy from the{" "}
                    <a href="/marketplace" className="text-amber-400 hover:underline">Marketplace</a>{" "}
                    to create one.
                  </p>
                )}
              </div>
            )}

            {/* Connect GitHub form — always available */}
            <div className="border border-zinc-800 rounded-sm p-3 space-y-2">
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Connect GitHub Repo</p>
              <div className="flex gap-2">
                <input
                  value={repoInput}
                  onChange={e => { setRepoInput(e.target.value); setConnectError(null); }}
                  onKeyDown={e => { if (e.key === "Enter") void connectGitHub(); }}
                  placeholder="https://github.com/owner/repo"
                  className="flex-1 h-8 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <button
                  onClick={() => void connectGitHub()}
                  disabled={!repoInput.trim() || connecting}
                  className="h-8 px-3 rounded-sm border border-zinc-700 text-zinc-400 font-mono text-[9px] uppercase tracking-widest hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {connecting ? <Loader className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Connect
                </button>
              </div>
              {connectError && <p className="font-mono text-[9px] text-red-400">{connectError}</p>}
              <p className="font-mono text-[9px] text-zinc-600">
                Requires sign-in with GitHub · Registers a webhook for push + PR events
                {deploymentId && " · Scoped to current engagement"}
              </p>
            </div>

            {/* Integration list */}
            {integrations.length === 0 && deploymentId && (
              <p className="font-mono text-[10px] text-zinc-600 text-center py-4">No integrations connected yet</p>
            )}

            {integrations.map(int => (
              <div key={int.id} className="border border-zinc-700 rounded-sm p-3 bg-zinc-900/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-sm border border-zinc-700 bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div>
                      <p className="font-mono text-xs font-medium text-zinc-100">{int.name}</p>
                      <p className="font-mono text-[9px] text-zinc-600 capitalize">{int.provider} · connected {int.connected_at}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-mono text-[9px] text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> Connected
                    </span>
                    <a href={int.external_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors">
                      <ExternalLink className="w-2.5 h-2.5" /> Open
                    </a>
                  </div>
                </div>

                {/* Recent events */}
                {int.events.length > 0 ? (
                  <div className="space-y-1">
                    {int.events.map(ev => (
                      <div key={ev.id} className="flex items-start gap-2 border border-zinc-800 rounded-sm px-2.5 py-1.5 bg-zinc-950/40">
                        <Clock className="w-2.5 h-2.5 text-zinc-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-mono text-[10px] text-zinc-300">{ev.title}</p>
                          <p className="font-mono text-[9px] text-zinc-600">{ev.occurred_at}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[9px] text-zinc-600 pl-1">No events yet — push to the repo to see activity</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Thread Panel */}
      {threadMsgId && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="flex-1" onClick={() => setThreadMsgId(null)} />
          <div className="w-full sm:w-80 h-full bg-zinc-950 border-l border-zinc-800 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <span className="font-mono text-xs font-medium text-zinc-300">Thread</span>
              <button onClick={() => setThreadMsgId(null)} className="text-zinc-600 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Parent message preview */}
            {(() => {
              const parent = messages.find(m => m.id === threadMsgId);
              if (!parent) return null;
              return (
                <div className="px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/30 flex-shrink-0">
                  <p className="font-mono text-[9px] text-zinc-500">{parent.author}</p>
                  <p className="font-mono text-xs text-zinc-400 line-clamp-2 mt-0.5">
                    {parent.deleted_at ? "Message deleted" : parent.body}
                  </p>
                </div>
              );
            })()}

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {threadLoading ? (
                <div className="flex justify-center pt-4">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                </div>
              ) : threadMessages.length === 0 ? (
                <p className="font-mono text-[10px] text-zinc-600 text-center pt-4">No replies yet.</p>
              ) : threadMessages.map(tm => {
                const isMeTm = tm.sender_id === profileId;
                return (
                  <div key={tm.id} className={`flex gap-2 ${isMeTm ? "flex-row-reverse" : ""}`}>
                    <div className={`w-5 h-5 rounded-sm flex-shrink-0 flex items-center justify-center font-mono text-[8px] font-medium ${
                      isMeTm ? "bg-sky-950 text-sky-400 border border-sky-800" : "bg-purple-950 text-purple-400 border border-purple-800"
                    }`}>{tm.author[0]}</div>
                    <div className={`max-w-[80%] space-y-0.5 flex flex-col ${isMeTm ? "items-end" : ""}`}>
                      <div className={`flex items-center gap-1.5 ${isMeTm ? "flex-row-reverse" : ""}`}>
                        <span className="font-mono text-[8px] text-zinc-600">{tm.author}</span>
                        <span className="font-mono text-[8px] text-zinc-700">{tm.ts}</span>
                      </div>
                      <div className={`border rounded-sm px-2 py-1.5 font-mono text-xs leading-relaxed ${
                        isMeTm ? "border-sky-900/50 bg-sky-950/20 text-zinc-300"
                               : "border-zinc-800 bg-zinc-900 text-zinc-400"
                      }`}>
                        {tm.deleted_at ? <span className="italic text-zinc-600">Message deleted</span> : tm.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply input */}
            <div className="border-t border-zinc-800 p-3 flex-shrink-0">
              <div className="flex gap-2">
                <input
                  value={threadInput}
                  onChange={e => setThreadInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendThreadReply(); } }}
                  placeholder="Reply in thread…"
                  className="flex-1 h-8 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <button onClick={() => void sendThreadReply()}
                  disabled={!threadInput.trim() || threadSending}
                  className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-sm border border-amber-900 bg-amber-950/30 text-amber-400 disabled:opacity-30">
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
