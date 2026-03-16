import { handlers } from "@/auth";
import { NextRequest } from "next/server";

const { GET: authGET, POST: authPOST } = handlers;

// Wrap handlers to log the actual Auth.js error — the default
// "error=Configuration" redirect hides the real cause.
// TODO: remove debug logging before production launch.
export async function GET(req: NextRequest) {
  try {
    return await authGET(req);
  } catch (e: unknown) {
    console.error("[auth] GET error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    const name = e instanceof Error ? e.name : "UnknownError";
    return Response.json(
      { error: name, message: msg, stack: stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await authPOST(req);
  } catch (e: unknown) {
    console.error("[auth] POST error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    const name = e instanceof Error ? e.name : "UnknownError";
    return Response.json(
      { error: name, message: msg, stack: stack?.split("\n").slice(0, 5) },
      { status: 500 }
    );
  }
}
