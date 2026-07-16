import type { AnalysisLanguage, ContractType } from "@workspace/contract-types";

export const CONTRACT_RAG_SESSION_STATUS_VALUES = ["active", "expired", "deleted"] as const;
export type ContractRagSessionStatus = (typeof CONTRACT_RAG_SESSION_STATUS_VALUES)[number];

/**
 * A session is the unit of isolation for Contract RAG: exactly one
 * uploaded contract's masked chunks live under one `sessionId`, and
 * retrieval never crosses sessions. Deliberately separate from — and
 * structurally unrelated to — the Legal RAG manifest/collection model,
 * which is durable public data with no per-user scoping at all.
 */
export interface ContractRagSession {
  sessionId: string;
  contractType: ContractType;
  analysisLanguage: AnalysisLanguage;
  createdAt: Date;
  expiresAt: Date;
  status: ContractRagSessionStatus;
  chunkCount: number;
  /** Optional checksum of the masked source text — lets a caller detect "this is the same document" without ever storing/re-exposing the text itself. */
  sourceFingerprint: string | null;
}
