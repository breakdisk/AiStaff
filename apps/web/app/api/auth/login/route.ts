import { NextRequest, NextResponse } from "next/server";
import { MOCK_ACCOUNTS, SESSION_COOKIE, encodeSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const account = MOCK_ACCOUNTS[email?.toLowerCase?.()];

  if (!account || account.password !== password) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const token = encodeSession(account.session);

  const res = NextResponse.json({ ok: true, session: account.session });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    maxAge:   60 * 60 * 8, // 8 hours
  });

  return res;
}
