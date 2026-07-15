import assert from "node:assert/strict";
import { sanitizeDisplayText } from "../textSanitization";

export function run(): void {
  assert.equal(sanitizeDisplayText("Ahmad Al-Ali"), "Ahmad Al-Ali", "clean text passes through unchanged");
  console.log("PASS sanitizeDisplayText leaves clean text unchanged");

  assert.equal(sanitizeDisplayText(null), null);
  assert.equal(sanitizeDisplayText(undefined), null);
  assert.equal(sanitizeDisplayText(""), null);
  assert.equal(sanitizeDisplayText("   "), null);
  console.log("PASS sanitizeDisplayText returns null for missing/empty input");

  // A placeholder as the entire value leaves nothing renderable.
  assert.equal(sanitizeDisplayText("[NATIONAL_ID]"), null, "a bare placeholder must never render as text");
  console.log("PASS sanitizeDisplayText returns null when only a placeholder remains");

  // A placeholder at the end of a labeled value.
  assert.equal(sanitizeDisplayText("Tenant: [NATIONAL_ID]"), "Tenant", "a trailing placeholder and its dangling colon must be cleaned");
  console.log("PASS sanitizeDisplayText cleans a trailing placeholder and its separator");

  // A placeholder in the middle of a sentence.
  assert.equal(
    sanitizeDisplayText("Contact the tenant at [PHONE] for questions."),
    "Contact the tenant at for questions.",
    "a mid-sentence placeholder is removed, collapsing the resulting double space",
  );
  console.log("PASS sanitizeDisplayText removes a mid-sentence placeholder and collapses whitespace");

  // Multiple placeholders and separators.
  assert.equal(
    sanitizeDisplayText("Tenant: [NATIONAL_ID], Phone: [PHONE], Email: [EMAIL]"),
    "Tenant, Phone, Email",
    "multiple placeholders and their dangling colons must all be cleaned",
  );
  console.log("PASS sanitizeDisplayText cleans multiple placeholders in one value");

  // A generic, not-explicitly-listed all-caps bracket token is also caught defensively.
  assert.equal(sanitizeDisplayText("Reference: [SOME_FUTURE_TOKEN]"), "Reference", "an unlisted but bracket-shaped placeholder must still be stripped");
  console.log("PASS sanitizeDisplayText defensively strips unlisted bracket-shaped tokens");

  // Arabic text with a placeholder.
  assert.equal(sanitizeDisplayText("رقم الهوية: [NATIONAL_ID]"), "رقم الهوية", "Arabic labeled placeholders must be cleaned the same way");
  console.log("PASS sanitizeDisplayText cleans Arabic-labeled placeholders");

  // Real (non-placeholder) bracketed content is preserved — only the specific placeholder shape is stripped.
  assert.equal(sanitizeDisplayText("Unit [A-12]"), "Unit [A-12]", "a real bracketed value that isn't an all-caps placeholder token must be preserved");
  console.log("PASS sanitizeDisplayText preserves non-placeholder bracketed content");

  console.log("PASS textSanitization.test.ts");
}

run();
