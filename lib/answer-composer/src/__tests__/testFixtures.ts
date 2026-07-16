import type { ChatRoute } from "@workspace/chat-router";
import type {
  AnalysisFactItem,
  ContractEvidenceItem,
  FinancialFactItem,
  GroundedContext,
  LegalEvidenceItem,
} from "@workspace/context-builder";
import type { ContractAnalysisProvider, ContractAnalysisProviderResponse } from "@workspace/contract-analysis";
import { ContractAnalysisError } from "@workspace/contract-analysis";

export const CONTRACT_EVIDENCE: ContractEvidenceItem = {
  source: "contract",
  authority: "user_contract",
  citation: "Your contract — Early Termination",
  relevanceScore: 0.9,
  excerpt: "Either party may terminate this lease early by giving sixty (60) days written notice to the other party.",
  chunkId: "chunk-1",
  section: "Early Termination",
  chunkOrder: 0,
};

export const LEGAL_EVIDENCE: LegalEvidenceItem = {
  source: "legal",
  authority: "sama",
  citation: "https://rulebook.sama.gov.sa/en/regulations-consumer-financing",
  relevanceScore: 0.85,
  excerpt: "All fees, costs and administrative services charges to be recovered from the Borrower by the Creditor must not exceed 1% of the total loan amount.",
  chunkId: "legal-chunk-1",
  documentTitle: "SAMA Regulations for Consumer Financing",
  articleNumber: "Article 9",
  section: null,
};

export const FINANCIAL_FACT: FinancialFactItem = {
  source: "financial",
  authority: "financial_metrics_engine",
  citation: "financialMetrics.recurringCommitment",
  relevanceScore: 1,
  excerpt: "Monthly payment: 2,400.00 SAR",
  factKey: "monthly_payment",
  label: "Monthly payment",
};

export const ANALYSIS_FACT: AnalysisFactItem = {
  source: "analysis",
  authority: "contract_analysis_engine",
  citation: "contractAnalysis.contractSummary",
  relevanceScore: 0.9,
  excerpt: "This is an auto financing agreement between a bank and a borrower.",
  factKey: "contract_summary",
  label: "Contract summary",
};

export function buildGroundedContextFixture(route: ChatRoute, overrides: Partial<GroundedContext> = {}): GroundedContext {
  const base: GroundedContext = {
    route,
    question: "What does my contract say about early termination?",
    language: "en",
    contractType: "auto_finance",
    sourcesUsed: [],
    contractEvidence: [],
    legalEvidence: [],
    financialFacts: [],
    analysisFacts: [],
    tokenEstimate: 100,
    warnings: [],
  };

  switch (route) {
    case "contract":
      base.sourcesUsed = ["contract"];
      base.contractEvidence = [CONTRACT_EVIDENCE];
      break;
    case "legal":
      base.sourcesUsed = ["legal"];
      base.legalEvidence = [LEGAL_EVIDENCE];
      break;
    case "financial":
      base.sourcesUsed = ["financial"];
      base.financialFacts = [FINANCIAL_FACT];
      break;
    case "contract_and_legal":
      base.sourcesUsed = ["contract", "legal"];
      base.contractEvidence = [CONTRACT_EVIDENCE];
      base.legalEvidence = [LEGAL_EVIDENCE];
      break;
    case "contract_and_financial":
      base.sourcesUsed = ["contract", "financial"];
      base.contractEvidence = [CONTRACT_EVIDENCE];
      base.financialFacts = [FINANCIAL_FACT];
      break;
    case "all":
      base.sourcesUsed = ["contract", "legal", "financial"];
      base.contractEvidence = [CONTRACT_EVIDENCE];
      base.legalEvidence = [LEGAL_EVIDENCE];
      base.financialFacts = [FINANCIAL_FACT];
      base.analysisFacts = [ANALYSIS_FACT];
      break;
    case "general":
    default:
      break;
  }

  return { ...base, ...overrides };
}

/** A minimal, honest JSON response a well-behaved model would return for the given context — cites exactly what's actually present, nothing more. */
export function validLlmResponseTextFor(context: GroundedContext, answer = "This is a test answer referencing the supplied evidence."): string {
  const citations = [
    ...context.contractEvidence.map((item) => ({ source: "contract", citation: item.citation })),
    ...context.legalEvidence.map((item) => ({ source: "legal", citation: item.citation })),
  ];
  const usedFinancialFactKeys = context.financialFacts.map((item) => item.factKey);
  return JSON.stringify({ answer, citations, usedFinancialFactKeys });
}

type QueueEntry = { rawText: string } | { throwError: ContractAnalysisError };

/** A fake `ContractAnalysisProvider` that returns a scripted sequence of responses/errors, one per call — the last entry repeats if called more times than scripted. Never makes a network call. */
export function makeQueueProvider(entries: QueueEntry[]): ContractAnalysisProvider {
  let index = 0;
  return {
    async generate(): Promise<ContractAnalysisProviderResponse> {
      const entry = entries[Math.min(index, entries.length - 1)];
      index += 1;
      if ("throwError" in entry) {
        throw entry.throwError;
      }
      return { rawText: entry.rawText, diagnostics: { rawTextLength: entry.rawText.length } };
    },
  };
}

export function makeSingleResponseProvider(rawText: string): ContractAnalysisProvider {
  return makeQueueProvider([{ rawText }]);
}

export function makeThrowingProvider(error: ContractAnalysisError): ContractAnalysisProvider {
  return makeQueueProvider([{ throwError: error }]);
}

export function rateLimited(): ContractAnalysisError {
  return new ContractAnalysisError("RATE_LIMITED", "The AI provider rejected the request due to rate limits or usage quotas.");
}

export function providerRequestFailed(): ContractAnalysisError {
  return new ContractAnalysisError("PROVIDER_REQUEST_FAILED", "The AI provider rejected the analysis request.");
}

export function missingApiKey(): ContractAnalysisError {
  return new ContractAnalysisError("MISSING_API_KEY", "GEMINI_API_KEY is not configured. Set it before calling the contract analysis service.");
}
