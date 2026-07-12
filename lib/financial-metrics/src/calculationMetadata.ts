import { z } from "zod/v4";
import { sourceFieldsSchema } from "./common";
import { calculationWarningSeveritySchema, metricStatusSchema } from "./enums";

/** A formula's named inputs — each is either a concrete scalar or unavailable. */
const formulaInputValueSchema = z.union([z.number(), z.string(), z.null()]);

export const formulaRecordSchema = z.object({
  metric: z.string().min(1),
  formula: z.string().min(1),
  inputs: z.record(z.string(), formulaInputValueSchema),
  result: z.number().nullable(),
  status: metricStatusSchema,
});

export type FormulaRecord = z.infer<typeof formulaRecordSchema>;

export const calculationWarningSchema = z.object({
  code: z.string().min(1),
  severity: calculationWarningSeveritySchema,
  messageKey: z.string().min(1),
  sourceFields: sourceFieldsSchema,
  details: z.string().nullable(),
});

export type CalculationWarning = z.infer<typeof calculationWarningSchema>;

export const calculationConflictSchema = z.object({
  metric: z.string().min(1),
  values: z.array(formulaInputValueSchema),
  resolution: z.string().nullable(),
  sourceFields: sourceFieldsSchema,
});

export type CalculationConflict = z.infer<typeof calculationConflictSchema>;

export const excludedValueSchema = z.object({
  value: formulaInputValueSchema,
  reasonCode: z.string().min(1),
  sourceField: z.string().nullable(),
});

export type ExcludedValue = z.infer<typeof excludedValueSchema>;

export const calculationMetadataSchema = z.object({
  formulasUsed: z.array(formulaRecordSchema),
  unavailableCalculations: z.array(z.string()),
  warnings: z.array(calculationWarningSchema),
  conflicts: z.array(calculationConflictSchema),
  excludedValues: z.array(excludedValueSchema),
});

export type CalculationMetadata = z.infer<typeof calculationMetadataSchema>;
