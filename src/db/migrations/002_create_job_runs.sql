CREATE TABLE IF NOT EXISTS job_run_history (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  message TEXT
);

ALTER TABLE job_run_history ADD COLUMN IF NOT EXISTS job_id TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE job_run_history ADD COLUMN IF NOT EXISTS job_name TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE job_run_history ADD COLUMN IF NOT EXISTS run_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE job_run_history ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'FAILED';
ALTER TABLE job_run_history ADD COLUMN IF NOT EXISTS message TEXT;

CREATE INDEX IF NOT EXISTS idx_job_run_history_run_at_desc ON job_run_history(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_run_history_job_name ON job_run_history(job_name);