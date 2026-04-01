import type { MetadataRoute } from "next";
import { Pool } from "pg";

const BASE = "https://aistaffglobal.com";

// Public pages — no auth required, safe for crawlers and LLM indexers
const STATIC_ROUTES: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "/",               priority: 1.0, changeFrequency: "weekly"  },
  { path: "/marketplace",    priority: 0.9, changeFrequency: "hourly"  },
  { path: "/leaderboard",    priority: 0.8, changeFrequency: "daily"   },
  { path: "/pricing-tool",   priority: 0.7, changeFrequency: "monthly" },
  { path: "/proof-of-human", priority: 0.7, changeFrequency: "monthly" },
  { path: "/transparency",   priority: 0.6, changeFrequency: "monthly" },
  { path: "/career",         priority: 0.6, changeFrequency: "weekly"  },
  { path: "/community",      priority: 0.6, changeFrequency: "weekly"  },
  { path: "/mentorship",     priority: 0.6, changeFrequency: "weekly"  },
  { path: "/tools/roi-calculator", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tools/trust-score",    priority: 0.8, changeFrequency: "monthly" },
  { path: "/robotics",             priority: 0.7, changeFrequency: "monthly" },
  { path: "/agents/aistaff",       priority: 0.8, changeFrequency: "weekly"  },
  { path: "/agents/aitalent",      priority: 0.8, changeFrequency: "weekly"  },
  { path: "/agents/airobot",       priority: 0.7, changeFrequency: "weekly"  },
  { path: "/login",          priority: 0.5, changeFrequency: "yearly"  },
  { path: "/privacy",        priority: 0.3, changeFrequency: "yearly"  },
  { path: "/terms",          priority: 0.3, changeFrequency: "yearly"  },
  { path: "/data-deletion",  priority: 0.2, changeFrequency: "yearly"  },
];

async function fetchListings(): Promise<{ slug: string; updated_at: Date }[]> {
  if (!process.env.DATABASE_URL) return [];
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ slug: string; updated_at: Date }>(
      `SELECT slug, updated_at
       FROM agent_listings
       WHERE slug IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1000`
    );
    return rows;
  } catch {
    return [];
  } finally {
    await pool.end();
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map(
    ({ path, priority, changeFrequency }) => ({
      url: `${BASE}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })
  );

  const listings = await fetchListings();
  const listingEntries: MetadataRoute.Sitemap = listings.map((l) => ({
    url:             `${BASE}/marketplace/${l.slug}`,
    lastModified:    l.updated_at,
    changeFrequency: "weekly" as const,
    priority:        0.8,
  }));

  const HIRE_SKILLS = ["rust","python","typescript","devops","ml-engineer","llm-integration","data-engineer"];
  const HIRE_INDUSTRIES = ["fintech","healthcare","logistics","legal","hr-automation","e-commerce","saas"];
  const hireEntries: MetadataRoute.Sitemap = HIRE_SKILLS.flatMap((skill) =>
    HIRE_INDUSTRIES.map((industry) => ({
      url: `${BASE}/hire/${skill}/${industry}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }))
  );

  return [...staticEntries, ...hireEntries, ...listingEntries];
}
