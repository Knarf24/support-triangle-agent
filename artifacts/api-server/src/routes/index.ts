import { Router, type IRouter } from "express";
import healthRouter from "./health";
import triageRouter from "./triage";
import startupStatusRouter from "./startup-status";

const router: IRouter = Router();

router.use(healthRouter);
router.use(triageRouter);
router.use(startupStatusRouter);

export default router;
