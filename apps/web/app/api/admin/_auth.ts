// apps/web/app/api/admin/_auth.ts
// Shared admin guard for all /api/admin/* Route Handlers.
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<{ ok: true } | NextResponse> {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { ok: true };
}

export const IDENTITY_URL    = process.env.IDENTITY_SERVICE_URL    ?? "http://localhost:3001";
export const MARKETPLACE_URL = process.env.MARKETPLACE_SERVICE_URL ?? "http://localhost:3002";
