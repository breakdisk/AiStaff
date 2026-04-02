import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      profileId:          string;
      identityTier:       "UNVERIFIED" | "SOCIAL_VERIFIED" | "BIOMETRIC_VERIFIED";
      trustScore:         number;
      provider:           string;
      accountType:        string;          // "individual" | "agency"
      role:               string | null;   // "talent" | "client" | "agent-owner" | null
      roles:              string[];
      isAdmin:            boolean;
      isLinkedAccount:    boolean;
      githubAccessToken?: string;          // set only when signed in via GitHub
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    profileId?:          string;
    identityTier?:       string;
    trustScore?:         number;
    provider?:           string;
    accountType?:        string;           // "individual" | "agency"
    role?:               string | null;    // "talent" | "client" | "agent-owner" | null
    roles?:              string[];
    isAdmin?:            boolean;
    isLinkedAccount?:    boolean;
    githubAccessToken?:  string;           // set only when signed in via GitHub
  }
}
