"use client";

import {  LogIn } from "lucide-react";
import { StatisticsCard } from "@/components/dashboard/statistics-card";
import { GateAccessStats } from "@/components/dashboard/gate-access-stats";
import { LiveDataTable } from "@/components/dashboard/live-data-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// import axios from "axios";
import axios from "@/lib/axios-interceptor";
import {
  CustomField,
  DeviceProps,
  EventProps,
  ReportData,
  ScanProps,
  UserProps,
} from "@/lib/types";
import useUserToken from "@/hooks/useUserToken";
import { useReportsSocket } from "@/hooks/useReportSocket";
import { mapScanToReportData } from "@/lib/report-mapper";
import { isMockMode } from "@/lib/mock-mode";
import { mockDashboardScans } from "@/mocks/data/dashboard";
import { normalizeDeviceId, normalizeUserId } from "@/lib/biostar-event";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function Dashboard() {
  const { token } = useUserToken();
  const { stats } = useReportsSocket();
  const [tableQueue, setTableQueue] = useState<ScanProps[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const postedReportsRef = useRef<Set<string>>(new Set());
  const pendingReportsRef = useRef<
    Map<string, { reportEventKey: string; reportData: ReportData; attempts: number }>
  >(new Map());
  // const [devicesData, setDevicesData] = useState<{ [key: string]: ScanProps }>(
  //   {}
  // );
  const buildEventKey = useCallback(
    (
      userId: string,
      deviceId: string,
      datetime: string,
      eventTypeName?: string,
      tnaKey?: string
    ) =>
      `${userId}-${deviceId}-${datetime}-${eventTypeName ?? "UNKNOWN"}-${tnaKey ?? "UNKNOWN"}`,
    []
  );
  // Returns whether the report was actually written, so the caller can decide
  // between marking it posted (postedReportsRef) or queuing it for retry
  // (pendingReportsRef). A missing token is treated the same as a failed POST:
  // both fall through to the pending-queue path instead of being dropped.
  const sendReport = useCallback(
    async (reportData: ReportData): Promise<boolean> => {
      if (!token) {
        return false;
      }

      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reports`, reportData, {
          headers: {
            accept: "*/*",
            "Content-Type": "application/json",
            Authorization: `${token}`,
          },
        });
        return true;
      } catch (error) {
        console.error("Error sending report:", error);
        return false;
      }
    },
    [token]
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const BIOSTAR2_WS_URI = `${process.env.NEXT_PUBLIC_WS_HOST}/wsapi`;

  // Utility function to check if a datetime is from today
  const isToday = (datetime: string): boolean => {
    const eventDate = new Date(datetime);
    const today = new Date();
    return (
      eventDate.getDate() === today.getDate() &&
      eventDate.getMonth() === today.getMonth() &&
      eventDate.getFullYear() === today.getFullYear()
    );
  };

  // Filter table queue to only include entries from today
  const filteredTableQueue = useMemo(() => {
    return tableQueue.filter(entry => isToday(entry.datetime));
  }, [tableQueue]);

  //   const scanSimulation = async () => {
  //   try {
  //     // First, get a session ID by logging in
  //     const loginResponse = await axios.post(
  //       "/api/login",
  //       {
  //         User: {
  //           login_id: process.env.NEXT_PUBLIC_BIOSTAR_LOGIN_ID,
  //           password: process.env.NEXT_PUBLIC_BIOSTAR_PASSWORD,
  //         },
  //       },
  //       {
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //       }
  //     );

  //     const bsSessionId = loginResponse.data.bsSessionId;

  //     if (!bsSessionId) {
  //       console.error("Could not get session ID for simulation");
  //       return;
  //     }

  //     // Create fake user and device data
  //     const user = {
  //       user_id: "10008", // This should match a real user ID in your system for testing
  //       name: "",
  //       photo_exist: false
  //     };

  //     const device = {
  //       id: "538203430", // Choose one of your actual device IDs
  //       name: "Turnstile 1"
  //     };

  //     // Current time
  //     const datetime = new Date().toISOString();

  //     // tna_key of 1 for entry (IN)
  //     const tna_key = "";
  //     // const tna_key = "1";

  //     // Event type
  //     const event_type_id = {
  //       code: "24577",
  //       name: "APB_VIOLATION_HARD",
  //     };

  //     // Call the same function that processes real scans
  //     await fetchUserData(
  //       bsSessionId,
  //       user,
  //       device,
  //       tna_key,
  //       datetime,
  //       event_type_id
  //     );

  //     console.log("Scan simulation completed using fetchUserData");
  //   } catch (error) {
  //     console.error("Error in scan simulation:", error);
  //   }
  // };

  useEffect(() => {
    if (isMockMode()) {
      const seedScans = mockDashboardScans.map((scan, index) => ({
        ...scan,
        datetime: new Date(Date.now() - index * 60000).toISOString(),
      }));

      setTableQueue(seedScans);

      const interval = setInterval(() => {
        const next = seedScans[Math.floor(Math.random() * seedScans.length)];
        const synthetic: ScanProps = {
          ...next,
          datetime: new Date().toISOString(),
        };
        setTableQueue((prevQueue) => {
          const newQueue = [synthetic, ...prevQueue];
          return newQueue.length > 25 ? newQueue.slice(0, 25) : newQueue;
        });
      }, 6000);

      return () => clearInterval(interval);
    }

    // Declared in the outer effect scope (not inside fetchSessionId) so the
    // cleanup function returned by this effect can always reach the socket
    // that was actually created, and close it on unmount.
    let ws: WebSocket | undefined;

    const fetchSessionId = async () => {
      try {
        const response = await axios.post(
          "/api/login",
          {
            User: {
              login_id: process.env.NEXT_PUBLIC_BIOSTAR_LOGIN_ID,
              password: process.env.NEXT_PUBLIC_BIOSTAR_PASSWORD,
            },
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response) {
          // setBsSessionId(response.data.bsSessionId);
          ws = new WebSocket(BIOSTAR2_WS_URI);

          ws.onopen = () => {
            console.log("WebSocket connection established.");
            // Send the session ID to the WebSocket server
            ws?.send(`bs-session-id=${response.data.bsSessionId}`);

            // Optionally call the event API after WebSocket connection is established
            setTimeout(() => {
              fetchEventData(response.data.bsSessionId);
            }, 1000);
          };
          ws.onmessage = (event) => {
            let eventData: { Event?: Record<string, unknown> };
            try {
              eventData = JSON.parse(event.data);
            } catch (error) {
              console.error("Failed to parse WebSocket message:", error);
              return;
            }

            if (eventData.Event) {
              const { user_id, device_id, datetime, tna_key, event_type_id } =
                eventData.Event as {
                  user_id: unknown;
                  device_id: unknown;
                  datetime: string;
                  tna_key: string;
                  event_type_id: EventProps;
                };
              const normalizedUserId = normalizeUserId(user_id);
              const normalizedDeviceId = normalizeDeviceId(device_id);

              if (!normalizedUserId || !normalizedDeviceId || !datetime) {
                return;
              }

              // Ref-backed guard prevents stale closure dedupe bugs. The key
              // includes tna_key so an IN and OUT event for the same
              // user/device/datetime don't collide and drop one another.
              const eventKey = buildEventKey(
                normalizedUserId,
                normalizedDeviceId,
                datetime,
                event_type_id?.name,
                tna_key
              );
              if (processedEventsRef.current.has(eventKey)) {
                return;
              }
              processedEventsRef.current.add(eventKey);

              // Called directly (no debounce): the dedupe guard above already
              // prevents true duplicate processing regardless of timing, so a
              // debounce here only dropped distinct, fast-arriving events.
              fetchUserData(
                response.data.bsSessionId,
                {
                  user_id: normalizedUserId,
                  name: "",
                  photo_exist: false,
                },
                {
                  id: normalizedDeviceId,
                  name: `Device ${normalizedDeviceId}`,
                },
                tna_key,
                datetime,
                event_type_id
              );
            }
          };

          ws.onerror = (error) => {
            console.error("WebSocket error:", error);
          };

          ws.onclose = () => {
            console.log("WebSocket connection closed.");
          };
        } else {
          console.error(
            "Session ID is missing. Cannot establish WebSocket connection."
          );
          return;
        }

        // console.log('Login response:', response.data);
      } catch (error) {
        console.error("Error logging in:", error);
      }
    };

    fetchSessionId();

    // Cleanup on component unmount. Returned from the effect itself (not
    // from the async fetchSessionId, whose return value would be a promise
    // React never sees) so the socket is actually closed.
    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUserData = async (
    bsSessionId: string,
    user: UserProps,
    device: DeviceProps,
    tna_key: string,
    datetime: string,
    event_type_id: EventProps
  ) => {
       // Skip UPDATE events
       if (event_type_id.name.includes("UPDATE")) {
        return;
      }

      // if (event_type_id.name === "APB_VIOLATION_HARD") {
      //   return;
      // }

      // if (event_type_id.name.includes("APB")) {
      //   return;
      // }
  
      // // Skip tna_key of 2 (OUT events)
      // if (tna_key === "2") {
      //   return;
      // }
    
    try {
      const response = await axios.get("api/users", {
        headers: {
          "bs-session-id": bsSessionId,
        },
        params: {
          params: user.user_id,
        },
      });

      console.log("WebSocket Event Received:", datetime); // Add this to track events

      const userImage = response.data.data.User.photo
        ? response.data.data.User.photo
        : undefined;

      const userCustomFields = response.data.data.User.user_custom_fields || [];

      const remarksField = userCustomFields.find(
        (field: CustomField) => field.custom_field.name === "Remarks"
      );

      const livedNameField = userCustomFields.find(
        (field: CustomField) => field.custom_field.name === "Lived Name"
      );
      const gateField = userCustomFields.find(
        (field: CustomField) => field.custom_field.name === "Gate"
      );
      const userData: UserProps = {
        user_id: response.data.data.User.user_id,
        name: response.data.data.User.name,
        photo_exist: response.data.data.User.photo_exist,
      };

      const deviceData: DeviceProps = {
        id: device.id,
        name: device.name || `Device ${device.id}`,
      };

      const remarks = remarksField ? (remarksField.item as string) : undefined;
      const livedName = livedNameField
        ? (livedNameField.item as string)
        : undefined;
      const gateValue =
        gateField && gateField.item !== null && gateField.item !== undefined
          ? String(gateField.item).trim()
          : "";
      const gate =
        gateValue ||
        (deviceData.name ? String(deviceData.name).trim() : "") ||
        (deviceData.id ? String(deviceData.id).trim() : "") ||
        "Unknown Gate";

      const disabled = response.data.data.User.disabled;
      const expiryDate = response.data.data.User.expiry_datetime;

      const newDeviceData = {
        user: userData,
        device: deviceData,
        datetime,
        remarks: remarks ?? "No remarks",
        livedName,
        userImage,
        disabled,
        expiryDate,
        tnaKey: tna_key,
        eventTypeId: event_type_id.name,
        gate,
      };

      // setDevicesData((prevData) => ({
      //   ...prevData,
      //   [device.id]: {
      //     user: userData,
      //     device: deviceData,
      //     datetime,
      //     remarks: remarks ?? "No remarks",
      //     livedName,
      //     userImage,
      //     disabled,
      //     expiryDate,
      //     tnaKey: tna_key,
      //   },
      // }));

      // Update table queue with length limit (prepend so newest appears first)
      setTableQueue((prevQueue) => {
        const newQueue = [newDeviceData, ...prevQueue];
        return newQueue.length > 25 ? newQueue.slice(0, 25) : newQueue;
      });

      // Update stats queue without limit
      // setDeviceQueue((prevQueue) => [...prevQueue, newDeviceData]);

      const reportEventKey = buildEventKey(
        newDeviceData.user.user_id,
        newDeviceData.device.id,
        newDeviceData.datetime,
        newDeviceData.eventTypeId,
        newDeviceData.tnaKey
      );

      // Guard report inserts against websocket replay/reconnect duplicates.
      if (!postedReportsRef.current.has(reportEventKey)) {
        const reportData = mapScanToReportData(newDeviceData);
        // Only mark as "posted" once the write actually succeeds. On
        // failure (missing token or a rejected POST), queue it for retry
        // instead of silently dropping it.
        const success = await sendReport(reportData);
        if (success) {
          postedReportsRef.current.add(reportEventKey);
        } else {
          pendingReportsRef.current.set(reportEventKey, {
            reportEventKey,
            reportData,
            attempts: 0,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchEventData = async (bsSessionId: string) => {
    try {
      const response = await axios.post(
        "/api/events",
        {
          Query: {
            limit: 51,
            conditions: [
              {
                column: "datetime",
                operator: 3,
                values: [new Date().toISOString()],
              },
            ],
            orders: [
              {
                column: "datetime",
                descending: false,
              },
            ],
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "bs-session-id": bsSessionId,
          },
        }
      );

      console.log("Fetched event data:", response.data);
    } catch (error) {
      console.error("Error fetching event data:", error);
    }
  };

  const handleClear = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const handleConfirmClear = useCallback(() => {
    setTableQueue([]);
    setIsDialogOpen(false);
  }, []);

  const handleCancelClear = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  // Retry queue for reports that failed to send (missing token or a
  // rejected POST). Runs on a fixed interval, separate from the midnight
  // check below, and gives up loudly after 5 attempts per report instead of
  // retrying forever or dropping silently.
  useEffect(() => {
    const RETRY_INTERVAL_MS = 5000;
    const MAX_ATTEMPTS = 5;
    const BATCH_SIZE = 10;
    let isRunning = false;

    const runOne = async (
      key: string,
      pending: { reportData: ReportData; attempts: number }
    ) => {
      const success = await sendReport(pending.reportData);
      if (success) {
        postedReportsRef.current.add(key);
        pendingReportsRef.current.delete(key);
        return;
      }

      pending.attempts += 1;
      if (pending.attempts >= MAX_ATTEMPTS) {
        console.error(
          `Gate scan report permanently failed after ${MAX_ATTEMPTS} attempts:`,
          pending.reportData
        );
        pendingReportsRef.current.delete(key);
      }
    };

    // async setInterval callbacks aren't serialized by the browser, so a
    // batch that outlives one tick would otherwise overlap the next tick's
    // batch and could double-POST the same key. isRunning skips a tick
    // entirely if the previous one hasn't finished yet.
    const interval = setInterval(async () => {
      if (isRunning) {
        return;
      }
      isRunning = true;
      try {
        const entries = Array.from(pendingReportsRef.current.entries());
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(([key, pending]) => runOne(key, pending)));
        }
      } finally {
        isRunning = false;
      }
    }, RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sendReport]);

  // Midnight detection and auto-clear
  const lastCheckedDateRef = useRef<string>(
    `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`
  );
  
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const currentDateString = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      
      // Check if the date has changed (midnight has passed)
      if (currentDateString !== lastCheckedDateRef.current) {
        setTableQueue([]);
        processedEventsRef.current.clear();
        postedReportsRef.current.clear();
        lastCheckedDateRef.current = currentDateString;
      }
    };
    
    // Check every minute
    const interval = setInterval(checkMidnight, 60000);
    
    // Also check immediately on mount in case component was mounted after midnight
    checkMidnight();
    
    return () => clearInterval(interval);
  }, []);

  // calculate counts from deviceQueue
  // useEffect(() => {
  //   const entry = deviceQueue.filter((item) => item.tnaKey === "1").length;
  //   const exit = deviceQueue.filter((item) => item.tnaKey === "2").length;
  //   const onPremise = entry - exit;

  //   setAccessCounts({
  //     entry,
  //     exit,
  //     onPremise: onPremise >= 0 ? onPremise : 0, // Ensure it doesn't go negative
  //   });
  // }, [deviceQueue]);

  return (
    <div className="p-6">
       {/* <button onClick={scanSimulation} className="btn btn-primary">Simulate Scan</button> */}

      <div>
        <h2 className="mb-4 text-lg font-medium">Access Counts Overview</h2>

        <div className="mb-6 grid grid-cols-12 gap-4">
          {/* Stats and Gate Access in same row */}
          {
            <div className="col-span-3 grid grid-cols-1 gap-4">
              <StatisticsCard
                icon={
                  <LogIn className="h-10 w-10 text-[#4fd1c5] transform rotate-180" />
                }
                count={stats?.entry}
                label="Entry"
              />
            </div>
          }

          {/* Gate Access Stats */}
          <div className="col-span-9 rounded-lg px-4">
            <h2 className="mb-4 text-lg font-medium">Gate Access Stats</h2>
            <GateAccessStats data={stats?.gateAccessStats} />
          </div>
        </div>

        {/* Live Data Table */}
        <LiveDataTable data={filteredTableQueue} handleClear={handleClear} />
      </div>
      {/* Confirmation Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Live Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all entries from the live data
              table?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleCancelClear}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmClear}>
                Clear Data
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
