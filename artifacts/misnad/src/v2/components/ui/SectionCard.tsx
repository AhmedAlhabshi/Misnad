import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The one card shell every V2 results section is built on — consistent spacing/typography instead of five different hand-rolled containers. */
export default function SectionCard({
  title,
  description,
  action,
  children,
  className,
  testId,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={cn("border-border shadow-sm", className)} data-testid={testId}>
      {(title || action) && (
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            {title && <CardTitle className="text-base font-semibold">{title}</CardTitle>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </CardHeader>
      )}
      <CardContent className={title ? undefined : "pt-6"}>{children}</CardContent>
    </Card>
  );
}
