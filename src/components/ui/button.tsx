import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "action" | "secondary" | "link" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-deep-navy text-white border border-deep-navy hover:bg-trust-blue hover:border-trust-blue disabled:bg-cloud disabled:text-slate disabled:border-mist",
  action:
    "bg-trust-blue text-white border border-trust-blue hover:bg-deep-navy hover:border-deep-navy disabled:bg-cloud disabled:text-slate disabled:border-mist",
  secondary:
    "bg-white text-deep-navy border border-mist hover:bg-pale-blue hover:border-trust-blue disabled:bg-cloud disabled:text-slate disabled:border-mist",
  link: "bg-transparent text-trust-blue border border-transparent underline underline-offset-4 hover:text-deep-navy disabled:text-slate disabled:no-underline",
  danger:
    "bg-brick-red text-white border border-brick-red hover:bg-white hover:text-brick-red disabled:bg-cloud disabled:text-slate disabled:border-mist",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "min-h-12 px-4 py-2 text-16",
  lg: "min-h-12 px-6 py-4 text-16",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      asChild = false,
      loading = false,
      loadingLabel = "Working...",
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const useSlot = asChild && !loading;
    const Comp = useSlot ? Slot : "button";
    const isDisabled = Boolean(disabled || loading);

    return (
      <Comp
        ref={ref}
        type={useSlot ? undefined : type}
        disabled={useSlot ? undefined : isDisabled}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded font-medium state-transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue",
          "disabled:cursor-not-allowed",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {loading ? loadingLabel : children}
      </Comp>
    );
  }
);

Button.displayName = "Button";
