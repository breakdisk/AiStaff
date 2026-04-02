export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { sendEmail } from "@/lib/mailer";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Params = { params: Promise<{ task_id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task_id } = await params;
  const body = await req.json() as { freelancer_id?: string; status?: string };

  const client = await pool.connect();
  try {
    // Fetch current task + org name for email
    const { rows: existing } = await client.query(
      `SELECT st.*, o.name AS org_name
         FROM subcontract_tasks st
         JOIN organisations o ON o.id = st.org_id
        WHERE st.id = $1`,
      [task_id],
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const task = existing[0];

    const updates: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    if (body.freelancer_id !== undefined) {
      updates.push(`freelancer_id = $${idx++}`);
      values.push(body.freelancer_id);
    }
    if (body.status !== undefined) {
      const valid = ["OPEN", "ASSIGNED", "SUBMITTED", "APPROVED", "PAID"];
      if (!valid.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.push(`status = $${idx++}`);
      values.push(body.status);
    }

    values.push(task_id);
    const { rows } = await client.query(
      `UPDATE subcontract_tasks SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );

    // Email freelancer when assigned
    if (body.freelancer_id && body.status === "ASSIGNED") {
      const { rows: fl } = await client.query(
        `SELECT email, full_name FROM unified_profiles WHERE id = $1`,
        [body.freelancer_id],
      );
      if (fl[0]?.email) {
        const name = fl[0].full_name ?? "there";
        await sendEmail(
          fl[0].email,
          `New task: ${task.title} — ${task.org_name} on AiStaff`,
          `Hi ${name},\n\nYou've been assigned a subcontract task from ${task.org_name}.\n\n` +
          `Task: ${task.title}\n` +
          (task.description ? `Details: ${task.description}\n` : "") +
          `Budget: $${(Number(task.budget_cents) / 100).toFixed(2)}\n\n` +
          `Log in to AiStaff to accept and get started.\n\nhttps://aistaffglobal.com/dashboard`,
        );
      }
    }

    return NextResponse.json({ task: rows[0] });
  } finally {
    client.release();
  }
}
