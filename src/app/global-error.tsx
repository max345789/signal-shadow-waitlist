"use client";

import React from "react";
import { captureException } from "@/lib/monitoring/errors";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    captureException(error, { digest: error.digest, source: "global-error" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#F5F7FA",
          color: "#1F2933",
          margin: 0,
          padding: "2rem",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #CBD2D9",
            borderRadius: "8px",
            padding: "2rem",
            maxWidth: "480px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "#0B2545",
              margin: 0,
            }}
          >
            Critical error
          </h1>
          <p style={{ fontSize: "1rem", color: "#52606D", margin: 0 }}>
            A critical error prevented the application from rendering. This
            incident has been logged. Please reload the page to try again.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#52606D",
                fontFamily: "monospace",
                margin: 0,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            aria-label="Reload the page and try again"
            style={{
              backgroundColor: "#1E56A0",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
              minHeight: "48px",
              alignSelf: "flex-start",
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
