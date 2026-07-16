import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PendingUpload, StoredAnalysisResult } from "@/types/analysis";
import HomeScreen from "./pages/HomeScreen";
import LoadingScreen from "./pages/LoadingScreen";
import ResultsScreen from "./pages/ResultsScreen";

/**
 * Misnad V2's own top-level shell — mirrors V1's `App.tsx` screen-switch
 * state machine exactly (same three states, same `PendingUpload`/
 * `StoredAnalysisResult` types, same object-URL revocation on a new
 * upload) so the underlying flow/business logic is identical; only the
 * visual layer and page components differ. Deliberately never touches
 * `document.documentElement` — the light `.misnad-v2` theme and `dir` are
 * scoped to this component's own root wrapper, so switching `UI_VERSION`
 * back to `"v1"` (see `src/uiVersion.ts`) can never leave a stray class or
 * attribute behind on the page's root element.
 */
export default function AppV2() {
  const [currentScreen, setCurrentScreen] = useState("home");
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [analysisResult, setAnalysisResult] = useState<StoredAnalysisResult | null>(null);

  function handleStartAnalysis(upload: PendingUpload) {
    setAnalysisResult((previous) => {
      if (previous?.contractObjectUrl) {
        URL.revokeObjectURL(previous.contractObjectUrl);
      }
      return null;
    });
    setPendingUpload(upload);
  }

  return (
    <div className="misnad-v2 min-h-[100dvh] w-full bg-background text-foreground" dir="rtl">
      <TooltipProvider>
        <div className="mx-auto min-h-[100dvh] w-full max-w-5xl">
          <AnimatePresence mode="wait">
            {currentScreen === "home" && (
              <HomeScreen key="home" onNavigate={setCurrentScreen} onStartAnalysis={handleStartAnalysis} />
            )}
            {currentScreen === "loading" && (
              <LoadingScreen
                key="loading"
                onNavigate={setCurrentScreen}
                pendingUpload={pendingUpload}
                onAnalysisComplete={setAnalysisResult}
              />
            )}
            {currentScreen === "results" && (
              <ResultsScreen key="results" onNavigate={setCurrentScreen} analysisResult={analysisResult} />
            )}
          </AnimatePresence>
        </div>
        <Toaster />
      </TooltipProvider>
    </div>
  );
}
