import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeContractRouter from "./analyzeContract";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeContractRouter);

export default router;
