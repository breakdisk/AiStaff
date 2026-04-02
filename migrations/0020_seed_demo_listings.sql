-- 0020: Seed canonical demo unified_profiles + agent_listings
--
-- These records back the frontend DEMO_LISTINGS constants so that
-- POST /marketplace/express-interest can satisfy the agent_id FK without
-- a real listing in the DB.  All IDs are valid UUIDs (full hex).
-- Idempotent: ON CONFLICT DO NOTHING on all inserts.

-- ── Demo developer profiles ───────────────────────────────────────────────

INSERT INTO unified_profiles
    (id, display_name, email, identity_tier, trust_score, account_type, role)
VALUES
    ('de000001-0000-0000-0000-111111111111',
     'Demo Agency',      'demo-agency@demo.aistaff.app',     'BIOMETRIC_VERIFIED', 85, 'agency',     'agent-owner'),
    ('de000002-0000-0000-0000-222222222222',
     'Demo Freelancer A','demo-freelancer-a@demo.aistaff.app','SOCIAL_VERIFIED',   55, 'individual', 'talent'),
    ('de000003-0000-0000-0000-333333333333',
     'Demo Freelancer B','demo-freelancer-b@demo.aistaff.app','SOCIAL_VERIFIED',   50, 'individual', 'talent')
ON CONFLICT (id) DO NOTHING;

-- ── Demo agent listings ───────────────────────────────────────────────────

INSERT INTO agent_listings
    (id, developer_id, name, description, wasm_hash, price_cents, active, category, seller_type)
VALUES
    ('a6000001-0000-0000-0000-a1a1a1a1a1a1',
     'de000001-0000-0000-0000-111111111111',
     'DataSync Agent v2.1',
     'Bidirectional ETL sync between PostgreSQL and S3. Handles schema drift, deduplication, and incremental loads. 99.9% SLA.',
     'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
     249900, true, 'AiStaff', 'Agency'),

    ('a6000002-0000-0000-0000-b2b2b2b2b2b2',
     'de000002-0000-0000-0000-222222222222',
     'LogAudit Sentinel',
     'Real-time log ingestion, anomaly detection, and compliance tagging for SOC 2 / ISO 27001 environments. Outputs structured alerts.',
     'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
     149900, true, 'AiStaff', 'Freelancer'),

    ('a6000003-0000-0000-0000-c3c3c3c3c3c3',
     'de000001-0000-0000-0000-111111111111',
     'HireAssist Pro',
     'AI-driven candidate screening, skills verification, and interview scheduling. Integrates with LinkedIn, GitHub, and ATS systems.',
     'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
     189900, true, 'AiTalent', 'Agency'),

    ('a6000004-0000-0000-0000-d4d4d4d4d4d4',
     'de000003-0000-0000-0000-333333333333',
     'K8s Scaler Agent',
     'Autonomous HPA tuning for Kubernetes workloads. Reads Prometheus metrics and adjusts replica counts within user-defined bounds.',
     'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
     349900, true, 'AiRobot', 'Agency'),

    ('a6000005-0000-0000-0000-e5e5e5e5e5e5',
     'de000002-0000-0000-0000-222222222222',
     'SecretRotator',
     'Zero-downtime rotation of database passwords, API keys, and TLS certificates across AWS Secrets Manager, Vault, and Kubernetes secrets.',
     'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
     199900, true, 'AiStaff', 'Freelancer'),

    ('a6000006-0000-0000-0000-f6f6f6f6f6f6',
     'de000003-0000-0000-0000-333333333333',
     'RoboticArm Calibrator',
     'Vision-guided calibration and trajectory planning for 6-DOF robotic arms. Supports FANUC, ABB, and UR hardware via Wasm bridge.',
     'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
     549900, true, 'AiRobot', 'Freelancer'),

    ('a6000007-0000-0000-0000-a7a7a7a7a7a7',
     'de000001-0000-0000-0000-111111111111',
     'ContractReviewer',
     'Extracts risk clauses, compares against template SOWs, and flags deviations. Outputs structured diff with severity ratings.',
     '77a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
     129900, true, 'AiTalent', 'Freelancer')

ON CONFLICT (id) DO NOTHING;
