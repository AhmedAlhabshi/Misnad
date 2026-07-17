import assert from "node:assert/strict";
import type {
  FeeItem,
  FinancialMetrics,
  InformationalAmount,
  MoneyMetric,
  PaymentObligation,
  PenaltyItem,
  PercentageMetric,
} from "@workspace/financial-metrics";
import {
  buildFinancialConcepts,
  classifyFinancialItemBucket,
  groupContractFinancialConcepts,
  groupEmploymentFinancialConcepts,
  isStatedCapText,
  resolveCanonicalConcept,
  resolveContractFinancialGroup,
  resolveEmploymentFinancialGroup,
  selectApplicableMonthlyOutflow,
  selectApplicableUpfrontLiquidity,
  selectGuaranteedEmploymentIncome,
  type NormalizedFinancialItem,
} from "../financialConcepts";

function knownMoney(value: number, currency = "SAR"): MoneyMetric {
  return { value, currency, status: "known", source: "test", reason: null, confidence: "high" };
}

function unavailableMoney(): MoneyMetric {
  return { value: null, currency: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function unavailablePercentage(): PercentageMetric {
  return { value: null, status: "unavailable", source: null, reason: "n/a", confidence: "low" };
}

function obligation(overrides: Partial<PaymentObligation> = {}): PaymentObligation {
  return {
    id: "obligation-0",
    label: "Obligation",
    type: "recurring_payment",
    amount: knownMoney(1000),
    frequency: "monthly",
    numberOfPayments: null,
    startDate: null,
    endDate: null,
    mandatory: true,
    conditional: false,
    refundable: null,
    financialRole: "recurring_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function feeItem(overrides: Partial<FeeItem> = {}): FeeItem {
  return {
    id: "fee-0",
    type: "other",
    label: "Fee",
    amount: knownMoney(100),
    percentage: unavailablePercentage(),
    calculationBase: null,
    frequency: "one_time",
    mandatory: true,
    conditional: false,
    refundable: null,
    financialRole: "one_time_outflow",
    sourceFields: [],
    ...overrides,
  };
}

function informationalAmount(overrides: Partial<InformationalAmount> = {}): InformationalAmount {
  return {
    id: "informational-0",
    type: "principal",
    label: "Financed amount",
    amount: knownMoney(96000),
    percentage: unavailablePercentage(),
    financialRole: "financing_principal",
    sourceFields: [],
    ...overrides,
  };
}

function normalizedItem(overrides: Partial<NormalizedFinancialItem> = {}): NormalizedFinancialItem {
  return {
    id: "item-0",
    source: "obligation",
    label: "Item",
    amount: knownMoney(1000),
    percentage: null,
    frequency: "monthly",
    numberOfPayments: null,
    mandatory: true,
    conditional: false,
    refundable: null,
    financialRole: "recurring_outflow",
    trigger: null,
    ...overrides,
  };
}

function penaltyItem(overrides: Partial<PenaltyItem> = {}): PenaltyItem {
  return {
    id: "penalty-0",
    type: "other",
    label: "Penalty",
    amount: knownMoney(50),
    percentage: unavailablePercentage(),
    calculationBase: null,
    trigger: "late payment",
    maximumAmount: unavailableMoney(),
    conditional: true,
    financialRole: "conditional_cost",
    sourceFields: [],
    ...overrides,
  };
}

function buildFinancialMetrics(overrides: {
  paymentObligations?: PaymentObligation[];
  fees?: FeeItem[];
  penalties?: PenaltyItem[];
  informationalAmounts?: InformationalAmount[];
}): FinancialMetrics {
  return {
    schemaVersion: "1.0",
    currency: "SAR",
    paymentObligations: overrides.paymentObligations ?? [],
    informationalAmounts: overrides.informationalAmounts ?? [],
    recurringCommitment: {
      actualMonthlyAmount: unavailableMoney(),
      monthlyEquivalent: unavailableMoney(),
      annualEquivalent: unavailableMoney(),
      minimumMonthlyAmount: unavailableMoney(),
      maximumMonthlyAmount: unavailableMoney(),
      isVariable: null,
      includedObligationIds: [],
    },
    contractDuration: {
      value: null,
      unit: null,
      months: null,
      days: null,
      startDate: null,
      endDate: null,
      status: "unavailable",
      source: null,
      reason: "n/a",
      confidence: "low",
    },
    totalCost: {
      statedTotalCost: unavailableMoney(),
      calculatedBaseCost: unavailableMoney(),
      calculatedCoreObligations: unavailableMoney(),
      calculatedKnownCost: unavailableMoney(),
      financingRepaymentTotal: unavailableMoney(),
      financingCost: unavailableMoney(),
      estimatedContractCost: unavailableMoney(),
      differenceFromStated: { classification: "unavailable", amount: unavailableMoney(), reason: "n/a" },
    },
    fees: {
      items: overrides.fees ?? [],
      totalKnownFees: unavailableMoney(),
      mandatoryFees: unavailableMoney(),
      upfrontFees: unavailableMoney(),
      recurringFees: unavailableMoney(),
      conditionalFees: unavailableMoney(),
      hasUndefinedFees: null,
      status: "unavailable",
    },
    penalties: {
      items: overrides.penalties ?? [],
      totalKnownPenalties: unavailableMoney(),
      highestKnownPenalty: unavailableMoney(),
      hasUndefinedPenalty: null,
      status: "unavailable",
    },
    ratios: {
      feesToBaseCost: unavailablePercentage(),
      penaltiesToBaseCost: unavailablePercentage(),
      upfrontPaymentToBaseCost: unavailablePercentage(),
      balloonPaymentToBaseCost: unavailablePercentage(),
      totalCostIncrease: unavailablePercentage(),
      recurringPaymentToIncome: unavailablePercentage(),
    },
    exposure: {
      totalKnownExposure: unavailableMoney(),
      monthlyExposure: unavailableMoney(),
      annualExposure: unavailableMoney(),
      upfrontExposure: unavailableMoney(),
      contingentExposure: unavailableMoney(),
      maximumSinglePayment: unavailableMoney(),
      unquantifiedContingentExposure: null,
      totalsByCurrency: [],
    },
    positiveFinancialFactors: [],
    calculationMetadata: { formulasUsed: [], unavailableCalculations: [], warnings: [], conflicts: [], excludedValues: [] },
  };
}

export function run(): void {
  // --- resolveCanonicalConcept ---
  {
    const balloon = normalizedItem({ obligationType: "balloon_payment", label: "Final payment", amount: knownMoney(19200), financialRole: "upfront_liquidity" });
    assert.equal(resolveCanonicalConcept(balloon, "auto_finance"), "final_payment");
  }
  console.log("PASS resolveCanonicalConcept maps balloon_payment to final_payment (fixes the untranslated 'Balloon payment' bug generically)");

  // --- buildFinancialConcepts: admin fee dedup across sources with mismatched frequency (requirement #3) ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({
          id: "obligation-admin",
          label: "Administrative fee",
          type: "unknown",
          amount: knownMoney(1200),
          frequency: "unknown",
          mandatory: true,
          financialRole: "other",
        }),
      ],
      fees: [
        feeItem({
          id: "fee-admin",
          type: "administration",
          label: "Administrative fee",
          amount: knownMoney(1200),
          frequency: "one_time",
          mandatory: true,
          financialRole: "one_time_outflow",
        }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const adminItems = concepts.filter((c) => c.conceptId === "administrative_fee");
    assert.equal(adminItems.length, 1, "the admin fee reported in both paymentObligations and fees must collapse to one row");
    assert.equal(adminItems[0]?.source, "obligation", "obligations take precedence over fees on a dedup tie");
  }
  console.log("PASS buildFinancialConcepts deduplicates the same concept across obligations and fees despite mismatched frequency strings");

  // --- Requirement #4: same amount, different financial meaning, must remain two separate facts ---
  {
    const financialMetrics = buildFinancialMetrics({
      fees: [
        feeItem({ id: "admin-fee", type: "administration", label: "Administrative fee", amount: knownMoney(1200) }),
        feeItem({ id: "insurance-fee", type: "insurance", label: "Insurance fee", amount: knownMoney(1200) }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    assert.equal(concepts.length, 2, "a 1,200 SAR admin fee and a different 1,200 SAR insurance fee must never merge just because the amounts match");
    assert.ok(concepts.some((c) => c.conceptId === "administrative_fee"));
    assert.ok(concepts.some((c) => c.conceptId === "insurance_premium"));
  }
  console.log("PASS two genuinely different facts sharing the same amount remain separate, never merged by amount alone");

  // --- Requirement #5: a financing principal must never be treated as an additional payment obligation ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [obligation({ id: "installment", label: "Monthly installment", amount: knownMoney(2400) })],
      informationalAmounts: [informationalAmount({ id: "principal", type: "principal", label: "Financed amount", amount: knownMoney(96000), financialRole: "financing_principal" })],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const principal = concepts.find((c) => c.conceptId === "financing_principal");
    assert.ok(principal, "the principal must appear as its own stated fact");
    assert.equal(principal?.bucket, "informational", "a financing principal must never be bucketed guaranteed");
    assert.equal(resolveContractFinancialGroup(principal!), "financingAndCredit", "a principal must be grouped as financing/credit information, never as something the user pays");
    assert.notEqual(resolveContractFinancialGroup(principal!), "whatYoullPay");
  }
  console.log("PASS a financing principal is exposed as its own fact but never grouped as a payment the user makes");

  // --- Requirement #6: a conditional collection cost preserves 'up to / maximum' semantics ---
  {
    const capped = normalizedItem({
      source: "penalty",
      label: "Actual collection costs",
      trigger: "up to 500 SAR if collection action is required",
      conditional: true,
      financialRole: "conditional_cost",
      amount: knownMoney(500),
    });
    assert.equal(isStatedCapText(capped), true, "a penalty worded as 'up to 500 SAR' must be recognized as a stated cap, not an exact guaranteed amount");

    const exact = normalizedItem({ source: "penalty", label: "Late fee", trigger: "charged once per late payment", conditional: true, amount: knownMoney(50) });
    assert.equal(isStatedCapText(exact), false, "a penalty with no cap/maximum wording must not be misrepresented as a cap");
  }
  console.log("PASS a conditional collection cost worded as 'up to X' is recognized and preserved, never flattened to a bare exact amount");

  // --- Requirement #7/#8: empty groups are never produced; groups are driven by meaning, not contract type ---
  {
    const rentAsConcept = { ...normalizedItem({ financialRole: "recurring_outflow", amount: knownMoney(3000) }), conceptId: "monthly_rent" as const, bucket: "guaranteed" as const };
    const groups = groupContractFinancialConcepts([rentAsConcept]);
    assert.ok(groups.whatYoullPay && groups.whatYoullPay.length === 1);
    assert.equal(groups.feesAndCosts, undefined, "a group with zero matching facts must not appear in the grouped result at all");
    assert.equal(groups.conditionalAmounts, undefined);

    // Same role/concept combination resolves to the same group regardless of which contract type it came from.
    const installmentForAutoFinance = { ...normalizedItem({ financialRole: "recurring_outflow" }), conceptId: "monthly_installment" as const, bucket: "guaranteed" as const };
    const rentForLease = { ...normalizedItem({ financialRole: "recurring_outflow" }), conceptId: "monthly_rent" as const, bucket: "guaranteed" as const };
    assert.equal(resolveContractFinancialGroup(installmentForAutoFinance), "whatYoullPay");
    assert.equal(resolveContractFinancialGroup(rentForLease), "whatYoullPay");
  }
  console.log("PASS empty groups are never produced, and group assignment is driven by financial meaning, not contract type");

  // --- Income/credit-limit/coverage-limit are informational, never guaranteed ---
  {
    const salary = normalizedItem({ id: "salary", label: "Base salary", amount: knownMoney(8000), financialRole: "income", mandatory: null });
    assert.equal(classifyFinancialItemBucket(salary), "informational", "income must never be classified guaranteed");

    const creditLimit = normalizedItem({ id: "cl", label: "Credit limit", amount: knownMoney(20000), financialRole: "credit_limit", mandatory: null });
    assert.equal(classifyFinancialItemBucket(creditLimit), "informational", "a credit limit is an available limit, not an obligation");

    const coverageLimit = normalizedItem({ id: "cov", label: "Coverage amount", amount: knownMoney(500000), financialRole: "coverage_limit", mandatory: null });
    assert.equal(classifyFinancialItemBucket(coverageLimit), "informational", "a coverage limit is protection, not user spending");
  }
  console.log("PASS income, credit limit, and coverage limit are all classified informational, never guaranteed cost");

  // --- Root-cause regression: an unresolved role with mandatory left null must never silently become guaranteed ---
  {
    const ambiguous = normalizedItem({ id: "ambiguous", label: "Total installments during term", amount: knownMoney(115200), financialRole: "other", mandatory: null, conditional: null });
    assert.equal(
      classifyFinancialItemBucket(ambiguous),
      "informational",
      "an item with an unresolved role and no explicit mandatory:true must never be silently summed as a guaranteed cost",
    );
  }
  console.log("PASS an ambiguous/unresolved item never defaults to guaranteed (the root cause of the fake aggregate is fixed)");

  // --- Refundable deposit: guaranteed bucket (it is a real upfront payment) but role 'refundable', not a permanent cost ---
  {
    const deposit = normalizedItem({ id: "dep", label: "Security deposit", amount: knownMoney(5000), refundable: true, financialRole: "refundable" });
    assert.equal(classifyFinancialItemBucket(deposit), "guaranteed", "a refundable deposit is still a real, guaranteed upfront payment");
  }
  console.log("PASS a refundable deposit is bucketed guaranteed (real payment) while its role stays 'refundable'");

  // --- Penalties are always conditional ---
  {
    const late = normalizedItem({ source: "penalty", label: "Late payment penalty", penaltyType: "late_payment", conditional: true, financialRole: "conditional_cost", mandatory: null });
    assert.equal(classifyFinancialItemBucket(late), "conditional");
    assert.equal(resolveCanonicalConcept(late, "auto_finance"), "late_fee");
    assert.equal(resolveContractFinancialGroup({ ...late, conceptId: "late_fee", bucket: "conditional" }), "conditionalAmounts");
  }
  console.log("PASS penalties are always bucketed conditional and resolve to their concrete concept (e.g. late_fee)");

  // --- selectApplicableMonthlyOutflow excludes income/credit_limit and includes a monthly recurring fee (not just paymentObligations) ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "salary", label: "Base salary", amount: knownMoney(10000), financialRole: "income", mandatory: null }),
      ],
      fees: [
        feeItem({ id: "service", type: "service", label: "Monthly service fee", amount: knownMoney(50), frequency: "monthly", financialRole: "recurring_outflow" }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "lease");
    const applicable = selectApplicableMonthlyOutflow(concepts);
    assert.equal(applicable?.value, 50, "salary must be excluded; a monthly recurring fee (not just obligations) must be included");
  }
  console.log("PASS selectApplicableMonthlyOutflow excludes income and includes a monthly recurring fee from fees[]");

  // --- selectApplicableUpfrontLiquidity includes a refundable deposit ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "down", label: "Down payment", type: "upfront_payment", amount: knownMoney(9600), frequency: "one_time", financialRole: "upfront_liquidity" }),
        obligation({ id: "dep", label: "Security deposit", type: "deposit", amount: knownMoney(1200), refundable: true, financialRole: "refundable", frequency: "one_time" }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const liquidity = selectApplicableUpfrontLiquidity(concepts);
    assert.equal(liquidity?.value, 10800, "upfront liquidity must include both the down payment and the refundable deposit: 9,600 + 1,200 = 10,800");
  }
  console.log("PASS selectApplicableUpfrontLiquidity includes both non-refundable and refundable upfront amounts");

  // --- selectApplicableUpfrontLiquidity includes a mandatory one-time fee the engine has confirmed
  //     is due now (financialRole upfront_liquidity), but excludes a final/balloon payment (which the
  //     engine assigns one_time_outflow, since it is due at the end of the term, not now) ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "down", label: "Down payment", type: "upfront_payment", amount: knownMoney(9600), frequency: "one_time", financialRole: "upfront_liquidity" }),
        obligation({ id: "final", label: "Final payment", type: "balloon_payment", amount: knownMoney(19200), frequency: "one_time", financialRole: "one_time_outflow" }),
      ],
      fees: [feeItem({ id: "admin", type: "administration", label: "Administrative fee", amount: knownMoney(1200), frequency: "one_time", financialRole: "upfront_liquidity" })],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const liquidity = selectApplicableUpfrontLiquidity(concepts);
    assert.equal(
      liquidity?.value,
      10800,
      "upfront liquidity must include the down payment (9,600) and the mandatory admin fee confirmed due at signing (1,200) = 10,800, but exclude the final/balloon payment (19,200), which is due at the end of the term, not now",
    );
  }
  console.log("PASS selectApplicableUpfrontLiquidity includes a mandatory one-time fee the engine confirms is due now, but excludes a final/balloon payment");

  // --- selectApplicableUpfrontLiquidity must NEVER include a one_time_outflow item, even a mandatory
  //     one — that role now means "due later or genuinely unstated timing", never "assume due now" ---
  {
    const financialMetrics = buildFinancialMetrics({
      fees: [feeItem({ id: "untimed", label: "Administrative fee", amount: knownMoney(1200), frequency: "one_time", financialRole: "one_time_outflow" })],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const liquidity = selectApplicableUpfrontLiquidity(concepts);
    assert.equal(liquidity, null, "a guaranteed one-time fee with unresolved/unconfirmed timing (financialRole one_time_outflow) must never be counted as upfront liquidity");
  }
  console.log("PASS selectApplicableUpfrontLiquidity never assumes a one_time_outflow item is due now");

  // --- Contract-type-driven recurring concept disambiguation ---
  {
    const rent = normalizedItem({ label: "Monthly rent", amount: knownMoney(3000), financialRole: "recurring_outflow" });
    assert.equal(resolveCanonicalConcept(rent, "lease"), "monthly_rent");

    const subscriptionFee = normalizedItem({ label: "Billing amount", amount: knownMoney(40), financialRole: "recurring_outflow" });
    assert.equal(resolveCanonicalConcept(subscriptionFee, "subscription"), "subscription_fee");
  }
  console.log("PASS the same generic recurring_outflow role resolves to different concepts based on contract type, not a hardcoded template");

  // --- Informational amounts: rate is exposed with a percentage, never a fabricated currency amount ---
  {
    const financialMetrics = buildFinancialMetrics({
      informationalAmounts: [
        informationalAmount({ id: "apr", type: "rate", label: "Interest rate (APR)", amount: unavailableMoney(), percentage: { value: 8.75, status: "known", source: "test", reason: null, confidence: "high" }, financialRole: "rate_or_percentage" }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");
    const rate = concepts.find((c) => c.conceptId === "interest_rate");
    assert.ok(rate, "a stated APR must appear as its own fact");
    assert.equal(rate?.percentage?.value, 8.75);
    assert.equal(resolveContractFinancialGroup(rate!), "ratesAndPercentages");
  }
  console.log("PASS a stated rate/APR is exposed as its own fact and grouped under rates and percentages");

  // --- Task D requirement: principal, final/balloon payment, and conditional costs must never
  //     enter the applicable monthly commitment or upfront liquidity used by Financial Analysis ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "installment", label: "Monthly installment", amount: knownMoney(2400), frequency: "monthly", financialRole: "recurring_outflow" }),
        obligation({
          id: "final",
          label: "Final payment",
          type: "balloon_payment",
          amount: knownMoney(19200),
          frequency: "one_time",
          financialRole: "one_time_outflow",
        }),
      ],
      fees: [feeItem({ id: "admin-fee", label: "Administrative fee", amount: knownMoney(1200), frequency: "one_time", financialRole: "upfront_liquidity" })],
      penalties: [penaltyItem({ id: "late-fee", label: "Late payment penalty", amount: knownMoney(50) })],
      informationalAmounts: [
        informationalAmount({ id: "principal", type: "principal", label: "Financed amount", amount: knownMoney(96000), financialRole: "financing_principal" }),
        informationalAmount({ id: "asset", type: "asset_value", label: "Vehicle price", amount: knownMoney(120000), financialRole: "asset_value" }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "auto_finance");

    const monthly = selectApplicableMonthlyOutflow(concepts);
    assert.equal(monthly?.value, 2400, "only the recurring installment must count toward the applicable monthly commitment");

    const upfront = selectApplicableUpfrontLiquidity(concepts);
    assert.equal(upfront?.value, 1200, "only the mandatory one-time admin fee due now must count toward upfront liquidity — principal, the final payment, and the conditional late fee must all be excluded");
  }
  console.log("PASS selectApplicableMonthlyOutflow/selectApplicableUpfrontLiquidity exclude principal, asset value, the final/balloon payment, and conditional costs");

  // --- Task D requirement: the same selectors must work generically for a non-auto-finance contract type ---
  {
    const financialMetrics = buildFinancialMetrics({
      paymentObligations: [
        obligation({ id: "salary", label: "Monthly salary", amount: knownMoney(9000), frequency: "monthly", mandatory: null, conditional: null, financialRole: "income" }),
      ],
      fees: [
        feeItem({ id: "deduction", label: "Fixed monthly deduction", amount: knownMoney(300), frequency: "monthly", financialRole: "recurring_outflow" }),
        feeItem({ id: "bonus", label: "Discretionary bonus", amount: knownMoney(1000), frequency: "one_time", mandatory: false, conditional: true, financialRole: "conditional_cost" }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "employment");

    const monthly = selectApplicableMonthlyOutflow(concepts);
    assert.equal(monthly?.value, 300, "salary (income role) must never be counted as an outflow, and a conditional bonus must be excluded — only the guaranteed recurring deduction counts");

    const upfront = selectApplicableUpfrontLiquidity(concepts);
    assert.equal(upfront, null, "an employment contract with no guaranteed upfront/refundable amount must yield no applicable upfront liquidity");
  }
  console.log("PASS the same selectors correctly exclude income and conditional costs for a non-auto-finance (employment) fixture");

  // --- selectGuaranteedEmploymentIncome: reads only the canonical monthly_income informational amount ---
  {
    const financialMetrics = buildFinancialMetrics({
      informationalAmounts: [
        informationalAmount({ id: "base-salary", type: "salary_component", label: "Base salary", amount: knownMoney(9000) }),
        informationalAmount({ id: "housing", type: "salary_component", label: "Housing allowance", amount: knownMoney(2250) }),
        informationalAmount({ id: "transport", type: "salary_component", label: "Transportation allowance", amount: knownMoney(750) }),
        informationalAmount({ id: "guaranteed-income", type: "monthly_income", label: "Guaranteed monthly employment income", amount: knownMoney(12000) }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "employment");
    const guaranteed = selectGuaranteedEmploymentIncome(concepts);
    assert.equal(guaranteed?.value, 12000, "the canonical guaranteed income must be the one true figure — never re-derived by summing the components again here");
  }
  console.log("PASS selectGuaranteedEmploymentIncome reads the single canonical monthly_income figure");

  {
    const concepts = buildFinancialConcepts(buildFinancialMetrics({}), "employment");
    assert.equal(selectGuaranteedEmploymentIncome(concepts), null, "no monthly_income informational amount present must yield null, never a fabricated figure");
  }
  console.log("PASS selectGuaranteedEmploymentIncome returns null when no canonical income figure is present");

  // --- resolveEmploymentFinancialGroup / groupEmploymentFinancialConcepts: the two 24,000 SAR
  // amounts from the spec fixture must land in DIFFERENT groups and stay fully distinct --------
  {
    const financialMetrics = buildFinancialMetrics({
      informationalAmounts: [
        informationalAmount({ id: "guaranteed-income", type: "monthly_income", label: "Guaranteed monthly employment income", amount: knownMoney(12000) }),
        informationalAmount({ id: "base-salary", type: "salary_component", label: "Base salary", amount: knownMoney(9000) }),
        informationalAmount({ id: "housing", type: "salary_component", label: "Housing allowance", amount: knownMoney(2250) }),
      ],
      fees: [
        feeItem({
          id: "bonus",
          label: "Performance bonus",
          amount: knownMoney(1200),
          frequency: "one_time",
          mandatory: false,
          conditional: true,
          financialRole: "conditional_income",
        }),
        feeItem({
          id: "medical",
          label: "Medical insurance premium",
          amount: knownMoney(150),
          frequency: "monthly",
          mandatory: false,
          financialRole: "benefit",
        }),
      ],
      penalties: [
        penaltyItem({
          id: "notice-deduction",
          label: "Notice period deduction",
          amount: knownMoney(24000),
          trigger: "employee fails to complete the 60-day notice period",
          financialRole: "conditional_cost",
        }),
        penaltyItem({
          id: "termination-entitlement",
          label: "Termination compensation",
          amount: knownMoney(24000),
          trigger: "employer terminates without a legitimate reason",
          financialRole: "conditional_income",
        }),
      ],
    });
    const concepts = buildFinancialConcepts(financialMetrics, "employment");
    const groups = groupEmploymentFinancialConcepts(concepts);

    const receiveIds = (groups.whatYouWillReceive ?? []).map((i) => i.id);
    assert.ok(receiveIds.includes("guaranteed-income"), "the canonical guaranteed income must appear under 'what you will receive'");

    const breakdownIds = (groups.compensationBreakdown ?? []).map((i) => i.id);
    assert.ok(breakdownIds.includes("base-salary") && breakdownIds.includes("housing"), "individual salary components must appear under 'compensation breakdown'");

    const conditionalIds = (groups.conditionalOrNonGuaranteed ?? []).map((i) => i.id);
    assert.ok(conditionalIds.includes("bonus"), "the performance bonus must appear under 'conditional or non-guaranteed amounts'");
    assert.ok(
      conditionalIds.includes("termination-entitlement"),
      "the termination compensation must appear as a potential employee entitlement under 'conditional or non-guaranteed amounts', never under deductions",
    );

    const deductionIds = (groups.potentialDeductions ?? []).map((i) => i.id);
    assert.ok(deductionIds.includes("notice-deduction"), "the notice-period deduction must appear under 'potential deductions or obligations'");
    assert.ok(!deductionIds.includes("termination-entitlement"), "the termination compensation must never be grouped alongside the employee's own deduction");

    const benefitIds = (groups.otherBenefits ?? []).map((i) => i.id);
    assert.ok(benefitIds.includes("medical"), "medical insurance must appear under 'other benefits'");

    // The two 24,000 SAR amounts must both survive, fully distinct — never deduplicated merely because the amounts match.
    const bothTwentyFourK = concepts.filter((c) => c.amount.value === 24000);
    assert.equal(bothTwentyFourK.length, 2, "both 24,000 SAR amounts must be present — they represent opposite-direction facts, not duplicates");
    const twentyFourKGroups = new Set(bothTwentyFourK.map((c) => resolveEmploymentFinancialGroup(c)));
    assert.deepEqual(
      [...twentyFourKGroups].sort(),
      ["conditionalOrNonGuaranteed", "potentialDeductions"].sort(),
      "the two 24,000 SAR amounts must resolve to two DIFFERENT groups, reflecting their opposite direction",
    );
  }
  console.log("PASS resolveEmploymentFinancialGroup/groupEmploymentFinancialConcepts keep the two 24,000 SAR amounts distinct and correctly grouped");

  console.log("PASS financialConcepts.test.ts");
}

run();
