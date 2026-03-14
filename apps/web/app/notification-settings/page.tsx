"use client";

import Image from "next/image";
import { useState, useEffect, useCallback } from "react";
import {
  Bell, Mail, MessageSquare, Smartphone, Check, Settings,
  Clock, Shield, AlertTriangle, FileText, Zap, ChevronDown,
  MessageCircle, Slack, Monitor, Video, Link, RefreshCw,
  CheckCircle, XCircle, Loader,
} from "lucide-react";
import {
  fetchNotificationPreferences, saveNotificationPreferences,
  fetchIntegrationsStatus, initWhatsAppConnect,
  saveTeamsWebhook, disconnectIntegration,
  type NotifPrefs, type IntegrationStatus,
} from "@/lib/api";

// ── Demo user (replace with real session in production) ───────────────────────
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Types ────────────────────────────────────────────────────────────────────

type Channel    = "in-app" | "email" | "sms" | "push";
type DigestMode = "realtime" | "hourly" | "daily";
type EventKey   = "proposals" | "milestones" | "drift_alerts" | "escrow" | "compliance";

interface EventConfig {
  key: EventKey; label: string; description: string; icon: React.ElementType;
}

const CHANNELS: { key: Channel; label: string; icon: React.ElementType; note?: string }[] = [
  { key: "in-app", label: "In-App",  icon: Bell },
  { key: "email",  label: "Email",   icon: Mail },
  { key: "sms",    label: "SMS",     icon: MessageSquare, note: "Requires phone verification" },
  { key: "push",   label: "Push",    icon: Smartphone,    note: "Requires mobile app" },
];

const EVENTS: EventConfig[] = [
  { key: "proposals",    label: "Proposal Alerts",     description: "New AI-matched freelancer recommendations",   icon: Zap           },
  { key: "milestones",   label: "Milestone Reminders",  description: "Deadline and SLA breach notifications",        icon: Clock         },
  { key: "drift_alerts", label: "Drift Alerts",         description: "Artifact hash mismatch + warranty holds",      icon: AlertTriangle  },
  { key: "escrow",       label: "Escrow Events",        description: "Veto windows, payouts, release confirmations", icon: Shield        },
  { key: "compliance",   label: "Compliance Docs",      description: "Contract signings, NDA expirations, SOWs",     icon: FileText      },
];

type MatrixState  = Record<EventKey, Record<Channel, boolean>>;
type ChannelState = Record<Channel, boolean>;

const DEFAULT_CHANNELS: ChannelState = { "in-app": true, email: true, sms: false, push: false };
const DEFAULT_MATRIX: MatrixState = {
  proposals:    { "in-app": true, email: true,  sms: false, push: false },
  milestones:   { "in-app": true, email: true,  sms: false, push: false },
  drift_alerts: { "in-app": true, email: true,  sms: false, push: false },
  escrow:       { "in-app": true, email: true,  sms: false, push: false },
  compliance:   { "in-app": true, email: false, sms: false, push: false },
};

// ── Integration providers config ─────────────────────────────────────────────

const INTEGRATION_PROVIDERS = [
  {
    key:      "whatsapp",
    label:    "WhatsApp",
    icon:     MessageCircle,
    color:    "text-emerald-400",
    border:   "border-emerald-900",
    note:     "Scan QR with your phone to link your WhatsApp",
    qrBased:  true,
  },
  {
    key:      "slack",
    label:    "Slack",
    icon:     Slack,
    color:    "text-purple-400",
    border:   "border-purple-900",
    note:     "Scan QR to authorise AiStaff in your Slack workspace",
    qrBased:  true,
    oauthPath: `/api/integrations/slack/oauth?user_id=${DEMO_USER_ID}`,
  },
  {
    key:      "teams",
    label:    "Microsoft Teams",
    icon:     Monitor,
    color:    "text-blue-400",
    border:   "border-blue-900",
    note:     "Paste your Teams incoming webhook URL below",
    qrBased:  false,
  },
  {
    key:      "google_meet",
    label:    "Google Meet",
    icon:     Video,
    color:    "text-red-400",
    border:   "border-red-900",
    note:     "Scan QR to link Google Calendar — Meet links auto-added to match events",
    qrBased:  true,
    oauthPath: `/api/integrations/google/oauth?user_id=${DEMO_USER_ID}`,
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function qrImageUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(data)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, onChange, size = "md" }: {
  enabled: boolean; onChange: (v: boolean) => void; size?: "sm" | "md";
}) {
  const w = size === "sm" ? "w-8" : "w-10";
  const h = size === "sm" ? "h-4" : "h-5";
  const d = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const t = size === "sm"
    ? (enabled ? "translate-x-4" : "translate-x-0.5")
    : (enabled ? "translate-x-5" : "translate-x-0.5");
  return (
    <button role="switch" aria-checked={enabled} onClick={() => onChange(!enabled)}
      className={`relative inline-flex items-center ${w} ${h} rounded-full border transition-colors ${
        enabled ? "bg-amber-600 border-amber-700" : "bg-zinc-800 border-zinc-700"
      }`}
    >
      <span className={`inline-block ${d} rounded-full bg-white shadow transition-transform ${t}`} />
    </button>
  );
}

function ChannelToggleRow({ channel, enabled, onToggle }: {
  channel: typeof CHANNELS[number]; enabled: boolean; onToggle: (v: boolean) => void;
}) {
  const Icon = channel.icon;
  return (
    <div className={`flex items-center justify-between px-3 py-3 border rounded-sm transition-colors ${
      enabled ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/30 opacity-60"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-sm border flex items-center justify-center ${
          enabled ? "border-amber-800 bg-amber-950/40" : "border-zinc-800"
        }`}>
          <Icon className={`w-4 h-4 ${enabled ? "text-amber-400" : "text-zinc-600"}`} />
        </div>
        <div>
          <p className={`font-mono text-xs font-medium ${enabled ? "text-zinc-200" : "text-zinc-500"}`}>
            {channel.label}
          </p>
          {channel.note && (
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{channel.note}</p>
          )}
        </div>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onToggle} />
    </div>
  );
}

function MatrixCell({ checked, disabled, onChange }: {
  checked: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} disabled={disabled}
      className={`w-8 h-8 rounded-sm border flex items-center justify-center transition-colors ${
        disabled ? "border-zinc-800 opacity-30 cursor-not-allowed"
        : checked  ? "border-amber-800 bg-amber-950/50"
        : "border-zinc-700 hover:border-zinc-600"
      }`}
    >
      {checked && !disabled && <Check className="w-3 h-3 text-amber-400" />}
    </button>
  );
}

function IntegrationRow({
  provider, status, onConnect, onDisconnect,
}: {
  provider: typeof INTEGRATION_PROVIDERS[number];
  status:   IntegrationStatus | undefined;
  onConnect:    () => void;
  onDisconnect: () => void;
}) {
  const Icon      = provider.icon;
  const connected = status?.status === "verified";
  const pending   = status?.status === "pending";

  return (
    <div className={`border rounded-sm p-3 ${connected ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/30"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-sm border flex items-center justify-center ${connected ? provider.border : "border-zinc-800"}`}>
            <Icon className={`w-4 h-4 ${connected ? provider.color : "text-zinc-600"}`} />
          </div>
          <div>
            <p className={`font-mono text-xs font-medium ${connected ? "text-zinc-200" : "text-zinc-400"}`}>
              {provider.label}
            </p>
            {connected && status?.display_name && (
              <p className="font-mono text-[10px] text-zinc-500">{status.display_name}</p>
            )}
            {!connected && (
              <p className="font-mono text-[10px] text-zinc-600">{provider.note}</p>
            )}
          </div>
        </div>

        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-mono text-[10px] text-emerald-400">
              <CheckCircle className="w-3 h-3" /> Connected
            </span>
            <button
              onClick={onDisconnect}
              className="font-mono text-[10px] text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 border border-zinc-800 rounded-sm hover:border-red-900"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="font-mono text-xs px-3 py-1.5 border border-zinc-700 rounded-sm text-zinc-300 hover:border-amber-700 hover:text-amber-400 transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {/* Pending QR state */}
      {pending && provider.qrBased && status && (
        <div className="mt-2 flex items-start gap-3 border border-zinc-800 rounded-sm p-3">
          <Image
            src={qrImageUrl(status.display_name ?? "")}
            alt={`${provider.label} QR Code`}
            width={100}
            height={100}
            unoptimized
            className="rounded-sm border border-zinc-700 flex-shrink-0"
          />
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] text-zinc-400">Scan with your phone camera</p>
            <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">{provider.note}</p>
            <p className="font-mono text-[10px] text-amber-400 flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Waiting for confirmation…
            </p>
          </div>
        </div>
      )}

      {/* Teams — URL paste field */}
      {!connected && provider.key === "teams" && (
        <TeamsInput userId={DEMO_USER_ID} onSaved={() => { /* will be refreshed by parent poll */ }} />
      )}
    </div>
  );
}

function TeamsInput({ userId, onSaved }: { userId: string; onSaved: () => void }) {
  const [url, setUrl]       = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  async function handleSave() {
    if (!url.startsWith("https://")) { setErr("URL must start with https://"); return; }
    setSaving(true); setErr(null);
    try {
      await saveTeamsWebhook(userId, url);
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            type="url"
            placeholder="https://your-tenant.webhook.office.com/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-sm pl-7 pr-3 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-amber-700"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !url}
          className="px-3 py-1.5 font-mono text-xs border border-zinc-700 rounded-sm text-zinc-300 hover:border-amber-700 hover:text-amber-400 transition-colors disabled:opacity-40"
        >
          {saving ? <Loader className="w-3 h-3 animate-spin" /> : "Save"}
        </button>
      </div>
      {err && <p className="font-mono text-[10px] text-red-400">{err}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationSettingsPage() {
  const [channels,    setChannels]    = useState<ChannelState>(DEFAULT_CHANNELS);
  const [matrix,      setMatrix]      = useState<MatrixState>(DEFAULT_MATRIX);
  const [digest,      setDigest]      = useState<DigestMode>("realtime");
  const [quietHours,  setQuietHours]  = useState({ start: "22:00", end: "08:00", timezone: "UTC" });
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [saveErr,     setSaveErr]     = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [qrPending,   setQrPending]   = useState<Record<string, string>>({});  // provider → qr_url

  // ── Load preferences on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchNotificationPreferences(DEMO_USER_ID).then((p) => {
      setChannels({
        "in-app": p.in_app_enabled,
        email:    p.email_enabled,
        sms:      p.sms_enabled,
        push:     p.push_enabled,
      });
      setDigest((p.digest_mode as DigestMode) ?? "realtime");
      setQuietHours({
        start:    p.quiet_hours_start ?? "22:00",
        end:      p.quiet_hours_end   ?? "08:00",
        timezone: p.quiet_hours_tz    ?? "UTC",
      });
    }).catch(() => { /* backend offline — use defaults */ });

    fetchIntegrationStatuses();
  }, []);

  // ── Poll integrations every 5s (while any pending) ─────────────────────────
  useEffect(() => {
    const hasPending = integrations.some((i) => i.status === "pending");
    if (!hasPending) return;
    const id = setInterval(fetchIntegrationStatuses, 5000);
    return () => clearInterval(id);
  }, [integrations]);

  const fetchIntegrationStatuses = useCallback(() => {
    fetchIntegrationsStatus(DEMO_USER_ID).then(setIntegrations).catch(() => {});
  }, []);

  // ── Channel toggle ─────────────────────────────────────────────────────────
  function toggleChannel(ch: Channel, val: boolean) {
    setChannels((prev) => ({ ...prev, [ch]: val }));
    if (!val) {
      setMatrix((prev) => {
        const next = { ...prev } as MatrixState;
        (Object.keys(next) as EventKey[]).forEach((ev) => {
          next[ev] = { ...next[ev], [ch]: false };
        });
        return next;
      });
    }
  }

  function toggleMatrix(ev: EventKey, ch: Channel, val: boolean) {
    setMatrix((prev) => ({ ...prev, [ev]: { ...prev[ev], [ch]: val } }));
  }

  // ── Save preferences ───────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setSaveErr(null);
    const prefs: NotifPrefs & { user_id: string } = {
      user_id:           DEMO_USER_ID,
      email_enabled:     channels.email,
      sms_enabled:       channels.sms,
      push_enabled:      channels.push,
      in_app_enabled:    channels["in-app"],
      whatsapp_enabled:  false,
      slack_enabled:     false,
      teams_enabled:     false,
      quiet_hours_start: quietHours.start || null,
      quiet_hours_end:   quietHours.end   || null,
      quiet_hours_tz:    quietHours.timezone,
      digest_mode:       digest,
    };
    try {
      await saveNotificationPreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setSaveErr("Could not save — backend may be offline.");
    } finally {
      setSaving(false);
    }
  }

  // ── Integration connect/disconnect ─────────────────────────────────────────
  async function handleConnect(providerKey: string) {
    if (providerKey === "whatsapp") {
      try {
        const res = await initWhatsAppConnect(DEMO_USER_ID);
        setQrPending((prev) => ({ ...prev, whatsapp: res.qr_url }));
        // Optimistically add pending status
        setIntegrations((prev) => [
          ...prev.filter((i) => i.provider !== "whatsapp"),
          { provider: "whatsapp", status: "pending", display_name: res.qr_url, connected_at: null },
        ]);
      } catch { /* backend offline */ }
    } else {
      // Slack / Google Meet — redirect to OAuth via QR
      const provider = INTEGRATION_PROVIDERS.find((p) => p.key === providerKey);
      if (provider && "oauthPath" in provider && provider.oauthPath) {
        const oauthUrl = `${window.location.origin}${provider.oauthPath}`;
        setIntegrations((prev) => [
          ...prev.filter((i) => i.provider !== providerKey),
          { provider: providerKey, status: "pending", display_name: oauthUrl, connected_at: null },
        ]);
      }
    }
  }

  async function handleDisconnect(providerKey: string) {
    try {
      await disconnectIntegration(providerKey, DEMO_USER_ID);
      setIntegrations((prev) => prev.filter((i) => i.provider !== providerKey));
    } catch { /* backend offline */ }
  }

  const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-56 border-r border-zinc-800 bg-zinc-950 p-4 gap-6">
        <span className="font-mono text-xs text-zinc-500 uppercase tracking-widest">AiStaffApp</span>
        <nav className="flex flex-col gap-1">
          {[
            { label: "Dashboard",   href: "/dashboard"   },
            { label: "Marketplace", href: "/marketplace" },
            { label: "Leaderboard", href: "/leaderboard" },
            { label: "Matching",    href: "/matching"    },
            { label: "Profile",     href: "/profile"     },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="px-3 py-2 rounded-sm font-mono text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </nav>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">AI Tools</p>
          {[
            { label: "Scoping",      href: "/scoping"      },
            { label: "Outcomes",     href: "/outcomes"     },
            { label: "Proposals",    href: "/proposals"    },
            { label: "Pricing Tool", href: "/pricing-tool" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Payments</p>
          {[
            { label: "Escrow",             href: "/escrow"             },
            { label: "Payouts",            href: "/payouts"            },
            { label: "Billing",            href: "/billing"            },
            { label: "Smart Contracts",    href: "/smart-contracts"    },
            { label: "Outcome Listings",   href: "/outcome-listings"   },
            { label: "Pricing Calculator", href: "/pricing-calculator" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Workspace</p>
          {[
            { label: "Work Diaries",  href: "/work-diaries"  },
            { label: "Async Collab",  href: "/async-collab"  },
            { label: "Collaboration", href: "/collab"         },
            { label: "Success Layer", href: "/success-layer"  },
            { label: "Quality Gate",  href: "/quality-gate"   },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Legal</p>
          {[
            { label: "Legal Toolkit", href: "/legal-toolkit"     },
            { label: "Tax Engine",    href: "/tax-engine"        },
            { label: "Reputation",    href: "/reputation-export" },
            { label: "Transparency",  href: "/transparency"      },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="block px-3 py-1.5 rounded-sm font-mono text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 transition-colors"
            >{label}</a>
          ))}
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] text-zinc-300 uppercase tracking-widest px-3">Notifications</p>
          {[
            { label: "Alerts",    href: "/notifications",        active: false },
            { label: "Reminders", href: "/reminders",            active: false },
            { label: "Settings",  href: "/notification-settings",active: true  },
          ].map(({ label, href, active }) => (
            <a key={label} href={href}
              className={`block px-3 py-1.5 rounded-sm font-mono text-xs transition-colors ${
                active ? "text-zinc-100 bg-zinc-800" : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >{label}</a>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 pb-20 lg:pb-4 space-y-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <Settings className="w-4 h-4 text-amber-400" />
          <h1 className="font-mono text-sm font-medium text-zinc-300 uppercase tracking-widest">
            Notification Settings
          </h1>
        </div>

        {/* ── Section 1: Channel Enable/Disable ── */}
        <section className="space-y-3">
          <div className="border-b border-zinc-800 pb-1">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Channels</p>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Enable or disable entire delivery channels</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHANNELS.map((ch) => (
              <ChannelToggleRow key={ch.key} channel={ch} enabled={channels[ch.key]}
                onToggle={(v) => toggleChannel(ch.key, v)} />
            ))}
          </div>
          {channels.sms && (
            <div className="border border-amber-900 bg-amber-950/30 rounded-sm px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="font-mono text-[10px] text-amber-300">
                SMS requires a verified phone number. Add one in{" "}
                <a href="/profile" className="underline">Profile Settings</a>.
              </p>
            </div>
          )}
        </section>

        {/* ── Section 2: Event × Channel Matrix ── */}
        <section className="space-y-3">
          <div className="border-b border-zinc-800 pb-1">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Event Preferences</p>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">Control which events fire on each channel</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 pr-4 font-mono text-[10px] text-zinc-600 uppercase tracking-widest w-1/2">
                    Event
                  </th>
                  {CHANNELS.map((ch) => {
                    const Icon = ch.icon;
                    return (
                      <th key={ch.key} className="py-2 px-2 font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                        <div className="flex flex-col items-center gap-1">
                          <Icon className={`w-3.5 h-3.5 ${channels[ch.key] ? "text-zinc-400" : "text-zinc-700"}`} />
                          <span className={channels[ch.key] ? "text-zinc-500" : "text-zinc-700"}>{ch.label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map((ev) => {
                  const Icon = ev.icon;
                  return (
                    <tr key={ev.key} className="border-b border-zinc-900 hover:bg-zinc-900/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-start gap-2">
                          <Icon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-mono text-xs text-zinc-300">{ev.label}</p>
                            <p className="font-mono text-[9px] text-zinc-600 mt-0.5">{ev.description}</p>
                          </div>
                        </div>
                      </td>
                      {CHANNELS.map((ch) => (
                        <td key={ch.key} className="py-2.5 px-2 text-center">
                          <div className="flex justify-center">
                            <MatrixCell checked={matrix[ev.key][ch.key]} disabled={!channels[ch.key]}
                              onChange={(v) => toggleMatrix(ev.key, ch.key, v)} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 3: Digest Mode ── */}
        <section className="space-y-3">
          <div className="border-b border-zinc-800 pb-1">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Delivery Mode</p>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">How often to receive email/SMS batches</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {(["realtime", "hourly", "daily"] as DigestMode[]).map((mode) => {
              const meta = {
                realtime: { label: "Real-time",    desc: "Send immediately"       },
                hourly:   { label: "Hourly Digest", desc: "Batch per hour"        },
                daily:    { label: "Daily Digest",  desc: "Morning summary email" },
              }[mode];
              return (
                <button key={mode} onClick={() => setDigest(mode)}
                  className={`flex-1 px-3 py-2.5 rounded-sm border text-left transition-colors ${
                    digest === mode ? "border-amber-800 bg-amber-950/40" : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <p className={`font-mono text-xs font-medium ${digest === mode ? "text-amber-400" : "text-zinc-400"}`}>
                    {meta.label}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{meta.desc}</p>
                </button>
              );
            })}
          </div>
          <p className="font-mono text-[10px] text-zinc-600">
            In-app and push notifications are always real-time regardless of digest mode.
          </p>
        </section>

        {/* ── Section 4: Quiet Hours ── */}
        <section className="space-y-3">
          <div className="border-b border-zinc-800 pb-1">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Quiet Hours</p>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">No notifications sent during these hours. HIGH priority events bypass this.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="font-mono text-[10px] text-zinc-600 block mb-1">From</label>
              <input type="time" value={quietHours.start}
                onChange={(e) => setQuietHours((p) => ({ ...p, start: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] text-zinc-600 block mb-1">To</label>
              <input type="time" value={quietHours.end}
                onChange={(e) => setQuietHours((p) => ({ ...p, end: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="font-mono text-[10px] text-zinc-600 block mb-1">Timezone</label>
              <div className="relative">
                <select value={quietHours.timezone}
                  onChange={(e) => setQuietHours((p) => ({ ...p, timezone: e.target.value }))}
                  className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-sm px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:outline-none focus:border-amber-700 pr-6"
                >
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600 pointer-events-none" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 5: Connected Integrations ── */}
        <section className="space-y-3">
          <div className="border-b border-zinc-800 pb-1">
            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Connected Integrations</p>
            <p className="font-mono text-[10px] text-zinc-600 mt-0.5">
              Receive notifications via WhatsApp, Slack, Teams, and Google Meet
            </p>
          </div>
          <div className="space-y-2">
            {INTEGRATION_PROVIDERS.map((provider) => {
              const status = integrations.find((i) => i.provider === provider.key);
              return (
                <IntegrationRow
                  key={provider.key}
                  provider={provider}
                  status={status}
                  onConnect={() => handleConnect(provider.key)}
                  onDisconnect={() => handleDisconnect(provider.key)}
                />
              );
            })}
          </div>
          <p className="font-mono text-[10px] text-zinc-600">
            Connected integrations receive HIGH priority alerts regardless of quiet hours.
          </p>
        </section>

        {/* ── Save ── */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`h-10 px-6 rounded-sm font-mono text-xs font-medium uppercase tracking-widest transition-all disabled:opacity-50 ${
              saved
                ? "border border-green-800 bg-green-950 text-green-400"
                : "border border-amber-800 bg-amber-950 text-amber-400 hover:bg-amber-900"
            }`}
          >
            {saving ? (
              <span className="flex items-center gap-1.5"><Loader className="w-3.5 h-3.5 animate-spin" /> Saving…</span>
            ) : saved ? (
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> Saved</span>
            ) : (
              "Save Preferences"
            )}
          </button>
          {saveErr ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-red-400">
              <XCircle className="w-3 h-3" /> {saveErr}
            </span>
          ) : (
            <p className="font-mono text-[10px] text-zinc-600">Changes take effect immediately.</p>
          )}
        </div>
      </main>
    </div>
  );
}
