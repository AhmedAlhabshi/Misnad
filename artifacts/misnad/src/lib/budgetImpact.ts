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

  // ---------------------------------------------------------------------
  // Canonical personalized-analysis values (additive — every field below
  // is either a direct alias of a field above, kept under the product's
  // canonical name, or a genuinely new figure). None of the fields above
  // are renamed, removed, or recalculated differently — existing callers
  // and tests keep reading exactly the same values under their original
  // names. Added specifically because `totalCommitmentRatio` above is a
  // narrower, deliberately-distinct debt-to-income-style ratio (existing
  // debt + the new contract's own commitment, excluding essential living
  // expenses — see its own field doc and `resultsCopy.ts`'s label) and must
  // never be conflated with a full "total monthly outflow" ratio, which is
  // what `totalOutflowRatioAfterContract` below actually is.
  // ---------------------------------------------------------------------

  /** Alias of `contract.monthlyCommitment` under its canonical name. */
  monthlyContractCommitment: number | null;
  /** `essentialExpenses + existingMonthlyDebt` — the user's own recurring outflow, before this contract exists at all. */
  totalMonthlyOutflowBeforeContract: number;
  /** `essentialExpenses + existingMonthlyDebt + monthlyCommitment` — every known monthly outflow once this contract is signed. `null` exactly when `monthlyCommitment` is unknown. */
  totalMonthlyOutflowAfterContract: number | null;
  /** Alias of `availableBeforeContract` under its canonical name. */
  remainingMonthlyBeforeContract: number;
  /** Alias of `availableAfterContract` under its canonical name. */
  remainingMonthlyAfterContract: number | null;
  /** Alias of `contractIncomeRatio` under its canonical name — this contract's own monthly payment as a percentage of income. */
  newContractBurdenRatio: number | null;
  /** `totalMonthlyOutflowAfterContract ÷ monthlyIncome × 100` — percentage points, `null` under the same conditions as `totalMonthlyOutflowAfterContract`/income being non-positive. */
  totalOutflowRatioAfterContract: number | null;
  /** Alias of `contract.upfrontCosts` under its canonical name. */
  initialCashRequired: number | null;
  /** Alias of `remainingSavings` under its canonical name. */
  savingsAfterInitialCash: number | null;
  /** Same value as `emergencyCoverageMonths`, rounded to one decimal place — the canonical, display/AI-facing figure (never a long floating-point value). */
  emergencyFundCoverageMonths: number | null;
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

  const totalMonthlyOutflowBeforeContract = inputs.essentialExpenses + inputs.existingMonthlyDebt;
  const totalOutflowRatioAfterContract =
    totalMonthlyOutflow !== null && inputs.monthlyIncome > 0 ? (totalMonthlyOutflow / inputs.monthlyIncome) * 100 : null;

  // `emergencyFundCoverageMonths` is the presentation/AI-facing canonical
  // value — rounded to one decimal place here (never a long floating-point
  // value like `2.9090909090909087`), per the finite-number/display
  // requirements for personalized analysis. `emergencyCoverageMonths` above
  // deliberately stays full-precision and unrounded — it is a
  // longer-standing, separately-tested field, and other callers (e.g.
  // `emergencyCoverageWording.ts`'s own AR/EN singular/dual/plural
  // formatting) already do their own rounding for display.
  const emergencyFundCoverageMonths = emergencyCoverageMonths !== null ? roundToOneDecimal(emergencyCoverageMonths) : null;

  return {
    availableBeforeContract,
    availableAfterContract,
    contractIncomeRatio,
    totalCommitmentRatio,
    remainingSavings,
    emergencyCoverageMonths,

    monthlyContractCommitment: contract.monthlyCommitment,
    totalMonthlyOutflowBeforeContract,
    totalMonthlyOutflowAfterContract: totalMonthlyOutflow,
    remainingMonthlyBeforeContract: availableBeforeContract,
    remainingMonthlyAfterContract: availableAfterContract,
    newContractBurdenRatio: contractIncomeRatio,
    totalOutflowRatioAfterContract,
    initialCashRequired: contract.upfrontCosts,
    savingsAfterInitialCash: remainingSavings,
    emergencyFundCoverageMonths,
  };
}

/** Rounds to one decimal place — never returns `NaN`/`Infinity` since callers only ever pass an already-finite number. */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Employment personalized analysis — a fundamentally different calculation
// from every other contract type: an employment contract changes the
// user's INCOME rather than adding a monthly commitment the user pays, so
// it needs its own dedicated inputs/outputs rather than reusing
// `ContractBudgetFigures`/`calculateBudgetImpact` (which would otherwise
// treat the salary as something subtracted from the remaining balance).
// ---------------------------------------------------------------------------

export const EMPLOYMENT_INCOME_MODE_VALUES = ["replace_current_income", "add_to_current_income"] as const;
export type EmploymentIncomeMode = (typeof EMPLOYMENT_INCOME_MODE_VALUES)[number];

export interface EmploymentBudgetImpactInputs {
  /** The user's current monthly income, before this contract. */
  currentMonthlyIncome: number;
  monthlyLivingExpenses: number;
  monthlyDebtPayments: number;
  /** Optional, same convention as `BudgetImpactInputs.savings` — `null` when not entered. */
  savings: number | null;
}

export interface EmploymentContractFigures {
  /** The canonical guaranteed monthly employment income (see `financialConcepts.ts`'s `selectGuaranteedEmploymentIncome`) — `null` when the contract states no guaranteed compensation at all. */
  guaranteedMonthlyIncome: number | null;
  /** A recurring amount explicitly, confirmedly deducted from the employee's pay (e.g. a stated, fixed recurring deduction) — `0` when the contract states none, never guessed. */
  confirmedRecurringEmployeeDeductions: number;
  /** An upfront amount the employee must explicitly pay per the contract (rare) — `null` when the contract requires none, which is the common case; never assumed. */
  upfrontEmployeePayment: number | null;
}

export interface EmploymentBudgetImpactResult {
  incomeBefore: number;
  /** `null` exactly when `guaranteedMonthlyIncome` is unknown. */
  incomeAfter: number | null;
  remainingBefore: number;
  /** `null` exactly when `guaranteedMonthlyIncome` is unknown. */
  remainingAfter: number | null;
  /** `null` exactly when `guaranteedMonthlyIncome` is unknown. */
  incomeChange: number | null;
  /** Percentage points. `null` when `incomeChange` is unknown OR `currentMonthlyIncome` is not positive (never `NaN`/`Infinity` — display as "Unavailable"/"غير متاح"). */
  incomeChangePercentage: number | null;
  /**
   * Employment salary never reduces savings on its own — only an explicit
   * upfront employee-paid amount does (`savings - upfrontEmployeePayment`).
   * `null` only when `savings` itself was never entered.
   */
  savingsAfterContract: number | null;
  /**
   * `savings ÷ (monthlyLivingExpenses + monthlyDebtPayments + confirmedRecurringEmployeeDeductions)`,
   * rounded to one decimal place. Salary itself is never counted as an
   * expense in this denominator. `null` when `savings` is unknown or the
   * denominator is not strictly positive.
   */
  emergencyFundCoverageMonths: number | null;
}

/**
 * Deterministic employment personalized-impact calculation for both modes
 * (see the product requirement's formulas). `mode` must already be
 * selected by the user before this is ever called — there is no default.
 */
export function calculateEmploymentBudgetImpact(
  inputs: EmploymentBudgetImpactInputs,
  contract: EmploymentContractFigures,
  mode: EmploymentIncomeMode,
): EmploymentBudgetImpactResult {
  const incomeBefore = inputs.currentMonthlyIncome;
  const remainingBefore = inputs.currentMonthlyIncome - inputs.monthlyLivingExpenses - inputs.monthlyDebtPayments;

  const guaranteed = contract.guaranteedMonthlyIncome;
  const deductions = contract.confirmedRecurringEmployeeDeductions;

  let incomeAfter: number | null = null;
  let incomeChange: number | null = null;

  if (guaranteed !== null) {
    if (mode === "replace_current_income") {
      incomeAfter = guaranteed;
      incomeChange = guaranteed - inputs.currentMonthlyIncome;
    } else {
      incomeAfter = inputs.currentMonthlyIncome + guaranteed;
      incomeChange = guaranteed;
    }
  }

  const remainingAfter = incomeAfter !== null ? incomeAfter - inputs.monthlyLivingExpenses - inputs.monthlyDebtPayments - deductions : null;

  const incomeChangePercentage =
    incomeChange !== null && inputs.currentMonthlyIncome > 0 ? (incomeChange / inputs.currentMonthlyIncome) * 100 : null;

  // Salary never reduces savings — only an explicit upfront employee
  // payment does, and this employment fixture (and the overwhelming
  // majority of real employment contracts) has none.
  const savingsAfterContract =
    inputs.savings !== null ? inputs.savings - (contract.upfrontEmployeePayment ?? 0) : null;

  const monthlyRequiredOutflow = inputs.monthlyLivingExpenses + inputs.monthlyDebtPayments + deductions;
  const emergencyFundCoverageMonths =
    inputs.savings !== null && monthlyRequiredOutflow > 0 ? roundToOneDecimal(inputs.savings / monthlyRequiredOutflow) : null;

  return {
    incomeBefore,
    incomeAfter,
    remainingBefore,
    remainingAfter,
    incomeChange,
    incomeChangePercentage,
    savingsAfterContract,
    emergencyFundCoverageMonths,
  };
}
