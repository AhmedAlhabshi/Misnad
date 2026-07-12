import { z } from "zod/v4";
import { CONTRACT_TYPE_VALUES, type ContractType } from "@workspace/contract-types";

export const contractTypeSchema = z.enum(
  CONTRACT_TYPE_VALUES as [ContractType, ...ContractType[]],
);

export const partySchema = z.object({
  role: z.string().max(100),
  name: z.string().nullable(),
  identifier: z.string().nullable(),
  notes: z.string().max(300).nullable(),
});

export const financialObligationSchema = z.object({
  description: z.string().max(250),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  frequency: z.string().max(250).nullable(),
  dueDate: z.string().nullable(),
});

export const contractDateSchema = z.object({
  label: z.string().max(250),
  date: z.string().nullable(),
  notes: z.string().max(250).nullable(),
});

export const penaltySchema = z.object({
  description: z.string().max(250),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  condition: z.string().max(600).nullable(),
});

export const feeSchema = z.object({
  description: z.string().max(250),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  isRecurring: z.boolean().nullable(),
});

export const importantClauseSchema = z.object({
  title: z.string().max(180),
  summary: z.string().max(500),
  riskLevel: z.enum(["low", "medium", "high"]).nullable(),
  /**
   * A short verbatim excerpt copied exactly from the masked contract text
   * that supports this clause — never translated, paraphrased, or
   * fabricated. Null when no reliable supporting excerpt exists.
   * Integrity (exact substring containment in maskedText) is enforced at
   * runtime by contract-analysis's validate.ts, not by this schema alone,
   * since this schema has no access to maskedText. The 350-char cap keeps
   * excerpts to one focused passage without affecting substring integrity
   * (the model is prompted to keep excerpts within this length itself —
   * nothing is trimmed after generation, which would break verbatim
   * containment).
   */
  evidence: z.string().max(350).nullable(),
});

export const extractedNumberSchema = z.object({
  label: z.string().max(250),
  value: z.number(),
  unit: z.string().nullable(),
});

export const missingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string().max(300).nullable(),
});

export const autoFinanceDetailsSchema = z.object({
  contractType: z.literal("auto_finance"),
  vehicleMake: z.string().nullable(),
  vehicleModel: z.string().nullable(),
  vehicleYear: z.number().nullable(),
  financedAmount: z.number().nullable(),
  downPayment: z.number().nullable(),
  interestRate: z.number().nullable(),
  loanTermMonths: z.number().nullable(),
  monthlyInstallment: z.number().nullable(),
  balloonPayment: z.number().nullable(),
});

export const personalFinanceDetailsSchema = z.object({
  contractType: z.literal("personal_finance"),
  loanAmount: z.number().nullable(),
  interestRate: z.number().nullable(),
  loanTermMonths: z.number().nullable(),
  monthlyInstallment: z.number().nullable(),
  purpose: z.string().nullable(),
  earlySettlementTerms: z.string().nullable(),
});

export const mortgageDetailsSchema = z.object({
  contractType: z.literal("mortgage"),
  propertyAddress: z.string().nullable(),
  propertyValue: z.number().nullable(),
  loanAmount: z.number().nullable(),
  downPayment: z.number().nullable(),
  interestRate: z.number().nullable(),
  loanTermYears: z.number().nullable(),
  monthlyInstallment: z.number().nullable(),
});

export const creditCardDetailsSchema = z.object({
  contractType: z.literal("credit_card"),
  creditLimit: z.number().nullable(),
  annualFee: z.number().nullable(),
  interestRateApr: z.number().nullable(),
  minimumPaymentPercentage: z.number().nullable(),
  lateFee: z.number().nullable(),
  cashAdvanceFee: z.number().nullable(),
});

export const leaseDetailsSchema = z.object({
  contractType: z.literal("lease"),
  propertyAddress: z.string().nullable(),
  monthlyRent: z.number().nullable(),
  securityDeposit: z.number().nullable(),
  leaseTermMonths: z.number().nullable(),
  renewalTerms: z.string().nullable(),
  utilitiesIncluded: z.boolean().nullable(),
});

export const insuranceDetailsSchema = z.object({
  contractType: z.literal("insurance"),
  insuranceType: z.string().nullable(),
  coverageAmount: z.number().nullable(),
  premiumAmount: z.number().nullable(),
  premiumFrequency: z.string().nullable(),
  deductible: z.number().nullable(),
  policyTermMonths: z.number().nullable(),
  exclusions: z.array(z.string()),
});

export const employmentDetailsSchema = z.object({
  contractType: z.literal("employment"),
  jobTitle: z.string().nullable(),
  employer: z.string().nullable(),
  employmentType: z.string().nullable(),
  baseSalary: z.number().nullable(),
  salaryFrequency: z.string().nullable(),
  probationPeriodMonths: z.number().nullable(),
  noticePeriodDays: z.number().nullable(),
  nonCompeteTerms: z.string().nullable(),
});

export const subscriptionDetailsSchema = z.object({
  contractType: z.literal("subscription"),
  serviceName: z.string().nullable(),
  billingAmount: z.number().nullable(),
  billingFrequency: z.string().nullable(),
  autoRenew: z.boolean().nullable(),
  cancellationTerms: z.string().nullable(),
  freeTrialDays: z.number().nullable(),
});

export const otherDetailsSchema = z.object({
  contractType: z.literal("other"),
  description: z.string().nullable(),
});

export const contractTypeDetailsSchema = z.discriminatedUnion("contractType", [
  autoFinanceDetailsSchema,
  personalFinanceDetailsSchema,
  mortgageDetailsSchema,
  creditCardDetailsSchema,
  leaseDetailsSchema,
  insuranceDetailsSchema,
  employmentDetailsSchema,
  subscriptionDetailsSchema,
  otherDetailsSchema,
]);

const CONTRACT_TYPE_DETAILS_SCHEMA_BY_TYPE = {
  auto_finance: autoFinanceDetailsSchema,
  personal_finance: personalFinanceDetailsSchema,
  mortgage: mortgageDetailsSchema,
  credit_card: creditCardDetailsSchema,
  lease: leaseDetailsSchema,
  insurance: insuranceDetailsSchema,
  employment: employmentDetailsSchema,
  subscription: subscriptionDetailsSchema,
  other: otherDetailsSchema,
} as const satisfies Record<ContractType, z.ZodTypeAny>;

/**
 * Returns the type-specific details schema for a single contract type
 * (e.g. only `otherDetailsSchema` for "other"), instead of the full
 * 9-branch discriminated union. Used to keep the schema handed to the
 * model as small/specific as possible when the contract type is already
 * known.
 */
export function getContractTypeDetailsSchemaFor<T extends ContractType>(
  contractType: T,
): (typeof CONTRACT_TYPE_DETAILS_SCHEMA_BY_TYPE)[T] {
  return CONTRACT_TYPE_DETAILS_SCHEMA_BY_TYPE[contractType];
}

function buildContractUnderstandingSchema<
  TypeDetails extends z.ZodTypeAny,
  ContractTypeField extends z.ZodTypeAny = typeof contractTypeSchema,
>(typeDetailsSchema: TypeDetails, contractTypeField?: ContractTypeField) {
  return z.object({
    contractType: contractTypeField ?? contractTypeSchema,
    // Array limits bound worst-case structured-output size (see
    // promptBuilder.ts for the matching prompt-level instructions) so a
    // long template contract can still return complete, valid JSON within
    // the provider's output-token budget.
    parties: z.array(partySchema).max(6),
    financialObligations: z.array(financialObligationSchema).max(12),
    dates: z.array(contractDateSchema).max(12),
    penalties: z.array(penaltySchema).max(10),
    fees: z.array(feeSchema).max(10),
    importantClauses: z.array(importantClauseSchema).max(10),
    extractedNumbers: z.array(extractedNumberSchema).max(20),
    missingInformation: z.array(missingInformationItemSchema).max(15),
    extractionNotes: z.string().max(700).nullable(),
    typeDetails: typeDetailsSchema,
  });
}

export const contractUnderstandingSchema = buildContractUnderstandingSchema(
  contractTypeDetailsSchema,
);

/**
 * Returns the full contract-understanding schema, but with `typeDetails`
 * narrowed to only the branch matching the given contract type, instead of
 * the full 9-branch union. This is the schema that should be handed to the
 * model when the contract type is already known (e.g. via structured
 * output config), so the model isn't asked to consider irrelevant branches.
 *
 * This does NOT replace `contractUnderstandingSchema` as the source of
 * truth for final response validation — callers should still run the
 * model's response through `contractUnderstandingSchema.safeParse(...)`.
 */
export function getContractUnderstandingSchemaFor<T extends ContractType>(
  contractType: T,
) {
  return buildContractUnderstandingSchema(
    getContractTypeDetailsSchemaFor(contractType),
    z.literal(contractType),
  );
}

/**
 * Converts a Zod schema to a JSON Schema using Zod's own official
 * conversion (`z.toJSONSchema`), then applies the minimal, generic
 * adjustments needed for compatibility with Gemini's `responseJsonSchema`
 * supported subset (documented by @google/genai): notably, Gemini supports
 * `enum` but not `const`, so single-value `const` schemas (as produced for
 * `z.literal(...)`) are rewritten as an equivalent single-value `enum`.
 * This is a structural/representational adjustment only — it does not add,
 * remove, or loosen any field or constraint from the schema Zod generated.
 */
export function toGeminiJsonSchema(schema: z.ZodTypeAny): unknown {
  return z.toJSONSchema(schema, {
    target: "draft-7",
    override: (ctx) => {
      const jsonSchema = ctx.jsonSchema as Record<string, unknown>;
      if ("const" in jsonSchema) {
        jsonSchema.enum = [jsonSchema.const];
        delete jsonSchema.const;
      }
    },
  });
}

/**
 * Convenience helper: builds the type-narrowed contract-understanding
 * schema for the given contract type (see `getContractUnderstandingSchemaFor`)
 * and converts it to a Gemini-compatible JSON Schema in one step.
 */
export function getContractUnderstandingJsonSchemaFor(
  contractType: ContractType,
): unknown {
  return toGeminiJsonSchema(getContractUnderstandingSchemaFor(contractType));
}

export type Party = z.infer<typeof partySchema>;
export type FinancialObligation = z.infer<typeof financialObligationSchema>;
export type ContractDate = z.infer<typeof contractDateSchema>;
export type Penalty = z.infer<typeof penaltySchema>;
export type Fee = z.infer<typeof feeSchema>;
export type ImportantClause = z.infer<typeof importantClauseSchema>;
export type ExtractedNumber = z.infer<typeof extractedNumberSchema>;
export type MissingInformationItem = z.infer<typeof missingInformationItemSchema>;

export type AutoFinanceDetails = z.infer<typeof autoFinanceDetailsSchema>;
export type PersonalFinanceDetails = z.infer<typeof personalFinanceDetailsSchema>;
export type MortgageDetails = z.infer<typeof mortgageDetailsSchema>;
export type CreditCardDetails = z.infer<typeof creditCardDetailsSchema>;
export type LeaseDetails = z.infer<typeof leaseDetailsSchema>;
export type InsuranceDetails = z.infer<typeof insuranceDetailsSchema>;
export type EmploymentDetails = z.infer<typeof employmentDetailsSchema>;
export type SubscriptionDetails = z.infer<typeof subscriptionDetailsSchema>;
export type OtherDetails = z.infer<typeof otherDetailsSchema>;

export type ContractTypeDetails = z.infer<typeof contractTypeDetailsSchema>;
export type ContractUnderstanding = z.infer<typeof contractUnderstandingSchema>;
