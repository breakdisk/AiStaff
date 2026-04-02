# Reminders Feature — Design Spec
> Date: 2026-03-20
> Status: Approved
> Scope: Notifications → Reminders tab (user-created + auto-generated from deployment milestones)

---

## 1. Context

The Reminders page under `/notifications` is currently a pure demo — no DB table, no API calls, all mock data. Three gaps to close:

1. No persistence — reminders disappear on refresh
2. No scheduler — reminders never "fire"
3. No auto-generation — DoD checklist milestones do not create reminders

When a reminder fires it must: (a) write an entry to `in_app_notifications` (Alerts tab) and (b) send an email via the existing SMTP mailer in `notification_service`.

---

## 2. Database — migration `0022_reminders.sql`

```sql
CREATE TABLE reminders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES unified_profiles(id),
    deployment_id  UUID REFERENCES deployments(id),  -- NULL for user-created
    title          TEXT NOT NULL,
    remind_at      TIMESTAMPTZ NOT NULL,
    source         TEXT NOT NULL DEFAULT 'user',      -- 'user' | 'system'
    fired          BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX reminders_user_idx ON reminders(user_id);
CREATE INDEX reminders_due_idx  ON reminders(remind_at, fired) WHERE fired = false;
```

**Column notes:**
- `remind_at` — full timestamp (date + HH:MM combined server-side from API input)
- `source` — `'user'` (manually created) | `'system'` (auto-generated on DeploymentStarted)
- `fired` — set to `true` atomically by the polling loop; prevents double-fire
- `deployment_id` — `NULL` for user-created; links system reminders to their deployment for UI badge display

---

## 3. Rust — `crates/notification_service/`

### 3a. `DeploymentStarted` Kafka consumer (new arm in `consumer.rs`)

On `DeploymentStarted` event:

1. Fetch the deployment row to get `talent_id` (the user to notify)
2. Fetch all `dod_checklist_steps` rows for `deployment_id`
3. For each step: insert one `reminders` row:
   - `user_id = talent_id`
   - `deployment_id = event.deployment_id`
   - `title = "DoD: {step_label}"`
   - `remind_at = NOW() + INTERVAL '24 hours'`
   - `source = 'system'`
4. If no checklist steps exist, skip silently (no error)

### 3b. Polling loop (new `tokio::spawn` in `main.rs`)

Spawned once at startup alongside the Kafka consumer task:

```rust
let mut ticker = tokio::time::interval(Duration::from_secs(60));
loop {
    ticker.tick().await;
    let due = sqlx::query!(
        "UPDATE reminders SET fired = true
         WHERE fired = false AND remind_at <= NOW()
         RETURNING id, user_id, title"
    )
    .fetch_all(&pool)
    .await?;

    for r in due {
        fanout.dispatch_in_app(
            r.user_id, &r.title, "Reminder due", "reminder", "normal"
        ).await.ok();
        fanout.dispatch_email(r.user_id, &r.title, "Your reminder is due").await.ok();
    }
}
```

**Key properties:**
- `UPDATE … RETURNING` is atomic — a reminder can fire at most once even under concurrent restarts
- `.ok()` on dispatch calls — a failed notification does not halt the polling loop
- Loop runs every 60 seconds; maximum latency to fire is 60s

---

## 4. Next.js API routes

All routes in `apps/web/app/api/reminders/`.

### `GET /api/reminders`
- Auth: `auth()` session → `profileId`
- Query: `SELECT * FROM reminders WHERE user_id = $1 ORDER BY remind_at ASC LIMIT 100`
- Response: `{ reminders: ReminderRow[] }`

### `POST /api/reminders`
- Body: `{ title: string, date: string, hours: number, minutes: number }`
- Server combines: `remind_at = new Date(\`${date}T${HH}:${MM}:00Z\`)`
- Inserts with `source = 'user'`, `user_id` from session
- Response: `{ reminder: ReminderRow }` (201)
- Validation: `title` non-empty, `date` is valid ISO date, `hours` 0–23, `minutes` 0–59

### `DELETE /api/reminders/[id]`
- Auth check: only delete if `user_id` matches session (no cross-user deletion)
- Response: 204 on success, 404 if not found / not owner

### `api.ts` additions
```ts
fetchReminders(): Promise<ReminderRow[]>
createReminder(title: string, date: string, hours: number, minutes: number): Promise<ReminderRow>
deleteReminder(id: string): Promise<void>
```

---

## 5. Frontend — Reminders page

### 5a. Create form

Fields:
- **Title** — text input, full-width
- **Date** — `<input type="date">`, full-width
- **Time row** — `grid grid-cols-2 gap-2`:
  - **Hours** — `<select>` 00–23
  - **Minutes** — `<select>` options: 00, 15, 30, 45
- **Add Reminder** button — full-width on mobile

On submit: call `createReminder()`, optimistically prepend to list, clear form. Show inline error on failure.

### 5b. Reminder list

Loaded via `fetchReminders()` on mount. Each row:

| Element | Detail |
|---|---|
| Title | `text-zinc-50 text-sm` |
| Relative time | "in 2h", "tomorrow 3:00 pm" — `text-zinc-400 text-xs` |
| Source badge | `source === 'system'`: small `Deployment` chip, `bg-zinc-700 text-zinc-300 text-xs px-1` |
| Status | `fired=true` → emerald-500 checkmark; `remind_at < NOW()+1h` → amber-400 "Due soon" label; otherwise no indicator |
| Delete button | Trash icon, shown on hover/focus; **only for `source === 'user'`** rows; calls `deleteReminder()` |

Mobile: card layout, `border border-zinc-800 rounded-[2px] p-3`.

### 5c. Empty state

> "No reminders. Add one above."

Single line, `text-zinc-400 text-sm`, no illustration.

### 5d. Loading state

Zinc-800 shimmer skeleton rows (3 rows) while `fetchReminders()` is in flight.

---

## 6. Data flow summary

```
User submits form
  → POST /api/reminders
  → INSERT reminders (source='user')
  → GET /api/reminders re-renders list

DeploymentStarted Kafka event
  → notification_service consumer
  → fetch dod_checklist_steps
  → INSERT reminders × N (source='system')

notification_service polling loop (60s)
  → UPDATE reminders SET fired=true WHERE due → RETURNING rows
  → dispatch_in_app() → in_app_notifications table
  → dispatch_email()  → SMTP
```

---

## 7. Test plan

```bash
# Migration
sqlx migrate run   # applies 0022_reminders.sql
cargo sqlx prepare --workspace

# Rust unit test
cargo test -p notification_service   # polling loop fires due reminders, skips future ones

# Manual E2E
# 1. Open /notifications → Reminders tab
# 2. Add reminder: "Follow up with client", today's date, 1 minute from now
# 3. Wait 60s → row shows emerald checkmark; Alerts tab shows new entry
# 4. Start a deployment → after event consumed, system reminders appear in list with "Deployment" badge
# 5. Delete a user-created reminder → row disappears (204)
# 6. Attempt delete on system reminder → delete button absent (UI enforces)

# TypeScript
cd apps/web && npx tsc --noEmit
```

---

## 8. Out of scope (future)

- Quiet hours (suppress firing during sleep hours) — Settings tab, separate spec
- Snooze / reschedule — post-MVP
- Free-form minute input (currently 00/15/30/45 only)
- Per-step deadline on DoD checklist (checklist_service has no deadline column today)
