import express from "express";
import { createServer } from "http";
import path from "path";
import { Server } from "socket.io";
import { env } from "./config/env";
import { jobsRouter } from "./api/jobs.router";
import { statsRouter } from "./api/stats.router";
import { getControlRoomPayload } from "./api/stats.service";
import { getStatsSnapshot } from "./api/stats.service";
import { ensureRunHistoryTable } from "./queue/run-history";
import { Jobworker } from "./worker/worker";
import { startScheduler } from "./scheduler/scheduler";
import { getRedisClient } from "./config/redis";
import { keys } from "./queue/keys";

function logApp(message: string): void {
    console.log(`[app ${new Date().toISOString()}] ${message}`);
}

async function main() {
    await ensureRunHistoryTable();
    const redis = await getRedisClient();

    await redis.del([
        keys.pending(),
        keys.processing(),
        keys.dead(),
        keys.recurring(),
        keys.recurringDefinitions()
    ]);
    logApp("Cleared queue runtime keys for fresh startup");

    await startScheduler();

    const app = express();
    const server = createServer(app);
    const io = new Server(server, {
        cors: {
            origin: "*"
        }
    });

    app.use(express.json());
    app.use("/api/jobs", jobsRouter);
    app.use("/api/stats", statsRouter);
    let queuePaused = false;

    app.post("/api/queues/pause", (_req, res) => {
        queuePaused = true;
        res.json({ ok: true, paused: true });
    });

    app.post("/api/queues/resume", (_req, res) => {
        queuePaused = false;
        res.json({ ok: true, paused: false });
    });

    app.get("/dashboard", (_req, res) => {
        res.sendFile(path.join(process.cwd(), "src", "api", "dashboard", "index.html"));
    });

    const statsEmitter = setInterval(async () => {
        try {
            const stats = await getStatsSnapshot();
            io.emit("stats:update", stats);

            const controlRoom = await getControlRoomPayload();
            io.emit("stats", controlRoom);
        } catch (error) {
            console.error("stats emitter failed:", error);
        }
    }, 2000);

    let workerRunning = false;
    const workerLoop = setInterval(() => {
        if (queuePaused) {
            return;
        }

        if (workerRunning) {
            return;
        }

        workerRunning = true;
        void Jobworker()
            .catch((error) => {
                console.error("Jobworker failed:", error);
            })
            .finally(() => {
                workerRunning = false;
            });
    }, 1000);

    const port = Number(env.PORT);
    server.listen(port, () => {
        logApp(`Server listening on http://localhost:${port}`);
        logApp(`Dashboard available at http://localhost:${port}/dashboard`);
    });

    process.on("SIGINT", () => {
        clearInterval(statsEmitter);
        clearInterval(workerLoop);
        server.close(() => process.exit(0));
    });
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
