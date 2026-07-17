import { useCallback, useRef, useState } from "react";
import type { BudgetImpactResult, EmploymentBudgetImpactResult, EmploymentIncomeMode } from "@/lib/budgetImpact";
import type { PersonalizedAnalysisResponse } from "@/lib/personalizedAnalysisApi";

export interface PersonalizedAnalysisFormState {
  monthlyIncome: string;
  essentialExpenses: string;
  existingDebt: string;
  savings: string;
}

export const EMPTY_PERSONALIZED_ANALYSIS_FORM: PersonalizedAnalysisFormState = {
  monthlyIncome: "",
  essentialExpenses: "",
  existingDebt: "",
  savings: "",
};

export type PersonalizedAnalysisStatus = "idle" | "loading" | "success" | "unavailable";

export interface PersonalizedAnalysisSessionState {
  /** Raw string form inputs — preserved verbatim so re-showing the form after "edit" looks unchanged. */
  form: PersonalizedAnalysisFormState;
  /** The deterministic Budget Impact calculation, present once the user has submitted the form. Unused for `contractType === "employment"` — see `employmentBudgetResult` instead. */
  budgetResult: BudgetImpactResult | null;
  /**
   * The user's answer to "how will this contract salary affect your
   * current income?" — required before an employment analysis can run
   * (see `hasMinimumBudgetInputs`'s employment-only counterpart in
   * `FinancialAnalysisTab.tsx`). `null` for every non-employment contract,
   * and `null` until the user picks one for an employment contract.
   */
  employmentIncomeMode: EmploymentIncomeMode | null;
  /** The deterministic employment income-impact calculation — parallel to `budgetResult`, used only for `contractType === "employment"`. */
  employmentBudgetResult: EmploymentBudgetImpactResult | null;
  status: PersonalizedAnalysisStatus;
  /** The completed AI personalized-analysis result, present only when `status === "success"`. */
  result: PersonalizedAnalysisResponse | null;
}

const INITIAL_STATE: PersonalizedAnalysisSessionState = {
  form: EMPTY_PERSONALIZED_ANALYSIS_FORM,
  budgetResult: null,
  employmentIncomeMode: null,
  employmentBudgetResult: null,
  status: "idle",
  result: null,
};

/** True once a completed personalized-analysis result exists — for a future "Download Report Summary" feature to check before offering to include this section. */
export function hasCompletedPersonalizedAnalysis(state: PersonalizedAnalysisSessionState): boolean {
  return state.status === "success" && state.result !== null;
}

/**
 * Owns the Personalized Analysis tab's durable in-memory state — financial
 * form inputs, the deterministic budget-impact result, and the AI
 * personalized-analysis result/loading/error state — for the CURRENT
 * contract-analysis session only.
 *
 * Call this from a component that stays mounted while the user switches
 * between result tabs (`ResultsScreen`), never from a component nested
 * inside a tab panel — Radix's `TabsContent` unmounts inactive panels, so
 * state owned there is destroyed on every tab switch (this was the root
 * cause of the original bug: both the budget form and the AI result lived
 * in `useState` inside `FinancialAnalysisTab`/`PersonalizedAnalysisSection`,
 * which are rendered inside a `TabsContent`).
 *
 * `sessionKey` identifies the current contract-analysis session (pass the
 * current `StoredAnalysisResult` reference, which is a new object every time
 * a new analysis completes) — whenever it changes, this hook's state resets
 * to a fresh, empty session. This is what satisfies "reset on a new
 * analysis", never merely on tab navigation (tab navigation never changes
 * `sessionKey`).
 *
 * Nothing here touches localStorage, sessionStorage, cookies, or any
 * backend — this is plain React state, held only for as long as the owning
 * component (`ResultsScreen`) stays mounted, and gone the moment it unmounts.
 */
export function usePersonalizedAnalysisSession(sessionKey: unknown) {
  const [state, setState] = useState<PersonalizedAnalysisSessionState>(INITIAL_STATE);
  const previousSessionKeyRef = useRef(sessionKey);

  // Reset synchronously during render when the session changes (React's
  // documented pattern for "adjusting state when a prop changes") — this
  // guarantees the very first render of a new session never briefly shows
  // the previous session's inputs/result before an effect gets to clear it.
  if (previousSessionKeyRef.current !== sessionKey) {
    previousSessionKeyRef.current = sessionKey;
    if (state !== INITIAL_STATE) {
      setState(INITIAL_STATE);
    }
  }

  const setForm = useCallback((updater: (prev: PersonalizedAnalysisFormState) => PersonalizedAnalysisFormState) => {
    setState((prev) => ({ ...prev, form: updater(prev.form) }));
  }, []);

  const setBudgetResult = useCallback((budgetResult: BudgetImpactResult) => {
    setState((prev) => ({ ...prev, budgetResult }));
  }, []);

  const setEmploymentBudgetResult = useCallback((employmentBudgetResult: EmploymentBudgetImpactResult) => {
    setState((prev) => ({ ...prev, employmentBudgetResult }));
  }, []);

  /**
   * Changing the mode always discards any prior employment result/AI
   * analysis for this session — the two modes produce genuinely different
   * figures, so a stale result under the previous mode must never linger
   * (this is what "changing the mode triggers a fresh analysis" means:
   * the user must submit again, but never sees the old mode's numbers
   * mislabeled as the new mode's).
   */
  const setEmploymentIncomeMode = useCallback((employmentIncomeMode: EmploymentIncomeMode) => {
    setState((prev) => ({
      ...prev,
      employmentIncomeMode,
      employmentBudgetResult: null,
      status: "idle",
      result: null,
    }));
  }, []);

  /** Marks the AI personalized-analysis request as in flight — call once, right when it starts. */
  const startPersonalizedAnalysis = useCallback(() => {
    setState((prev) => ({ ...prev, status: "loading", result: null }));
  }, []);

  const setPersonalizedAnalysisResult = useCallback((result: PersonalizedAnalysisResponse) => {
    setState((prev) => ({ ...prev, status: "success", result }));
  }, []);

  const setPersonalizedAnalysisUnavailable = useCallback(() => {
    setState((prev) => ({ ...prev, status: "unavailable", result: null }));
  }, []);

  /** Used when the user clicks "edit inputs": discards the stale budget result and AI analysis so the next submission starts clean, but deliberately keeps `form`/`employmentIncomeMode` so their previously-entered values remain editable. */
  const resetBudgetResult = useCallback(() => {
    setState((prev) => ({ ...prev, budgetResult: null, employmentBudgetResult: null, status: "idle", result: null }));
  }, []);

  return {
    state,
    setForm,
    setBudgetResult,
    setEmploymentBudgetResult,
    setEmploymentIncomeMode,
    startPersonalizedAnalysis,
    setPersonalizedAnalysisResult,
    setPersonalizedAnalysisUnavailable,
    resetBudgetResult,
  };
}

export type PersonalizedAnalysisSession = ReturnType<typeof usePersonalizedAnalysisSession>;
