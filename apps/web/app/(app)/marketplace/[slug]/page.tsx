"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft, Star, CheckCircle, Shield, Clock, AlertTriangle,
  ChevronRight, Loader2, MessageSquare, Play, Users, Zap,
  FileText, Package, ClipboardList, BadgeCheck,
} from "lucide-react";
import {
  fetchListingBySlug, fetchListingMedia,
  type AgentListing, type ListingMedia,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "deliverables" | "requirements" | "reviews";

interface Review {
  id:        string;
  author:    string;
  tier:      "BiometricVerified" | "SocialVerified";
  role:      string;
  stars:     number;
  body:      string;
  date:      string;
}

interface Deliverable {
  label:  string;
  detail: string;
}

interface Requirement {
  required: boolean;
  label:    string;
  detail:   string;
}

interface Step {
  day:   string;
  label: string;
}

// ── Category-aware demo data ──────────────────────────────────────────────────

function getSteps(listing: AgentListing): Step[] {
  const cat = listing.category;
  if (cat === "AiTalent") return [
    { day: "Day 1",    label: "Kickoff call — scope alignment and access setup" },
    { day: "Day 2",    label: "First deliverable draft shared for feedback" },
    { day: "Day 3–5",  label: "Revisions based on your feedback" },
    { day: "Day 7",    label: "Final delivery + handoff documentation" },
    { day: "Ongoing",  label: "7-day warranty period — bugs fixed at no cost" },
  ];
  if (cat === "AiRobot") return [
    { day: "Day 1",    label: "Hardware compatibility check and calibration spec" },
    { day: "Day 2",    label: "Remote configuration and sandbox test run" },
    { day: "Day 3",    label: "Live environment test with your hardware" },
    { day: "Day 5",    label: "Handover — operational runbook delivered" },
    { day: "Ongoing",  label: "Telemetry monitoring active via dashboard" },
  ];
  return [
    { day: "Day 1",    label: "Credential setup and brief confirmation" },
    { day: "Day 2",    label: "Content calendar / execution plan delivered" },
    { day: "Day 3",    label: "First batch live — review and approve" },
    { day: "Day 7",    label: "First performance report delivered" },
    { day: "Ongoing",  label: "Daily automation running — weekly reports" },
  ];
}

function getDeliverables(listing: AgentListing): Deliverable[] {
  const cat = listing.category;
  if (cat === "AiTalent") return [
    { label: "Source code (GitHub repo or ZIP)",       detail: "Clean, commented, production-ready" },
    { label: "Documentation (Markdown)",               detail: "Setup guide, API reference, examples" },
    { label: "Unit + integration tests",               detail: "Minimum 80% coverage on core paths" },
    { label: "2 rounds of revisions included",         detail: "Turnaround < 48h per round" },
    { label: "7-day warranty",                         detail: "Bug fixes at no extra cost" },
  ];
  if (cat === "AiRobot") return [
    { label: "Calibrated robot configuration file",    detail: "JSON export, version-controlled" },
    { label: "Operational runbook (PDF)",              detail: "Step-by-step ops guide" },
    { label: "Telemetry dashboard access",             detail: "Live heartbeat + drift detection" },
    { label: "Remote support session (1h)",            detail: "Via async video or call" },
    { label: "7-day warranty",                         detail: "Recalibration at no cost" },
  ];
  return [
    { label: "30 short-form videos (9:16, MP4)",       detail: "Ready to post, branded" },
    { label: "30 static image posts (1:1, PNG)",       detail: "1080px, on-brand" },
    { label: "Automated comment replies (24/7)",       detail: "Context-aware, no canned responses" },
    { label: "Automated DM handling",                  detail: "Business hours, escalates edge cases" },
    { label: "Weekly performance PDF report",          detail: "Reach, engagement, growth metrics" },
  ];
}

function getRequirements(listing: AgentListing): Requirement[] {
  const cat = listing.category;
  if (cat === "AiTalent") return [
    { required: true,  label: "Project brief or requirements doc",       detail: "PDF, Notion page, or Google Doc link" },
    { required: true,  label: "Tech stack preferences",                  detail: "Languages, frameworks, constraints" },
    { required: false, label: "Existing codebase access (if applicable)", detail: "GitHub repo or ZIP" },
    { required: false, label: "Design mockups or wireframes",             detail: "Figma, screenshots, or sketches" },
  ];
  if (cat === "AiRobot") return [
    { required: true,  label: "Robot model and firmware version",        detail: "FANUC, ABB, UR — specify model number" },
    { required: true,  label: "Workspace dimensions and safety envelope", detail: "CAD file or measurements (mm)" },
    { required: true,  label: "SSH or API access to robot controller",   detail: "Credentials shared via encrypted channel" },
    { required: false, label: "Existing trajectory programs",            detail: "Current .TP or .mod files" },
  ];
  return [
    { required: true,  label: "Facebook Page Admin access",             detail: "Grant editor role to agent@aistaff.app" },
    { required: true,  label: "Instagram Business account",             detail: "Must be linked to your Facebook Page" },
    { required: true,  label: "OpenAI or Gemini API key",               detail: "Your own subscription — ~$20/month" },
    { required: false, label: "Brand guidelines",                       detail: "Logo, colors, tone of voice doc" },
    { required: false, label: "Content restrictions",                   detail: "Topics to avoid, competitor names" },
  ];
}

const DEMO_REVIEWS: Review[] = [
  {
    id:     "r1",
    author: "Sarah K.",
    tier:   "BiometricVerified",
    role:   "Marketing Director",
    stars:  5,
    body:   "Set up in under 24 hours. Results were measurable in the first week — engagement up 40%, inbox fully automated. The AI PM caught a scope change I almost missed.",
    date:   "14 Mar 2026",
  },
  {
    id:     "r2",
    author: "Ali M.",
    tier:   "SocialVerified",
    role:   "E-commerce Founder",
    stars:  4,
    body:   "Solid work. Setup took a day longer than expected but the deliverables were exactly as described. Replies are context-aware — not canned responses.",
    date:   "2 Mar 2026",
  },
  {
    id:     "r3",
    author: "Priya N.",
    tier:   "BiometricVerified",
    role:   "Operations Lead",
    stars:  5,
    body:   "The escrow model gave us confidence to try a new vendor. Veto window is a great feature — we used it once and the seller responded immediately.",
    date:   "19 Feb 2026",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(cents: number): string {
  if (cents < 100)   return `${cents}¢`;
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toLocaleString()}`;
}

function tierBadge(tier: string) {
  if (tier === "BiometricVerified") return (
    <span className="font-mono text-[9px] text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded-sm">
      BiometricVerified ✓
    </span>
  );
  return (
    <span className="font-mono text-[9px] text-sky-400 border border-sky-800 px-1.5 py-0.5 rounded-sm">
      SocialVerified ✓
    </span>
  );
}

function Stars({ n, sm }: { n: number; sm?: boolean }) {
  const sz = sm ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`${sz} ${i <= n ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
      ))}
    </span>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function OverviewTab({ listing, media }: { listing: AgentListing; media: ListingMedia[] }) {
  const steps      = getSteps(listing);
  const videoItem  = media.find((m) => m.media_type === "video_url");
  const imageItems = media.filter((m) => m.media_type === "image");

  function embedUrl(url: string): string | null {
    if (url.includes("youtube.com/watch")) return url.replace("watch?v=", "embed/");
    if (url.includes("youtu.be/"))        return url.replace("youtu.be/", "www.youtube.com/embed/");
    if (url.includes("vimeo.com/"))       return url.replace("vimeo.com/", "player.vimeo.com/video/");
    return null;
  }

  return (
    <div className="space-y-6">
      {/* What it does */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-2">What It Does</p>
        <p className="font-mono text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
          {listing.description}
        </p>
      </div>

      {/* How it works */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-3">How It Works</p>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="grid grid-cols-[68px_1fr] gap-3 items-start">
              <span className="font-mono text-[10px] text-amber-400 pt-0.5">{step.day}</span>
              <span className="font-mono text-xs text-zinc-300">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Video demo */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-2">Demo</p>
        {videoItem ? (
          <div className="aspect-video bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden">
            {embedUrl(videoItem.content) ? (
              <iframe
                src={embedUrl(videoItem.content)!}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <a href={videoItem.content} target="_blank" rel="noopener noreferrer"
                className="flex flex-col items-center justify-center w-full h-full gap-2 text-zinc-500 hover:text-amber-400 transition-colors">
                <Play className="w-8 h-8" />
                <span className="font-mono text-xs">Watch demo video ↗</span>
              </a>
            )}
          </div>
        ) : (
          <div className="aspect-video bg-zinc-900 border border-zinc-800 rounded-sm flex flex-col items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center">
              <Play className="w-4 h-4 text-zinc-500 ml-0.5" />
            </div>
            <p className="font-mono text-[10px] text-zinc-600">Demo video — seller uploads before going live</p>
          </div>
        )}
      </div>

      {/* Proof of work */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-2">Proof of Work</p>
        {imageItems.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {imageItems.map((img) => (
              <a key={img.id} href={img.content} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.content}
                  alt="Proof of work"
                  className="w-full aspect-square object-cover rounded-sm border border-zinc-800 hover:border-zinc-600 transition-colors"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </a>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3].map(i => (
                <div key={i} className="aspect-square bg-zinc-900 border border-zinc-800 rounded-sm flex items-center justify-center">
                  <FileText className="w-4 h-4 text-zinc-700" />
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-zinc-600 mt-1.5">Seller attaches sample outputs before launch</p>
          </>
        )}
      </div>
    </div>
  );
}

function DeliverablesTab({ listing, media }: { listing: AgentListing; media: ListingMedia[] }) {
  const dbDeliverables = media.filter((m) => m.media_type === "deliverable");
  const deliverables = dbDeliverables.length > 0
    ? dbDeliverables.map((d) => ({ label: d.content, detail: "" }))
    : getDeliverables(listing);
  return (
    <div className="space-y-6">
      {/* What you receive */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-3">What You Receive</p>
        <div className="space-y-2">
          {deliverables.map((d, i) => (
            <div key={i} className="flex items-start gap-2.5 border border-zinc-800 rounded-sm px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-xs text-zinc-200">{d.label}</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{d.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-3">Timeline</p>
        <div className="space-y-2">
          {getSteps(listing).map((step, i) => (
            <div key={i} className="grid grid-cols-[68px_1fr] gap-3 items-start">
              <span className="font-mono text-[10px] text-amber-400">{step.day}</span>
              <span className="font-mono text-xs text-zinc-400">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Format */}
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-3">Delivery Format</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Delivery channel", value: "Async Collab handoffs tab" },
            { label: "Revisions",        value: "2 rounds included" },
            { label: "Warranty",         value: "7-day fix or refund" },
            { label: "Communication",    value: "Async chat + video updates" },
          ].map(({ label, value }) => (
            <div key={label} className="border border-zinc-800 rounded-sm p-2.5">
              <p className="font-mono text-[9px] text-zinc-600 uppercase">{label}</p>
              <p className="font-mono text-xs text-zinc-300 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RequirementsTab({ listing, media }: { listing: AgentListing; media: ListingMedia[] }) {
  const dbRequirements = media.filter((m) => m.media_type === "requirement");
  const reqs = dbRequirements.length > 0
    ? dbRequirements.map((r) => ({ required: r.required, label: r.content, detail: "" }))
    : getRequirements(listing);
  const required = reqs.filter(r => r.required);
  const optional = reqs.filter(r => !r.required);
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">
          What You Must Provide
        </p>
        <p className="font-mono text-[10px] text-zinc-600 mb-3">
          Required before work starts — have these ready at deployment.
        </p>
        <div className="space-y-2">
          {required.map((r, i) => (
            <div key={i} className="border-l-2 border-amber-800 pl-3 py-1.5">
              <div className="flex items-center gap-1.5 mb-0.5">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <p className="font-mono text-xs text-zinc-200">{r.label}</p>
              </div>
              <p className="font-mono text-[10px] text-zinc-500">{r.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {optional.length > 0 && (
        <div>
          <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3">Optional</p>
          <div className="space-y-2">
            {optional.map((r, i) => (
              <div key={i} className="border-l-2 border-zinc-800 pl-3 py-1.5">
                <p className="font-mono text-xs text-zinc-400">{r.label}</p>
                <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{r.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="border border-zinc-800 bg-zinc-900/40 rounded-sm p-3 flex items-start gap-2.5">
        <Shield className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
        <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
          All credentials are injected into an isolated Wasm sandbox — never stored as plain text,
          never visible to other parties. ZK-verified identity required on both sides.
        </p>
      </div>
    </div>
  );
}

function ReviewsTab() {
  const total   = DEMO_REVIEWS.length;
  const avg     = (DEMO_REVIEWS.reduce((s, r) => s + r.stars, 0) / total).toFixed(1);
  const counts  = [5,4,3,2,1].map(n => ({
    n,
    count: DEMO_REVIEWS.filter(r => r.stars === n).length,
  }));

  return (
    <div className="space-y-5">
      {/* Aggregate */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <p className="font-mono text-3xl font-medium text-amber-400">{avg}</p>
          <Stars n={Math.round(Number(avg))} />
          <p className="font-mono text-[10px] text-zinc-600 mt-1">{total} deployments</p>
        </div>
        <div className="flex-1 space-y-1.5">
          {counts.map(({ n, count }) => (
            <div key={n} className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500 w-4">{n}★</span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-zinc-600 w-3">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-zinc-800" />

      {/* Individual reviews */}
      <div className="space-y-3">
        {DEMO_REVIEWS.map(r => (
          <div key={r.id} className="border border-zinc-800 rounded-sm p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-[10px] text-zinc-400">{r.author[0]}</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-mono text-xs text-zinc-200">{r.author}</p>
                    {tierBadge(r.tier)}
                  </div>
                  <p className="font-mono text-[9px] text-zinc-600">{r.role}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Stars n={r.stars} sm />
                <p className="font-mono text-[9px] text-zinc-600">{r.date}</p>
              </div>
            </div>
            <p className="font-mono text-xs text-zinc-400 leading-relaxed">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Buy Panel (desktop sticky) ────────────────────────────────────────────────

function BuyPanel({
  listing, onDeploy, busy, error, deployed,
}: {
  listing:  AgentListing;
  onDeploy: () => void;
  busy:     boolean;
  error:    string | null;
  deployed: string | null;
}) {
  return (
    <div className="border border-zinc-800 rounded-sm p-4 space-y-4 bg-zinc-900/60">
      {/* Price */}
      <div>
        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">Starting from</p>
        <p className="font-mono text-2xl font-medium text-zinc-100 mt-0.5">
          {formatPrice(listing.price_cents)}
        </p>
        <p className="font-mono text-[10px] text-zinc-500">Held in escrow until you approve</p>
      </div>

      {/* CTA */}
      {deployed ? (
        <a
          href={`/async-collab?deployment_id=${deployed}`}
          className="flex items-center justify-center gap-2 h-10 w-full rounded-sm
                     bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-mono text-xs
                     uppercase tracking-widest transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Open Chat
        </a>
      ) : (
        <button
          onClick={onDeploy}
          disabled={busy}
          className="flex items-center justify-center gap-2 h-10 w-full rounded-sm
                     bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-xs
                     uppercase tracking-widest transition-colors disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing…</>
            : <>Deploy Now <ChevronRight className="w-3.5 h-3.5" /></>
          }
        </button>
      )}

      {error && (
        <p className="font-mono text-[10px] text-red-400 border border-red-900 rounded-sm px-2 py-1.5">
          {error}
        </p>
      )}

      {/* Trust bullets */}
      <div className="space-y-1.5">
        {[
          { icon: Shield,    text: "Escrow protected — you control release" },
          { icon: Clock,     text: "30-second veto window on every payout" },
          { icon: CheckCircle, text: "7-day fix-or-refund warranty" },
          { icon: BadgeCheck, text: "ZK-verified seller identity" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-2">
            <Icon className="w-3 h-3 text-emerald-500 flex-shrink-0" />
            <p className="font-mono text-[10px] text-zinc-400">{text}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-zinc-800 pt-3">
        <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest mb-1.5">How escrow works</p>
        <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
          Your payment is locked until you verify the deliverables meet the agreed scope.
          You approve release — no automatic transfers without your confirmation.
        </p>
      </div>

      <a
        href={`mailto:support@aistaffglobal.com?subject=Question about ${encodeURIComponent(listing.name)}`}
        className="flex items-center justify-center gap-1.5 h-8 w-full rounded-sm border border-zinc-700
                   text-zinc-400 font-mono text-[10px] uppercase tracking-widest hover:border-zinc-600
                   hover:text-zinc-300 transition-colors"
      >
        <MessageSquare className="w-3 h-3" /> Ask a Question
      </a>
    </div>
  );
}

// ── Mobile bottom bar ─────────────────────────────────────────────────────────

function MobileBar({
  listing, onDeploy, busy, deployed,
}: {
  listing:  AgentListing;
  onDeploy: () => void;
  busy:     boolean;
  deployed: string | null;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur
                    px-4 h-16 flex items-center gap-3 lg:hidden">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm font-medium text-zinc-100">{formatPrice(listing.price_cents)}</p>
        <p className="font-mono text-[9px] text-zinc-500 truncate">Escrow protected</p>
      </div>
      {deployed ? (
        <a
          href={`/async-collab?deployment_id=${deployed}`}
          className="flex items-center gap-1.5 px-4 h-10 rounded-sm bg-emerald-600 text-zinc-950
                     font-mono text-xs uppercase tracking-widest whitespace-nowrap"
        >
          <MessageSquare className="w-3.5 h-3.5" /> Open Chat
        </a>
      ) : (
        <button
          onClick={onDeploy}
          disabled={busy}
          className="flex items-center gap-1.5 px-4 h-10 rounded-sm bg-amber-400 hover:bg-amber-300
                     text-zinc-950 font-mono text-xs uppercase tracking-widest whitespace-nowrap
                     disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Deploy <ChevronRight className="w-3 h-3" /></>}
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ListingDetailPage() {
  const params    = useParams<{ slug: string }>();
  const router    = useRouter();
  const { data: session } = useSession();

  const profileId  = (session?.user as { profileId?: string })?.profileId ?? "";
  const userTier   = (session?.user as { identityTier?: string })?.identityTier ?? "UNVERIFIED";

  const [listing,     setListing]     = useState<AgentListing | null>(null);
  const [media,       setMedia]       = useState<ListingMedia[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [tab,         setTab]         = useState<Tab>("overview");
  const [busy,        setBusy]        = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployed,    setDeployed]    = useState<string | null>(null);

  // ── Fetch listing + media ──────────────────────────────────────────────────

  useEffect(() => {
    if (!params.slug) return;
    fetchListingBySlug(params.slug)
      .then((l) => {
        setListing(l);
        // Fire-and-forget: non-blocking media fetch
        fetchListingMedia(l.id)
          .then((m) => setMedia(m.media ?? []))
          .catch(() => {/* fall through to demo data */});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.slug]);

  // ── Deploy ─────────────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    if (!listing) return;
    if (userTier === "UNVERIFIED") {
      router.push("/onboarding");
      return;
    }
    if (!profileId || profileId === "00000000-0000-0000-0000-000000000000") {
      setDeployError("Profile not loaded — please refresh and try again.");
      return;
    }
    const amountCents = listing.price_cents ?? 0;
    if (amountCents < 100) {
      setDeployError("Listing has no price set. Contact support.");
      return;
    }

    setDeployError(null);
    setBusy(true);

    try {
      const res = await fetch("/api/network-intl/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: amountCents,
          listing_id:   listing.id,
          agent_name:   listing.name,
          client_id:    profileId,
        }),
      });
      const data = await res.json() as { payment_url?: string; error?: string };
      if (!res.ok || !data.payment_url) {
        setDeployError(data.error ?? `Server error ${res.status}`);
        setBusy(false);
        return;
      }
      window.location.href = data.payment_url;
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Network error — try again.");
      setBusy(false);
    }
  }, [listing, profileId, userTier, router]);

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) return (
    <main className="flex-1 flex items-center justify-center p-8">
      <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
    </main>
  );

  if (notFound || !listing) return (
    <main className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <p className="font-mono text-sm text-zinc-400">Listing not found.</p>
      <button
        onClick={() => router.push("/marketplace")}
        className="font-mono text-xs text-amber-400 border border-amber-900 px-3 h-8 rounded-sm hover:border-amber-700 transition-colors"
      >
        ← Back to Marketplace
      </button>
    </main>
  );

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview",      label: "Overview",      icon: <Zap className="w-3 h-3" /> },
    { key: "deliverables",  label: "Deliverables",  icon: <Package className="w-3 h-3" /> },
    { key: "requirements",  label: "Requirements",  icon: <ClipboardList className="w-3 h-3" /> },
    { key: "reviews",       label: "Reviews",       icon: <Star className="w-3 h-3" /> },
  ];

  return (
    <>
      <main className="flex-1 pb-20 lg:pb-8 max-w-5xl mx-auto w-full px-4 pt-4 space-y-4">

        {/* Back link */}
        <button
          onClick={() => router.push("/marketplace")}
          className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Marketplace
        </button>

        {/* ── Hero Bar ──────────────────────────────────────────────────────── */}
        <div className="border border-zinc-800 rounded-sm p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-mono text-[9px] text-amber-400 border border-amber-900 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">
                  {listing.category}
                </span>
                <span className="font-mono text-[9px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded-sm">
                  {listing.seller_type}
                </span>
              </div>
              <h1 className="font-mono text-lg font-medium text-zinc-100 leading-tight">{listing.name}</h1>
              <p className="font-mono text-xs text-zinc-500 mt-1 line-clamp-2">{listing.description}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 pt-1 border-t border-zinc-800/60 flex-wrap">
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="font-mono text-xs text-zinc-300">4.9</span>
              <span className="font-mono text-[10px] text-zinc-600">(23)</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3 text-zinc-500" />
              <span className="font-mono text-[10px] text-zinc-500">23 deployments</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              <span className="font-mono text-[10px] text-zinc-500">96% success rate</span>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">

          {/* LEFT — tabs */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Trust Strip */}
            <div className="border border-zinc-800 rounded-sm p-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-sm bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
                  <span className="font-mono text-sm text-amber-400">AI</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono text-xs font-medium text-zinc-200">AiStaff Seller</p>
                    <span className="font-mono text-[9px] text-emerald-400 border border-emerald-800 px-1 py-0.5 rounded-sm">
                      BiometricVerified ✓
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-500">Verified AI Service Provider</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-[9px] text-zinc-600 uppercase">Trust Score</p>
                  <p className="font-mono text-sm text-amber-400 font-medium">87/100</p>
                </div>
              </div>

              {/* Score bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-zinc-600">Trust score</span>
                  <span className="font-mono text-[9px] text-amber-400">87%</span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "87%" }} />
                </div>
                <div className="flex gap-3 pt-0.5">
                  {[
                    { label: "GitHub 30%",   pct: 28 },
                    { label: "LinkedIn 30%", pct: 27 },
                    { label: "ZK Bio 40%",   pct: 32 },
                  ].map(({ label, pct }) => (
                    <div key={label} className="flex-1">
                      <div className="h-0.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                        <div className="h-full bg-zinc-500 rounded-full" style={{ width: `${(pct / 40) * 100}%` }} />
                      </div>
                      <p className="font-mono text-[9px] text-zinc-600">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 border-t border-zinc-800/60 pt-2">
                <span className="font-mono text-[10px] text-zinc-600">23 deployments</span>
                <span className="font-mono text-[10px] text-zinc-600">4.9★ avg rating</span>
                <span className="font-mono text-[10px] text-zinc-600">Member since Feb 2026</span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-zinc-800 overflow-x-auto scrollbar-hide">
              {TABS.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 font-mono text-xs whitespace-nowrap
                              border-b-2 transition-colors flex-shrink-0
                              ${tab === key
                                ? "border-amber-500 text-amber-400"
                                : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="pb-4">
              {tab === "overview"     && <OverviewTab      listing={listing} media={media} />}
              {tab === "deliverables" && <DeliverablesTab  listing={listing} media={media} />}
              {tab === "requirements" && <RequirementsTab  listing={listing} media={media} />}
              {tab === "reviews"      && <ReviewsTab />}
            </div>
          </div>

          {/* RIGHT — sticky buy panel (desktop only) */}
          <div className="hidden lg:block w-72 flex-shrink-0 sticky top-4">
            <BuyPanel
              listing={listing}
              onDeploy={handleDeploy}
              busy={busy}
              error={deployError}
              deployed={deployed}
            />
          </div>
        </div>
      </main>

      {/* Mobile bottom bar */}
      <MobileBar
        listing={listing}
        onDeploy={handleDeploy}
        busy={busy}
        deployed={deployed}
      />
    </>
  );
}
