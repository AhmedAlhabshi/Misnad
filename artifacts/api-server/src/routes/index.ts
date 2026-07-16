import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeContractRouter from "./analyzeContract";
import analyzeFinancialImpactRouter from "./analyzeFinancialImpact";
import legalSearchRouter from "./legalSearch";
import contractSearchRouter from "./contractSearch";
import contractChatRouter from "./contractChat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeContractRouter);
router.use(analyzeFinancialImpactRouter);
router.use(legalSearchRouter);
router.use(contractSearchRouter);
router.use(contractChatRouter);

export default router;
