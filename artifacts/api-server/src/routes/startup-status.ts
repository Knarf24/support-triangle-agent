import { Router, type IRouter } from "express";
import { getMigrationStatus } from "../lib/migration-status";
import { GetStartupStatusResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/startup-status", (_req, res) => {
  const { failed } = getMigrationStatus();
  const data = GetStartupStatusResponse.parse({ migrationFailed: failed });
  res.json(data);
});

export default router;
