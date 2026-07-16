import type { KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { isQuestionOverLimit, remainingQuestionCharacters } from "@/lib/chatApi";

/** Shown once remaining characters drops to (or below) this many — keeps the counter out of the way for a normal-length question. */
const LOW_REMAINING_THRESHOLD = 200;

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  canSend,
  language,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  canSend: boolean;
  language: AnalysisLanguage;
}) {
  const copy = RESULTS_COPY[language].chat;
  const remaining = remainingQuestionCharacters(value);
  const overLimit = isQuestionOverLimit(value);
  const showCounter = remaining <= LOW_REMAINING_THRESHOLD;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend();
      }
    }
    // Shift+Enter falls through to the textarea's default behavior (a newline).
  }

  return (
    <div className="flex flex-col gap-1.5" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={copy.inputPlaceholder}
          aria-label={copy.inputAriaLabel}
          data-testid="chat-input-textarea"
          rows={1}
          className="min-h-11 max-h-40 resize-none bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus-visible:ring-indigo-400"
        />
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          size="icon"
          aria-label={copy.send}
          data-testid="chat-send-button"
          className="shrink-0 h-11 w-11 rounded-full bg-[linear-gradient(135deg,#6366F1,#8B5CF6)] border-0 text-white"
        >
          <SendHorizontal size={17} />
        </Button>
      </div>
      {showCounter && (
        <span
          className={`text-[11px] px-1 ${overLimit ? "text-red-400 font-semibold" : "text-muted-foreground"}`}
          data-testid="chat-character-counter"
        >
          {overLimit ? copy.overLimitMessage : copy.charactersRemainingTemplate(remaining)}
        </span>
      )}
    </div>
  );
}
