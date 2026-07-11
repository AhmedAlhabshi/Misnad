import { useState, useRef, type ReactElement } from "react";
import { motion } from "framer-motion";
import { Upload, Shield, Archive, Sparkles, Car, CreditCard, Home, Smartphone, ShieldCheck, FileText, Loader2 } from "lucide-react";
import type { ContractType } from "@workspace/contract-types";

const CONTRACT_TYPES: { id: ContractType; label: string; icon: ReactElement }[] = [
  { id: "auto_finance", label: "تمويل سيارة", icon: <Car size={16} /> },
  { id: "credit_card", label: "بطاقة ائتمانية", icon: <CreditCard size={16} /> },
  { id: "mortgage", label: "تمويل عقاري", icon: <Home size={16} /> },
  { id: "subscription", label: "اشتراك", icon: <Smartphone size={16} /> },
  { id: "insurance", label: "تأمين", icon: <ShieldCheck size={16} /> },
  { id: "employment", label: "عقد عمل", icon: <FileText size={16} /> },
];

export default function HomeScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [selectedType, setSelectedType] = useState<ContractType>("auto_finance");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("يُقبل ملف PDF فقط");
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("userSelectedContractType", selectedType);

      const res = await fetch("/api/analyze-contract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? "فشل رفع الملف");
      }

      onNavigate("loading");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ أثناء الرفع");
    } finally {
      setUploading(false);
    }
  }

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
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-testid="input-file-upload"
        onChange={handleFileChange}
      />
      <motion.div
        whileHover={{ backgroundColor: "rgba(255,255,255,0.07)" }}
        onClick={() => fileInputRef.current?.click()}
        data-testid="upload-zone"
        className="relative animate-dash-border p-8 flex flex-col items-center justify-center text-center gap-4 transition-all duration-300 cursor-pointer rounded-[20px]"
      >
        <div className="w-16 h-16 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] flex items-center justify-center text-white mb-2 shadow-lg shadow-indigo-500/20">
          <Upload size={32} />
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-white mb-1">ارفع عقدك</h2>
          <p className="text-sm text-muted-foreground">PDF فقط — نحلله في ثوانٍ</p>
        </div>
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-1 px-4 py-2 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-sm font-semibold flex items-center gap-2"
            data-testid="text-selected-file"
          >
            <FileText size={14} />
            <span className="max-w-[200px] truncate">{selectedFile.name}</span>
          </motion.div>
        )}
      </motion.div>

      {/* Error message */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-sm text-red-400 -mt-4"
          data-testid="text-upload-error"
        >
          {error}
        </motion.p>
      )}

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
                data-testid={`chip-contract-type-${type.id}`}
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
        onClick={handleAnalyze}
        disabled={uploading}
        data-testid="button-analyze-contract"
        className="w-full h-[52px] mt-4 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white font-bold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            <span>جاري الرفع...</span>
          </>
        ) : (
          <>
            <span>{selectedFile ? "تحليل العقد" : "اختر ملف PDF"}</span>
            <Sparkles size={18} />
          </>
        )}
      </motion.button>

      {/* Privacy Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-[-10px]">
        <Shield size={14} className="text-emerald-500" />
        <span>ملفك لا يُخزّن — يُحلّل ويُحذف فوراً</span>
      </div>

      <div className="mt-auto pt-6 flex justify-center pb-4">
        <button
          onClick={() => onNavigate("archive")}
          data-testid="link-archive"
          className="flex items-center gap-2 text-sm text-indigo-400 font-semibold hover:text-indigo-300 transition-colors"
        >
          <Archive size={16} />
          <span>عقودي المحفوظة</span>
        </button>
      </div>
    </motion.div>
  );
}
