-- Migration 0017: Freelancer profile fields + skill tag seeds + job applications

-- Profile fields for edit mode (Phase 2)
ALTER TABLE unified_profiles
    ADD COLUMN IF NOT EXISTS bio               TEXT,
    ADD COLUMN IF NOT EXISTS hourly_rate_cents INT,
    ADD COLUMN IF NOT EXISTS availability      TEXT NOT NULL DEFAULT 'available',
    ADD COLUMN IF NOT EXISTS role              TEXT NOT NULL DEFAULT 'talent';

-- Applicant tracking on match_requests (Phase 3: express-interest)
ALTER TABLE match_requests
    ADD COLUMN IF NOT EXISTS applicant_id UUID REFERENCES unified_profiles(id);

CREATE INDEX IF NOT EXISTS idx_match_requests_applicant
    ON match_requests (applicant_id);

-- Seed common skill tags so the picker has data on fresh installs
INSERT INTO skill_tags (id, tag, domain) VALUES
    (gen_random_uuid(), 'rust',       'systems'),
    (gen_random_uuid(), 'python',     'general'),
    (gen_random_uuid(), 'typescript', 'web'),
    (gen_random_uuid(), 'wasm',       'systems'),
    (gen_random_uuid(), 'kafka',      'infra'),
    (gen_random_uuid(), 'postgres',   'data'),
    (gen_random_uuid(), 'k8s',        'infra'),
    (gen_random_uuid(), 'terraform',  'infra'),
    (gen_random_uuid(), 'mlops',      'ai'),
    (gen_random_uuid(), 'llm',        'ai'),
    (gen_random_uuid(), 'solidity',   'web3'),
    (gen_random_uuid(), 'docker',     'infra'),
    (gen_random_uuid(), 'go',         'systems'),
    (gen_random_uuid(), 'react',      'web'),
    (gen_random_uuid(), 'aws',        'cloud'),
    (gen_random_uuid(), 'devops',     'infra')
ON CONFLICT (tag) DO NOTHING;
