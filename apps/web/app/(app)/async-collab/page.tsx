"use client";

import {
  useState, useRef, useEffect, useCallback,
  type RefObject, Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Video, Globe, ArrowRight, MessageSquare, Zap, Clock,
  CheckCircle2, ChevronDown, ChevronUp, X, MicOff, Mic,
  Upload, Play,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VideoUpdate {
  id:            string;
  deployment_id: string | null;
  author_id:     string;
  author_name:   string;
  title:         string;
  video_path:    string | null;
  duration_s:    number;
  ai_summary:    string | null;
  tags:          string[];
  viewed:        boolean;
  created_at:    string;
}

interface HandoffEntry {
  id:           string;
  phase:        string;
  from:         string;
  to:           string;
  date:         string;
  status:       "pending" | "in_review" | "accepted";
  deliverables: string[];
  notes:        string;
}

// Kept as demo until a handoffs backend is built
const DEMO_HANDOFFS: HandoffEntry[] = [
  {
    id: "hof-001", phase: "Phase 2 → Phase 3",
    from: "Marcus T.", to: "Acme Corp", date: "2026-03-05", status: "accepted",
    deliverables: ["agent.wasm (sha256: a4f9…)", "test suite (24 passing)", "deployment runbook v1"],
    notes: "All DoD checklist items met. Client confirmed acceptance. Escrow for Phase 2 released.",
  },
  {
    id: "hof-002", phase: "Phase 3 Handoff",
    from: "Marcus T.", to: "Acme Corp", date: "2026-03-08", status: "in_review",
    deliverables: ["live deployment URL", "DoD checklist 6/6", "monitoring dashboard config"],
    notes: "Awaiting client review. 30s veto window active. Escrow held pending approval.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(iso: string) {
  return iso.slice(0, 10);
}

const HANDOFF_STATUS = {
  pending:   { label: "Pending",   color: "text-zinc-500",  border: "border-zinc-700"  },
  in_review: { label: "In Review", color: "text-amber-400", border: "border-amber-800" },
  accepted:  { label: "Accepted",  color: "text-green-400", border: "border-green-800" },
};

const AVAILABLE_TAGS = ["milestone", "blocker", "blocker-resolved", "on-track", "review-needed", "demo", "auth", "wasm"];

// ── VideoCard ─────────────────────────────────────────────────────────────────

function VideoCard({
  video,
  profileId,
  onWatch,
}: {
  video: VideoUpdate;
  profileId: string | undefined;
  onWatch: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(!video.viewed);

  const markViewed = useCallback(async () => {
    if (video.viewed || !profileId) return;
    await fetch(`/api/async-collab/video/${video.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewer_id: profileId }),
    }).catch(() => {});
  }, [video.id, video.viewed, profileId]);

  const handleWatch = () => {
    markViewed();
    onWatch(video.id);
  };

  return (
    <div className={`border rounded-sm overflow-hidden ${
      !video.viewed ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      <div
        role="button" tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded(v => !v)}
        className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-900/30 transition-colors"
      >
        {/* Thumbnail */}
        <div className="w-20 h-12 bg-zinc-800 border border-zinc-700 rounded-sm flex-shrink-0 flex items-center justify-center relative">
          {video.video_path
            ? <Play className="w-5 h-5 text-amber-400" />
            : <Video className="w-5 h-5 text-zinc-600" />}
          {video.duration_s > 0 && (
            <span className="absolute bottom-1 right-1 font-mono text-[8px] text-zinc-500 bg-zinc-900 px-0.5 rounded">
              {fmtDuration(video.duration_s)}
            </span>
          )}
          {!video.viewed && (
            <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-mono text-xs font-medium ${!video.viewed ? "text-zinc-100" : "text-zinc-300"}`}>
              {video.title}
            </p>
            {!video.viewed && (
              <span className="font-mono text-[9px] px-1 border border-amber-800 text-amber-400 rounded-sm uppercase">New</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="font-mono text-[10px] text-sky-400">{video.author_name}</span>
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
              <Clock className="w-2.5 h-2.5" />{fmtDate(video.created_at)}
            </span>
          </div>
        </div>

        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1" />
          : <ChevronDown className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950/40 p-3 space-y-3">
          {video.ai_summary && (
            <div className="flex items-start gap-2 border border-amber-900/30 bg-amber-950/10 rounded-sm p-2.5">
              <Zap className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-[9px] text-amber-500 uppercase tracking-widest mb-1">Summary</p>
                <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">{video.ai_summary}</p>
              </div>
            </div>
          )}

          {video.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {video.tags.map(t => (
                <span key={t} className="font-mono text-[9px] text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded-sm">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {video.video_path ? (
              <button
                onClick={handleWatch}
                className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-amber-800 text-amber-400
                           font-mono text-[10px] uppercase tracking-widest hover:border-amber-600 transition-colors"
              >
                <Play className="w-3 h-3" /> Watch {video.duration_s > 0 ? `(${fmtDuration(video.duration_s)})` : ""}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-zinc-800 text-zinc-600
                               font-mono text-[10px] uppercase tracking-widest">
                <Video className="w-3 h-3" /> No video attached
              </span>
            )}
            <a
              href="/collab"
              className="flex items-center gap-1.5 h-8 px-3 rounded-sm border border-zinc-700 text-zinc-500
                         font-mono text-[10px] uppercase tracking-widest hover:border-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <MessageSquare className="w-3 h-3" /> Reply in Chat
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── HandoffCard ───────────────────────────────────────────────────────────────

function HandoffCard({ entry }: { entry: HandoffEntry }) {
  const s = HANDOFF_STATUS[entry.status];
  return (
    <div className={`border rounded-sm p-3 ${
      entry.status === "in_review" ? "border-amber-900/50 bg-amber-950/5" : "border-zinc-800 bg-zinc-900/40"
    }`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs font-medium text-zinc-100">{entry.phase}</p>
          <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm ${s.color} ${s.border}`}>
            {s.label}
          </span>
        </div>
        <span className="font-mono text-[9px] text-zinc-600">{entry.date}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[10px] text-sky-400">{entry.from}</span>
        <ArrowRight className="w-3 h-3 text-zinc-600" />
        <span className="font-mono text-[10px] text-purple-400">{entry.to}</span>
      </div>
      <div className="space-y-1 mb-2">
        {entry.deliverables.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <CheckCircle2 className={`w-3 h-3 flex-shrink-0 ${
              entry.status === "accepted" ? "text-green-400" : "text-zinc-600"
            }`} />
            <span className="font-mono text-[9px] text-zinc-400">{d}</span>
          </div>
        ))}
      </div>
      <p className="font-mono text-[9px] text-zinc-600 leading-relaxed">{entry.notes}</p>
    </div>
  );
}

// ── VideoModal ────────────────────────────────────────────────────────────────

function VideoModal({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 border border-zinc-700 rounded-sm bg-zinc-950 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Video Update</p>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <video
          src={`/api/async-collab/video/${id}`}
          controls
          autoPlay
          className="w-full bg-black"
          style={{ maxHeight: "60vh" }}
        />
      </div>
    </div>
  );
}

// ── RecordTab ─────────────────────────────────────────────────────────────────

function RecordTab({
  deploymentId,
  onPosted,
}: {
  deploymentId: string | null;
  onPosted: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null) as RefObject<HTMLVideoElement>;

  const startRecording = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.muted = true; // avoid feedback during recording
        liveVideoRef.current.play();
      }

      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = null;
          liveVideoRef.current.src = url;
          liveVideoRef.current.muted = false;
          liveVideoRef.current.controls = true;
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s >= 599) { stopRecording(); return s; }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCamError(msg.includes("Permission") || msg.includes("NotAllowed")
        ? "Camera/mic permission denied. Allow access in your browser settings."
        : `Could not access camera: ${msg}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const toggleMute = () => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = muted; });
      setMuted(m => !m);
    }
  };

  const discard = () => {
    setRecordedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSeconds(0);
    if (liveVideoRef.current) {
      liveVideoRef.current.src = "";
      liveVideoRef.current.srcObject = null;
      liveVideoRef.current.controls = false;
    }
  };

  const postUpdate = async () => {
    if (!title.trim() && !recordedBlob) return;
    setUploading(true);
    const form = new FormData();
    form.append("title", title.trim() || "Video update");
    form.append("tags", selectedTags.join(","));
    form.append("duration_s", String(seconds));
    if (deploymentId) form.append("deployment_id", deploymentId);
    if (recordedBlob) form.append("video", recordedBlob, "update.webm");

    const res = await fetch("/api/async-collab/upload", { method: "POST", body: form }).catch(() => null);
    setUploading(false);
    if (res?.ok) {
      discard();
      setTitle("");
      setSelectedTags([]);
      onPosted();
    }
  };

  const toggleTag = (t: string) =>
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div className="space-y-4">
      {/* Camera preview */}
      <div className="relative border border-zinc-800 rounded-sm overflow-hidden bg-zinc-950">
        <video
          ref={liveVideoRef}
          className="w-full"
          style={{ maxHeight: "300px", objectFit: "cover", background: "#000" }}
          playsInline
        />
        {!recording && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950">
            <Video className="w-8 h-8 text-zinc-700" />
            <p className="font-mono text-[10px] text-zinc-600">Click record to start — browser will ask for camera access</p>
          </div>
        )}
        {recording && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-zinc-950/80 px-2 py-1 rounded-sm">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-[10px] text-red-400">{fmtDuration(seconds)}</span>
          </div>
        )}
      </div>

      {camError && (
        <p className="font-mono text-[10px] text-red-400 border border-red-900/50 bg-red-950/10 px-3 py-2 rounded-sm">
          {camError}
        </p>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {!recording && !previewUrl && (
          <button
            onClick={startRecording}
            className="flex items-center gap-1.5 h-9 px-4 rounded-sm border border-red-800 bg-red-950/20
                       text-red-400 font-mono text-xs uppercase tracking-widest hover:border-red-600 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-red-500" /> Record
          </button>
        )}
        {recording && (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 h-9 px-4 rounded-sm border border-red-700 bg-red-950/30
                         text-red-400 font-mono text-xs uppercase tracking-widest hover:border-red-500 transition-colors"
            >
              <span className="w-3 h-3 rounded-sm bg-red-500" /> Stop
            </button>
            <button
              onClick={toggleMute}
              className="flex items-center gap-1.5 h-9 px-3 rounded-sm border border-zinc-700 text-zinc-400
                         font-mono text-xs hover:border-zinc-500 transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="w-3.5 h-3.5 text-red-400" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
          </>
        )}
        {previewUrl && !recording && (
          <button
            onClick={discard}
            className="flex items-center gap-1.5 h-9 px-3 rounded-sm border border-zinc-700 text-zinc-500
                       font-mono text-xs uppercase tracking-widest hover:border-zinc-500 transition-colors"
          >
            <X className="w-3 h-3" /> Discard
          </button>
        )}
      </div>

      {/* Metadata form */}
      <div className="space-y-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Update title…"
          className="w-full h-9 px-2.5 bg-zinc-900 border border-zinc-800 rounded-sm font-mono text-xs
                     text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <div className="flex gap-1.5 flex-wrap">
          {AVAILABLE_TAGS.map(t => (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className={`font-mono text-[9px] px-1.5 py-0.5 rounded-sm border transition-colors ${
                selectedTags.includes(t)
                  ? "border-amber-700 text-amber-400 bg-amber-950/20"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={postUpdate}
        disabled={uploading || (!title.trim() && !recordedBlob)}
        className="w-full h-9 rounded-sm border border-amber-800 bg-amber-950/30 text-amber-400
                   font-mono text-xs uppercase tracking-widest hover:border-amber-600 transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {uploading
          ? <><span className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" /> Uploading…</>
          : <><Upload className="w-3 h-3" /> Post Update</>}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function AsyncCollabPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const deploymentId = searchParams.get("deployment_id");
  const profileId = (session?.user as { profileId?: string })?.profileId;

  const [tab, setTab] = useState<"videos" | "handoffs" | "compose">("videos");
  const [updates, setUpdates] = useState<VideoUpdate[]>([]);
  const [loadingUpdates, setLoadingUpdates] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);

  const fetchUpdates = useCallback(async () => {
    const url = deploymentId
      ? `/api/async-collab/updates?deployment_id=${deploymentId}`
      : `/api/async-collab/updates`;
    const res = await fetch(url).catch(() => null);
    if (res?.ok) {
      const data = await res.json() as { updates: VideoUpdate[] };
      setUpdates(data.updates);
    }
    setLoadingUpdates(false);
  }, [deploymentId]);

  useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

  const unread = updates.filter(u => !u.viewed).length;

  return (
    <>
      {watchingId && (
        <VideoModal id={watchingId} onClose={() => setWatchingId(null)} />
      )}
        <main className="flex-1 p-4 pb-20 lg:pb-4 max-w-3xl mx-auto w-full space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
                Async Collaboration
              </h1>
              <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
                Video updates · structured handoffs · timezone-aware
              </p>
            </div>
            <Video className="w-5 h-5 text-amber-500" />
          </div>

          {/* Timezone note */}
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3 flex items-center gap-3">
            <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <p className="font-mono text-[10px] text-zinc-400 leading-relaxed">
              Record video updates at any time — teammates watch when their day starts.
              {deploymentId && (
                <span className="ml-1 text-zinc-600">Linked to engagement <span className="text-zinc-400 font-mono">{deploymentId.slice(0, 8)}…</span></span>
              )}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Updates",  value: String(updates.length), color: "text-sky-400"   },
              { label: "Unread",   value: String(unread),         color: "text-amber-400" },
              { label: "Handoffs", value: String(DEMO_HANDOFFS.length), color: "text-zinc-300" },
            ].map(({ label, value, color }) => (
              <div key={label} className="border border-zinc-800 rounded-sm p-2.5 bg-zinc-900/40">
                <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">{label}</p>
                <p className={`font-mono text-base font-medium tabular-nums mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800">
            {[
              { key: "videos"   as const, label: `Updates (${updates.length})` },
              { key: "handoffs" as const, label: `Handoffs (${DEMO_HANDOFFS.length})` },
              { key: "compose"  as const, label: "Record Update" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-3 py-2 font-mono text-xs border-b-2 transition-colors ${
                  tab === key
                    ? "border-amber-500 text-amber-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >{label}</button>
            ))}
          </div>

          {tab === "videos" && (
            <div className="space-y-2">
              {loadingUpdates ? (
                <div className="border border-zinc-800 rounded-sm p-6 flex items-center justify-center">
                  <span className="font-mono text-[10px] text-zinc-600">Loading updates…</span>
                </div>
              ) : updates.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-sm p-6 text-center">
                  <p className="font-mono text-xs text-zinc-600">No updates yet</p>
                  <p className="font-mono text-[10px] text-zinc-700 mt-1">
                    Switch to the <button onClick={() => setTab("compose")} className="text-amber-500 hover:underline">Record Update</button> tab to post the first one
                  </p>
                </div>
              ) : (
                updates.map(v => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    profileId={profileId}
                    onWatch={setWatchingId}
                  />
                ))
              )}
            </div>
          )}

          {tab === "handoffs" && (
            <div className="space-y-2">
              {DEMO_HANDOFFS.map(h => <HandoffCard key={h.id} entry={h} />)}
              <p className="font-mono text-[9px] text-zinc-700 text-center pt-1">
                Handoff records are created automatically when DoD checklist is finalized
              </p>
            </div>
          )}

          {tab === "compose" && (
            <RecordTab
              deploymentId={deploymentId}
              onPosted={() => { setTab("videos"); fetchUpdates(); }}
            />
          )}
        </main>
          </>
  );
}

export default function AsyncCollabPage() {
  return (
    <Suspense>
      <AsyncCollabPageInner />
    </Suspense>
  );
}
