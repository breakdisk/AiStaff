import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── GET — list diary days for the authenticated user ──────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ days: [] });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ days: [] });

  const { searchParams } = new URL(req.url);
  const deploymentId = searchParams.get("deployment_id");

  // deploymentId available for future scoped queries
  void deploymentId;

  const client = await pool.connect();
  try {
    // Sessions for the last 14 days
    const { rows: sessions } = await client.query(
      `SELECT id, session_date::text, started_at, ended_at, commit_count, files_count, commit_messages
       FROM work_diary_sessions
       WHERE owner_profile_id = $1
         AND session_date >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY session_date DESC, started_at ASC`,
      [profileId],
    );

    // Diary entries (mood/notes) for the same window
    const { rows: entries } = await client.query(
      `SELECT id, entry_date::text, mood, notes, ai_summary
       FROM work_diary_entries
       WHERE owner_profile_id = $1
         AND entry_date >= CURRENT_DATE - INTERVAL '14 days'`,
      [profileId],
    );

    // Manual activities keyed by entry_id
    const entryIds = entries.map(e => e.id as string);
    const { rows: activities } = entryIds.length > 0
      ? await client.query(
          `SELECT entry_id, category, label, hours::float FROM work_diary_activities
           WHERE entry_id = ANY($1::uuid[])`,
          [entryIds],
        )
      : { rows: [] };

    // Group sessions by date
    const byDate = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const d = s.session_date as string;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(s);
    }

    // Merge sessions + entries into day objects
    const allDates = new Set([
      ...Array.from(byDate.keys()),
      ...entries.map(e => e.entry_date as string),
    ]);

    const days = Array.from(allDates)
      .sort((a, b) => b.localeCompare(a))
      .map(date => {
        const daySessions = byDate.get(date) ?? [];
        const entry       = entries.find(e => e.entry_date === date) ?? null;
        const dayActivities = entry
          ? activities.filter(a => a.entry_id === entry.id)
          : [];

        // Compute totals from sessions
        let totalMinutes = 0;
        let totalCommits = 0;
        let totalFiles   = 0;
        const allMessages: string[] = [];

        for (const s of daySessions) {
          if (s.started_at && s.ended_at) {
            const mins = (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000;
            totalMinutes += Math.max(0, mins);
          }
          totalCommits += (s.commit_count as number) ?? 0;
          totalFiles   += (s.files_count  as number) ?? 0;
          const msgs = s.commit_messages as string[] | null;
          if (msgs) allMessages.push(...msgs);
        }

        return {
          date,
          sessions: daySessions.map(s => ({
            id:          s.id,
            started_at:  s.started_at,
            ended_at:    s.ended_at,
            commits:     s.commit_count,
            files:       s.files_count,
            open:        !s.ended_at,
          })),
          totals: {
            minutes:  Math.round(totalMinutes),
            commits:  totalCommits,
            files:    totalFiles,
            messages: allMessages.slice(0, 10),
          },
          entry: entry ? {
            id:         entry.id,
            mood:       entry.mood,
            notes:      entry.notes,
            ai_summary: entry.ai_summary,
            activities: dayActivities,
          } : null,
        };
      });

    return NextResponse.json({ days });
  } catch {
    return NextResponse.json({ days: [] });
  } finally {
    client.release();
  }
}

// ── POST — finalise a diary day (mood, notes, manual activities) ──────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = (session.user as { profileId?: string }).profileId;
  if (!profileId) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const body = await req.json() as {
    date:        string;
    mood:        string;
    notes?:      string;
    activities?: { category: string; label: string; hours: number }[];
    deployment_id?: string;
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Upsert diary entry
    const { rows } = await client.query(
      `INSERT INTO work_diary_entries (owner_profile_id, deployment_id, entry_date, mood, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (owner_profile_id, entry_date)
       DO UPDATE SET mood = EXCLUDED.mood, notes = EXCLUDED.notes
       RETURNING id`,
      [profileId, body.deployment_id ?? null, body.date, body.mood, body.notes ?? null],
    );
    const entryId = rows[0].id as string;

    // Replace manual activities
    await client.query("DELETE FROM work_diary_activities WHERE entry_id = $1", [entryId]);
    for (const act of body.activities ?? []) {
      if (act.label.trim() && act.hours > 0) {
        await client.query(
          `INSERT INTO work_diary_activities (entry_id, category, label, hours)
           VALUES ($1, $2, $3, $4)`,
          [entryId, act.category, act.label.trim(), act.hours],
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({ id: entryId });
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
