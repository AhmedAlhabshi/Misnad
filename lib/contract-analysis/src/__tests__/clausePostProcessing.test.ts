import assert from "node:assert/strict";
import type { ImportantClause } from "@workspace/contract-schema";
import {
  applyDeterministicClausePostProcessing,
  deduplicateEquivalentClauses,
  normalizeClauseTitle,
  sortClausesStably,
  splitCompoundClauses,
} from "../clausePostProcessing";

function clause(overrides: Partial<ImportantClause>): ImportantClause {
  return {
    title: "Clause",
    summary: "Summary.",
    plainExplanation: "Explanation.",
    riskLevel: "medium",
    evidence: null,
    ...overrides,
  };
}

/**
 * Real (test-only, fabricated identifiers) masked contract fragment — the
 * exact two sections that were observed to produce inconsistent clause
 * counts (4 vs 5) across separate live model runs of the same PDF. Kept
 * verbatim (not paraphrased) so this regression test exercises the actual
 * text shape that triggered the bug.
 */
const REAL_FIXTURE_MASKED_TEXT = `الجهة الممولةشركة الأفق للتمويل - سجل [NATIONAL_ID]
العميلسلمان فهد التجريبي - هوية [NATIONAL_ID] - جوال [PHONE]
: التأخر والسداد المبكر

يوجه للعميل إشعار كتابي عند التأخر عن سداد أي قسط لأكثر من 30 يوماً.
لا تفرض غرامة مالية ثابتة لمصلحة الجهة الممولة، ويجوز تحميل العميل تكاليف التحصيل الفعلية المثبتة بحد أقصى 500 ريال للحالة.
يجوز للعميل طلب السداد المبكر، ويحسب مبلغ السداد المبكر وفق الرصيد المتبقي وتعويض لا يتجاوز كلفة الأجل لثلاثة أشهر تالية.
: التأمين والملكية

تبقى المركبة مسجلة باسم الجهة الممولة حتى استكمال جميع الالتزامات. يشمل القسط تكلفة التأمين الشامل للسنة الأولى فقط،
ولا تدخل في إجمالي مبلغ السداد المذكور.
أما التجديد للسنوات اللاحقة فتقدر تكلفته الفعلية سنوياً`;

/**
 * A raw model response that bundles each entire section into ONE clause —
 * i.e. the "4 clauses" (or fewer) failure mode: two independently-effective
 * paragraphs (late payment + collection cost + early settlement; ownership
 * + insurance) each collapsed into a single clause instead of being split
 * per independent effect.
 */
const MERGED_RAW_CLAUSES: ImportantClause[] = [
  clause({
    title: "التأخر والسداد المبكر",
    summary:
      "يوجه للعميل إشعار كتابي عند التأخر عن سداد أي قسط لأكثر من 30 يوماً. لا تفرض غرامة مالية ثابتة لمصلحة الجهة الممولة، ويجوز تحميل العميل تكاليف التحصيل الفعلية المثبتة بحد أقصى 500 ريال للحالة. يجوز للعميل طلب السداد المبكر، ويحسب مبلغ السداد المبكر وفق الرصيد المتبقي وتعويض لا يتجاوز كلفة الأجل لثلاثة أشهر تالية.",
    plainExplanation:
      "إذا تأخرت عن دفع قسط لأكثر من 30 يوماً، ستحصل على إشعار مكتوب من الجهة الممولة. لن تدفع غرامة مالية ثابتة إذا تأخرت في السداد، ولكن قد تتحمل تكاليف حقيقية للتحصيل بحد أقصى 500 ريال في كل مرة تتأخر فيها. يمكنك طلب سداد المبلغ المتبقي مبكراً، وسيتم حساب المبلغ بناءً على رصيدك المتبقي مع إضافة تعويض لا يزيد عن تكلفة الأرباح لثلاثة أشهر قادمة.",
  }),
  clause({
    title: "التأمين والملكية",
    summary:
      "تبقى المركبة مسجلة باسم الجهة الممولة حتى استكمال جميع الالتزامات المالية من قبل العميل. القسط الشهري يشمل تكلفة التأمين الشامل للسنة الأولى فقط. تجديد التأمين للسنوات اللاحقة تُقدر تكلفته الفعلية سنوياً ولا تدخل في إجمالي مبلغ السداد المذكور.",
    plainExplanation:
      "السيارة ستبقى مسجلة باسم الجهة التي مولتك حتى تسدد كل المبالغ المستحقة بالكامل. قسطك الشهري يغطي التأمين الشامل للسيارة للسنة الأولى فقط. في السنوات التالية، ستدفع تكلفة التأمين الشامل بنفسك، وهذه التكاليف غير محسوبة ضمن إجمالي المبلغ الذي ستسدده.",
  }),
];

/**
 * A raw model response that already split each independent effect into its
 * own clause — the "5 clauses" (correct) outcome from one real live run.
 * Kept exactly as the model produced it (see the investigation's RUN 1).
 */
const ALREADY_SPLIT_RAW_CLAUSES: ImportantClause[] = [
  clause({
    title: "إشعار التأخر في السداد",
    summary: "يوجه للعميل إشعار كتابي عند التأخر عن سداد أي قسط لأكثر من 30 يوماً.",
    plainExplanation: "إذا تأخرت عن دفع قسط لأكثر من 30 يوماً، ستحصل على إشعار مكتوب من الجهة الممولة.",
  }),
  clause({
    title: "تكاليف التحصيل بدل الغرامة المالية",
    summary:
      "لا تفرض غرامة مالية ثابتة على التأخر في السداد، ولكن يجوز تحميل العميل تكاليف التحصيل الفعلية المثبتة بحد أقصى 500 ريال سعودي للحالة.",
    plainExplanation:
      "لن تدفع غرامة مالية ثابتة إذا تأخرت في السداد، ولكن قد تتحمل تكاليف حقيقية للتحصيل بحد أقصى 500 ريال في كل مرة تتأخر فيها.",
  }),
  clause({
    title: "السداد المبكر",
    summary:
      "يجوز للعميل طلب السداد المبكر، ويُحسب مبلغ السداد المبكر وفق الرصيد المتبقي وتعويض لا يتجاوز كلفة الأجل لثلاثة أشهر تالية.",
    plainExplanation:
      "يمكنك طلب سداد المبلغ المتبقي مبكراً، وسيتم حساب المبلغ بناءً على رصيدك المتبقي مع إضافة تعويض لا يزيد عن تكلفة الأرباح لثلاثة أشهر قادمة.",
    riskLevel: "low",
  }),
  clause({
    title: "ملكية المركبة",
    summary: "تبقى المركبة مسجلة باسم الجهة الممولة حتى استكمال جميع الالتزامات المالية من قبل العميل.",
    plainExplanation: "السيارة ستبقى مسجلة باسم الجهة التي مولتك حتى تسدد كل المبالغ المستحقة بالكامل.",
    riskLevel: "high",
  }),
  clause({
    title: "تغطية التأمين الشامل",
    summary:
      "القسط الشهري يشمل تكلفة التأمين الشامل للسنة الأولى فقط. تجديد التأمين للسنوات اللاحقة تُقدر تكلفته الفعلية سنوياً ولا تدخل في إجمالي مبلغ السداد المذكور.",
    plainExplanation:
      "قسطك الشهري يغطي التأمين الشامل للسيارة للسنة الأولى فقط. في السنوات التالية، ستدفع تكلفة التأمين الشامل بنفسك، وهذه التكاليف غير محسوبة ضمن إجمالي المبلغ الذي ستسدده.",
  }),
];

/**
 * Three additional, GENERIC concept-pair fixtures (not vehicle-finance),
 * proving the split mechanism generalizes beyond the original 5 concepts —
 * each spans a different contract type this app supports (lease/subscription,
 * employment/lease, lease/auto).
 */

// --- lease/subscription: automatic renewal + cancellation ------------------
const RENEWAL_CANCELLATION_MERGED: ImportantClause = clause({
  title: "التجديد والإلغاء",
  summary:
    "يتجدد العقد تلقائيا لمدة سنة إضافية ما لم يخطر أحد الطرفين الآخر برغبته في عدم الاستمرار. يجوز للمشترك إلغاء الاشتراك في أي وقت بشرط تقديم إشعار كتابي قبل 30 يوما من تاريخ التجديد.",
  plainExplanation:
    "سيستمر اشتراكك تلقائيا لسنة أخرى ما لم يخبر أحدكما الآخر برغبته في الإيقاف. يمكنك إلغاء اشتراكك في أي وقت طالما أرسلت إشعارا كتابيا قبل 30 يوما من موعد التجديد.",
});
const RENEWAL_CANCELLATION_ALREADY_SPLIT: ImportantClause[] = [
  clause({
    title: "التجديد التلقائي للعقد",
    summary: "يتجدد العقد تلقائيا لمدة سنة إضافية ما لم يخطر أحد الطرفين الآخر برغبته في عدم الاستمرار.",
    plainExplanation: "سيستمر اشتراكك تلقائيا لسنة أخرى ما لم يخبر أحدكما الآخر برغبته في الإيقاف.",
  }),
  clause({
    title: "حق إلغاء الاشتراك",
    summary: "يجوز للمشترك إلغاء الاشتراك في أي وقت بشرط تقديم إشعار كتابي قبل 30 يوما من تاريخ التجديد.",
    plainExplanation: "يمكنك إلغاء اشتراكك في أي وقت طالما أرسلت إشعارا كتابيا قبل 30 يوما من موعد التجديد.",
  }),
];

// --- employment/lease: termination notice + termination fee ----------------
const TERMINATION_MERGED: ImportantClause = clause({
  title: "إنهاء العقد",
  summary:
    "يجب على أي من الطرفين تقديم إشعار إنهاء العقد قبل 60 يوما من تاريخ الإنهاء المرغوب. في حال الإنهاء قبل نهاية المدة الأصلية، يتحمل الطرف المنهي رسوم إنهاء العقد المحددة بمبلغ شهرين من الأجرة.",
  plainExplanation:
    "يجب إخبار الطرف الآخر كتابيا قبل 60 يوما إذا رغبت في إنهاء العقد. إذا أنهيت العقد مبكرا ستدفع مبلغا يعادل أجرة شهرين كرسوم إنهاء.",
});
const TERMINATION_ALREADY_SPLIT: ImportantClause[] = [
  clause({
    title: "مهلة إشعار إنهاء العقد",
    summary: "يجب على أي من الطرفين تقديم إشعار إنهاء العقد قبل 60 يوما من تاريخ الإنهاء المرغوب.",
    plainExplanation: "يجب إخبار الطرف الآخر كتابيا قبل 60 يوما إذا رغبت في إنهاء العقد.",
  }),
  clause({
    title: "رسوم الإنهاء المبكر",
    summary: "في حال الإنهاء قبل نهاية المدة الأصلية، يتحمل الطرف المنهي رسوم إنهاء العقد المحددة بمبلغ شهرين من الأجرة.",
    plainExplanation: "إذا أنهيت العقد مبكرا ستدفع مبلغا يعادل أجرة شهرين كرسوم إنهاء.",
    riskLevel: "high",
  }),
];

// --- lease/auto: maintenance duty + damage compensation ---------------------
const MAINTENANCE_DAMAGE_MERGED: ImportantClause = clause({
  title: "الصيانة والأضرار",
  summary:
    "يقع الالتزام بالصيانة الدورية للوحدة المؤجرة على عاتق المستأجر طوال مدة العقد. وفي حال حدوث أي تلف نتيجة سوء الاستخدام، يجب على المستأجر تقديم التعويض عن الأضرار للمالك بما يعادل تكلفة الإصلاح الفعلية.",
  plainExplanation:
    "عليك القيام بأعمال الصيانة الدورية للوحدة طوال فترة الإيجار. وإذا تسببت في أي تلف بسبب سوء الاستخدام، يجب أن تدفع للمالك تكلفة الإصلاح كاملة.",
});
const MAINTENANCE_DAMAGE_ALREADY_SPLIT: ImportantClause[] = [
  clause({
    title: "الالتزام بالصيانة الدورية",
    summary: "يقع الالتزام بالصيانة الدورية للوحدة المؤجرة على عاتق المستأجر طوال مدة العقد.",
    plainExplanation: "عليك القيام بأعمال الصيانة الدورية للوحدة طوال فترة الإيجار.",
  }),
  clause({
    title: "التعويض عن أضرار سوء الاستخدام",
    summary: "في حال حدوث أي تلف نتيجة سوء الاستخدام، يجب على المستأجر تقديم التعويض عن الأضرار للمالك بما يعادل تكلفة الإصلاح الفعلية.",
    plainExplanation: "إذا تسببت في أي تلف بسبب سوء الاستخدام، يجب أن تدفع للمالك تكلفة الإصلاح كاملة.",
    riskLevel: "medium",
  }),
];

/**
 * A single sentence that literally contains keywords from TWO different
 * concept anchors (renewal + cancellation) but expresses ONE unified
 * mechanism (conditional non-renewal), not two independent obligations.
 * Requirement: this must remain one clause, not be split — an ambiguous
 * sentence is never force-assigned to either concept.
 */
const AMBIGUOUS_SINGLE_EFFECT_CLAUSE: ImportantClause = clause({
  title: "شرط التجديد المشروط بالإلغاء",
  summary: "يتجدد العقد تلقائيا ما لم يتم إلغاء الاشتراك قبل 30 يوما من تاريخ التجديد.",
  plainExplanation: "يستمر عقدك تلقائيا إلا إذا ألغيت اشتراكك قبل الموعد بـ 30 يوما.",
});

/** Indices of clauses whose summary+plainExplanation contains `keyword`. */
function indicesContaining(clauses: readonly ImportantClause[], keyword: string): number[] {
  return clauses
    .map((c, i) => ({ i, text: `${c.title} ${c.summary} ${c.plainExplanation}` }))
    .filter(({ text }) => text.includes(keyword))
    .map(({ i }) => i);
}

/**
 * Generic two-concept version of `assertFiveIndependentEffectsAreSeparate`,
 * used for the additional concept pairs required beyond the original
 * vehicle-finance fixture (auto-renewal/cancellation, termination
 * notice/fee, maintenance/damage compensation) — proves the split mechanism
 * is not special-cased to the original 5 concepts.
 */
function assertTwoIndependentEffectsAreSeparate(
  clauses: readonly ImportantClause[],
  a: { keyword: string; label: string },
  b: { keyword: string; label: string },
): void {
  assert.equal(clauses.length, 2, `expected exactly 2 clauses, got ${clauses.length}`);
  const aIndices = indicesContaining(clauses, a.keyword);
  const bIndices = indicesContaining(clauses, b.keyword);
  assert.equal(aIndices.length, 1, `${a.label} concept must appear in exactly one clause, found in ${aIndices.length}`);
  assert.equal(bIndices.length, 1, `${b.label} concept must appear in exactly one clause, found in ${bIndices.length}`);
  assert.notEqual(aIndices[0], bIndices[0], `${a.label} and ${b.label} must not be merged into the same clause`);
}

function assertFiveIndependentEffectsAreSeparate(clauses: readonly ImportantClause[]): void {
  assert.equal(clauses.length, 5, `expected exactly 5 clauses, got ${clauses.length}`);

  const latePayment = indicesContaining(clauses, "التأخر عن سداد");
  const collectionCost = indicesContaining(clauses, "تكاليف التحصيل");
  const earlySettlement = indicesContaining(clauses, "السداد المبكر");
  const ownership = indicesContaining(clauses, "تبقى المركبة مسجلة");
  const insurance = indicesContaining(clauses, "التأمين الشامل");

  for (const [name, indices] of [
    ["late payment", latePayment],
    ["collection cost", collectionCost],
    ["early settlement", earlySettlement],
    ["ownership", ownership],
    ["insurance", insurance],
  ] as const) {
    assert.equal(indices.length, 1, `${name} concept must appear in exactly one clause, found in ${indices.length}`);
  }

  assert.notEqual(
    latePayment[0],
    collectionCost[0],
    "late payment and collection costs must not be merged into the same clause",
  );
  assert.notEqual(
    latePayment[0],
    earlySettlement[0],
    "early settlement must remain a separate clause from late payment",
  );
  assert.notEqual(
    collectionCost[0],
    earlySettlement[0],
    "early settlement must remain a separate clause from collection costs",
  );
  assert.notEqual(ownership[0], insurance[0], "ownership and insurance must remain separate clauses");
}

function run(): void {
  // --- normalizeClauseTitle ---------------------------------------------
  assert.equal(normalizeClauseTitle("  Late Payment:  "), "Late Payment");
  assert.equal(normalizeClauseTitle("التأمين الشامل، "), "التأمين الشامل");
  assert.equal(normalizeClauseTitle("Fee-"), "Fee");
  assert.equal(normalizeClauseTitle("Multiple   Spaces   Title"), "Multiple Spaces Title");

  // --- splitCompoundClauses: single-concept clauses are never split -----
  assert.deepEqual(
    splitCompoundClauses([clause({ title: "Unrelated", summary: "A single unrelated sentence.", plainExplanation: "Nothing to split here." })]),
    [clause({ title: "Unrelated", summary: "A single unrelated sentence.", plainExplanation: "Nothing to split here." })],
    "a clause naming zero or one concept anchor must never be split",
  );

  // --- splitCompoundClauses: the two real merged sections split correctly
  const splitFromMerged = splitCompoundClauses(MERGED_RAW_CLAUSES);
  assertFiveIndependentEffectsAreSeparate(splitFromMerged);

  // --- deduplicateEquivalentClauses: genuine duplicates collapse ---------
  const genuineDuplicate = clause({
    title: "Early Settlement Right",
    summary: "Customer may request early settlement of the remaining balance.",
    plainExplanation: "You can pay off what you owe early.",
  });
  const nearIdenticalRewrite = clause({
    title: "Early Settlement Right",
    summary: "Customer may request early settlement of the remaining balance amount.",
    plainExplanation: "You can pay off what you owe early.",
  });
  assert.equal(
    deduplicateEquivalentClauses([genuineDuplicate, nearIdenticalRewrite]).length,
    1,
    "two clauses with near-identical title and content must be deduplicated to one",
  );

  // --- deduplicateEquivalentClauses: distinct clauses distinguished only by
  // a short number must NOT be merged (regression: tokenize() must not
  // silently drop single-digit numbers, or "Fee 1"/"Fee 2" become
  // indistinguishable and wrongly collapse) -------------------------------
  const fee1 = clause({ title: "Fee 1", summary: "Administrative fee of 100 SAR.", plainExplanation: "You pay 100 SAR once." });
  const fee2 = clause({ title: "Fee 2", summary: "Late fee of 200 SAR.", plainExplanation: "You pay 200 SAR if late." });
  assert.equal(
    deduplicateEquivalentClauses([fee1, fee2]).length,
    2,
    "clauses distinguished only by a single-digit number must remain separate, not be wrongly deduplicated",
  );

  // --- deduplicateEquivalentClauses: never drops a clause based on riskLevel
  const highRisk = clause({ title: "Vehicle Ownership", summary: "Ownership stays with financier.", plainExplanation: "You do not own it yet.", riskLevel: "high" });
  const unrelatedLowRisk = clause({ title: "Insurance Coverage", summary: "Comprehensive insurance for year one.", plainExplanation: "First year insurance included.", riskLevel: "low" });
  const dedupedMixed = deduplicateEquivalentClauses([highRisk, unrelatedLowRisk]);
  assert.equal(dedupedMixed.length, 2, "unrelated clauses of different risk levels must both be kept");

  // --- sortClausesStably: resolves real document order, stable otherwise -
  const outOfOrder = [
    clause({ title: "B", summary: "تكلفة التأمين الشامل", plainExplanation: "x" }),
    clause({ title: "A", summary: "التأخر عن سداد", plainExplanation: "x" }),
  ];
  const sorted = sortClausesStably(outOfOrder, REAL_FIXTURE_MASKED_TEXT);
  assert.equal(sorted[0]!.title, "A", "clause appearing earlier in the source text must sort first");
  assert.equal(sorted[1]!.title, "B");

  const unresolvable = [clause({ title: "First", summary: "زز", plainExplanation: "زز" }), clause({ title: "Second", summary: "زز", plainExplanation: "زز" })];
  assert.deepEqual(
    sortClausesStably(unresolvable, REAL_FIXTURE_MASKED_TEXT).map((c) => c.title),
    ["First", "Second"],
    "clauses with no resolvable source position must keep their original relative order",
  );

  // --- applyDeterministicClausePostProcessing: fixture-based end-to-end --
  const fromMerged = applyDeterministicClausePostProcessing(MERGED_RAW_CLAUSES, REAL_FIXTURE_MASKED_TEXT);
  assertFiveIndependentEffectsAreSeparate(fromMerged);

  const fromAlreadySplit = applyDeterministicClausePostProcessing(ALREADY_SPLIT_RAW_CLAUSES, REAL_FIXTURE_MASKED_TEXT);
  assertFiveIndependentEffectsAreSeparate(fromAlreadySplit);
  // Both raw variants that caused the 4-vs-5 inconsistency (fully merged vs.
  // already split by the model) converge to 5 clauses with each of the 5
  // independent effects isolated to its own clause — verified above by
  // assertFiveIndependentEffectsAreSeparate for each input independently.

  // --- idempotence: re-running on already-processed output is a no-op ----
  const processedTwice = applyDeterministicClausePostProcessing(fromMerged, REAL_FIXTURE_MASKED_TEXT);
  assert.deepEqual(processedTwice, fromMerged, "re-running post-processing on its own output must be a no-op (idempotent)");

  const processedThrice = applyDeterministicClausePostProcessing(processedTwice, REAL_FIXTURE_MASKED_TEXT);
  assert.deepEqual(processedThrice, processedTwice, "post-processing must remain stable across repeated re-application");

  // --- generalization: 3 additional concept pairs beyond the original 5 --
  // Proves the split mechanism is not narrowly hardcoded to the
  // vehicle-finance fixture's late payment/collection cost/early
  // settlement/ownership/insurance concepts.

  // (a) lease/subscription: automatic renewal + cancellation
  assertTwoIndependentEffectsAreSeparate(
    splitCompoundClauses([RENEWAL_CANCELLATION_MERGED]),
    { keyword: "يتجدد العقد تلقائيا", label: "automatic renewal" },
    { keyword: "إلغاء الاشتراك", label: "cancellation" },
  );

  // (b) employment/lease: termination notice + termination fee
  assertTwoIndependentEffectsAreSeparate(
    splitCompoundClauses([TERMINATION_MERGED]),
    { keyword: "إشعار إنهاء العقد", label: "termination notice" },
    { keyword: "رسوم إنهاء العقد", label: "termination fee" },
  );

  // (c) lease/auto: maintenance duty + damage compensation
  assertTwoIndependentEffectsAreSeparate(
    splitCompoundClauses([MAINTENANCE_DAMAGE_MERGED]),
    { keyword: "الالتزام بالصيانة", label: "maintenance duty" },
    { keyword: "التعويض عن الأضرار", label: "damage compensation" },
  );

  // --- requirement #4: already-correct clauses for the new pairs must NOT
  // be over-split (each clause names only its own single concept, so no
  // split should trigger) or wrongly merged by dedup (distinct content) ---
  for (const alreadySplit of [
    RENEWAL_CANCELLATION_ALREADY_SPLIT,
    TERMINATION_ALREADY_SPLIT,
    MAINTENANCE_DAMAGE_ALREADY_SPLIT,
  ]) {
    assert.deepEqual(
      splitCompoundClauses(alreadySplit),
      alreadySplit,
      "already-correctly-split clauses (one concept each) must pass through splitCompoundClauses unchanged",
    );
    assert.equal(
      deduplicateEquivalentClauses(alreadySplit).length,
      2,
      "already-correctly-split clauses with distinct content must not be wrongly deduplicated",
    );
    assert.equal(
      applyDeterministicClausePostProcessing(alreadySplit, "").length,
      2,
      "the full pipeline must preserve already-correct clause counts for generic (non-vehicle-finance) concept pairs",
    );
  }

  // --- requirement #5: a single sentence naming two concept keywords but
  // expressing one unified effect must remain one clause, never force-split
  assert.deepEqual(
    splitCompoundClauses([AMBIGUOUS_SINGLE_EFFECT_CLAUSE]),
    [AMBIGUOUS_SINGLE_EFFECT_CLAUSE],
    "a single ambiguous sentence naming two concepts for one unified effect must not be split",
  );

  console.log("PASS clausePostProcessing.test.ts");
}

run();
