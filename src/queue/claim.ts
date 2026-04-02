import { readFileSync } from "fs";
import { join } from "path";
import { keys } from "./keys";
import { getRedisClient } from "../config/redis";

export async function claimJob(): Promise<string | null> {
    const redis = await getRedisClient();
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