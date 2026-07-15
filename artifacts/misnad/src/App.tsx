import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomeScreen from "./pages/HomeScreen";
import LoadingScreen from "./pages/LoadingScreen";
import ResultsScreen from "./pages/ResultsScreen";
import ArchiveScreen from "./pages/ArchiveScreen";
import type { PendingUpload, StoredAnalysisResult } from "@/types/analysis";

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [analysisResult, setAnalysisResult] = useState<StoredAnalysisResult | null>(null);

  // Starting a new upload discards the previous result (analysis and
  // financial metrics together) so a stale result can never be shown
  // alongside a new in-progress analysis. Any object URL created for the
  // previous result's PDF viewer is revoked here too — React state
  // replacement alone does not release a blob URL.
  function handleStartAnalysis(upload: PendingUpload) {
    setAnalysisResult((previous) => {
      if (previous?.contractObjectUrl) {
        URL.revokeObjectURL(previous.contractObjectUrl);
      }
      return null;
    });
    setPendingUpload(upload);
  }

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("dir", "rtl");
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto relative overflow-x-hidden bg-[#0D1117] text-white selection:bg-indigo-500/30">
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
          {currentScreen === "archive" && <ArchiveScreen key="archive" onNavigate={setCurrentScreen} />}
        </AnimatePresence>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
