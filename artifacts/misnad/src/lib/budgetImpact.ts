/**
 * Deterministic, local-only Budget Impact calculations (Tab 3). No network
 * call, no LLM, no persistence — every formula here is plain arithmetic
 * over user-entered numbers and the two existing financial-metrics fields
 * already surfaced in Tab 2's Financial Snapshot (`recurringCommitment
 * .monthlyEquivalent` and `exposure.upfrontExposure`), so the two tabs never
 * disagree about what "the contract's monthly commitment" or "upfront
 * costs" means.
 */

export interface BudgetImpactInputs {
  monthlyIncome: number;
  essentialExpenses: number;
  existingMonthlyDebt: number;
  /** Optional per the spec — `null` when the user chose not to enter it. */
  savings: number | null;
}

/**
 * The two contract figures the calculations depend on, pre-resolved by the
 * caller from `FinancialMetrics` (see `financialPresentation.ts`'s
 * `selectSnapshotMetrics` for the same source fields) — `null` exactly when
 * the backend reports that metric as unavailable, never coerced to 0.
 */
export interface ContractBudgetFigures {
  monthlyCommitment: number | null;
  upfrontCosts: number | null;
}

export interface BudgetImpactResult {
  availableBeforeContract: number;
  /** `null` when `monthlyCommitment` is unknown — never silently treated as 0. */
  availableAfterContract: number | null;
  /** Percentage points. `null` when `monthlyCommitment` is unknown or income is not positive. */
  contractIncomeRatio: number | null;
  /** Percentage points. `null` under the same conditions as `contractIncomeRatio`. */
  totalCommitmentRatio: number | null;
  /** `null` unless both `savings` and `upfrontCosts` are known. */
  remainingSavings: number | null;
  /**
   * `remainingSavings ÷ (essentialExpenses + existingMonthlyDebt + monthlyCommitment)`
   * — only computed when `remainingSavings` and `monthlyCommitment` are both
   * known and the denominator is strictly greater than zero. The exact
   * formula is not specified by the product brief; this is the documented,
   * literal reading of "how many months would your remaining savings cover
   * your total monthly outflow after taking on this contract".
   */
  emergencyCoverageMonths: number | null;
}

/** The 3 required inputs the primary CTA needs before any calculation can run — `savings` stays optional throughout. */
export function hasMinimumBudgetInputs(
  inputs: Partial<BudgetImpactInputs>,
): inputs is Pick<BudgetImpactInputs, "monthlyIncome" | "essentialExpenses" | "existingMonthlyDebt"> {
  return (
    typeof inputs.monthlyIncome === "number" &&
    Number.isFinite(inputs.monthlyIncome) &&
    typeof inputs.essentialExpenses === "number" &&
    Number.isFinite(inputs.essentialExpenses) &&
    typeof inputs.existingMonthlyDebt === "number" &&
    Number.isFinite(inputs.existingMonthlyDebt)
  );
}

/** Parses a raw form-field string into a non-negative finite number, or `null` for empty/invalid/negative input — never `NaN`. */
export function parseBudgetInputValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function calculateBudgetImpact(inputs: BudgetImpactInputs, contract: ContractBudgetFigures): BudgetImpactResult {
  const availableBeforeContract = inputs.monthlyIncome - inputs.essentialExpenses - inputs.existingMonthlyDebt;

  const availableAfterContract =
    contract.monthlyCommitment !== null ? availableBeforeContract - contract.monthlyCommitment : null;

  const canRatio = contract.monthlyCommitment !== null && inputs.monthlyIncome > 0;
  const contractIncomeRatio = canRatio ? (contract.monthlyCommitment! / inputs.monthlyIncome) * 100 : null;
  const totalCommitmentRatio = canRatio
    ? ((inputs.existingMonthlyDebt + contract.monthlyCommitment!) / inputs.monthlyIncome) * 100
    : null;

  const remainingSavings =
    inputs.savings !== null && contract.upfrontCosts !== null ? inputs.savings - contract.upfrontCosts : null;

  const totalMonthlyOutflow =
    contract.monthlyCommitment !== null ? inputs.essentialExpenses + inputs.existingMonthlyDebt + contract.monthlyCommitment : null;
  const emergencyCoverageMonths =
    remainingSavings !== null && totalMonthlyOutflow !== null && totalMonthlyOutflow > 0
      ? remainingSavings / totalMonthlyOutflow
      : null;

  return {
    availableBeforeContract,
    availableAfterContract,
    contractIncomeRatio,
    totalCommitmentRatio,
    remainingSavings,
    emergencyCoverageMonths,
  };
}
