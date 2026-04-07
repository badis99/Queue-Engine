import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../config/db";

export async function runMigrations(): Promise<void> {
    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const migrationsDir = path.resolve(__dirname, "migrations");
    const files = (await fs.readdir(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b));

    for (const file of files) {
        const alreadyApplied = await db.query<{ filename: string }>(
            "SELECT filename FROM schema_migrations WHERE filename = $1",
            [file]
        );

        if (alreadyApplied.rowCount) {
            continue;
        }

        const migrationPath = path.join(migrationsDir, file);
        const sql = await fs.readFile(migrationPath, "utf-8");

        await db.query("BEGIN");
        try {
            await db.query(sql);
            await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
            await db.query("COMMIT");
            console.log(`[migrate] Applied ${file}`);
        } catch (error) {
            await db.query("ROLLBACK");
            throw error;
        }
    }
}

if (require.main === module) {
    runMigrations()
        .then(async () => {
            console.log("[migrate] All migrations are up to date");
            await db.end();
            process.exit(0);
        })
        .catch(async (error) => {
            console.error("[migrate] Failed:", error);
            await db.end();
            process.exit(1);
        });
}
