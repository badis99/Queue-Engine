import { Jobworker } from "./worker/worker";
import { getRedisClient } from "./config/redis";

async function main() {
    const redis = await getRedisClient();
    await redis.FLUSHALL();
    await Jobworker();
    return;
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
