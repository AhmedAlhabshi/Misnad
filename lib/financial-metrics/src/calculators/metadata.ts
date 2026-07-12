import type { CalculationWarning, ExcludedValue, FormulaRecord } from "../calculationMetadata";

/** Every calculator returns its schema section alongside this — merged by `engine.ts` into the root `calculationMetadata`. */
export interface CalculatorMetadata {
  formulas: FormulaRecord[];
  unavailable: string[];
  warnings: CalculationWarning[];
  excludedValues: ExcludedValue[];
}

export function emptyMetadata(): CalculatorMetadata {
  return { formulas: [], unavailable: [], warnings: [], excludedValues: [] };
}

export function mergeMetadata(...parts: CalculatorMetadata[]): CalculatorMetadata {
  return {
    formulas: parts.flatMap((part) => part.formulas),
    unavailable: parts.flatMap((part) => part.unavailable),
    warnings: parts.flatMap((part) => part.warnings),
    excludedValues: parts.flatMap((part) => part.excludedValues),
  };
}
