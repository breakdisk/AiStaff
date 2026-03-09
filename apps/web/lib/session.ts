// Mock session — base64(JSON) stored in httpOnly cookie.
// Replace with signed JWT (jose) when wiring real OAuth.

export const SESSION_COOKIE = "aistaff_session";

export type IdentityTier = 0 | 1 | 2;
export type UserRole = "client" | "talent" | "developer";

export interface Session {
  id:            string;
  name:          string;
  email:         string;
  roles:         UserRole[];   // array — one user can hold multiple roles
  identity_tier: IdentityTier;
  trust_score:   number;
}

/** Check if a session has a specific role. */
export function hasRole(session: Session | null, role: UserRole): boolean {
  return session?.roles.includes(role) ?? false;
}

/** Primary display role — first in the array. */
export function primaryRole(session: Session): UserRole {
  return session.roles[0];
}

// ── Mock accounts ─────────────────────────────────────────────────────────────

export const MOCK_ACCOUNTS: Record<string, { password: string; session: Session }> = {
  "client@demo.com": {
    password: "demo",
    session: {
      id:            "usr-c001",
      name:          "Alex Chen",
      email:         "client@demo.com",
      roles:         ["client"],
      identity_tier: 1,
      trust_score:   72,
    },
  },
  "talent@demo.com": {
    password: "demo",
    session: {
      id:            "usr-t001",
      name:          "Marcus T.",
      email:         "talent@demo.com",
      roles:         ["talent"],
      identity_tier: 2,
      trust_score:   94,
    },
  },
  "dev@demo.com": {
    password: "demo",
    session: {
      id:            "usr-d001",
      name:          "Priya N.",
      email:         "dev@demo.com",
      roles:         ["developer", "talent"],  // dual-role: publishes & installs
      identity_tier: 2,
      trust_score:   88,
    },
  },
};

// ── Encode / decode ───────────────────────────────────────────────────────────

export function encodeSession(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}

export function decodeSession(token: string): Session | null {
  try {
    const raw = JSON.parse(Buffer.from(token, "base64").toString("utf-8")) as
      Session & { role?: UserRole }; // handle old single-role cookies
    // Normalise: if old cookie has `role` but not `roles`, upgrade it
    if (!raw.roles && raw.role) {
      raw.roles = [raw.role];
    }
    return raw as Session;
  } catch {
    return null;
  }
}
