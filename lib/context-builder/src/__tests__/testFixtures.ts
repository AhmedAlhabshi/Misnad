import { evaluateAvailability, ROUTE_REQUIRED_SOURCES, type ChatRoute, type ChatRouteDecision } from "@workspace/chat-router";
import { indexContractSession, InMemoryContractRagRepository, type ContractRagRepository } from "@workspace/contract-rag";
import { FakeEmbeddingProvider, ingestSource, InMemoryLegalChunkRepository, LEGAL_SOURCE_MANIFEST, type EmbeddingProvider, type LegalChunkRepository } from "@workspace/legal-rag";
import type { ContractUnderstanding } from "@workspace/contract-schema";
import type { FinancialMetrics, MoneyMetric, PercentageMetric } from "@workspace/financial-metrics";

export interface RouteDecisionAvailability {
  contractRagAvailable: boolean;
  legalRagAvailable: boolean;
  financialMetricsAvailable: boolean;
}

/**
 * Builds a schema-valid `ChatRouteDecision` for a given route directly,
 * using chat-router's own real `ROUTE_REQUIRED_SOURCES` map and
 * `evaluateAvailability` function (not a hand-rolled duplicate) — this
 * lets each context-builder test target an exact route deterministically
 * without depending on chat-router's own keyword-pattern matching, while
 * still exercising the real availability-evaluation logic the two
 * packages actually share.
 */
export function buildRouteDecision(route: ChatRoute, availability: RouteDecisionAvailability, normalizedQuestion: string): ChatRouteDecision {
  const evaluation = evaluateAvailability(route, availability);
  return {
    route,
    requiredSources: evaluation.requiredSources,
    unavailableRequiredSources: evaluation.unavailableRequiredSources,
    confidence: 0.9,
    reasons: ["test_fixture"],
    normalizedQuestion,
    deterministic: true,
  };
}

export const FULLY_AVAILABLE: RouteDecisionAvailability = {
  contractRagAvailable: true,
  legalRagAvailable: true,
  financialMetricsAvailable: true,
};

export { ROUTE_REQUIRED_SOURCES };

const AUTO_FINANCE_MASKED_TEXT =
  "Early Termination\nEither party may terminate this financing agreement early by giving thirty (30) days written notice, subject to an early settlement fee.\n\nAdministrative Fee\nThe borrower shall pay a one-time administrative fee of [AMOUNT] SAR upon signing.\n\nMonthly Installment\nThe borrower shall pay a monthly installment of [AMOUNT] SAR on the first day of each month.";

export async function setupContractRagFixture(): Promise<{ repository: ContractRagRepository; embeddingProvider: EmbeddingProvider; sessionId: string }> {
  const repository = new InMemoryContractRagRepository();
  const embeddingProvider = new FakeEmbeddingProvider(256);
  const { sessionId } = await indexContractSession(
    { maskedDocument: { maskedText: AUTO_FINANCE_MASKED_TEXT }, contractType: "auto_finance", analysisLanguage: "en" },
    { repository, embeddingProvider },
  );
  return { repository, embeddingProvider, sessionId };
}

export async function setupLegalRagFixture(): Promise<{ repository: LegalChunkRepository; embeddingProvider: EmbeddingProvider }> {
  const repository = new InMemoryLegalChunkRepository();
  const embeddingProvider = new FakeEmbeddingProvider(256);
  await ingestSource("sama_regulations_consumer_financing", { repository, embeddingProvider, manifest: LEGAL_SOURCE_MANIFEST });
  return { repository, embeddingProvider };
}

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}
function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "not stated", confidence: "low" };
}
function unavailablePercentage(): PercentageMetric {
  return { value: null, status: "unavailable", source: null, reason: "not stated", confidence: "low" };
}

export function financialMetricsFixture(): FinancialMetrics {
  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations: [],
    informationalAmounts: [],
    recurringCommitment: {
      actualMonthlyAmount: knownMoney(2400),
      monthlyEquivalent: knownMoney(2400),
      annualEquivalent: knownMoney(28800),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: false,
      includedObligationIds: [],
    },
    contractDuration: { value: 48, unit: "months", months: 48, days: null, startDate: null, endDate: null, status: "known", source: "test", reason: null, confidence: "high" },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: knownMoney(96000),
      calculatedCoreObligations: knownMoney(134400),
      calculatedKnownCost: knownMoney(134400),
      financingRepaymentTotal: knownMoney(115200),
      financingCost: knownMoney(19200),
      estimatedContractCost: knownMoney(134400),
      differenceFromStated: { classification: "unavailable", amount: unavailableMoney(), reason: null },
    },
    fees: {
      items: [
        { id: "fee-admin", type: "administration", label: "Administrative fee", amount: knownMoney(1200), percentage: unavailablePercentage(), calculationBase: null, frequency: "one_time", mandatory: true, conditional: false, refundable: false, financialRole: "one_time_outflow", sourceFields: [] },
      ],
      totalKnownFees: knownMoney(1200),
      mandatoryFees: knownMoney(1200),
      upfrontFees: knownMoney(1200),
      recurringFees: unavailableMoney(),
      conditionalFees: unavailableMoney(),
      hasUndefinedFees: false,
      status: "known",
    },
    penalties: {
      items: [
        { id: "pen-late", type: "late_payment", label: "Late payment penalty", amount: knownMoney(50), percentage: unavailablePercentage(), calculationBase: null, trigger: "payment overdue by 10 days", maximumAmount: unavailableMoney(), conditional: true, financialRole: "conditional_cost", sourceFields: [] },
      ],
      totalKnownPenalties: knownMoney(50),
      highestKnownPenalty: knownMoney(50),
      hasUndefinedPenalty: false,
      status: "known",
    },
    ratios: {
      feesToBaseCost: { value: 1.25, status: "known", source: "test", reason: null, confidence: "high" },
      penaltiesToBaseCost: unavailablePercentage(),
      upfrontPaymentToBaseCost: unavailablePercentage(),
      balloonPaymentToBaseCost: unavailablePercentage(),
      totalCostIncrease: unavailablePercentage(),
      recurringPaymentToIncome: unavailablePercentage(),
    },
    exposure: {
      totalKnownExposure: knownMoney(134400),
      monthlyExposure: knownMoney(2400),
      annualExposure: knownMoney(28800),
      upfrontExposure: knownMoney(1200),
      contingentExposure: unavailableMoney(),
      maximumSinglePayment: unavailableMoney(),
      unquantifiedContingentExposure: false,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: { formulasUsed: [], unavailableCalculations: [], warnings: [], conflicts: [], excludedValues: [] },
  };
}

export function contractAnalysisFixture(): ContractUnderstanding {
  return {
    contractType: "auto_finance",
    contractSummary: "This is an auto financing agreement between a bank and a borrower for a vehicle purchase.",
    contractSummarySimple: "The bank is lending you money to buy a car, and you pay it back monthly.",
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [],
    fees: [],
    importantClauses: [
      { title: "Early Termination", summary: "Either party may terminate early with 30 days notice, subject to a fee.", riskLevel: "medium", evidence: null, plainExplanation: "You can end this early but might have to pay extra." },
    ],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails: {
      contractType: "auto_finance",
      vehicleMake: null,
      vehicleModel: null,
      vehicleYear: null,
      financedAmount: 96000,
      downPayment: 9600,
      interestRate: 8.75,
      loanTermMonths: 48,
      monthlyInstallment: 2400,
      balloonPayment: 19200,
    },
  };
}
