export default function StepIndicator({ step, label }: { step: number; label: string }) {
  return (
    <div className="flex items-center gap-2" data-testid={`step-indicator-${step}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {step}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}
