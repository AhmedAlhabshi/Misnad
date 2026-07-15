import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeContractRouter from "./analyzeContract";
import analyzeFinancialImpactRouter from "./analyzeFinancialImpact";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeContractRouter);
router.use(analyzeFinancialImpactRouter);

export default router;
