-- 0074: Freelancer availability calendar
-- Per-day availability flags shown on public profile and listing pages.

CREATE TABLE availability_blocks (
  profile_id UUID        NOT NULL REFERENCES unified_profiles(id) ON DELETE CASCADE,
  block_date DATE        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'AVAILABLE',
  CONSTRAINT availability_status_check
    CHECK (status IN ('AVAILABLE', 'BUSY', 'TENTATIVE')),
  PRIMARY KEY (profile_id, block_date)
);

CREATE INDEX ON availability_blocks (profile_id, block_date);
