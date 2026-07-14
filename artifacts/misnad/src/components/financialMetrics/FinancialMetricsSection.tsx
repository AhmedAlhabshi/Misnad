import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Wallet, Receipt, Info, AlertCircle, CircleDollarSign } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import type {
  CalculationConflict,
  CalculationWarning,
  ExcludedValue,
  FeeItem,
  FinancialMetrics,
  MetricStatus,
  MoneyMetric,
  PaymentObligation,
  PenaltyItem,
  PercentageMetric,
} from "@workspace/financial-metrics";
import type { FinancialMetricsPublicError } from "@/types/analysis";
import { FINANCIAL_METRICS_COPY, localizeObligationLabel, type FinancialMetricsCopy } from "@/lib/financialMetricsCopy";
import {
  formatContractDuration,
  formatCount,
  formatMoneyMetric,
  formatPercentageMetric,
} from "@/lib/financialFormatters";

/** Small labeled value card — the one reusable building block, not one component per schema field. */
function FinancialMetricCard({
  label,
  display,
  status,
  copy,
  testId,
}: {
  label: string;
  display: { kind: "value" | "unavailable"; text: string; reason: string | null; currencyUnknown?: boolean };
  status?: MetricStatus;
  copy: FinancialMetricsCopy;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-1 min-w-0"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold text-white break-words" data-testid={`${testId}-value`}>
        {display.text}
      </span>
      {display.kind === "value" && display.currencyUnknown && (
        <span className="text-[11px] text-muted-foreground">{copy.currencyUnknown}</span>
      )}
      {display.kind === "value" && status === "estimated" && (
        <span className="text-[11px] text-indigo-300 font-medium">{copy.calculated}</span>
      )}
      {display.kind === "unavailable" && display.reason && (
        <span className="text-[11px] text-muted-foreground">
          {copy.reasonPrefix}: {display.reason}
        </span>
      )}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "info" }) {
  const toneClass = tone === "info" ? "bg-indigo-500/15 text-indigo-300" : "bg-white/10 text-white/70";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-white mb-3">{children}</h2>;
}

function FinancialSummaryGrid({
  financialMetrics,
  language,
  copy,
}: {
  financialMetrics: FinancialMetrics;
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  const { recurringCommitment, contractDuration, totalCost, exposure } = financialMetrics;

  const duration = formatContractDuration(contractDuration, language, copy.unavailable, copy.duration);

  return (
    <div>
      <SectionHeading>{copy.summary.title}</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="financial-summary-grid">
        <FinancialMetricCard
          testId="summary-monthly-commitment"
          label={copy.summary.monthlyCommitment}
          display={formatMoneyMetric(recurringCommitment.monthlyEquivalent, language, copy.unavailable)}
          status={recurringCommitment.monthlyEquivalent.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="summary-annual-commitment"
          label={copy.summary.annualCommitment}
          display={formatMoneyMetric(recurringCommitment.annualEquivalent, language, copy.unavailable)}
          status={recurringCommitment.annualEquivalent.status}
          copy={copy}
        />
        <div
          data-testid="summary-duration"
          className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-1 min-w-0"
        >
          <span className="text-xs text-muted-foreground">{copy.summary.duration}</span>
          <span className="text-xl font-bold text-white break-words" data-testid="summary-duration-value">
            {duration.primaryText}
          </span>
          {duration.secondaryText && <span className="text-[11px] text-muted-foreground">{duration.secondaryText}</span>}
          {duration.kind === "unavailable" && duration.reason && (
            <span className="text-[11px] text-muted-foreground">
              {copy.reasonPrefix}: {duration.reason}
            </span>
          )}
        </div>
        <FinancialMetricCard
          testId="summary-core-obligations"
          label={copy.summary.coreObligations}
          display={formatMoneyMetric(totalCost.calculatedCoreObligations, language, copy.unavailable)}
          status={totalCost.calculatedCoreObligations.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="summary-known-cost"
          label={copy.summary.knownCost}
          display={formatMoneyMetric(totalCost.calculatedKnownCost, language, copy.unavailable)}
          status={totalCost.calculatedKnownCost.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="summary-upfront-exposure"
          label={copy.summary.upfrontExposure}
          display={formatMoneyMetric(exposure.upfrontExposure, language, copy.unavailable)}
          status={exposure.upfrontExposure.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="summary-financing-repayment-total"
          label={copy.summary.financingRepaymentTotal}
          display={formatMoneyMetric(totalCost.financingRepaymentTotal, language, copy.unavailable)}
          status={totalCost.financingRepaymentTotal.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="summary-financing-cost"
          label={copy.summary.financingCost}
          display={formatMoneyMetric(totalCost.financingCost, language, copy.unavailable)}
          status={totalCost.financingCost.status}
          copy={copy}
        />
      </div>
    </div>
  );
}

function ObligationCard({
  obligation,
  language,
  copy,
  index,
}: {
  obligation: PaymentObligation;
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
  index: number;
}) {
  const amount = formatMoneyMetric(obligation.amount, language, copy.unavailable);
  return (
    <div
      data-testid={`financial-obligation-${index}`}
      className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
        <Wallet size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-white font-semibold">{localizeObligationLabel(obligation.label, language)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
          <span data-testid={`financial-obligation-${index}-amount`}>{amount.text}</span>
          <span>{copy.obligationTypeLabels[obligation.type]}</span>
          <span>{copy.frequencyLabels[obligation.frequency]}</span>
          {obligation.numberOfPayments !== null && (
            <span>
              {copy.duration.paymentCount}: {formatCount(obligation.numberOfPayments, language)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {obligation.mandatory === true && <Badge tone="info">{copy.paymentObligations.mandatory}</Badge>}
          {obligation.conditional === true && <Badge tone="neutral">{copy.paymentObligations.conditional}</Badge>}
        </div>
        {amount.kind === "unavailable" && amount.reason && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {copy.reasonPrefix}: {amount.reason}
          </p>
        )}
      </div>
    </div>
  );
}

function PaymentObligationsList({
  paymentObligations,
  language,
  copy,
}: {
  paymentObligations: readonly PaymentObligation[];
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  return (
    <div>
      <SectionHeading>{copy.paymentObligations.title}</SectionHeading>
      {paymentObligations.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" data-testid="payment-obligations-empty">
          {copy.paymentObligations.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {paymentObligations.map((obligation, index) => (
            <ObligationCard key={obligation.id} obligation={obligation} language={language} copy={copy} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeeCard({
  fee,
  language,
  copy,
  index,
}: {
  fee: FeeItem;
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
  index: number;
}) {
  const amount = formatMoneyMetric(fee.amount, language, copy.unavailable);
  const percentage = formatPercentageMetric(fee.percentage, language, copy.unavailable, language === "ar" ? "٪" : "%");
  const showPercentage = amount.kind === "unavailable" && percentage.kind === "value";

  return (
    <div
      data-testid={`fee-${index}`}
      className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-full bg-white/10 text-white/70 flex items-center justify-center shrink-0">
        <Receipt size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-white font-semibold">{fee.label}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
          <span data-testid={`fee-${index}-amount`}>{showPercentage ? percentage.text : amount.text}</span>
          <span>{copy.feeTypeLabels[fee.type]}</span>
          {fee.frequency && <span>{copy.frequencyLabels[fee.frequency]}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {fee.mandatory === true && <Badge tone="info">{copy.fees.mandatory}</Badge>}
          {fee.conditional === true && <Badge tone="neutral">{copy.fees.conditional}</Badge>}
          {fee.frequency && ["daily", "weekly", "monthly", "quarterly", "semi_annual", "annual"].includes(fee.frequency) && (
            <Badge tone="neutral">{copy.fees.recurring}</Badge>
          )}
          {fee.frequency === "one_time" && <Badge tone="neutral">{copy.fees.oneTime}</Badge>}
          {fee.refundable === true && <Badge tone="neutral">{copy.fees.refundable}</Badge>}
          {fee.refundable === null && <Badge tone="neutral">{copy.fees.refundabilityUnresolved}</Badge>}
        </div>
        {!showPercentage && amount.kind === "unavailable" && amount.reason && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {copy.reasonPrefix}: {amount.reason}
          </p>
        )}
      </div>
    </div>
  );
}

function FeesSection({
  fees,
  language,
  copy,
}: {
  fees: FinancialMetrics["fees"];
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  const totalKnown = formatMoneyMetric(fees.totalKnownFees, language, copy.unavailable);
  return (
    <div>
      <SectionHeading>{copy.fees.title}</SectionHeading>
      {fees.items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" data-testid="fees-empty">
          {copy.fees.empty}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {fees.items.map((fee, index) => (
              <FeeCard key={fee.id} fee={fee} language={language} copy={copy} index={index} />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground" data-testid="fees-total-known">
            {copy.fees.totalKnown}: {totalKnown.text}
          </div>
        </>
      )}
    </div>
  );
}

function PenaltyCard({
  penalty,
  language,
  copy,
  index,
}: {
  penalty: PenaltyItem;
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
  index: number;
}) {
  const amount = formatMoneyMetric(penalty.amount, language, copy.unavailable);
  const percentage = formatPercentageMetric(penalty.percentage, language, copy.unavailable, language === "ar" ? "٪" : "%");
  const showPercentage = amount.kind === "unavailable" && percentage.kind === "value";

  return (
    <div
      data-testid={`financial-penalty-${index}`}
      className="bg-white/5 border border-white/10 rounded-[16px] p-4"
    >
      <p className="text-[14px] text-white font-semibold">{penalty.label}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
        <span data-testid={`financial-penalty-${index}-amount`}>{showPercentage ? percentage.text : amount.text}</span>
        <span>{copy.penaltyTypeLabels[penalty.type]}</span>
        {penalty.trigger && <span>{penalty.trigger}</span>}
      </div>
      {!showPercentage && amount.kind === "unavailable" && amount.reason && (
        <p className="text-[11px] text-muted-foreground mt-1">
          {copy.reasonPrefix}: {amount.reason}
        </p>
      )}
    </div>
  );
}

function PenaltiesSection({
  penalties,
  language,
  copy,
}: {
  penalties: FinancialMetrics["penalties"];
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  const totalKnown = formatMoneyMetric(penalties.totalKnownPenalties, language, copy.unavailable);
  return (
    <div>
      <SectionHeading>{copy.penalties.title}</SectionHeading>
      {penalties.items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" data-testid="penalties-empty">
          {copy.penalties.empty}
        </p>
      ) : (
        <>
          <div
            data-testid="penalties-conditional-notice"
            className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-2 mb-2"
          >
            <Info size={16} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">{copy.penalties.conditionalNotice}</p>
          </div>
          <div className="flex flex-col gap-2">
            {penalties.items.map((penalty, index) => (
              <PenaltyCard key={penalty.id} penalty={penalty} language={language} copy={copy} index={index} />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground" data-testid="penalties-total-known">
            {copy.penalties.totalKnown}: {totalKnown.text}
          </div>
        </>
      )}
    </div>
  );
}

function ExposureSection({
  exposure,
  language,
  copy,
}: {
  exposure: FinancialMetrics["exposure"];
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  return (
    <div>
      <SectionHeading>{copy.exposure.title}</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="exposure-grid">
        <FinancialMetricCard
          testId="exposure-upfront"
          label={copy.exposure.upfront}
          display={formatMoneyMetric(exposure.upfrontExposure, language, copy.unavailable)}
          status={exposure.upfrontExposure.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="exposure-contingent"
          label={copy.exposure.contingent}
          display={formatMoneyMetric(exposure.contingentExposure, language, copy.unavailable)}
          status={exposure.contingentExposure.status}
          copy={copy}
        />
        <FinancialMetricCard
          testId="exposure-maximum-single-payment"
          label={copy.exposure.maximumSinglePayment}
          display={formatMoneyMetric(exposure.maximumSinglePayment, language, copy.unavailable)}
          status={exposure.maximumSinglePayment.status}
          copy={copy}
        />
      </div>

      {exposure.unquantifiedContingentExposure === true && (
        <div
          data-testid="exposure-unquantified-notice"
          className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3 flex gap-2"
        >
          <AlertCircle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[12px] text-muted-foreground leading-relaxed">{copy.exposure.unquantifiedContingent}</p>
        </div>
      )}

      {exposure.totalsByCurrency.length > 0 && (
        <div className="mt-3" data-testid="exposure-totals-by-currency">
          <p className="text-xs text-muted-foreground mb-2">{copy.exposure.totalsByCurrency}</p>
          <div className="flex flex-wrap gap-2">
            {exposure.totalsByCurrency.map((total: MoneyMetric, index: number) => {
              const display = formatMoneyMetric(total, language, copy.unavailable);
              return (
                <div
                  key={`${total.currency ?? "unknown"}-${index}`}
                  data-testid={`exposure-currency-total-${index}`}
                  className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white font-semibold"
                >
                  {display.text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const RATIO_KEYS = [
  "feesToBaseCost",
  "penaltiesToBaseCost",
  "upfrontPaymentToBaseCost",
  "balloonPaymentToBaseCost",
  "totalCostIncrease",
  "recurringPaymentToIncome",
] as const;

function FinancialRatiosGrid({
  ratios,
  language,
  copy,
}: {
  ratios: FinancialMetrics["ratios"];
  language: AnalysisLanguage;
  copy: FinancialMetricsCopy;
}) {
  return (
    <div>
      <SectionHeading>{copy.ratios.title}</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="financial-ratios-grid">
        {RATIO_KEYS.map((key) => {
          const metric: PercentageMetric = ratios[key];
          const display = formatPercentageMetric(metric, language, copy.unavailable, language === "ar" ? "٪" : "%");
          return (
            <FinancialMetricCard
              key={key}
              testId={`ratio-${key}`}
              label={copy.ratios[key]}
              display={display}
              status={metric.status}
              copy={copy}
            />
          );
        })}
      </div>
    </div>
  );
}

function CalculationDetailsList({
  titleText,
  items,
  renderItem,
  testId,
}: {
  titleText: string;
  items: readonly unknown[];
  renderItem: (item: never, index: number) => React.ReactNode;
  testId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3" data-testid={testId}>
      <p className="text-xs font-semibold text-white/80 mb-1.5">{titleText}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="text-[12px] text-muted-foreground leading-relaxed">
            {renderItem(item as never, index)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinancialCalculationDetails({
  calculationMetadata,
  copy,
}: {
  calculationMetadata: FinancialMetrics["calculationMetadata"];
  copy: FinancialMetricsCopy;
}) {
  const [expanded, setExpanded] = useState(false);
  const { warnings, conflicts, unavailableCalculations, excludedValues } = calculationMetadata;

  const isEmpty =
    warnings.length === 0 && conflicts.length === 0 && unavailableCalculations.length === 0 && excludedValues.length === 0;

  if (isEmpty) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="financial-calculation-details-panel"
        data-testid="button-toggle-calculation-details"
        className="flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex">
          <ChevronDown size={16} />
        </motion.span>
        {copy.calculationDetails.title}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            id="financial-calculation-details-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 bg-white/5 border border-white/10 rounded-[16px] p-4">
              <CalculationDetailsList
                titleText={copy.calculationDetails.warnings}
                items={warnings}
                testId="calculation-warnings"
                renderItem={(item: CalculationWarning) => item.details ?? item.messageKey}
              />
              <CalculationDetailsList
                titleText={copy.calculationDetails.conflicts}
                items={conflicts}
                testId="calculation-conflicts"
                renderItem={(item: CalculationConflict) => item.resolution ?? item.metric}
              />
              <CalculationDetailsList
                titleText={copy.calculationDetails.unavailableCalculations}
                items={unavailableCalculations}
                testId="calculation-unavailable"
                renderItem={(item: string) => item}
              />
              <CalculationDetailsList
                titleText={copy.calculationDetails.excludedValues}
                items={excludedValues}
                testId="calculation-excluded-values"
                renderItem={(item: ExcludedValue) => item.reasonCode}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FinancialMetricsErrorState({ copy }: { copy: FinancialMetricsCopy }) {
  return (
    <div
      data-testid="financial-metrics-error-state"
      className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex gap-3"
    >
      <CircleDollarSign size={20} className="text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <p className="text-[14px] text-white font-semibold">{copy.calculationFailed}</p>
        <p className="text-[13px] text-muted-foreground mt-1">{copy.calculationFailedHint}</p>
      </div>
    </div>
  );
}

export default function FinancialMetricsSection({
  financialMetrics,
  financialMetricsError,
  language,
}: {
  financialMetrics: FinancialMetrics | null | undefined;
  financialMetricsError: FinancialMetricsPublicError | null | undefined;
  language: AnalysisLanguage;
}) {
  const copy = FINANCIAL_METRICS_COPY[language];

  // Field absent (older backend response shape) — omit the section entirely.
  if (financialMetrics === undefined && financialMetricsError === undefined) {
    return null;
  }

  if (financialMetrics === null && financialMetricsError) {
    return (
      <div data-testid="financial-metrics-section">
        <h2 className="text-base font-bold text-white mb-3">{copy.title}</h2>
        <FinancialMetricsErrorState copy={copy} />
      </div>
    );
  }

  if (!financialMetrics) {
    return (
      <div data-testid="financial-metrics-section">
        <h2 className="text-base font-bold text-white mb-3">{copy.title}</h2>
        <p className="text-[13px] text-muted-foreground" data-testid="financial-metrics-unavailable">
          {copy.noDataState}
        </p>
      </div>
    );
  }

  const headlineMetrics: MoneyMetric[] = [
    financialMetrics.recurringCommitment.monthlyEquivalent,
    financialMetrics.recurringCommitment.annualEquivalent,
    financialMetrics.totalCost.calculatedCoreObligations,
    financialMetrics.totalCost.calculatedKnownCost,
    financialMetrics.exposure.upfrontExposure,
  ];
  const hasPartialData = headlineMetrics.some((metric) => metric.status === "unavailable");

  return (
    <div className="flex flex-col gap-8" data-testid="financial-metrics-section">
      <div>
        <h2 className="text-base font-bold text-white" data-testid="financial-metrics-title">
          {copy.title}
        </h2>
        {hasPartialData && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="financial-metrics-partial-notice">
            {copy.partial}
          </p>
        )}
      </div>

      <FinancialSummaryGrid financialMetrics={financialMetrics} language={language} copy={copy} />
      <PaymentObligationsList paymentObligations={financialMetrics.paymentObligations} language={language} copy={copy} />
      <FeesSection fees={financialMetrics.fees} language={language} copy={copy} />
      <PenaltiesSection penalties={financialMetrics.penalties} language={language} copy={copy} />
      <ExposureSection exposure={financialMetrics.exposure} language={language} copy={copy} />
      <FinancialRatiosGrid ratios={financialMetrics.ratios} language={language} copy={copy} />
      <FinancialCalculationDetails calculationMetadata={financialMetrics.calculationMetadata} copy={copy} />
    </div>
  );
}
