import type { ChatRoute, ChatSourceKind, RequiredSourceStatus } from "../schema";

/** Deterministic, fixed mapping — the only place a route's source requirements are declared. */
export const ROUTE_REQUIRED_SOURCES: Readonly<Record<ChatRoute, readonly ChatSourceKind[]>> = {
  contract: ["contract"],
  legal: ["legal"],
  financial: ["financial"],
  contract_and_legal: ["contract", "legal"],
  contract_and_financial: ["contract", "financial"],
  all: ["contract", "legal", "financial"],
  general: [],
};

export interface SourceAvailability {
  contractRagAvailable: boolean;
  legalRagAvailable: boolean;
  financialMetricsAvailable: boolean;
}

export interface AvailabilityEvaluation {
  requiredSources: RequiredSourceStatus[];
  unavailableRequiredSources: ChatSourceKind[];
  reasons: string[];
}

function isAvailable(source: ChatSourceKind, availability: SourceAvailability): boolean {
  switch (source) {
    case "contract":
      return availability.contractRagAvailable;
    case "legal":
      return availability.legalRagAvailable;
    case "financial":
      return availability.financialMetricsAvailable;
  }
}

/**
 * Reports availability for exactly the sources the given route requires —
 * it never changes `route` itself. A route whose required source is
 * unavailable is still returned as-is; the caller (the future answer
 * composer) is responsible for deciding how to degrade gracefully, but it
 * is told explicitly, never left to assume success. This is what
 * satisfies "do not silently downgrade a legal-comparison question to a
 * general answer".
 */
export function evaluateAvailability(route: ChatRoute, availability: SourceAvailability): AvailabilityEvaluation {
  const required = ROUTE_REQUIRED_SOURCES[route];
  const requiredSources: RequiredSourceStatus[] = required.map((source) => ({
    source,
    available: isAvailable(source, availability),
  }));
  const unavailableRequiredSources = requiredSources.filter((entry) => !entry.available).map((entry) => entry.source);

  const reasons = unavailableRequiredSources.map(
    (source) => `required_source_unavailable:${source} (route "${route}" preserved; ${source} explicitly reported unavailable)`,
  );

  return { requiredSources, unavailableRequiredSources, reasons };
}
