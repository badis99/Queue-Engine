import { randomUUID } from "crypto";
import { getRedisClient } from "../config/redis";

export async function acquireLock(lockKey: string, ttlSeconds: number): Promise<string | null> {
    const redis = await getRedisClient();
    const token = randomUUID();

    const result = await redis.set(lockKey, token, {
        NX: true,
        EX: ttlSeconds
    });

    if (result !== "OK") {
        return null;
    }

    return token;
}

export async function releaseLock(lockKey: string, token: string): Promise<void> {
    const redis = await getRedisClient();

    await redis.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
            return redis.call("DEL", KEYS[1])
        else
            return 0
        end`,
        {
            keys: [lockKey],
            arguments: [token]
        }
    );
}
