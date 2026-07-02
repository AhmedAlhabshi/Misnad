import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, CheckCircle2, Loader2, Clock } from "lucide-react";

const STEPS = [
  "قراءة الوثيقة",
  "تحليل البنود",
  "كشف المخاطر",
  "إعداد التقرير"
];

export default function LoadingScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step > STEPS.length) {
        clearInterval(interval);
        onNavigate("results");
      } else {
        setCurrentStep(step);
      }
    }, 800);
    return () => clearInterval(interval);
  }, [onNavigate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="p-6 flex flex-col items-center justify-center min-h-screen gap-10"
    >
      <div className="relative w-[140px] h-[140px] flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <defs>
            <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <circle
            cx="70"
            cy="70"
            r="64"
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="6"
          />
          <motion.circle
            cx="70"
            cy="70"
            r="64"
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth="6"
            strokeLinecap="round"
            initial={{ strokeDasharray: "0 400" }}
            animate={{ strokeDasharray: "400 400" }}
            transition={{ duration: 3.2, ease: "linear" }}
          />
        </svg>
        <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-indigo-400">
          <FileText size={32} />
        </div>
      </div>

      <h2 className="text-xl font-bold text-white tracking-wide">جاري تحليل عقدك...</h2>

      <div className="w-full flex flex-col gap-3">
        {STEPS.map((step, idx) => {
          const isPending = idx >= currentStep;
          const isActive = idx === currentStep - 1;
          const isDone = idx < currentStep - 1;

          return (
            <div
              key={idx}
              className={`h-[52px] rounded-xl flex items-center px-4 gap-4 transition-all duration-300 ${
                isActive ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-white/5 border border-white/5"
              } ${isDone ? "bg-emerald-500/10 border-emerald-500/20" : ""}`}
            >
              <div className="shrink-0 w-6 flex justify-center">
                {isDone ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: [1.2, 1] }}>
                    <CheckCircle2 size={20} className="text-emerald-500" />
                  </motion.div>
                ) : isActive ? (
                  <Loader2 size={20} className="text-indigo-400 animate-spin" />
                ) : (
                  <Clock size={20} className="text-muted-foreground/50" />
                )}
              </div>
              <span
                className={`font-semibold text-[15px] ${
                  isDone ? "text-emerald-500 line-through opacity-80" : isActive ? "text-indigo-400" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 w-full">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-500">
          💡
        </div>
        <p className="text-[13px] text-amber-200/90 leading-relaxed font-medium">
          هل تعلم؟ 68% من الناس لا يقرؤون عقودهم كاملاً قبل التوقيع.
        </p>
      </div>
    </motion.div>
  );
}
