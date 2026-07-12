import { useState, type ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Users,
  Calendar,
  Receipt,
  Landmark,
  Hash,
  HelpCircle,
  Info,
  FileWarning,
} from "lucide-react";
import {
  CONTRACT_TYPE_LABELS_AR,
  CONTRACT_TYPE_LABELS_EN,
  type ContractType,
} from "@workspace/contract-types";
import { getFieldLabel } from "@/lib/fieldLabels";
import type {
  StoredAnalysisResult,
  ImportantClause,
  RiskLevel,
} from "@/types/analysis";

interface ResultsCopy {
  back: string;
  noResult: string;
  clausesTitle: string;
  financialObligationsTitle: string;
  penaltiesTitle: string;
  feesTitle: string;
  datesTitle: string;
  partiesTitle: string;
  extractedNumbersTitle: string;
  missingInfoTitle: string;
  extractionNotesTitle: string;
  evidenceLabel: string;
  riskHigh: string;
  riskMedium: string;
  riskLow: string;
  recurring: string;
  oneTime: string;
  reasonPrefix: string;
  months: string;
  years: string;
  days: string;
  percent: string;
}

const COPY: Record<"ar" | "en", ResultsCopy> = {
  ar: {
    back: "الرئيسية",
    noResult: "لا توجد نتيجة تحليل متاحة حالياً.",
    clausesTitle: "البنود التي تحتاج انتباهك",
    financialObligationsTitle: "الالتزامات المالية",
    penaltiesTitle: "الغرامات",
    feesTitle: "الرسوم",
    datesTitle: "تواريخ مهمة",
    partiesTitle: "أطراف العقد",
    extractedNumbersTitle: "أرقام مستخرجة من العقد",
    missingInfoTitle: "معلومات غير متوفرة في العقد",
    extractionNotesTitle: "ملاحظات على استخراج النص",
    evidenceLabel: getFieldLabel("importantClauses.evidence", "ar"),
    riskHigh: "مرتفع",
    riskMedium: "متوسط",
    riskLow: "منخفض",
    recurring: "متكررة",
    oneTime: "لمرة واحدة",
    reasonPrefix: "السبب",
    months: "شهر",
    years: "سنة",
    days: "يوم",
    percent: "٪",
  },
  en: {
    back: "Home",
    noResult: "No analysis result is currently available.",
    clausesTitle: "Clauses that need your attention",
    financialObligationsTitle: "Financial obligations",
    penaltiesTitle: "Penalties",
    feesTitle: "Fees",
    datesTitle: "Important dates",
    partiesTitle: "Contract parties",
    extractedNumbersTitle: "Numbers extracted from the contract",
    missingInfoTitle: "Information not found in the contract",
    extractionNotesTitle: "Text extraction notes",
    evidenceLabel: getFieldLabel("importantClauses.evidence", "en"),
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",
    recurring: "Recurring",
    oneTime: "One-time",
    reasonPrefix: "Reason",
    months: "mo",
    years: "yr",
    days: "day(s)",
    percent: "%",
  },
};

type OverviewKind = "amount" | "percent" | "months" | "years" | "days";

interface OverviewFieldDef {
  key: string;
  kind: OverviewKind;
}

/**
 * Which typeDetails fields are shown as compact overview cards, per
 * contract type. Only real, directly-available structured values — no
 * derived ratios, scores, or recommendations of any kind.
 */
const OVERVIEW_FIELDS_BY_TYPE: Record<ContractType, OverviewFieldDef[]> = {
  auto_finance: [
    { key: "financedAmount", kind: "amount" },
    { key: "monthlyInstallment", kind: "amount" },
    { key: "loanTermMonths", kind: "months" },
    { key: "interestRate", kind: "percent" },
    { key: "downPayment", kind: "amount" },
    { key: "balloonPayment", kind: "amount" },
  ],
  personal_finance: [
    { key: "loanAmount", kind: "amount" },
    { key: "monthlyInstallment", kind: "amount" },
    { key: "loanTermMonths", kind: "months" },
    { key: "interestRate", kind: "percent" },
  ],
  mortgage: [
    { key: "loanAmount", kind: "amount" },
    { key: "monthlyInstallment", kind: "amount" },
    { key: "loanTermYears", kind: "years" },
    { key: "interestRate", kind: "percent" },
    { key: "downPayment", kind: "amount" },
    { key: "propertyValue", kind: "amount" },
  ],
  credit_card: [
    { key: "creditLimit", kind: "amount" },
    { key: "interestRateApr", kind: "percent" },
    { key: "annualFee", kind: "amount" },
    { key: "minimumPaymentPercentage", kind: "percent" },
  ],
  lease: [
    { key: "monthlyRent", kind: "amount" },
    { key: "securityDeposit", kind: "amount" },
    { key: "leaseTermMonths", kind: "months" },
  ],
  insurance: [
    { key: "coverageAmount", kind: "amount" },
    { key: "premiumAmount", kind: "amount" },
    { key: "deductible", kind: "amount" },
    { key: "policyTermMonths", kind: "months" },
  ],
  employment: [
    { key: "baseSalary", kind: "amount" },
    { key: "probationPeriodMonths", kind: "months" },
    { key: "noticePeriodDays", kind: "days" },
  ],
  subscription: [
    { key: "billingAmount", kind: "amount" },
    { key: "freeTrialDays", kind: "days" },
  ],
  other: [],
};

function formatOverviewValue(
  value: number,
  kind: OverviewKind,
  copy: ResultsCopy,
): string {
  const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  switch (kind) {
    case "percent":
      return `${rounded}${copy.percent}`;
    case "months":
      return `${rounded} ${copy.months}`;
    case "years":
      return `${rounded} ${copy.years}`;
    case "days":
      return `${rounded} ${copy.days}`;
    case "amount":
    default:
      return rounded;
  }
}

function riskRank(level: RiskLevel | null): number {
  if (level === "high") return 0;
  if (level === "medium") return 1;
  if (level === "low") return 2;
  return 3;
}

function riskStyles(level: RiskLevel | null): { border: string; badgeBg: string; icon: ReactElement } {
  if (level === "high") {
    return {
      border: "border-red-500",
      badgeBg: "bg-[linear-gradient(135deg,#EF4444,#F97316)]",
      icon: <ShieldAlert size={20} />,
    };
  }
  if (level === "medium") {
    return {
      border: "border-amber-500",
      badgeBg: "bg-[linear-gradient(135deg,#F59E0B,#EAB308)]",
      icon: <AlertTriangle size={20} />,
    };
  }
  if (level === "low") {
    return {
      border: "border-emerald-500",
      badgeBg: "bg-[linear-gradient(135deg,#10B981,#059669)]",
      icon: <ShieldCheck size={20} />,
    };
  }
  return {
    border: "border-white/10",
    badgeBg: "bg-white/10",
    icon: <Info size={20} />,
  };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-white mb-3">{children}</h2>;
}

function ClauseCard({
  clause,
  index,
  lang,
  copy,
  expanded,
  onToggle,
}: {
  clause: ImportantClause;
  index: number;
  lang: "ar" | "en";
  copy: ResultsCopy;
  expanded: boolean;
  onToggle: () => void;
}) {
  const styles = riskStyles(clause.riskLevel);
  const riskLabel =
    clause.riskLevel === "high"
      ? copy.riskHigh
      : clause.riskLevel === "medium"
        ? copy.riskMedium
        : clause.riskLevel === "low"
          ? copy.riskLow
          : null;

  return (
    <div
      data-testid={`clause-card-${index}`}
      className={`bg-white/5 border-r-4 ${styles.border} border-y border-l border-white/10 rounded-[16px] p-4 relative overflow-hidden`}
    >
      {riskLabel && (
        <div
          className={`absolute top-4 ${lang === "ar" ? "left-4" : "right-4"} h-6 px-3 ${styles.badgeBg} rounded-full text-[11px] font-bold text-white flex items-center`}
        >
          {riskLabel}
        </div>
      )}
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-white/80">
          {styles.icon}
        </div>
        <div className="pt-1 flex-1 min-w-0">
          <h3 className="font-bold text-white text-[15px] mb-1 pr-16">{clause.title}</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{clause.summary}</p>

          {clause.evidence && (
            <div className="mt-3">
              <button
                onClick={onToggle}
                data-testid={`button-toggle-evidence-${index}`}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex">
                  <ChevronDown size={14} />
                </motion.span>
                {copy.evidenceLabel}
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <blockquote
                      dir="auto"
                      data-testid={`text-evidence-${index}`}
                      className="mt-2 border-r-2 border-indigo-500/40 pr-3 text-[13px] text-white/70 leading-relaxed italic"
                    >
                      {clause.evidence}
                    </blockquote>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResultsScreen({
  onNavigate,
  analysisResult,
}: {
  onNavigate: (s: string) => void;
  analysisResult?: StoredAnalysisResult | null;
}) {
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());

  const lang = analysisResult?.analysisLanguage ?? "ar";
  const copy = COPY[lang];
  const isAr = lang === "ar";
  const analysis = analysisResult?.analysis ?? null;

  if (!analysisResult || !analysis) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        dir={isAr ? "rtl" : "ltr"}
        className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center"
      >
        <FileWarning size={40} className="text-muted-foreground" />
        <p className="text-white/80">{copy.noResult}</p>
        <button
          onClick={() => onNavigate("home")}
          data-testid="button-back-home-from-results"
          className="h-11 px-6 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold"
        >
          {copy.back}
        </button>
      </motion.div>
    );
  }

  function toggleEvidence(index: number) {
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const contractTypeLabel = isAr
    ? CONTRACT_TYPE_LABELS_AR[analysis.contractType]
    : CONTRACT_TYPE_LABELS_EN[analysis.contractType];

  const overviewFields = OVERVIEW_FIELDS_BY_TYPE[analysis.contractType] ?? [];
  const overviewCards = overviewFields
    .map((def) => ({ def, value: analysis.typeDetails[def.key] }))
    .filter((entry): entry is { def: OverviewFieldDef; value: number } => typeof entry.value === "number");

  const sortedClauses = [...analysis.importantClauses].sort(
    (a, b) => riskRank(a.riskLevel) - riskRank(b.riskLevel),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      dir={isAr ? "rtl" : "ltr"}
      className="flex flex-col h-[100dvh] relative"
    >
      {/* Top Header */}
      <div className="pt-6 pb-4 px-6 flex justify-between items-center bg-[#0D1117]/80 backdrop-blur-md sticky top-0 z-10 border-b border-white/5">
        <button
          onClick={() => onNavigate("home")}
          data-testid="button-back-home"
          className="h-8 px-3 rounded-full bg-white/5 border border-white/10 flex items-center gap-1 text-sm font-semibold text-white"
        >
          <ChevronRight size={16} className={isAr ? "" : "rotate-180"} />
          <span>{copy.back}</span>
        </button>
        <span className="text-xs text-muted-foreground truncate max-w-[45%]">
          {analysisResult.fileName}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 px-6 pt-5 flex flex-col gap-8">
        {/* 4.1 Header / contract overview */}
        <div>
          <h1 className="text-[22px] font-bold text-white" data-testid="text-contract-type-heading">
            {contractTypeLabel}
          </h1>
        </div>

        {/* 4.2 Dynamic overview cards */}
        {overviewCards.length > 0 && (
          <div className="grid grid-cols-2 gap-3" data-testid="overview-cards">
            {overviewCards.map(({ def, value }) => (
              <div
                key={def.key}
                data-testid={`overview-card-${def.key}`}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-1"
              >
                <span className="text-xs text-muted-foreground">{getFieldLabel(`typeDetails.${def.key}`, lang)}</span>
                <span className="text-xl font-bold text-white">{formatOverviewValue(value, def.kind, copy)}</span>
              </div>
            ))}
          </div>
        )}

        {/* 4.3 Clauses that need your attention */}
        {sortedClauses.length > 0 && (
          <div>
            <SectionHeading>{copy.clausesTitle}</SectionHeading>
            <div className="flex flex-col gap-3">
              {sortedClauses.map((clause, index) => (
                <ClauseCard
                  key={index}
                  clause={clause}
                  index={index}
                  lang={lang}
                  copy={copy}
                  expanded={expandedEvidence.has(index)}
                  onToggle={() => toggleEvidence(index)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 4.4 Financial obligations */}
        {analysis.financialObligations.length > 0 && (
          <div>
            <SectionHeading>{copy.financialObligationsTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.financialObligations.map((item, index) => (
                <div
                  key={index}
                  data-testid={`financial-obligation-${index}`}
                  className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                    <Landmark size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-white font-semibold">{item.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {item.amount !== null && (
                        <span>
                          {item.amount}
                          {item.currency ? ` ${item.currency}` : ""}
                        </span>
                      )}
                      {item.frequency && <span>{item.frequency}</span>}
                      {item.dueDate && <span>{item.dueDate}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.5 Penalties */}
        {analysis.penalties.length > 0 && (
          <div>
            <SectionHeading>{copy.penaltiesTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.penalties.map((item, index) => (
                <div
                  key={index}
                  data-testid={`penalty-${index}`}
                  className="bg-white/5 border-r-4 border-amber-500 border-y border-l border-white/10 rounded-[16px] p-4"
                >
                  <p className="text-[14px] text-white font-semibold">{item.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    {item.amount !== null && (
                      <span>
                        {item.amount}
                        {item.currency ? ` ${item.currency}` : ""}
                      </span>
                    )}
                    {item.condition && <span>{item.condition}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.6 Fees */}
        {analysis.fees.length > 0 && (
          <div>
            <SectionHeading>{copy.feesTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.fees.map((item, index) => (
                <div
                  key={index}
                  data-testid={`fee-${index}`}
                  className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 text-white/70 flex items-center justify-center shrink-0">
                    <Receipt size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-white font-semibold">{item.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {item.amount !== null && (
                        <span>
                          {item.amount}
                          {item.currency ? ` ${item.currency}` : ""}
                        </span>
                      )}
                      {item.isRecurring !== null && (
                        <span>{item.isRecurring ? copy.recurring : copy.oneTime}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.7 Important dates */}
        {analysis.dates.length > 0 && (
          <div>
            <SectionHeading>{copy.datesTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.dates.map((item, index) => (
                <div
                  key={index}
                  data-testid={`date-item-${index}`}
                  className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-white font-semibold">{item.label}</p>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {item.date && <span>{item.date}</span>}
                      {item.notes && <span>{item.notes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.8 Contract parties */}
        {analysis.parties.length > 0 && (
          <div>
            <SectionHeading>{copy.partiesTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.parties.map((item, index) => (
                <div
                  key={index}
                  data-testid={`party-${index}`}
                  className="bg-white/5 border border-white/10 rounded-[16px] p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Users size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-white font-semibold">{item.role}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {item.name && <span>{item.name}</span>}
                      {item.identifier && <span>{item.identifier}</span>}
                      {item.notes && <span>{item.notes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.9 Extracted numbers */}
        {analysis.extractedNumbers.length > 0 && (
          <div>
            <SectionHeading>{copy.extractedNumbersTitle}</SectionHeading>
            <div className="flex flex-wrap gap-2">
              {analysis.extractedNumbers.map((item, index) => (
                <div
                  key={index}
                  data-testid={`extracted-number-${index}`}
                  className="bg-white/5 border border-white/10 rounded-full px-3 py-1.5 flex items-center gap-2 text-xs"
                >
                  <Hash size={12} className="text-muted-foreground" />
                  <span className="text-muted-foreground">{item.label}:</span>
                  <span className="text-white font-semibold">
                    {item.value}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.10 Missing information */}
        {analysis.missingInformation.length > 0 && (
          <div>
            <SectionHeading>{copy.missingInfoTitle}</SectionHeading>
            <div className="flex flex-col gap-2">
              {analysis.missingInformation.map((item, index) => (
                <div
                  key={index}
                  data-testid={`missing-info-${index}`}
                  className="bg-white/5 border border-white/10 rounded-[16px] p-3 flex items-start gap-3"
                >
                  <div className="w-7 h-7 rounded-full bg-white/10 text-muted-foreground flex items-center justify-center shrink-0 mt-0.5">
                    <HelpCircle size={14} />
                  </div>
                  <div className="flex-1 min-w-0 text-[13px]">
                    <span className="text-white/90 font-medium">{getFieldLabel(item.field, lang)}</span>
                    {item.reason && (
                      <span className="text-muted-foreground">
                        {" — "}
                        {item.reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4.11 Extraction notes */}
        {analysis.extractionNotes && (
          <div
            data-testid="extraction-notes"
            className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3"
          >
            <Info size={18} className="text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[13px] text-muted-foreground leading-relaxed">{analysis.extractionNotes}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
