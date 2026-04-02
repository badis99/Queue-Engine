import { createClient } from "redis";
import { env } from "./env";

const redis = createClient({ url: env.REDIS_URL });

let connectPromise: ReturnType<typeof redis.connect> | null = null;

redis.on("error", (err) => {
  console.error("Redis client error:", err);
});

export async function getRedisClient() {
  if (!connectPromise) {
    connectPromise = redis.connect();
  }

  await connectPromise;
  return redis;
}
