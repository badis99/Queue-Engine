import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "redis";
import { env } from "../config/env";
import { keys } from "./keys";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
    console.error("Presence Redis connection failed:", err);
    process.exit(1);
});

export async function claimJob(): Promise<string | null> {
    const luaScriptPath = join(process.cwd(), "src", "queue", "scripts", "claim_job.lua");
    const luaScript = readFileSync(luaScriptPath, "utf-8");
    
    const result = await redis.eval(luaScript, {
            keys : [keys.pending(),keys.processing()],
            arguments : [JSON.stringify(Date.now())]
        }
    );

    if (result === null || typeof result === "string") {
        return result;
    }

    throw new Error(`Unexpected Lua return type: ${typeof result}`);

}