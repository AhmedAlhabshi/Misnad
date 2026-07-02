import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import HomeScreen from "./pages/HomeScreen";
import LoadingScreen from "./pages/LoadingScreen";
import ResultsScreen from "./pages/ResultsScreen";
import ArchiveScreen from "./pages/ArchiveScreen";

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("dir", "rtl");
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-[100dvh] w-full max-w-[480px] mx-auto relative overflow-hidden bg-[#0D1117] text-white selection:bg-indigo-500/30">
        <AnimatePresence mode="wait">
          {currentScreen === "home" && <HomeScreen key="home" onNavigate={setCurrentScreen} />}
          {currentScreen === "loading" && <LoadingScreen key="loading" onNavigate={setCurrentScreen} />}
          {currentScreen === "results" && <ResultsScreen key="results" onNavigate={setCurrentScreen} />}
          {currentScreen === "archive" && <ArchiveScreen key="archive" onNavigate={setCurrentScreen} />}
        </AnimatePresence>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
