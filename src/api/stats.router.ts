import { Router } from "express";
import { getStatsSnapshot } from "./stats.service";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res) => {
  try {
    const stats = await getStatsSnapshot();
    res.json(stats);
  } catch {
    res.status(500).json({ error: "Failed to load stats" });
  }
});
