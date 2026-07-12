import type {
  AutoFinanceDetails,
  ContractDate,
  ContractTypeDetails,
  ContractUnderstanding,
  CreditCardDetails,
  EmploymentDetails,
  ExtractedNumber,
  Fee,
  FinancialObligation,
  InsuranceDetails,
  LeaseDetails,
  MortgageDetails,
  OtherDetails,
  Penalty,
  PersonalFinanceDetails,
  SubscriptionDetails,
} from "@workspace/contract-schema";

/** Not a runnable test file — shared fixture builders for the financial-metrics engine's test suite. */

export function baseContractUnderstanding(typeDetails: ContractTypeDetails): ContractUnderstanding {
  return {
    contractType: typeDetails.contractType,
    parties: [],
    financialObligations: [],
    dates: [],
    penalties: [],
    fees: [],
    importantClauses: [],
    extractedNumbers: [],
    missingInformation: [],
    extractionNotes: null,
    typeDetails,
  };
}

export function financialObligation(overrides: Partial<FinancialObligation> = {}): FinancialObligation {
  return { description: "Obligation", amount: null, currency: null, frequency: null, dueDate: null, ...overrides };
}

export function fee(overrides: Partial<Fee> = {}): Fee {
  return { description: "Fee", amount: null, currency: null, isRecurring: null, ...overrides };
}

export function penalty(overrides: Partial<Penalty> = {}): Penalty {
  return { description: "Penalty", amount: null, currency: null, condition: null, ...overrides };
}

export function extractedNumber(overrides: Partial<ExtractedNumber> = {}): ExtractedNumber {
  return { label: "Number", value: 0, unit: null, ...overrides };
}

export function contractDate(overrides: Partial<ContractDate> = {}): ContractDate {
  return { label: "Date", date: null, notes: null, ...overrides };
}

export function autoFinanceDetails(overrides: Partial<AutoFinanceDetails> = {}): AutoFinanceDetails {
  return {
    contractType: "auto_finance",
    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    financedAmount: null,
    downPayment: null,
    interestRate: null,
    loanTermMonths: null,
    monthlyInstallment: null,
    balloonPayment: null,
    ...overrides,
  };
}

export function personalFinanceDetails(overrides: Partial<PersonalFinanceDetails> = {}): PersonalFinanceDetails {
  return {
    contractType: "personal_finance",
    loanAmount: null,
    interestRate: null,
    loanTermMonths: null,
    monthlyInstallment: null,
    purpose: null,
    earlySettlementTerms: null,
    ...overrides,
  };
}

export function mortgageDetails(overrides: Partial<MortgageDetails> = {}): MortgageDetails {
  return {
    contractType: "mortgage",
    propertyAddress: null,
    propertyValue: null,
    loanAmount: null,
    downPayment: null,
    interestRate: null,
    loanTermYears: null,
    monthlyInstallment: null,
    ...overrides,
  };
}

export function creditCardDetails(overrides: Partial<CreditCardDetails> = {}): CreditCardDetails {
  return {
    contractType: "credit_card",
    creditLimit: null,
    annualFee: null,
    interestRateApr: null,
    minimumPaymentPercentage: null,
    lateFee: null,
    cashAdvanceFee: null,
    ...overrides,
  };
}

export function leaseDetails(overrides: Partial<LeaseDetails> = {}): LeaseDetails {
  return {
    contractType: "lease",
    propertyAddress: null,
    monthlyRent: null,
    securityDeposit: null,
    leaseTermMonths: null,
    renewalTerms: null,
    utilitiesIncluded: null,
    ...overrides,
  };
}

export function insuranceDetails(overrides: Partial<InsuranceDetails> = {}): InsuranceDetails {
  return {
    contractType: "insurance",
    insuranceType: null,
    coverageAmount: null,
    premiumAmount: null,
    premiumFrequency: null,
    deductible: null,
    policyTermMonths: null,
    exclusions: [],
    ...overrides,
  };
}

export function employmentDetails(overrides: Partial<EmploymentDetails> = {}): EmploymentDetails {
  return {
    contractType: "employment",
    jobTitle: null,
    employer: null,
    employmentType: null,
    baseSalary: null,
    salaryFrequency: null,
    probationPeriodMonths: null,
    noticePeriodDays: null,
    nonCompeteTerms: null,
    ...overrides,
  };
}

export function subscriptionDetails(overrides: Partial<SubscriptionDetails> = {}): SubscriptionDetails {
  return {
    contractType: "subscription",
    serviceName: null,
    billingAmount: null,
    billingFrequency: null,
    autoRenew: null,
    cancellationTerms: null,
    freeTrialDays: null,
    ...overrides,
  };
}

export function otherDetails(overrides: Partial<OtherDetails> = {}): OtherDetails {
  return { contractType: "other", description: null, ...overrides };
}
