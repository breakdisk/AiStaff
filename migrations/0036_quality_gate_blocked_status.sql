-- Add QUALITY_GATE_BLOCKED to deployment_status enum.
-- Escrow is held when quality_gate_scans has blocks_release=true for a deployment.
ALTER TYPE deployment_status ADD VALUE IF NOT EXISTS 'QUALITY_GATE_BLOCKED';
