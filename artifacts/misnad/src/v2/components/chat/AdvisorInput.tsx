import type { KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import type { AnalysisLanguage } from "@workspace/contract-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RESULTS_COPY } from "@/lib/resultsCopy";
import { isQuestionOverLimit, remainingQuestionCharacters } from "@/lib/chatApi";

const LOW_REMAINING_THRESHOLD = 200;

export default function AdvisorInput({
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
      if (canSend) onSend();
    }
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
          className="min-h-11 max-h-40 resize-none"
        />
        <Button type="button" onClick={onSend} disabled={!canSend} size="icon" aria-label={copy.send} data-testid="chat-send-button" className="h-11 w-11 shrink-0">
          <SendHorizontal size={17} />
        </Button>
      </div>
      {showCounter && (
        <span className={`px-1 text-[11px] ${overLimit ? "font-semibold text-v2-danger" : "text-muted-foreground"}`} data-testid="chat-character-counter">
          {overLimit ? copy.overLimitMessage : copy.charactersRemainingTemplate(remaining)}
        </span>
      )}
    </div>
  );
}
