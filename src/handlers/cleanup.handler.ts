import { readdir, stat, unlink } from "fs/promises";
import path from "path";

export async function cleanupHandler(payload: { path: string; maxAgeMinutes?: number }): Promise<void> {
  const cutoffMs = Date.now() - (payload.maxAgeMinutes ?? 60) * 60 * 1000;
  const files = await readdir(payload.path);

  for (const fileName of files) {
    const fullPath = path.join(payload.path, fileName);
    const fileStats = await stat(fullPath);

    if (!fileStats.isFile()) {
      continue;
    }

    if (fileStats.mtimeMs < cutoffMs) {
      await unlink(fullPath);
    }
  }
}
