// Session — backed by NextAuth (Auth.js v5) JWT strategy.
// The old base64-cookie approach is replaced; this file now re-exports
// the NextAuth helpers so existing call-sites keep working.

export { auth as getServerSession } from "@/auth";
export { signIn, signOut } from "@/auth";

// ── Convenience types (mirrors NextAuth session.user shape) ───────────────────

export type IdentityTier = "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
export type UserRole = "client" | "talent" | "developer";

export interface AiStaffUser {
  profileId:    string;
  name:         string | null;
  email:        string | null;
  image:        string | null;
  identityTier: IdentityTier;
  trustScore:   number;
  provider:     string;
  roles:        UserRole[];
}

/** True if the user holds the given role. */
export function hasRole(user: AiStaffUser | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

/** Primary display role — first in the array. */
export function primaryRole(user: AiStaffUser): UserRole {
  return (user.roles?.[0] as UserRole) ?? "talent";
}

/** True if the user can receive job matches (Tier 1 or above). */
export function canReceiveJobs(user: AiStaffUser | null): boolean {
  return user?.identityTier === "SOCIAL_VERIFIED" ||
    user?.identityTier === "BIOMETRIC_VERIFIED";
}
