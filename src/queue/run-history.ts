import { db } from "../config/db";

let initialized = false;

export async function ensureRunHistoryTable(): Promise<void> {
  if (initialized) {
    return;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS job_run_history (
      id BIGSERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  initialized = true;
}

export async function recordRunHistory(
  jobId: string,
  jobName: string,
  status: "SUCCESS" | "FAILED",
  message: string | null
): Promise<void> {
  await ensureRunHistoryTable();

  await db.query(
    `INSERT INTO job_run_history (job_id, job_name, status, message)
     VALUES ($1, $2, $3, $4)`,
    [jobId, jobName, status, message]
  );
}
