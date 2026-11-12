import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  highlighted?: boolean;
}

export function Card({
  highlighted = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded border border-mist p-6 state-transition",
        highlighted ? "bg-pale-blue" : "bg-white",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-2 border-b border-mist pb-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-serif text-20 font-semibold text-deep-navy", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-16 text-slate", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pt-4", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-mist pt-4",
        className
      )}
      {...props}
    />
  );
}

export function CardStateLoading({
  title = "Loading data",
  description = "Checking verification records and preparing the view.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-4">
        <div className="h-6 w-2/3 rounded bg-pale-blue" />
        <div className="h-12 w-full rounded bg-cloud" />
        <p className="text-16 font-medium text-deep-navy">{title}</p>
        <p className="text-16 text-slate">{description}</p>
      </div>
    </Card>
  );
}

export function CardStateEmpty({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card>
      <div className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-2 text-deep-navy">
          <Inbox className="h-6 w-6 shrink-0" aria-hidden="true" />
          <h3 className="font-serif text-20 font-semibold text-deep-navy">{title}</h3>
        </div>
        <p className="text-16 text-slate">{description}</p>
        {actionLabel && onAction ? (
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function CardStateError({
  title = "Could not load this section",
  message,
  retryLabel = "Try again",
  onRetry,
}: {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <Card role="alert" className="border-brick-red">
      <div className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-2 text-brick-red">
          <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden="true" />
          <h3 className="font-serif text-20 font-semibold text-brick-red">{title}</h3>
        </div>
        <p className="text-16 text-ink">{message}</p>
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
