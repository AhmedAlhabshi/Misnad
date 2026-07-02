import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Shield, Archive, Sparkles, Car, CreditCard, Home, Smartphone, ShieldCheck, FileText } from "lucide-react";

const CONTRACT_TYPES = [
  { id: "car", label: "تمويل سيارة", icon: <Car size={16} /> },
  { id: "credit", label: "بطاقة ائتمانية", icon: <CreditCard size={16} /> },
  { id: "home", label: "تمويل عقاري", icon: <Home size={16} /> },
  { id: "sub", label: "اشتراك", icon: <Smartphone size={16} /> },
  { id: "insurance", label: "تأمين", icon: <ShieldCheck size={16} /> },
  { id: "job", label: "عقد عمل", icon: <FileText size={16} /> },
];

export default function HomeScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [selectedType, setSelectedType] = useState("car");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-6 flex flex-col gap-8 min-h-screen"
    >
      {/* Topbar */}
      <div className="flex justify-between items-center w-full">
        <div>
          <h1 className="text-[28px] font-black text-white leading-tight tracking-tight">مِسناد</h1>
          <p className="text-[13px] text-muted-foreground">افهم عقودك قبل التوقيع</p>
        </div>
        <div className="px-3 py-1.5 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white text-xs font-semibold flex items-center gap-1.5">
          <Sparkles size={14} />
          <span>AI مدعوم بـ</span>
        </div>
      </div>

      {/* Upload Card */}
      <div className="relative animate-dash-border p-8 flex flex-col items-center justify-center text-center gap-4 transition-all duration-300 hover:bg-white/5 cursor-pointer">
        <div className="w-16 h-16 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] flex items-center justify-center text-white mb-2 shadow-lg shadow-indigo-500/20">
          <Upload size={32} />
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-white mb-1">ارفع عقدك</h2>
          <p className="text-sm text-muted-foreground">PDF أو صورة — نحلله في ثوانٍ</p>
        </div>
      </div>

      {/* Contract Types */}
      <div className="flex flex-col gap-3">
        <span className="text-xs text-muted-foreground font-semibold px-1">نوع العقد</span>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_TYPES.map((type) => {
            const isSelected = selectedType === type.id;
            return (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`h-10 px-4 rounded-full flex items-center gap-2 text-sm transition-all duration-200 ${
                  isSelected
                    ? "bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white shadow-md shadow-indigo-500/25 border-transparent"
                    : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
                }`}
              >
                <span className="opacity-70">{type.icon}</span>
                <span className="font-semibold">{type.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Primary CTA */}
      <motion.button
        whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(99,102,241,0.5)" }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onNavigate("loading")}
        className="w-full h-[52px] mt-4 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25"
      >
        <span>تحليل العقد</span>
        <Sparkles size={18} />
      </motion.button>

      {/* Privacy Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-[-10px]">
        <Shield size={14} className="text-emerald-500" />
        <span>ملفك لا يُخزّن — يُحلّل ويُحذف فوراً</span>
      </div>

      <div className="mt-auto pt-6 flex justify-center pb-4">
        <button 
          onClick={() => onNavigate("archive")}
          className="flex items-center gap-2 text-sm text-indigo-400 font-semibold hover:text-indigo-300 transition-colors"
        >
          <Archive size={16} />
          <span>عقودي المحفوظة</span>
        </button>
      </div>
    </motion.div>
  );
}
