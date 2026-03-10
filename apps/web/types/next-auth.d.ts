import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      profileId:    string;
      identityTier: "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
      trustScore:   number;
      provider:     string;
      roles:        string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileId?:    string;
    identityTier?: string;
    trustScore?:   number;
    provider?:     string;
    roles?:        string[];
  }
}
