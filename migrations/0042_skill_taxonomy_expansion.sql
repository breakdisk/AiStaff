-- migrations/0042_skill_taxonomy_expansion.sql
-- Expands skill_tags from 16 to ~82 entries across 10 domains.
-- ON CONFLICT (tag) DO NOTHING makes this idempotent.

INSERT INTO skill_tags (id, tag, domain) VALUES
  -- systems (existing: rust, go, wasm)
  (gen_random_uuid(), 'c',           'systems'),
  (gen_random_uuid(), 'cpp',         'systems'),
  (gen_random_uuid(), 'zig',         'systems'),
  (gen_random_uuid(), 'embedded',    'systems'),
  (gen_random_uuid(), 'assembly',    'systems'),

  -- web (existing: typescript, react)
  (gen_random_uuid(), 'javascript',  'web'),
  (gen_random_uuid(), 'nextjs',      'web'),
  (gen_random_uuid(), 'vue',         'web'),
  (gen_random_uuid(), 'angular',     'web'),
  (gen_random_uuid(), 'svelte',      'web'),
  (gen_random_uuid(), 'graphql',     'web'),
  (gen_random_uuid(), 'nodejs',      'web'),
  (gen_random_uuid(), 'rest-api',    'web'),
  (gen_random_uuid(), 'tailwind',    'web'),
  (gen_random_uuid(), 'html-css',    'web'),

  -- mobile
  (gen_random_uuid(), 'swift',        'mobile'),
  (gen_random_uuid(), 'kotlin',       'mobile'),
  (gen_random_uuid(), 'flutter',      'mobile'),
  (gen_random_uuid(), 'react-native', 'mobile'),
  (gen_random_uuid(), 'expo',         'mobile'),

  -- ai (existing: mlops, llm)
  (gen_random_uuid(), 'langchain',          'ai'),
  (gen_random_uuid(), 'pytorch',            'ai'),
  (gen_random_uuid(), 'tensorflow',         'ai'),
  (gen_random_uuid(), 'huggingface',        'ai'),
  (gen_random_uuid(), 'rag',                'ai'),
  (gen_random_uuid(), 'vector-db',          'ai'),
  (gen_random_uuid(), 'fine-tuning',        'ai'),
  (gen_random_uuid(), 'prompt-engineering', 'ai'),
  (gen_random_uuid(), 'computer-vision',    'ai'),
  (gen_random_uuid(), 'nlp',                'ai'),
  (gen_random_uuid(), 'openai-api',         'ai'),

  -- data (existing: postgres)
  (gen_random_uuid(), 'mongodb',       'data'),
  (gen_random_uuid(), 'redis',         'data'),
  (gen_random_uuid(), 'elasticsearch', 'data'),
  (gen_random_uuid(), 'apache-spark',  'data'),
  (gen_random_uuid(), 'airflow',       'data'),
  (gen_random_uuid(), 'dbt',           'data'),
  (gen_random_uuid(), 'pandas',        'data'),
  (gen_random_uuid(), 'bigquery',      'data'),
  (gen_random_uuid(), 'snowflake',     'data'),
  (gen_random_uuid(), 'mysql',         'data'),
  (gen_random_uuid(), 'sqlite',        'data'),

  -- infra (existing: kafka, k8s, terraform, docker, devops, aws)
  (gen_random_uuid(), 'gcp',            'infra'),
  (gen_random_uuid(), 'azure',          'infra'),
  (gen_random_uuid(), 'cloudflare',     'infra'),
  (gen_random_uuid(), 'linux',          'infra'),
  (gen_random_uuid(), 'github-actions', 'infra'),
  (gen_random_uuid(), 'ansible',        'infra'),
  (gen_random_uuid(), 'nginx',          'infra'),
  (gen_random_uuid(), 'pulumi',         'infra'),
  (gen_random_uuid(), 'prometheus',     'infra'),
  (gen_random_uuid(), 'grafana',        'infra'),
  (gen_random_uuid(), 'serverless',     'infra'),

  -- security
  (gen_random_uuid(), 'pentest',        'security'),
  (gen_random_uuid(), 'cryptography',   'security'),
  (gen_random_uuid(), 'oauth2',         'security'),
  (gen_random_uuid(), 'web-security',   'security'),
  (gen_random_uuid(), 'soc2',           'security'),
  (gen_random_uuid(), 'zero-knowledge', 'security'),

  -- web3 (existing: solidity)
  (gen_random_uuid(), 'ethereum',    'web3'),
  (gen_random_uuid(), 'move-lang',   'web3'),
  (gen_random_uuid(), 'near',        'web3'),
  (gen_random_uuid(), 'ipfs',        'web3'),
  (gen_random_uuid(), 'defi',        'web3'),
  (gen_random_uuid(), 'nft',         'web3'),

  -- general
  (gen_random_uuid(), 'system-design',      'general'),
  (gen_random_uuid(), 'api-design',         'general'),
  (gen_random_uuid(), 'technical-writing',  'general'),
  (gen_random_uuid(), 'agile',              'general'),
  (gen_random_uuid(), 'product-management', 'general'),
  (gen_random_uuid(), 'ui-ux',              'general')

ON CONFLICT (tag) DO NOTHING;
