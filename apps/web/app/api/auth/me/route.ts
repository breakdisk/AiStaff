import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json(null, { status: 401 });
  }
  return Response.json(session.user);
}
