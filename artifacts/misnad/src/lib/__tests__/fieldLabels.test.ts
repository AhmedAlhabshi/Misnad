import assert from "node:assert/strict";
import { getFieldLabel } from "../fieldLabels";

export function run(): void {
  assert.equal(getFieldLabel("typeDetails.vehicleMake", "ar"), "ماركة المركبة");
  assert.equal(getFieldLabel("typeDetails.vehicleMake", "en"), "Vehicle make");
  assert.equal(getFieldLabel("typeDetails.vehicleModel", "ar"), "موديل المركبة");
  assert.equal(getFieldLabel("typeDetails.vehicleYear", "en"), "Vehicle year");
  assert.equal(getFieldLabel("typeDetails.financedAmount", "ar"), "مبلغ التمويل");

  assert.equal(
    getFieldLabel("financialObligations[3].amount", "ar"),
    "مبلغ الالتزام المالي",
    "array indexes must be stripped before lookup",
  );
  assert.equal(getFieldLabel("financialObligations[3].amount", "en"), "Financial obligation amount");

  assert.equal(getFieldLabel("parties[0].identifier", "ar"), "معرف الطرف");
  assert.equal(getFieldLabel("parties[0].identifier", "en"), "Party identifier");

  for (const language of ["ar", "en"] as const) {
    const label = getFieldLabel("someTotallyUnknownField", language);
    assert.equal(
      /\[|\]|\./.test(label),
      false,
      "the fallback label must never expose raw path syntax such as brackets or dots",
    );
    assert.ok(label.length > 0, "the fallback label must not be empty");
  }

  const unknownArrayPath = getFieldLabel("someArray[7].nested[2].value", "en");
  assert.equal(
    /\[\d+\]/.test(unknownArrayPath),
    false,
    "array indexes must never leak into any label, including unknown-field fallbacks",
  );

  console.log("PASS fieldLabels.test.ts");
}

run();
