import { createClient } from "redis";
import { Jobworker } from "./worker/worker";
import { env } from "./config/env";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
    console.error("Presence Redis connection failed:", err);
    process.exit(1);
});

async function main() {
    await redis.FLUSHALL();
    await Jobworker();
    return;
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
