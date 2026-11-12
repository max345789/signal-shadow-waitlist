import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
}

/**
 * Standard page container for Baton (C12).
 * Centered, max width 1200px.
 * Side padding: 16px under 768px, 24px from 768px, 32px from 1024px.
 * No screen sets its own outer horizontal margins.
 */
export function PageContainer({
  children,
  className,
  as: Component = "div",
  ...props
}: PageContainerProps) {
  return (
    <Component
      className={cn(
        "mx-auto w-full max-w-[1200px] px-4 md:px-6 lg:px-8",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
