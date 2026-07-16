import { Document, Page, Text, View, Font, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ReportSummaryData } from "@/lib/reportSummary";
import { REPORT_SUMMARY_COPY } from "@/lib/reportSummaryCopy";
// Vite resolves this to a hashed, same-origin static asset URL at build time —
// never inlined as a string the user could mistake for an external resource,
// and never fetched from any third-party host.
import cairoFontUrl from "@/assets/fonts/Cairo-Variable.ttf?url";

const DEEP_GREEN = "#065F46";
const DARK_GRAY = "#1F2937";
const MUTED_GRAY = "#6B7280";
const BORDER_GRAY = "#E5E7EB";
const RISK_COLORS = { high: "#B91C1C", medium: "#B45309", low: DEEP_GREEN } as const;

let fontRegistered = false;

/** Registers the bundled Cairo font (once) — its OpenType tables give `@react-pdf/renderer`'s fontkit-based layout engine real Arabic contextual shaping (initial/medial/final letterforms), not just raw glyph placement. */
function ensureFontRegistered(): void {
  if (fontRegistered) return;
  Font.register({ family: "Cairo", src: cairoFontUrl });
  Font.registerHyphenationCallback((word) => [word]); // never hyphen-break Arabic/English words mid-word
  fontRegistered = true;
}

/** Exported for direct unit testing of RTL/LTR layout without invoking the full PDF render pipeline. */
export function buildStyles(isRtl: boolean) {
  const textAlign = isRtl ? "right" : "left";
  return StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingBottom: 48,
      paddingHorizontal: 40,
      fontFamily: "Cairo",
      fontSize: 10,
      color: DARK_GRAY,
      direction: isRtl ? "rtl" : "ltr",
    },
    header: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: DEEP_GREEN, paddingBottom: 10 },
    headerTitle: { fontSize: 18, color: DEEP_GREEN, marginBottom: 4, textAlign },
    headerMeta: { fontSize: 9, color: MUTED_GRAY, textAlign },
    section: { marginBottom: 16 },
    sectionTitle: { fontSize: 12, color: DEEP_GREEN, marginBottom: 8, textAlign },
    figuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    figureBlock: {
      width: "47%",
      borderWidth: 1,
      borderColor: BORDER_GRAY,
      borderRadius: 4,
      padding: 8,
    },
    figureLabel: { fontSize: 8, color: MUTED_GRAY, marginBottom: 3, textAlign },
    figureValue: { fontSize: 12, color: DARK_GRAY, textAlign },
    findingRow: { borderBottomWidth: 1, borderBottomColor: BORDER_GRAY, paddingVertical: 7 },
    findingHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
    findingTitle: { fontSize: 10.5, color: DARK_GRAY, textAlign, flex: 1 },
    findingRisk: { fontSize: 8, fontWeight: 700 },
    findingSummary: { fontSize: 9, color: MUTED_GRAY, textAlign, lineHeight: 1.4 },
    paragraphBox: { borderWidth: 1, borderColor: BORDER_GRAY, borderRadius: 4, padding: 10 },
    paragraphText: { fontSize: 9.5, color: DARK_GRAY, textAlign, lineHeight: 1.5 },
    tableRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: BORDER_GRAY,
      paddingVertical: 6,
    },
    tableLabel: { fontSize: 9.5, color: MUTED_GRAY, textAlign },
    tableValue: { fontSize: 9.5, color: DARK_GRAY, fontWeight: 700, textAlign: isRtl ? "left" : "right" },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      borderTopWidth: 1,
      borderTopColor: BORDER_GRAY,
      paddingTop: 8,
    },
    footerText: { fontSize: 7.5, color: MUTED_GRAY, textAlign: "center" },
    footerPage: { fontSize: 7.5, color: MUTED_GRAY, textAlign: "center", marginTop: 3 },
  });
}

function riskLabel(risk: string | null | undefined, labels: { high: string; medium: string; low: string }): string | null {
  if (risk === "high") return labels.high;
  if (risk === "medium") return labels.medium;
  if (risk === "low") return labels.low;
  return null;
}

function ReportDocument({ data }: { data: ReportSummaryData }) {
  const isRtl = data.language === "ar";
  const styles = buildStyles(isRtl);
  const copy = REPORT_SUMMARY_COPY[data.language].pdf;
  const generatedDate = new Date(data.generatedAt).toLocaleDateString(data.language === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Document title={`${copy.headerTitle} — ${data.contract.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>{copy.headerTitle}</Text>
          <Text style={styles.headerMeta}>{data.contract.title}</Text>
          <Text style={styles.headerMeta}>
            {copy.generatedOnLabel}: {generatedDate}
          </Text>
        </View>

        {data.keyFinancialFigures.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{copy.keyFiguresTitle}</Text>
            <View style={styles.figuresGrid}>
              {data.keyFinancialFigures.map((figure) => (
                <View key={figure.key} style={styles.figureBlock}>
                  <Text style={styles.figureLabel}>{figure.label}</Text>
                  <Text style={styles.figureValue}>{figure.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.findingsTitle}</Text>
          {data.importantFindings.length === 0 ? (
            <Text style={styles.paragraphText}>{copy.findingsEmpty}</Text>
          ) : (
            data.importantFindings.map((finding, index) => {
              const label = riskLabel(finding.riskLevel, copy.riskLabels);
              const color = finding.riskLevel ? RISK_COLORS[finding.riskLevel as "high" | "medium" | "low"] : MUTED_GRAY;
              return (
                <View key={index} style={styles.findingRow}>
                  <View style={styles.findingHeaderRow}>
                    <Text style={styles.findingTitle}>{finding.title}</Text>
                    {label && <Text style={{ ...styles.findingRisk, color }}>{label}</Text>}
                  </View>
                  {finding.summary && <Text style={styles.findingSummary}>{finding.summary}</Text>}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.conclusionTitle}</Text>
          <View style={styles.paragraphBox}>
            <Text style={styles.paragraphText}>{data.conclusion}</Text>
          </View>
        </View>

        {data.personalized && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{copy.personalizedTitle}</Text>
            <View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.monthlyIncome}</Text>
                <Text style={styles.tableValue}>{data.personalized.monthlyIncome}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.existingMonthlyObligations}</Text>
                <Text style={styles.tableValue}>{data.personalized.existingMonthlyObligations}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.newContractCommitment}</Text>
                <Text style={styles.tableValue}>{data.personalized.newContractCommitment}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.totalMonthlyObligations}</Text>
                <Text style={styles.tableValue}>{data.personalized.totalMonthlyObligations}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.obligationToIncomeRatio}</Text>
                <Text style={styles.tableValue}>{data.personalized.obligationToIncomeRatio}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>{copy.personalized.remainingMonthlyAmount}</Text>
                <Text style={styles.tableValue}>{data.personalized.remainingMonthlyAmount}</Text>
              </View>
            </View>
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 9, color: MUTED_GRAY, marginBottom: 4, textAlign: isRtl ? "right" : "left" }}>
                {copy.personalized.conclusionLabel}
              </Text>
              <View style={styles.paragraphBox}>
                <Text style={styles.paragraphText}>{data.personalized.conclusion}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{copy.footerDisclaimer}</Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) => (totalPages > 1 ? copy.pageLabel(pageNumber, totalPages) : "")}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Builds a clear, language-aware filename — never includes raw user financial figures. */
export function buildReportFileName(data: ReportSummaryData): string {
  const datePart = data.generatedAt.slice(0, 10); // YYYY-MM-DD
  const base = data.language === "ar" ? "خلاصة-تحليل-العقد" : "misnad-contract-summary";
  const suffix = data.personalized ? (data.language === "ar" ? "الخلاصة-والتحليل-الشخصي" : "with-personalized-analysis") : "";
  return suffix ? `${base}-${suffix}-${datePart}.pdf` : `${base}-${datePart}.pdf`;
}

/**
 * Generates the report PDF entirely client-side and returns it as a `Blob`
 * — never uploads `data` anywhere, never persists it. The caller is
 * responsible for creating/revoking any object URL used to trigger the
 * download and for discarding the blob afterward.
 */
export async function generateReportPdfBlob(data: ReportSummaryData): Promise<Blob> {
  ensureFontRegistered();
  const instance = pdf(<ReportDocument data={data} />);
  return instance.toBlob();
}

export { ReportDocument };
