import { db } from "../config/db";

export async function dbVacuumHandler(): Promise<void> {
  await db.query("VACUUM ANALYZE");
}
