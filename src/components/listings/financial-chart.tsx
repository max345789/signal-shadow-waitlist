import React from "react";
import { SECTION_4_COLORS } from "@/styles/tokens";
import type { FinancialSeriesPoint } from "@/lib/domain/valuation";
import { formatCurrency, type CurrencyCode } from "@/lib/format/currency";
import { Card, CardStateEmpty } from "@/components/ui/card";

export function FinancialChart({
  series,
  currency,
}: {
  series: FinancialSeriesPoint[];
  currency: CurrencyCode;
}) {
  if (series.length === 0) {
    return (
      <CardStateEmpty
        title="No quarterly breakdown available"
        description="Quarterly revenue and profit points will appear here once provided by the seller or connected accounting source."
      />
    );
  }

  const maxValue = Math.max(
    1,
    ...series.flatMap((pt) => [Math.max(0, pt.revenue), Math.max(0, pt.profit)])
  );

  const chartWidth = 640;
  const chartHeight = 240;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 36;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;
  const groupWidth = plotWidth / series.length;
  const barWidth = Math.min(36, Math.max(18, Math.floor(groupWidth * 0.28)));
  const barGap = 8;

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-serif text-20 font-semibold text-deep-navy">
            Trailing quarterly financial trend
          </h3>
          <span className="text-14 text-slate">
            Solid flat comparison of revenue and net profit ({currency})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-14 text-ink">
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded border border-mist"
              style={{ backgroundColor: SECTION_4_COLORS.deepNavy }}
              aria-hidden="true"
            />
            <span>Revenue</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-4 w-4 rounded border border-mist"
              style={{ backgroundColor: SECTION_4_COLORS.trustBlue }}
              aria-hidden="true"
            />
            <span>Net profit</span>
          </span>
        </div>
      </div>

      <div className="w-full overflow-hidden rounded border border-mist bg-cloud p-4">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-label="Quarterly revenue and net profit bar chart"
          className="h-auto w-full"
        >
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padTop + plotHeight * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={padLeft}
                y1={y}
                x2={chartWidth - padRight}
                y2={y}
                stroke={SECTION_4_COLORS.mist}
                strokeWidth={1}
              />
            );
          })}

          <line
            x1={padLeft}
            y1={padTop + plotHeight}
            x2={chartWidth - padRight}
            y2={padTop + plotHeight}
            stroke={SECTION_4_COLORS.slate}
            strokeWidth={1}
          />

          {series.map((pt, idx) => {
            const centerX = padLeft + groupWidth * idx + groupWidth / 2;
            const revHeight = Math.max(
              2,
              (Math.max(0, pt.revenue) / maxValue) * plotHeight
            );
            const profHeight = Math.max(
              pt.profit > 0 ? 2 : 0,
              (Math.max(0, pt.profit) / maxValue) * plotHeight
            );

            const revX = centerX - barWidth - barGap / 2;
            const profX = centerX + barGap / 2;
            const revY = padTop + plotHeight - revHeight;
            const profY = padTop + plotHeight - profHeight;

            return (
              <g key={pt.period}>
                <rect
                  x={revX}
                  y={revY}
                  width={barWidth}
                  height={revHeight}
                  rx={4}
                  fill={SECTION_4_COLORS.deepNavy}
                />
                <rect
                  x={profX}
                  y={profY}
                  width={barWidth}
                  height={profHeight}
                  rx={4}
                  fill={SECTION_4_COLORS.trustBlue}
                />
                <text
                  x={centerX}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  fill={SECTION_4_COLORS.ink}
                  fontSize="14"
                  fontWeight="600"
                >
                  {pt.period}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible tabular breakdown */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-mist">
              <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">Period</th>
              <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">Revenue</th>
              <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">Net profit</th>
              <th className="py-2 pr-4 text-14 font-semibold text-deep-navy">Margin</th>
              <th className="py-2 text-14 font-semibold text-deep-navy">Data source</th>
            </tr>
          </thead>
          <tbody>
            {series.map((pt) => {
              const margin =
                pt.revenue > 0 ? ((pt.profit / pt.revenue) * 100).toFixed(1) : "0";
              return (
                <tr key={pt.period} className="border-b border-mist last:border-b-0">
                  <td className="py-2 pr-4 text-14 font-medium text-deep-navy">
                    {pt.period}
                  </td>
                  <td className="py-2 pr-4 text-14 text-ink tabular-figures">
                    {formatCurrency(pt.revenue, { currency, compact: true })}
                  </td>
                  <td className="py-2 pr-4 text-14 text-ink tabular-figures">
                    {formatCurrency(pt.profit, { currency, compact: true })}
                  </td>
                  <td className="py-2 pr-4 text-14 text-slate tabular-figures">
                    {margin}%
                  </td>
                  <td className="py-2 text-14 text-slate">
                    {pt.source === "VERIFIED"
                      ? "Verified connection"
                      : "Seller-reported"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
