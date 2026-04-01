import { Job, Payload } from "./types";

type JobHash = Record<string, string>;

const requiredFields = [
  "id",
  "name",
  "payload",
  "status",
  "priorty",
  "createdAt",
  "runAt",
  "attempts",
  "maxRetries",
  "timeout"
] as const;

export function jobToHash(job: Job): JobHash {
  return {
    id: job.id,
    name: job.name,
    payload: JSON.stringify(job.payload),
    status: job.status,
    priorty: String(job.priorty),
    createdAt: job.createdAt.toISOString(),
    runAt: String(job.runAt),
    attempts: String(job.attempts),
    maxRetries: String(job.maxRetries),
    timeout: String(job.timeout)
  };
}

export function jobFromHash(hash: JobHash): Job | null {
  for (const field of requiredFields) {
    if (!hash[field]) {
      return null;
    }
  }

  const payload = safeParsePayload(hash.payload);
  if (payload === null) {
    return null;
  }

  const priorty = Number(hash.priorty);
  const runAt = Number(hash.runAt);
  const attempts = Number(hash.attempts);
  const maxRetries = Number(hash.maxRetries);
  const timeout = Number(hash.timeout);

  if ([priorty, runAt, attempts, maxRetries, timeout].some(Number.isNaN)) {
    return null;
  }

  return {
    id: hash.id,
    name: hash.name,
    payload,
    status: hash.status as Job["status"],
    priorty,
    createdAt: new Date(hash.createdAt),
    runAt,
    attempts,
    maxRetries,
    timeout
  };
}

function safeParsePayload(payload: string): Payload | null {
  try {
    return JSON.parse(payload) as Payload;
  } catch {
    return null;
  }
}
