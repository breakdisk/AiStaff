export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { auth } from "@/auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: NextRequest) {
  const session = await auth();
  const profileId = session?.user?.profileId;
  if (!profileId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT
       d.id            AS deployment_id,
       al.name         AS listing_name,
       al.slug,
       d.escrow_amount_cents,
       pf.fee_cents,
       pf.fee_pct,
       d.state,
       pf.created_at
     FROM platform_fees pf
     JOIN deployments d    ON d.id  = pf.deployment_id
     JOIN agent_listings al ON al.id = d.agent_id
    WHERE d.client_id = $1
    ORDER BY pf.created_at DESC
    LIMIT 100`,
    [profileId],
  );

  if (req.nextUrl.searchParams.get("export") === "csv") {
    const header = "Date,Agent,Escrow Amount,Platform Fee,Total\r\n";
    const lines = rows.map((r) => {
      const date   = new Date(r.created_at as string).toISOString().slice(0, 10);
      const escrow = ((r.escrow_amount_cents as number) / 100).toFixed(2);
      const fee    = ((r.fee_cents as number) / 100).toFixed(2);
      const total  = (((r.escrow_amount_cents as number) + (r.fee_cents as number)) / 100).toFixed(2);
      return `${date},"${(r.listing_name as string).replace(/"/g, '""')}",${escrow},${fee},${total}`;
    });
    const csv = header + lines.join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="spend-history.csv"',
      },
    });
  }

  return NextResponse.json(rows);
}
