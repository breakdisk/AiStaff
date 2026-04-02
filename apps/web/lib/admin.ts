import { Pool } from "pg";

// Shared pool for admin checks — reused across admin routes.
export const adminPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30_000,
});

/** Returns true if the given profileId has is_admin = true in unified_profiles. */
export async function assertAdmin(profileId: string): Promise<boolean> {
  let client;
  try {
    client = await adminPool.connect();
    const result = await client.query(
      `SELECT is_admin FROM unified_profiles WHERE id = $1`,
      [profileId],
    );
    return result.rows[0]?.is_admin === true;
  } finally {
    client?.release();
  }
}
