"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: DialogPrimitive.DialogContentProps & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-deep-navy" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-[540px] -translate-x-1/2 -translate-y-1/2",
          "rounded border border-mist bg-white p-6 text-ink",
          "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-trust-blue",
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-mist pb-4">
          <div className="flex flex-col gap-2">
            <DialogPrimitive.Title className="font-serif text-20 font-semibold text-deep-navy">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-16 text-slate">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close dialog"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded border border-mist bg-white text-deep-navy hover:bg-pale-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trust-blue"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        <div className="pt-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
