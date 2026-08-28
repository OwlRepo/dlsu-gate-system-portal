"use client";

import TurnstileGrid from "./TurnstileGrid";
import EntriesLog from "./EntriesLog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { useCallback, useEffect, useRef, useState } from "react";
// import axios from "axios";
import axios from "@/lib/axios-interceptor";
import {
  CustomField,
  DeviceProps,
  EventProps,
  ReportData,
  // ReportData,
  ScanProps,
  UserProps,
} from "@/lib/types";
import useUserToken from "@/hooks/useUserToken";
import { getAccessStatus, toLegacyStatus } from "@/lib/access-status";
import {
  deviceDisplayName,
  normalizeDeviceId,
  normalizeUserId,
} from "@/lib/biostar-event";
import { reconnectDelayMs } from "@/lib/ws-reconnect";
import { fetchSyncedPhoto } from "@/lib/synced-photo";

// Max retry attempts for a report POST before it is dropped (loudly logged).
const MAX_REPORT_POST_ATTEMPTS = 5;
// Retry interval (ms) for anything sitting in the pending-reports queue.
const REPORT_RETRY_INTERVAL_MS = 5000;

interface PendingReport {
  key: string;
  reportData: ReportData;
  attempts: number;
}

export default function TurnstileDashboard() {
  const { token } = useUserToken();
  const [devicesData, setDevicesData] = useState<{ [key: string]: ScanProps }>(
    {}
  );
  const [deviceQueue, setDeviceQueue] = useState<ScanProps[]>([]);
  const [reportQueue, setReportQueue] = useState<ScanProps[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Latest token, readable from callbacks/intervals without stale-closure risk.
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Guards against processing the same raw WS event twice (true duplicates/replays).
  const processedEventsRef = useRef<Set<string>>(new Set());
  // Guards against re-POSTing a report that already succeeded.
  const postedReportsRef = useRef<Set<string>>(new Set());
  // Reports that failed to POST (network error or missing token), retried on an interval.
  const pendingReportsRef = useRef<Map<string, PendingReport>>(new Map());
  // Per-tile last-updated timestamp, so tiles expire individually instead of
  // the whole grid being wiped on a timer that resets on every new scan.
  const deviceTileTimestampsRef = useRef<Map<string, number>>(new Map());

  // Composite key so IN and OUT events for the same user/device/timestamp never collide.
  const buildEventKey = useCallback(
    (
      userId: string,
      deviceId: string,
      datetime: string,
      eventTypeName?: string,
      tnaKey?: string
    ) =>
      `${userId}-${deviceId}-${datetime}-${eventTypeName ?? "UNKNOWN"}-${
        tnaKey ?? "NONE"
      }`,
    []
  );

  const getEntryStatus = useCallback((scan: ScanProps): string => {
    return toLegacyStatus(getAccessStatus(scan));
  }, []);

  // Sends one report, marking it posted only after a confirmed successful POST.
  // Missing token or a failed POST lands the report in the pending-retry queue instead
  // of being silently dropped.
  const attemptSendReport = useCallback(
    async (key: string, reportData: ReportData) => {
      if (postedReportsRef.current.has(key)) {
        pendingReportsRef.current.delete(key);
        return;
      }

      const currentToken = tokenRef.current;
      if (!currentToken) {
        const existing = pendingReportsRef.current.get(key);
        const attempts = (existing?.attempts ?? 0) + 1;

        if (attempts >= MAX_REPORT_POST_ATTEMPTS) {
          console.error(
            `TurnstileDashboard: dropping report after ${MAX_REPORT_POST_ATTEMPTS} attempts (no auth token), key=${key}`
          );
          pendingReportsRef.current.delete(key);
          return;
        }

        pendingReportsRef.current.set(key, { key, reportData, attempts });
        return;
      }

      try {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/reports`,
          reportData,
          {
            headers: {
              accept: "*/*",
              "Content-Type": "application/json",
              Authorization: `${currentToken}`,
            },
          }
        );

        postedReportsRef.current.add(key);
        pendingReportsRef.current.delete(key);
      } catch (error) {
        console.error("Error sending report:", error);
        const existing = pendingReportsRef.current.get(key);
        const attempts = (existing?.attempts ?? 0) + 1;

        if (attempts >= MAX_REPORT_POST_ATTEMPTS) {
          console.error(
            `TurnstileDashboard: dropping report after ${MAX_REPORT_POST_ATTEMPTS} failed attempts, key=${key}`
          );
          pendingReportsRef.current.delete(key);
          return;
        }

        pendingReportsRef.current.set(key, { key, reportData, attempts });
      }
    },
    []
  );

  // const WS_HOST = 'wss://192.168.0.22:8888';
  // const BIOSTAR2_WS_URI = `${WS_HOST}/wsapi`;
  const BIOSTAR2_WS_URI = `${process.env.NEXT_PUBLIC_WS_HOST}/wsapi`;

  // this is for simulating scan
  // const scanSimulation = () => {

  //   const futureDate = new Date();
  //   futureDate.setHours(futureDate.getHours() + 1);

  //   const expiredDate = new Date(2010, 11, 31);

  //   const scanDetail: ScanProps = {  // Add explicit type here
  //     user: {
  //       user_id: "1",
  //       name: "John Doe",
  //       photo_exist: false,
  //     },
  //     device: {
  //       // id: "538204298",
  //       id: '538203430',
  //       // id: "546164222",
  //       name: "Turnstile 1",
  //     },
  //     datetime: new Date().toISOString(),
  //     remarks: "No remarks",
  //     livedName: "John",
  //     userImage: "/default-user-icon.png",
  //     disabled: "false",  // Change to string type "false" instead of boolean false
  //     // expiryDate: futureDate.toISOString(),
  //     expiryDate: expiredDate.toISOString(),
  //     tnaKey: "2",
  //   };

  //   setDevicesData((prevData) => ({
  //     ...prevData,
  //     [scanDetail.device.id]: scanDetail,
  //   }));

  //   setDeviceQueue((prevQueue) => {
  //     const newQueue = [...prevQueue, scanDetail];
  //     // Remove first item if queue length exceeds 25
  //     return newQueue.length > 25 ? newQueue.slice(1) : newQueue;
  //   });
  // };

  // const scanSimulation = async () => {
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
  //       photo_exist: false,
  //     };

  //     const device = {
  //       id: "538203430", // Choose one of your actual device IDs
  //       name: "Turnstile 1",
  //     };

  //     // Current time
  //     const datetime = new Date().toISOString();

  //     // tna_key of 1 for entry (IN)
  //     // const tna_key = undefined;
  //     const tna_key = "";

  //     // Event type
  //     const event_type_id = {
  //       code: "102",
  //       name: "ACCESS_DENIED_APB"
  //     };

  //     // Call the same function that processes real scans
  //     await fetchUserData(
  //       bsSessionId,
  //       user,
  //       device,
  //       datetime,
  //       tna_key,
  //       event_type_id
  //     );

  //     console.log("Scan simulation completed using fetchUserData");
  //   } catch (error) {
  //     console.error("Error in scan simulation:", error);
  //   }
  // };

  useEffect(() => {
    // Hoisted to the effect scope (not the inner async function) so the cleanup
    // returned by this useEffect can actually see and close the real socket.
    let ws: WebSocket | undefined;
    // Auto-reconnect: BioStar keeps one session per account, so another login
    // (e.g. the admin dashboard) kills this page's session and closes the
    // socket. Without a reconnect the feed stayed dead until a manual reload.
    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = reconnectDelayMs(reconnectAttempt++);
      console.warn(`BioStar WebSocket down — reconnecting in ${delay}ms`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        fetchSessionId();
      }, delay);
    };

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
          ws = new WebSocket(BIOSTAR2_WS_URI);
          setSessionId(response.data.bsSessionId);

          ws.onopen = () => {
            console.log("WebSocket connection established.");
            reconnectAttempt = 0;
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

              const eventKey = buildEventKey(
                normalizedUserId,
                normalizedDeviceId,
                datetime,
                event_type_id?.name,
                tna_key
              );

              // True duplicate/replay of an already-processed WS event: skip.
              if (processedEventsRef.current.has(eventKey)) {
                return;
              }
              processedEventsRef.current.add(eventKey);

              // Pass real UserProps/DeviceProps objects, not raw id strings —
              // fetchUserData's signature expects objects (user.user_id,
              // device.id); passing bare strings here previously made every
              // lookup/report carry undefined user/device identity.
              // Pass real UserProps/DeviceProps objects, not raw id strings —
              // fetchUserData's signature expects objects (user.user_id,
              // device.id); passing bare strings here previously made every
              // lookup/report carry undefined user/device identity.
              fetchUserData(
                response.data.bsSessionId,
                {
                  user_id: normalizedUserId,
                  name: "",
                  photo_exist: false,
                },
                {
                  id: normalizedDeviceId,
                  name: deviceDisplayName(device_id, normalizedDeviceId),
                },
                datetime,
                tna_key,
                event_type_id
              );
            }
          };

          ws.onerror = (error) => {
            console.error("WebSocket error:", error);
          };

          ws.onclose = () => {
            console.log("WebSocket connection closed.");
            scheduleReconnect();
          };
        } else {
          console.error(
            "Session ID is missing. Cannot establish WebSocket connection."
          );
        }
      } catch (error) {
        console.error("Error logging in:", error);
        scheduleReconnect();
      }
    };

    fetchSessionId();

    // Cleanup on component unmount — returned from the outer effect itself so it
    // always sees the real `ws`, instead of being discarded from inside the async fn.
    return () => {
      disposed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
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
    datetime: string,
    tna_key: string,
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

      // BioStar first. On the Dasma deployment nothing ever uploads a photo TO
      // BioStar, so when it has none the copy the sync pulled into PostgreSQL
      // is the only one there is — without this fallback that photo is never
      // displayed anywhere.
      const userImage =
        response.data.data.User.photo ||
        (await fetchSyncedPhoto(String(user.user_id ?? ""), tokenRef.current));

      const userCustomFields = response.data.data.User.user_custom_fields || [];

      const remarksField = userCustomFields.find(
        (field: CustomField) => field.custom_field.name === "Remarks"
      );

      const livedNameField = userCustomFields.find(
        (field: CustomField) => field.custom_field.name === "Lived Name"
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

      const disabled = response.data.data.User.disabled;
      const expiryDate = response.data.data.User.expiry_datetime;

      deviceTileTimestampsRef.current.set(device.id, Date.now());
      setDevicesData((prevData) => ({
        ...prevData,
        [device.id]: {
          user: userData,
          device: deviceData,
          datetime: datetime,
          remarks: remarks ?? "No remarks",
          livedName,
          userImage,
          disabled,
          expiryDate,
          tnaKey: tna_key,
          eventTypeId: event_type_id.name,
        },
      }));

      // Array push (like deviceQueue below), not keyed by device.id — two scans on
      // the same turnstile before the flush effect runs must not overwrite each other.
      setReportQueue((prevQueue) => [
        ...prevQueue,
        {
          user: userData,
          device: deviceData,
          datetime: datetime,
          remarks: remarks ?? "No remarks",
          livedName,
          userImage,
          disabled,
          expiryDate,
          tnaKey: tna_key,
          eventTypeId: event_type_id.name,
        },
      ]);

      setDeviceQueue((prevQueue) => {
        const newDeviceData = {
          user: userData,
          device: deviceData,
          datetime: datetime,
          remarks: remarks ?? "No remarks",
          livedName,
          userImage,
          disabled,
          expiryDate,
          tnaKey: tna_key,
        };

        const isApbEvent = event_type_id.name?.includes("APB");
        const isOutEvent = tna_key === "2";

        // const newQueue = [...prevQueue, newDeviceData];
        // // Remove first item if queue length exceeds 10
        // return newQueue.length > 50 ? newQueue.slice(1) : newQueue;

        // Only add to queue if it's not an APB event and not an OUT event
        if (!isApbEvent && !isOutEvent) {
          const newQueue = [...prevQueue, newDeviceData];
          // Remove first item if queue length exceeds 50
          return newQueue.length > 50 ? newQueue.slice(1) : newQueue;
        }

        // Return the previous queue unchanged if it's an APB event or OUT event
        return prevQueue;
      });
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

  // Sweeps stale tiles individually on a fixed interval, rather than wiping
  // the whole grid on a timer keyed on `devicesData` itself — that pattern
  // resets on every new scan, so during a busy period the tiles never
  // cleared at all.
  useEffect(() => {
    const TILE_EXPIRY_MS = 5000;
    const SWEEP_INTERVAL_MS = 1000;

    const sweep = () => {
      const now = Date.now();
      setDevicesData((prevData) => {
        let changed = false;
        const next: { [key: string]: ScanProps } = {};

        for (const [deviceId, scan] of Object.entries(prevData)) {
          const lastUpdated = deviceTileTimestampsRef.current.get(deviceId) ?? 0;
          if (now - lastUpdated < TILE_EXPIRY_MS) {
            next[deviceId] = scan;
          } else {
            changed = true;
            deviceTileTimestampsRef.current.delete(deviceId);
          }
        }

        return changed ? next : prevData;
      });
    };

    const interval = setInterval(sweep, SWEEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Flush effect: iterate the reportQueue array directly (not Object.values — the
  // queue is a plain array now, see the setReportQueue fix above) so every distinct
  // scan queued before this effect ran gets its own send attempt, not just the last.
  useEffect(() => {
    if (reportQueue.length === 0) {
      return;
    }

    reportQueue.forEach((scan) => {
      let typeValue = "";
      if (scan.eventTypeId?.includes("APB")) {
        typeValue = "";
      } else if (scan.tnaKey === "1") {
        typeValue = "1";
      } else if (scan.tnaKey === "2") {
        typeValue = "2";
      }

      const reportData: ReportData = {
        datetime: scan.datetime,
        type: typeValue,
        user_id: scan.user.user_id,
        name: scan.user.name,
        remarks: scan.remarks || "No remarks",
        status: getEntryStatus(scan),
        activity: scan.tnaKey === "1" ? "IN" : "OUT",
        device: scan.device.name,
      };

      const key = buildEventKey(
        scan.user.user_id,
        scan.device.id,
        scan.datetime,
        scan.eventTypeId,
        scan.tnaKey
      );

      // Mark-as-posted only happens inside attemptSendReport, after a confirmed
      // successful POST — never before, so a failed/missing-token send can't be
      // mistaken for "already recorded".
      attemptSendReport(key, reportData);
    });

    setReportQueue([]);
  }, [reportQueue, buildEventKey, getEntryStatus, attemptSendReport]);

  // Bounded retry for anything sitting in the pending-reports queue (failed POST or
  // missing token at send time). Snapshot + batched-parallel + an in-flight guard,
  // matching dashboard.tsx's retry loop shape: a plain unawaited forEach here would
  // fire unbounded concurrent POSTs and let overlapping ticks double-send the same
  // key, since async setInterval callbacks aren't serialized by the browser.
  useEffect(() => {
    const BATCH_SIZE = 10;
    let isRunning = false;

    const interval = setInterval(async () => {
      if (isRunning || pendingReportsRef.current.size === 0) {
        return;
      }
      isRunning = true;
      try {
        const entries = Array.from(pendingReportsRef.current.values());
        for (let i = 0; i < entries.length; i += BATCH_SIZE) {
          const batch = entries.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map((pending) => attemptSendReport(pending.key, pending.reportData))
          );
        }
      } finally {
        isRunning = false;
      }
    }, REPORT_RETRY_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [attemptSendReport]);

  // Midnight detection and auto-clear, matching dashboard.tsx's pattern — this
  // component is a permanently-mounted lobby display, so without this the
  // dedupe Sets below would grow unboundedly for as long as it stays open.
  const lastCheckedDateRef = useRef<string>(
    `${new Date().getFullYear()}-${new Date().getMonth()}-${new Date().getDate()}`
  );

  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const currentDateString = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

      if (currentDateString !== lastCheckedDateRef.current) {
        processedEventsRef.current.clear();
        postedReportsRef.current.clear();
        setDeviceQueue([]);
        lastCheckedDateRef.current = currentDateString;
      }
    };

    const interval = setInterval(checkMidnight, 60000);
    checkMidnight();

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* <button onClick={scanSimulation} className="btn btn-primary">
        Simulate Scan
      </button> */}
      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="min-w-[75%] max-w-[75%]">
          <CardHeader>
            <CardTitle>Access Overview</CardTitle>
            <CardDescription>Real-Time Entry</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-row flex-wrap gap-4">
            <TurnstileGrid
              scanDetails={Object.values(devicesData).filter((scan) => {
                const isApbViolationHard =
                  scan.eventTypeId === "ACCESS_DENIED_APB";
                const isApbEvent = scan.eventTypeId?.includes("APB");
                const isOutEvent = scan.tnaKey === "2";

                return !isApbViolationHard && !isApbEvent && !isOutEvent;
              })}
              setScanDetail={(newScanDetail) => {
                deviceTileTimestampsRef.current.set(
                  newScanDetail.device.id,
                  Date.now()
                );
                setDevicesData((prevData) => ({
                  ...prevData,
                  [newScanDetail.device.id]: newScanDetail,
                }));
              }}
              turnstileCount={4}
              sessionId={sessionId || ""}
            />
          </CardContent>
        </Card>

        <EntriesLog queue={deviceQueue} />
      </div>
    </div>
  );
}
