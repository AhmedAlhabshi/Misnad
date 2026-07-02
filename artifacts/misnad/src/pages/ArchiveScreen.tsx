import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Bell, Car, CreditCard, ShieldCheck, Plus, ScanLine } from "lucide-react";

export default function ArchiveScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [fabOpen, setFabOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col min-h-screen p-6 relative"
    >
      <div className="flex justify-between items-center mb-8">
        <button
          onClick={() => onNavigate("home")}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
        >
          <ChevronRight size={20} />
        </button>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] rounded-full text-xs font-bold text-white">3 عقود نشطة</span>
          <h1 className="text-[28px] font-black text-white">عقودي</h1>
        </div>
      </div>

      <div className="mb-6 w-full rounded-[20px] bg-amber-500/10 border border-amber-500/25 p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
          <Bell size={24} />
        </div>
        <div>
          <span className="text-xs font-bold text-amber-500 block mb-1">تنبيه قريب</span>
          <p className="text-sm font-semibold text-white">🚗 تجديد تأمين سيارتك خلال ١٢ يوم</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => onNavigate("results")}
          className="h-[90px] bg-white/5 border border-white/10 rounded-[20px] p-4 flex items-center gap-4 cursor-pointer hover:bg-white/10 hover:scale-[1.02] transition-all relative overflow-hidden group"
        >
          <div className="w-12 h-12 rounded-full bg-[linear-gradient(135deg,#EF4444,#F97316)] flex items-center justify-center text-white shrink-0">
            <Car size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[15px] text-white">عقد تمويل سيارة — البنك الأ...</h3>
            <p className="text-xs text-muted-foreground mt-0.5">البنك الأهلي السعودي · قبل دقيقتين</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="h-6 px-3 bg-[linear-gradient(135deg,#EF4444,#F97316)] rounded-full text-[10px] font-bold text-white flex items-center">مرتفع</span>
          </div>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white/50">
            <ChevronLeft size={20} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "80%" }}
              transition={{ duration: 1, delay: 0.2 }}
              className="h-full bg-[linear-gradient(135deg,#EF4444,#F97316)] rounded-full" 
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="h-[90px] bg-white/5 border border-white/10 rounded-[20px] p-4 flex items-center gap-4 relative overflow-hidden"
        >
          <div className="w-12 h-12 rounded-full bg-[linear-gradient(135deg,#F59E0B,#EAB308)] flex items-center justify-center text-white shrink-0">
            <CreditCard size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[15px] text-white">بطاقة ائتمانية بلاتينية</h3>
            <p className="text-xs text-muted-foreground mt-0.5">بنك الراجحي · قبل 3 أيام</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="h-6 px-3 bg-[linear-gradient(135deg,#F59E0B,#EAB308)] rounded-full text-[10px] font-bold text-white flex items-center">متوسط</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "45%" }}
              transition={{ duration: 1, delay: 0.3 }}
              className="h-full bg-[linear-gradient(135deg,#F59E0B,#EAB308)] rounded-full" 
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="h-[90px] bg-white/5 border border-white/10 rounded-[20px] p-4 flex items-center gap-4 relative overflow-hidden"
        >
          <div className="w-12 h-12 rounded-full bg-[linear-gradient(135deg,#10B981,#059669)] flex items-center justify-center text-white shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-[15px] text-white">تأمين سيارة شامل</h3>
            <p className="text-xs text-muted-foreground mt-0.5">تأمين الدرع العربي · قبل أسبوع</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="h-6 px-3 bg-[linear-gradient(135deg,#10B981,#059669)] rounded-full text-[10px] font-bold text-white flex items-center">منخفض</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "15%" }}
              transition={{ duration: 1, delay: 0.4 }}
              className="h-full bg-[linear-gradient(135deg,#10B981,#059669)] rounded-full" 
            />
          </div>
        </motion.div>
      </div>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-50">
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              className="flex flex-col gap-3 items-center"
            >
              <button onClick={() => onNavigate("home")} className="h-[44px] px-5 rounded-full bg-[#161B22] border border-white/10 text-white font-bold text-sm shadow-xl flex items-center gap-2 hover:bg-white/10 transition-colors">
                <ScanLine size={18} />
                <span>رفع وتحليل</span>
              </button>
              <button className="h-[44px] px-5 rounded-full bg-[#161B22] border border-white/10 text-white font-bold text-sm shadow-xl flex items-center gap-2 hover:bg-white/10 transition-colors">
                <Plus size={18} />
                <span>إضافة مباشرة</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setFabOpen(!fabOpen)}
          className={`w-[60px] h-[60px] rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 transition-transform ${fabOpen ? "rotate-45" : ""}`}
        >
          <Plus size={30} />
        </motion.button>
      </div>
    </motion.div>
  );
}
