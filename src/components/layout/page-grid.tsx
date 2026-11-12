import * as React from "react";
import { cn } from "@/lib/cn";

export interface PageGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  as?: React.ElementType;
}

/**
 * Standard responsive grid for Baton (C12).
 * 4 columns on mobile (<768px), 8 columns on tablet (768-1023px), 12 columns on desktop (>=1024px).
 * Uses standard 8px spacing scale (gap-4 = 16px, gap-6 = 24px, gap-8 = 32px).
 */
export function PageGrid({
  children,
  className,
  as: Component = "div",
  ...props
}: PageGridProps) {
  return (
    <Component
      className={cn(
        "grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
