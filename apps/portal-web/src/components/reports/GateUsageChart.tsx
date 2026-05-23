"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GateUsageChartProps {
  data: { gate: string; count: number }[];
  loading: boolean;
}

export function GateUsageChart({ data, loading }: GateUsageChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const topGate = sorted[0];
  const leastGate = sorted[sorted.length - 1];

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-4">
        <h2 className="text-lg font-medium">Gate Usage Trends</h2>
        <p className="text-base text-muted-foreground">
          Entry activity grouped by gate
        </p>
      </div>

      {loading ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          Loading gate analytics...
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No gate analytics data found for the selected filters.
        </div>
      ) : (
        <>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted}
                margin={{ top: 8, right: 16, left: 0, bottom: 56 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="gate"
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={64}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#0F766E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>
              Most used gate: <span className="font-medium">{topGate.gate}</span>{" "}
              ({topGate.count})
            </p>
            <p>
              Least used gate: <span className="font-medium">{leastGate.gate}</span>{" "}
              ({leastGate.count})
            </p>
          </div>
        </>
      )}
    </div>
  );
}
