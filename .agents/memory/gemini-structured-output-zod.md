---
name: Gemini structured output from Zod schemas
description: How to get Gemini (@google/genai) to reliably follow a Zod-defined response shape, and the zod/v4-specific gotcha involved.
---

Rule: pass an actual JSON Schema to Gemini via `config.responseJsonSchema` (not just `responseMimeType: "application/json"`, and not the older `config.responseSchema`). Prompt text alone is not reliable enough for the model to follow exact field names/structure.

**Why:** with only `responseMimeType` set, Gemini reliably returns syntactically valid JSON but drifts on field names/shape (invents its own reasonable-looking structure instead of matching the intended schema exactly).

**How to apply:**
- Derive the JSON Schema from the same Zod schema used for validation (`zod/v4`'s `z.toJSONSchema(schema)`), never hand-write a parallel schema — they will drift apart.
- Classic `zod` (v3 default export) schemas are NOT compatible with `zod/v4`'s `toJSONSchema` — it throws (`Cannot read properties of undefined (reading 'def')`). If a schema package needs JSON Schema export, the whole package must import from `zod/v4`, not `zod`.
- Gemini's supported JSON Schema subset (per `@google/genai` types) includes `enum` but not `const`. `z.literal(...)` produces `{"const": ...}` under `toJSONSchema`, so post-process with the generator's `override` hook to rewrite `const` → `enum: [value]` (a lossless representational fix, not a schema change).
- If the response can be scoped to one known variant of a discriminated union (e.g. a specific contract type out of many), build and send the narrowed single-branch schema instead of the full union — smaller/less ambiguous schemas reduce drift further.
- Structured output config does not replace runtime validation — still run the model's response through the full Zod schema's `safeParse` afterwards.
