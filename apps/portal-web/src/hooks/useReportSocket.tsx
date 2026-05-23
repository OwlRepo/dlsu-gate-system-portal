import { useEffect, useState } from "react";
import { io } from "socket.io-client";

interface GateStats {
  onPremise: number;
  entry: number;
  exit: number;
  gateAccessStats: {
    allowed: number;
    allowedWithRemarks: number;
    notAllowed: number;
  };
  lastUpdated: Date;
}

export const useReportsSocket = () => {
  const [stats, setStats] = useState<GateStats | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9580";
    const socketInstance = io(socketUrl, {
      path: "/socket.io/",
      transports: ["websocket", "polling"], // Allow fallback to polling
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("Connected to WebSocket");
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
      console.log("Disconnected from WebSocket");
    });

    socketInstance.on("stats-update", (newStats: GateStats) => {
      setStats({
        ...newStats,
        lastUpdated: new Date(newStats.lastUpdated),
      });
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return {
    stats,
    isConnected,
  };
};