"use client";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import React, { useEffect, useState } from "react";

interface GateAccessStatProps {
  label: string;
  percentage: number | null | undefined;
  color: string;
}

interface AccessProps {
  data:
    | {
        allowed: number;
        allowedWithRemarks: number;
        notAllowed: number;
      }
    | null
    | undefined;
}

const getStatusStyles = (color: string) => {
  switch (color) {
    case "success":
      return {
        icon: ShieldCheck,
        bgColor: "bg-emerald-500",
        iconBg: "bg-emerald-50",
        iconColor: "text-emerald-500",
      };
    case "warning":
      return {
        icon: ShieldQuestion,
        bgColor: "bg-yellow-400",
        iconBg: "bg-yellow-50",
        iconColor: "text-yellow-400",
      };
    case "error":
      return {
        icon: ShieldAlert,
        bgColor: "bg-red-500",
        iconBg: "bg-red-50",
        iconColor: "text-red-500",
      };
  }
};

const GateAccessStat: React.FC<GateAccessStatProps> = ({
  label,
  percentage,
  color,
}) => {
  // Get the correct styles based on color
  const statusStyle = getStatusStyles(
    color === "bg-[#00C853]"
      ? "success"
      : color === "bg-[#FFB300]"
      ? "warning"
      : color === "bg-[#F44336]"
      ? "error"
      : ""
  );

  // Get the Icon component
  const IconComponent = statusStyle?.icon || ShieldCheck;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`h-10 w-10 rounded-sm shadow-md flex items-center justify-center ${statusStyle?.iconBg}`}
          >
            <IconComponent className={`h-6 w-6 ${statusStyle?.iconColor}`} />
          </div>
          <span>{label}</span>
        </div>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export function GateAccessStats({ data }: AccessProps) {
  const [isHydrated, setIsHydrated] = useState(false);
  // const { setStats, allowed, allowedWithRemarks, notAllowed } = useGateStatsStore();

  // Handle hydration
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsHydrated(true);
    }
  }, []);

  // Calculate percentages only when new data arrives
  // useEffect(() => {
  //   if (!isHydrated || !data?.length) return;

  //   let allowedCount = 0;
  //   let allowedWithRemarksCount = 0;
  //   let notAllowedCount = 0;

  //   data.forEach((scanDetail) => {
  //     const isExpired = checkExpiry(scanDetail.expiryDate);
  //     const isDisabled = scanDetail.disabled === "true";
  //     const hasRemarks = scanDetail.remarks !== "No remarks" && scanDetail.remarks !== null;

  //     if (isExpired || isDisabled) {
  //       notAllowedCount++;
  //     } else if (!isExpired && scanDetail.disabled === "false" && hasRemarks) {
  //       allowedWithRemarksCount++;
  //     } else if (scanDetail.remarks === "No remarks" || scanDetail.remarks === null) {
  //       allowedCount++;
  //     }
  //   });

  //   const total = data.length;
  //   if (total > 0) {
  //     setStats(
  //       Math.round((allowedCount / total) * 100),
  //       Math.round((allowedWithRemarksCount / total) * 100),
  //       Math.round((notAllowedCount / total) * 100)
  //     );
  //   }
  // }, [data, setStats, isHydrated]);

  // // Don't render until hydrated
  // if (!isHydrated) {
  //   return null;
  // }

  return (
    <div className="space-y-4 w-full">
      <GateAccessStat
        label="Allowed"
        percentage={isHydrated ? data?.allowed : 0}
        color="bg-[#00C853]"
      />
      <GateAccessStat
        label="Allowed with Remarks"
        percentage={isHydrated ? data?.allowedWithRemarks : 0}
        color="bg-[#FFB300]"
      />
      <GateAccessStat
        label="Not Allowed"
        percentage={isHydrated ? data?.notAllowed : 0}
        color="bg-[#F44336]"
      />
    </div>
  );
}
