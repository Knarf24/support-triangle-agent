import { Router, type IRouter } from "express";
import healthRouter from "./health";
import triageRouter from "./triage";
import startupStatusRouter from "./startup-status";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(triageRouter);
router.use(chatRouter);
router.use(startupStatusRouter);

export default router;
