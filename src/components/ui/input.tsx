import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  prefixText?: string;
  suffixText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      id,
      label,
      helperText,
      error,
      prefixText,
      suffixText,
      className,
      required,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;
    const describedBy =
      [error ? errorId : null, helperText ? helperId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex w-full flex-col gap-2">
        <LabelPrimitive.Root
          htmlFor={inputId}
          className="text-16 font-medium text-deep-navy"
        >
          {label}
          {required ? (
            <span className="ml-2 text-14 font-normal text-slate" aria-hidden="true">
              (required)
            </span>
          ) : null}
        </LabelPrimitive.Root>

        <div
          className={cn(
            "flex min-h-12 w-full items-center rounded border state-transition",
            "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-trust-blue",
            error
              ? "border-brick-red"
              : "border-mist focus-within:border-trust-blue",
            props.disabled ? "bg-cloud text-slate" : "bg-white text-ink"
          )}
        >
          {prefixText ? (
            <span className="border-r border-mist px-4 text-16 font-medium text-slate tabular-figures">
              {prefixText}
            </span>
          ) : null}

          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            className={cn(
              "w-full min-w-0 bg-transparent px-4 py-2 text-16 placeholder:text-slate",
              "focus:outline-none disabled:cursor-not-allowed disabled:text-slate",
              props.disabled ? "text-slate" : "text-ink",
              className
            )}
            {...props}
          />

          {suffixText ? (
            <span className="border-l border-mist px-4 text-14 font-medium text-slate tabular-figures">
              {suffixText}
            </span>
          ) : null}
        </div>

        {helperText ? (
          <span id={helperId} className="text-14 text-slate">
            {helperText}
          </span>
        ) : null}

        {error ? (
          <span
            id={errorId}
            role="alert"
            className="flex items-center gap-2 text-14 font-medium text-brick-red"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ id, label, helperText, error, className, required, rows = 4, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const helperId = `${textareaId}-helper`;
    const errorId = `${textareaId}-error`;
    const describedBy =
      [error ? errorId : null, helperText ? helperId : null]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex w-full flex-col gap-2">
        <LabelPrimitive.Root
          htmlFor={textareaId}
          className="text-16 font-medium text-deep-navy"
        >
          {label}
          {required ? (
            <span className="ml-2 text-14 font-normal text-slate" aria-hidden="true">
              (required)
            </span>
          ) : null}
        </LabelPrimitive.Root>

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded border px-4 py-2 text-16 placeholder:text-slate state-transition",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue",
            error ? "border-brick-red" : "border-mist focus-visible:border-trust-blue",
            props.disabled
              ? "cursor-not-allowed bg-cloud text-slate"
              : "bg-white text-ink",
            className
          )}
          {...props}
        />

        {helperText ? (
          <span id={helperId} className="text-14 text-slate">
            {helperText}
          </span>
        ) : null}

        {error ? (
          <span
            id={errorId}
            role="alert"
            className="flex items-center gap-2 text-14 font-medium text-brick-red"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
