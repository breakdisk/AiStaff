-- Escrow payout ledger — append-only; no rows are ever updated or deleted.
CREATE TABLE escrow_payouts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deployment_id  UUID NOT NULL REFERENCES deployments (id),
    recipient_id   UUID NOT NULL REFERENCES unified_profiles (id),
    amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),
    reason         TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrow_payouts_deployment ON escrow_payouts (deployment_id);
CREATE INDEX idx_escrow_payouts_recipient  ON escrow_payouts (recipient_id);

-- Immutable MCP tool call audit trail — no updates or deletes permitted.
CREATE TABLE tool_call_audit (
    id             BIGSERIAL PRIMARY KEY,
    deployment_id  UUID NOT NULL REFERENCES deployments (id),
    tool_name      TEXT NOT NULL,
    params         TEXT NOT NULL,
    decision       TEXT NOT NULL CHECK (decision IN ('ALLOWED', 'DENIED')),
    called_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_call_audit_deployment ON tool_call_audit (deployment_id);
CREATE INDEX idx_tool_call_audit_decision   ON tool_call_audit (decision);

-- Revoke DELETE on audit tables from the application role (run as superuser in production)
-- REVOKE DELETE ON escrow_payouts   FROM aistaffapp_app;
-- REVOKE DELETE ON tool_call_audit  FROM aistaffapp_app;
-- REVOKE UPDATE ON escrow_payouts   FROM aistaffapp_app;
-- REVOKE UPDATE ON tool_call_audit  FROM aistaffapp_app;
