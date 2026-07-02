import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Calendar,
  Coins,
  TrendingUp,
  AlertTriangle,
  GraduationCap,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  FileSignature,
  GitCompare,
  Download,
  MessageCircle,
  X,
  ArrowUp,
  Bot
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResultsScreen({ onNavigate }: { onNavigate: (s: string) => void }) {
  const [activeTab, setActiveTab] = useState<"overview" | "highlights">("overview");
  const [showSimple, setShowSimple] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ id: string; text: string; isAgent: boolean }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  
  // Highlight states
  const [activeHighlight, setActiveHighlight] = useState<number | null>(null);
  const [pulseHighlight, setPulseHighlight] = useState(false);
  
  const { toast } = useToast();
  const highlightsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "highlights" && highlightsContainerRef.current) {
      // Auto-scroll to first red highlight if needed
      const firstDanger = highlightsContainerRef.current.querySelector('[data-highlight="1"]');
      if (firstDanger) {
        firstDanger.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeTab]);

  const handleSign = () => {
    toast({
      title: "تمت الإضافة للأرشيف",
      duration: 3000,
    });
  };

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    const newMsg = { id: Date.now().toString(), text, isAgent: false };
    setMessages((prev) => [...prev, newMsg]);
    setChatInput("");
    setIsTyping(true);

    setTimeout(() => {
      let reply = "يمكنك مراجعة البند ٥ لمزيد من التفاصيل حول هذا الموضوع. 📄 انتقل للبند في العقد ←";
      if (text.includes("تأخير")) {
        reply = "وفقاً للبند ٧، غرامة التأخير تعادل ٢٪ من القسط الشهري عن كل يوم تأخير، بحد أقصى ٢٠٪ من إجمالي القسط. 📄 انتقل للبند في العقد ←";
      } else if (text.includes("ينتهي")) {
        reply = "العقد ينتهي في ١٥ يونيو ٢٠٢٩ وفق البند ٣. لكن احذر — يتجدد تلقائياً إذا لم تُخطر البنك قبل ٣٠ يوماً من الانتهاء. 📄 انتقل للبند في العقد ←";
      } else if (text.includes("تجديد")) {
        reply = "نعم، البند ١٢ ينص على التجديد التلقائي. هذا هو أخطر بند في عقدك — تأكد من إشعار البنك قبل انتهاء المدة. 📄 انتقل للبند في العقد ←";
      } else if (text.includes("فسخ")) {
        reply = "وفق البند ٩، يحق لك فسخ العقد في أي وقت، لكن ستُطبَّق غرامة السداد المبكر (٥٪ من المبلغ المتبقي). 📄 انتقل للبند في العقد ←";
      }
      setMessages((prev) => [...prev, { id: Date.now().toString(), text: reply, isAgent: true }]);
      setIsTyping(false);
    }, 1200);
  };

  const handleLinkClick = () => {
    setChatOpen(false);
    setActiveTab("highlights");
    setPulseHighlight(true);
    setTimeout(() => setPulseHighlight(false), 2000);
  };

  const renderTooltip = () => {
    if (activeHighlight === null) return null;
    
    let content = { title: "", desc: "", icon: <AlertTriangle size={18} />, color: "", borderColor: "" };
    
    if (activeHighlight === 1) {
      content = {
        title: "غرامة تأخير",
        desc: "النسبة مرتفعة وتصل إلى 20% كحد أقصى، مما يشكل عبئاً مالياً إضافياً.",
        icon: <AlertTriangle size={18} />,
        color: "text-amber-500",
        borderColor: "border-amber-500/30"
      };
    } else if (activeHighlight === 2) {
      content = {
        title: "تأمين شامل",
        desc: "هذا بند إيجابي يحميك من تحمل تكاليف التأمين الإضافية.",
        icon: <ShieldCheck size={18} />,
        color: "text-emerald-500",
        borderColor: "border-emerald-500/30"
      };
    } else if (activeHighlight === 3) {
      content = {
        title: "غرامة سداد مبكر",
        desc: "نسبة 5% تعتبر مرتفعة مقارنة بالمتوسط (1-2%).",
        icon: <AlertTriangle size={18} />,
        color: "text-amber-500",
        borderColor: "border-amber-500/30"
      };
    } else if (activeHighlight === 4) {
      content = {
        title: "تجديد تلقائي",
        desc: "يجب الانتباه لموعد الإخطار قبل 30 يوماً لتجنب تجديد العقد تلقائياً.",
        icon: <ShieldAlert size={18} />,
        color: "text-red-500",
        borderColor: "border-red-500/30"
      };
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        className={`fixed left-1/2 -translate-x-1/2 bottom-24 w-[280px] bg-[#161B22]/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 z-30 shadow-2xl shadow-black/50 ${content.borderColor} border-b-4`}
      >
        <div className="flex justify-between items-start mb-2">
          <div className={`flex items-center gap-2 font-bold ${content.color}`}>
            {content.icon}
            <span>{content.title}</span>
          </div>
          <button onClick={() => setActiveHighlight(null)} className="text-muted-foreground hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-[13px] text-white/80 leading-relaxed font-medium">
          {content.desc}
        </p>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col h-[100dvh] relative"
    >
      {/* Top Header */}
      <div className="pt-6 pb-2 px-6 flex justify-between items-center bg-[#0D1117]/80 backdrop-blur-md sticky top-0 z-10">
        <button
          onClick={() => onNavigate("home")}
          className="h-8 px-3 rounded-full bg-white/5 border border-white/10 flex items-center gap-1 text-sm font-semibold text-white"
        >
          <ChevronRight size={16} />
          <span>الرئيسية</span>
        </button>
        <span className="text-xs text-muted-foreground">قبل دقيقتين</span>
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-4 border-b border-white/10 sticky top-[64px] bg-[#0D1117]/80 backdrop-blur-md z-10 pt-2">
        <button
          onClick={() => { setActiveTab("overview"); setActiveHighlight(null); }}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "overview" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted-foreground"
          }`}
        >
          📊 نظرة عامة
        </button>
        <button
          onClick={() => setActiveTab("highlights")}
          className={`pb-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "highlights" ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted-foreground"
          }`}
        >
          📄 العقد المُعلَّم
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24 px-6 pt-4" ref={highlightsContainerRef}>
        {activeTab === "overview" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
            <h1 className="text-[22px] font-bold text-white">عقد تمويل سيارة — البنك الأهلي</h1>

            {/* Risk Row */}
            <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="relative w-20 h-20">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="url(#danger-grad)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="226"
                    initial={{ strokeDashoffset: 226 }}
                    animate={{ strokeDashoffset: 226 - (226 * 0.74) }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                  <defs>
                    <linearGradient id="danger-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#EF4444" />
                      <stop offset="100%" stopColor="#F97316" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-white leading-none">74</span>
                  <span className="text-[10px] text-muted-foreground">من 100</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-muted-foreground">مستوى المخاطرة</span>
                <div className="h-10 px-4 rounded-full bg-[linear-gradient(135deg,#EF4444,#F97316)] flex items-center text-white font-bold text-sm shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse">
                  مرتفع
                </div>
                <span className="text-xs text-muted-foreground">74/100 نقطة</span>
              </div>
            </div>

            {/* Stats Row */}
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6 hide-scrollbar">
              <div className="flex-shrink-0 w-[110px] bg-white/5 border border-white/10 rounded-[20px] p-3 flex flex-col items-center justify-center aspect-square text-center">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#3B82F6,#60A5FA)] flex items-center justify-center text-white mb-2">
                  <Calendar size={18} />
                </div>
                <div className="text-2xl font-bold text-white leading-none">60<span className="text-xs font-normal ml-1">شهر</span></div>
                <div className="text-xs text-muted-foreground mt-1">مدة العقد</div>
              </div>
              <div className="flex-shrink-0 w-[110px] bg-white/5 border border-white/10 rounded-[20px] p-3 flex flex-col items-center justify-center aspect-square text-center">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] flex items-center justify-center text-white mb-2">
                  <Coins size={18} />
                </div>
                <div className="text-2xl font-bold text-white leading-none">142K<sup className="text-[10px] font-normal ml-0.5">رس</sup></div>
                <div className="text-xs text-muted-foreground mt-1">إجمالي التكلفة</div>
              </div>
              <div className="flex-shrink-0 w-[110px] bg-white/5 border border-white/10 rounded-[20px] p-3 flex flex-col items-center justify-center aspect-square text-center">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#F59E0B,#EAB308)] flex items-center justify-center text-white mb-2">
                  <TrendingUp size={18} />
                </div>
                <div className="text-2xl font-bold text-amber-500 leading-none">18.4%</div>
                <div className="text-xs text-muted-foreground mt-1">نسبة الفائدة</div>
              </div>
              <div className="flex-shrink-0 w-[110px] bg-white/5 border border-white/10 rounded-[20px] p-3 flex flex-col items-center justify-center aspect-square text-center">
                <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#EF4444,#F97316)] flex items-center justify-center text-white mb-2">
                  <AlertTriangle size={18} />
                </div>
                <div className="text-2xl font-bold text-red-500 leading-none">3</div>
                <div className="text-xs text-muted-foreground mt-1">بنود خطيرة</div>
              </div>
            </div>

            {/* Explain Like 15 */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSimple(!showSimple)}
              className="w-full h-[52px] rounded-full bg-[linear-gradient(135deg,#F59E0B,#ea580c)] flex items-center justify-center gap-2 text-white font-bold shadow-lg shadow-amber-500/20"
            >
              <GraduationCap size={20} />
              <span>اشرحها كأني عمري 15</span>
              <Sparkles size={16} />
            </motion.button>

            <AnimatePresence>
              {showSimple && (
                <motion.div
                  initial={{ opacity: 0, height: 0, scale: 0.95 }}
                  animate={{ opacity: 1, height: "auto", scale: 1 }}
                  exit={{ opacity: 0, height: 0, scale: 0.95 }}
                  className="bg-white/5 border-r-4 border-indigo-500 border-y border-l border-white/10 rounded-xl p-4 overflow-hidden"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Bot size={18} />
                    </div>
                    <span className="font-bold text-white text-sm">✨ بلغة بسيطة</span>
                  </div>
                  <p className="text-[15px] leading-relaxed text-indigo-100/90 font-medium">
                    تخيّل إنك استأجرت سيارة من صاحبك لخمس سنين. كل شهر تدفع له مبلغ. لكن في الورقة اللي وقّعت عليها مكتوب: لو حبيت تخلص بدري، لازم تدفع غرامة كبيرة. وكمان، لما تخلص الخمس سنين، تلقائياً تتجدد لخمس سنين ثانية إلا إذا قلت لا قبل وقت. باختصار: العقد يميل لصالح البنك أكثر منك. فاحذر قبل التوقيع.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Findings */}
            <div>
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-xl">🔍</span> البنود التي تحتاج انتباهك
              </h2>
              <div className="flex flex-col gap-3">
                <div className="bg-white/5 border-r-4 border-red-500 border-y border-l border-white/10 rounded-[16px] p-4 relative overflow-hidden">
                  <div className="absolute top-4 left-4 h-6 px-3 bg-[linear-gradient(135deg,#EF4444,#F97316)] rounded-full text-[11px] font-bold text-white flex items-center">خطر عالٍ</div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                      <ShieldAlert size={20} />
                    </div>
                    <div className="pt-1">
                      <h3 className="font-bold text-white text-[15px] mb-1">تجديد تلقائي بدون إشعار</h3>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">يحق للبنك تجديد العقد تلقائياً دون إشعارك قبل انتهاء المدة، مما قد يربطك بفترة جديدة كاملة.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border-r-4 border-amber-500 border-y border-l border-white/10 rounded-[16px] p-4 relative overflow-hidden">
                  <div className="absolute top-4 left-4 h-6 px-3 bg-[linear-gradient(135deg,#F59E0B,#EAB308)] rounded-full text-[11px] font-bold text-white flex items-center">تحذير</div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="pt-1">
                      <h3 className="font-bold text-white text-[15px] mb-1">غرامة سداد مبكر مرتفعة</h3>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">في حال السداد المبكر، تدفع غرامة تعادل 5% من المبلغ المتبقي بدلاً من النسبة المعتادة 1%.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border-r-4 border-emerald-500 border-y border-l border-white/10 rounded-[16px] p-4 relative overflow-hidden">
                  <div className="absolute top-4 left-4 h-6 px-3 bg-[linear-gradient(135deg,#10B981,#059669)] rounded-full text-[11px] font-bold text-white flex items-center">آمن</div>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="pt-1">
                      <h3 className="font-bold text-white text-[15px] mb-1">بند التأمين الشامل مضمون</h3>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">العقد يضمن تأميناً شاملاً للسيارة طوال فترة التمويل دون رسوم إضافية.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button onClick={handleSign} className="flex-1 h-11 rounded-xl bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] flex items-center justify-center gap-2 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-transform">
                <FileSignature size={16} />
                <span>وقّعت على هذا العقد</span>
              </button>
              <button className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-white text-sm font-bold hover:bg-white/10 transition-colors">
                <GitCompare size={16} />
                <span>مقارنة بعقد آخر</span>
              </button>
              <button className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                <Download size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === "highlights" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 relative">
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-xs font-bold">🔴 3 خطيرة</span>
              <span className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-xs font-bold">🟡 2 تحذير</span>
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-bold">🟢 1 آمن</span>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-sm text-white/90 leading-[2.2] text-justify font-medium">
              يتفق الطرفان على أن يقوم الطرف الأول (البنك) بتمويل شراء المركبة الموصوفة أعلاه للطرف الثاني. 
              يلتزم الطرف الثاني بسداد الأقساط في موعدها المحدد، وفي حال التأخر 
              <span 
                onClick={() => setActiveHighlight(1)}
                className={`bg-amber-500/20 border-b-2 border-amber-500 px-1 rounded-t cursor-pointer mx-1 transition-all ${activeHighlight === 1 ? 'ring-2 ring-amber-500/50 bg-amber-500/30' : ''}`}>
                تُطبق غرامة تأخير قدرها ٢٪ من قيمة القسط<sup className="ml-0.5 font-bold">①</sup>
              </span>.
              <br/><br/>
              كما يتعهد البنك بأن 
              <span 
                onClick={() => setActiveHighlight(2)}
                className={`bg-emerald-500/15 border-b-2 border-emerald-500 px-1 rounded-t cursor-pointer mx-1 transition-all ${activeHighlight === 2 ? 'ring-2 ring-emerald-500/50 bg-emerald-500/30' : ''}`}>
                يوفر تأميناً شاملاً للمركبة طوال مدة العقد دون تحميل الطرف الثاني أي رسوم إضافية<sup className="ml-0.5 font-bold">②</sup>
              </span>.
              <br/><br/>
              يحق للطرف الثاني السداد المبكر لقيمة التمويل المتبقية، وفي هذه الحالة 
              <span 
                onClick={() => setActiveHighlight(3)}
                className={`bg-amber-500/20 border-b-2 border-amber-500 px-1 rounded-t cursor-pointer mx-1 transition-all ${activeHighlight === 3 ? 'ring-2 ring-amber-500/50 bg-amber-500/30' : ''}`}>
                يتحمل غرامة سداد مبكر تعادل ٥٪ من المبلغ المتبقي<sup className="ml-0.5 font-bold">③</sup>
              </span>.
              <br/><br/>
              مدة هذا العقد ٦٠ شهراً، و
              <span 
                data-highlight="1"
                onClick={() => setActiveHighlight(4)}
                className={`bg-red-500/25 border-b-2 border-red-500 px-1 rounded-t cursor-pointer mx-1 font-bold transition-all ${pulseHighlight ? 'animate-pulse ring-4 ring-red-500/50 bg-red-500/40' : ''} ${activeHighlight === 4 ? 'ring-2 ring-red-500/50 bg-red-500/40' : ''}`}>
                يُجدد العقد تلقائياً لمدة مماثلة ما لم يقم الطرف الثاني بإخطار البنك خطياً برغبته في عدم التجديد قبل ٣٠ يوماً من تاريخ الانتهاء<sup className="ml-0.5 font-bold">④</sup>
              </span>.
            </div>

            <AnimatePresence>
              {renderTooltip()}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Floating Chat Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 left-6 w-14 h-14 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white shadow-xl shadow-indigo-500/30 flex items-center justify-center z-40"
      >
        <MessageCircle size={28} />
        <span className="absolute top-0 right-0 w-3 h-3 bg-amber-400 rounded-full border-2 border-[#0D1117] animate-ping" />
        <span className="absolute top-0 right-0 w-3 h-3 bg-amber-400 rounded-full border-2 border-[#0D1117]" />
      </motion.button>

      {/* Bottom Sheet Chat */}
      <AnimatePresence>
        {chatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setChatOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 h-[60vh] max-w-[480px] mx-auto bg-[#161B22]/95 backdrop-blur-xl border-t border-white/10 rounded-t-[24px] z-50 flex flex-col"
            >
              <div className="flex justify-between items-center p-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Bot size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">🤖 اسأل عن عقدك</h3>
                    <p className="text-[11px] text-muted-foreground">يجاوب بناءً على نص العقد فقط</p>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/70">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col gap-2 mt-auto">
                    {["ما هي غرامة التأخير؟", "متى ينتهي العقد؟", "هل يوجد تجديد تلقائي؟", "ما حقوقي إذا أردت الفسخ؟"].map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        className="self-start px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/80 hover:bg-white/10 transition-colors text-right"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.isAgent ? "justify-start" : "justify-end"}`}>
                        {msg.isAgent && (
                          <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 ml-2 mt-1">م</div>
                        )}
                        <div
                          className={`max-w-[80%] p-3 text-sm leading-relaxed ${
                            msg.isAgent
                              ? "bg-white/5 text-white/90 rounded-[18px] rounded-tr-sm"
                              : "bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] text-white rounded-[18px] rounded-tl-sm"
                          }`}
                        >
                          {msg.text.includes("انتقل للبند") ? (
                            <>
                              {msg.text.split("📄")[0]}
                              <span
                                onClick={handleLinkClick}
                                className="block mt-2 text-indigo-300 font-bold cursor-pointer hover:text-indigo-200"
                              >
                                📄 انتقل للبند في العقد ←
                              </span>
                            </>
                          ) : (
                            msg.text
                          )}
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0 ml-2 mt-1">م</div>
                        <div className="bg-white/5 p-3 rounded-[18px] rounded-tr-sm flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-4 pt-2 border-t border-white/10 bg-[#161B22]">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend(chatInput)}
                    placeholder="اسأل أي سؤال عن عقدك..."
                    className="w-full h-[48px] bg-white/5 border border-white/10 rounded-full pl-12 pr-4 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
                  />
                  <button
                    onClick={() => handleSend(chatInput)}
                    className="absolute left-1.5 w-[36px] h-[36px] rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-400 transition-colors"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
