import { z } from "zod/v4";
import { ANALYSIS_LANGUAGE_VALUES, CONTRACT_TYPE_VALUES, type AnalysisLanguage, type ContractType } from "@workspace/contract-types";

/**
 * Request/response schemas for the personalized financial analysis endpoint
 * (Financial Analysis tab, MVP). The request payload is deliberately a
 * generic, already-sanitized summary of what the frontend itself already
 * computed and displays — never raw contract text, never a party
 * identifier, never a national ID/phone/email/IBAN/bank account (masked or
 * otherwise). All arithmetic (`budgetMetrics`) is computed deterministically
 * by the caller before this request is built; the AI only interprets it.
 */

const MAX_CLAUSES = 20;
const MAX_CONCEPTS = 40;
const MAX_INSIGHTS = 5;

export const sanitizedClausePayloadSchema = z.object({
  title: z.string().max(180),
  summary: z.string().max(500),
  plainExplanation: z.string().max(350),
  riskLevel: z.enum(["low", "medium", "high"]).nullable(),
});

/**
 * A single already-classified financial concept, mirroring the frontend's
 * `FinancialConceptItem` (see `artifacts/misnad/src/lib/financialConcepts.ts`)
 * structurally rather than by importing it — this package must not depend on
 * the frontend package. `conceptId`/`role` are kept as plain strings (not a
 * shared enum type) for the same reason; the prompt treats them as opaque,
 * human-readable-enough labels for grounding, not as values to compute with.
 */
export const financialConceptPayloadSchema = z.object({
  conceptId: z.string().max(60),
  label: z.string().max(250),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  frequency: z.string().max(60).nullable(),
  role: z.string().max(60),
  bucket: z.enum(["guaranteed", "conditional", "informational"]),
  mandatory: z.boolean().nullable(),
  conditional: z.boolean().nullable(),
  refundable: z.boolean().nullable(),
  /** Event/condition text — only ever populated for conditional/penalty-sourced items. */
  trigger: z.string().max(350).nullable(),
});

/**
 * The deterministic budget-impact numbers already calculated by
 * `budgetImpact.ts` plus the two role-based selectors
 * (`selectApplicableMonthlyOutflow`/`selectApplicableUpfrontLiquidity`) — the
 * AI must never recompute, restate as a different value, or contradict any
 * of these; it only interprets what they mean for the user.
 *
 * `incomeBefore`/`incomeAfter`/`incomeChange`/`incomeChangePercentage` are
 * employment-only additions (optional, `null`/absent for every other
 * contract type): an employment contract changes the user's INCOME, not a
 * monthly commitment the user pays, so it needs its own distinct figures
 * rather than overloading `applicableMonthlyOutflow`/`contractIncomeRatio`
 * (which remain `null` for employment — there is no monthly commitment the
 * user pays). `availableBeforeContract`/`availableAfterContract`/
 * `remainingSavings`/`emergencyCoverageMonths` are reused for employment
 * too, populated with the employment-specific formulas
 * (`calculateEmploymentIncomeImpact` in the frontend's `budgetImpact.ts`).
 */
export const budgetMetricsPayloadSchema = z.object({
  monthlyIncome: z.number(),
  essentialExpenses: z.number(),
  existingMonthlyDebt: z.number(),
  savings: z.number().nullable(),
  currency: z.string().nullable(),
  applicableMonthlyOutflow: z.number().nullable(),
  applicableUpfrontLiquidity: z.number().nullable(),
  availableBeforeContract: z.number(),
  availableAfterContract: z.number().nullable(),
  contractIncomeRatio: z.number().nullable(),
  totalCommitmentRatio: z.number().nullable(),
  remainingSavings: z.number().nullable(),
  emergencyCoverageMonths: z.number().nullable(),
  incomeBefore: z.number().nullable().optional(),
  incomeAfter: z.number().nullable().optional(),
  incomeChange: z.number().nullable().optional(),
  incomeChangePercentage: z.number().nullable().optional(),
});

export const EMPLOYMENT_INCOME_MODE_VALUES = ["replace_current_income", "add_to_current_income"] as const;
export const employmentIncomeModeSchema = z.enum(EMPLOYMENT_INCOME_MODE_VALUES);
export type EmploymentIncomeMode = z.infer<typeof employmentIncomeModeSchema>;

export const personalizedAnalysisRequestSchema = z
  .object({
    analysisLanguage: z.enum(ANALYSIS_LANGUAGE_VALUES as [AnalysisLanguage, ...AnalysisLanguage[]]),
    contractType: z.enum(CONTRACT_TYPE_VALUES as [ContractType, ...ContractType[]]),
    contractSummary: z.string().max(500),
    clauses: z.array(sanitizedClausePayloadSchema).max(MAX_CLAUSES),
    financialConcepts: z.array(financialConceptPayloadSchema).max(MAX_CONCEPTS),
    budgetMetrics: budgetMetricsPayloadSchema,
    /**
     * Required only for `contractType === "employment"` (see the `.refine`
     * below) — whether this contract's salary replaces the user's current
     * income or adds to it. Absent/`null` for every other contract type,
     * which never asks this question.
     */
    employmentIncomeMode: employmentIncomeModeSchema.nullable().optional(),
  })
  .refine((data) => data.contractType !== "employment" || data.employmentIncomeMode != null, {
    message: "employmentIncomeMode is required when contractType is 'employment'",
    path: ["employmentIncomeMode"],
  });

export type SanitizedClausePayload = z.infer<typeof sanitizedClausePayloadSchema>;
export type FinancialConceptPayload = z.infer<typeof financialConceptPayloadSchema>;
export type BudgetMetricsPayload = z.infer<typeof budgetMetricsPayloadSchema>;
export type PersonalizedAnalysisRequest = z.infer<typeof personalizedAnalysisRequestSchema>;

/**
 * A single grounded personal-impact or things-to-watch item — a plain
 * statement (never advice, never a question) describing what a supplied
 * fact/metric means for this specific user, grounded via `basis`.
 */
export const insightItemSchema = z.object({
  title: z.string().max(120),
  explanation: z.string().max(400),
  basis: z.string().max(200),
});

/**
 * "Before you sign" items are either practical advice or a question the
 * user could raise with the counterparty — `type` keeps these visually and
 * semantically distinct (see `personalizedAnalysisPrompt.ts`: a question
 * must never assert that a right/option exists unless the contract itself
 * states it; advice must be traceable to a specific supplied fact/metric,
 * never generic).
 */
export const BEFORE_YOU_SIGN_TYPE_VALUES = ["advice", "question"] as const;
export const beforeYouSignTypeSchema = z.enum(BEFORE_YOU_SIGN_TYPE_VALUES);
export type BeforeYouSignType = z.infer<typeof beforeYouSignTypeSchema>;

export const beforeYouSignItemSchema = z.object({
  type: beforeYouSignTypeSchema,
  title: z.string().max(120),
  text: z.string().max(400),
  basis: z.string().max(200),
});

/**
 * The 3 AI-generated sections of the personalized financial analysis:
 * - `personalImpact`: grounded statements of what the supplied deterministic
 *   metrics/facts mean for this user (using the actual numbers, never a
 *   vague qualitative magnitude judgment).
 * - `thingsToWatch`: uncertain, conditional, or excluded-from-calculation
 *   contract facts the user should notice — each must state whether it was
 *   included in the deterministic calculation.
 * - `beforeYouSign`: concrete advice and clarifying questions, each grounded
 *   in a specific supplied fact/clause/metric.
 */
export const personalizedAnalysisResponseSchema = z.object({
  personalImpact: z.array(insightItemSchema).max(MAX_INSIGHTS),
  thingsToWatch: z.array(insightItemSchema).max(MAX_INSIGHTS),
  beforeYouSign: z.array(beforeYouSignItemSchema).max(MAX_INSIGHTS),
});

export type InsightItem = z.infer<typeof insightItemSchema>;
export type BeforeYouSignItem = z.infer<typeof beforeYouSignItemSchema>;
export type PersonalizedAnalysisResponse = z.infer<typeof personalizedAnalysisResponseSchema>;
