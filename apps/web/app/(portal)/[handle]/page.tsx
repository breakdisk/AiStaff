import { Pool } from "pg";
import { notFound } from "next/navigation";
import { Bot, Users, Zap, Building2 } from "lucide-react";
import type { Metadata } from "next";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface Listing {
  id:          string;
  name:        string;
  description: string;
  price_cents: number;
  category:    string;
  seller_type: string;
  slug:        string | null;
}

interface Org {
  id:          string;
  name:        string;
  handle:      string;
  description: string | null;
  website_url: string | null;
}

async function getOrgByHandle(handle: string): Promise<Org | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, handle, description, website_url FROM organisations WHERE handle = $1`,
      [handle],
    );
    return rows[0] ?? null;
  } finally { client.release(); }
}

async function getOrgListings(orgId: string): Promise<Listing[]> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, description, price_cents, category, seller_type, slug
         FROM agent_listings
        WHERE org_id = $1 AND active = true AND listing_status = 'APPROVED'
        ORDER BY created_at DESC
        LIMIT 50`,
      [orgId],
    );
    return rows;
  } finally { client.release(); }
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  AiTalent: Users,
  AiStaff:  Bot,
  AiRobot:  Zap,
};

const CTA: Record<string, string> = {
  AiRobot:  "Rent",
  AiStaff:  "Deploy",
  AiTalent: "Hire",
};

function fmtUSD(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> }
): Promise<Metadata> {
  const { handle } = await params;
  const org = await getOrgByHandle(handle);
  if (!org) return { title: "Agency Portal" };
  return {
    title: `${org.name} — AiStaff Agency Portal`,
    description: org.description ?? `Browse AI agents and talent from ${org.name}`,
  };
}

export default async function PortalPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const org = await getOrgByHandle(handle);
  if (!org) notFound();

  const listings = await getOrgListings(org.id);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Org header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5 text-amber-400" />
          <span className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">Agency Portal</span>
        </div>
        <h1 className="font-mono text-2xl font-bold text-zinc-50">{org.name}</h1>
        {org.description && (
          <p className="font-mono text-sm text-zinc-400 max-w-2xl">{org.description}</p>
        )}
        {org.website_url && (
          <a
            href={org.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            {org.website_url}
          </a>
        )}
      </div>

      {/* Listings */}
      <div>
        <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-3">
          Available services ({listings.length})
        </p>
        {listings.length === 0 ? (
          <div className="border border-zinc-800 rounded-sm p-8 text-center">
            <p className="font-mono text-xs text-zinc-600">No listings available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {listings.map(l => {
              const Icon = CATEGORY_ICON[l.category] ?? Bot;
              const cta  = CTA[l.category] ?? "Hire";
              return (
                <div key={l.id} className="border border-zinc-800 rounded-sm p-4 space-y-3 hover:border-zinc-700 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                      <p className="font-mono text-sm font-medium text-zinc-200 line-clamp-1">{l.name}</p>
                    </div>
                  </div>
                  <p className="font-mono text-xs text-zinc-500 line-clamp-2">{l.description}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                    <div>
                      <p className="font-mono text-sm font-bold text-amber-400">{fmtUSD(l.price_cents)}</p>
                      <p className="font-mono text-[10px] text-emerald-600 mt-0.5">💰 Escrow protected</p>
                    </div>
                    <a
                      href={`/login?callbackUrl=${encodeURIComponent(l.slug ? `/marketplace/${l.slug}` : `/marketplace`)}`}
                      className="flex items-center gap-1 px-3 h-8 rounded-sm bg-amber-400 text-zinc-900
                                 font-mono text-xs font-bold hover:bg-amber-300 transition-colors"
                    >
                      {cta} →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
        <p className="font-mono text-[10px] text-zinc-700">
          Powered by{" "}
          <a href="https://aistaffglobal.com" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            AiStaff
          </a>
        </p>
        <a
          href="/login"
          className="font-mono text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
        >
          Sign in to get started →
        </a>
      </div>
    </div>
  );
}
