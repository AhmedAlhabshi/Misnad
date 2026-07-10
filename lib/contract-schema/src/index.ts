import { z } from "zod";
import { CONTRACT_TYPE_VALUES } from "@workspace/contract-types";

export const contractTypeSchema = z.enum(
  CONTRACT_TYPE_VALUES as [string, ...string[]],
);

export const partySchema = z.object({
  role: z.string(),
  name: z.string().nullable(),
  identifier: z.string().nullable(),
  notes: z.string().nullable(),
});

export const financialObligationSchema = z.object({
  description: z.string(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  frequency: z.string().nullable(),
  dueDate: z.string().nullable(),
});

export const contractDateSchema = z.object({
  label: z.string(),
  date: z.string().nullable(),
  notes: z.string().nullable(),
});

export const penaltySchema = z.object({
  description: z.string(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  condition: z.string().nullable(),
});

export const feeSchema = z.object({
  description: z.string(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  isRecurring: z.boolean().nullable(),
});

export const importantClauseSchema = z.object({
  title: z.string(),
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]).nullable(),
});

export const extractedNumberSchema = z.object({
  label: z.string(),
  value: z.number(),
  unit: z.string().nullable(),
});

export const missingInformationItemSchema = z.object({
  field: z.string(),
  reason: z.string().nullable(),
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

export const contractUnderstandingSchema = z.object({
  contractType: contractTypeSchema,
  parties: z.array(partySchema),
  financialObligations: z.array(financialObligationSchema),
  dates: z.array(contractDateSchema),
  penalties: z.array(penaltySchema),
  fees: z.array(feeSchema),
  importantClauses: z.array(importantClauseSchema),
  extractedNumbers: z.array(extractedNumberSchema),
  missingInformation: z.array(missingInformationItemSchema),
  extractionNotes: z.string().nullable(),
  typeDetails: contractTypeDetailsSchema,
});

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
