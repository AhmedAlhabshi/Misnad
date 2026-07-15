import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

/**
 * The single collapsed-by-default accordion row pattern shared across all
 * results tabs (Overview's clauses, Contract Finances' groups, Financial
 * Analysis' 4 sections). Kept generic — no content assumptions — so every
 * tab renders the identical visual language per the results-workspace design.
 */
export default function Accordion({
  title,
  expanded,
  onToggle,
  testId,
  children,
}: {
  title: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden" data-testid={testId}>
      <button
        onClick={onToggle}
        data-testid={`${testId}-toggle`}
        className="w-full flex items-center justify-between gap-3 p-4 text-start"
      >
        <span className="text-[14px] font-semibold text-white">{title}</span>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex shrink-0 text-muted-foreground">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 flex flex-col gap-2 text-start">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
