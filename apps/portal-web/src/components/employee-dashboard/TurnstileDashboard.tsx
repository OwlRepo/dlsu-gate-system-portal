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
import { useEffect, useState } from "react";
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
import { checkExpiry } from "@/lib/checkExpiry";

export default function TurnstileDashboard() {
  const { token } = useUserToken();
  const [devicesData, setDevicesData] = useState<{ [key: string]: ScanProps }>(
    {}
  );
  const [deviceQueue, setDeviceQueue] = useState<ScanProps[]>([]);
  const [reportQueue, setReportQueue] = useState<{ [key: string]: ScanProps }>(
    {}
  );
  const [sessionId, setSessionId] = useState<string | null>(null);

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
          const ws = new WebSocket(BIOSTAR2_WS_URI);
          setSessionId(response.data.bsSessionId);

          ws.onopen = () => {
            console.log("WebSocket connection established.");
            // Send the session ID to the WebSocket server
            ws.send(`bs-session-id=${response.data.bsSessionId}`);

            // Optionally call the event API after WebSocket connection is established
            setTimeout(() => {
              fetchEventData(response.data.bsSessionId);
            }, 1000);
          };

          ws.onmessage = (event) => {
            const eventData = JSON.parse(event.data);
            if (eventData.Event) {
              const { user_id, device_id, datetime, tna_key, event_type_id } =
                eventData.Event;
              if (user_id && device_id && datetime) {
                fetchUserData(
                  response.data.bsSessionId,
                  user_id,
                  device_id,
                  datetime,
                  tna_key,
                  event_type_id
                );
              }
            }
          };

          ws.onerror = (error) => {
            console.error("WebSocket error:", error);
          };

          ws.onclose = () => {
            console.log("WebSocket connection closed.");
          };

          // Cleanup on component unmount
          return () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          };
        } else {
          console.error(
            "Session ID is missing. Cannot establish WebSocket connection."
          );
          return;
        }
      } catch (error) {
        console.error("Error logging in:", error);
      }
    };

    fetchSessionId();

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

      const userData: UserProps = {
        user_id: response.data.data.User.user_id,
        name: response.data.data.User.name,
        photo_exist: response.data.data.User.photo_exist,
      };

      const deviceData: DeviceProps = {
        id: device.id,
        name: `${device.name} - ${device.id}`,
      };

      const remarks = remarksField ? (remarksField.item as string) : undefined;
      const livedName = livedNameField
        ? (livedNameField.item as string)
        : undefined;

      const disabled = response.data.data.User.disabled;
      const expiryDate = response.data.data.User.expiry_datetime;

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

      setReportQueue((prevData) => ({
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

  console.log(reportQueue);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDevicesData({});
    }, 5000);

    return () => clearTimeout(timer);
  }, [devicesData]);

  const getEntryStatus = (scan: ScanProps): string => {
    const isDisabled = scan.disabled === "true";
    const isExpired = checkExpiry(scan.expiryDate);
    const hasRemarks = scan.remarks !== "No remarks";
    const isApb = scan.eventTypeId?.includes("APB");

    if (isDisabled || isExpired || isApb) {
      return "RED;cannot enter with or without remarks";
    }

    if (hasRemarks) {
      return "YELLOW;can enter with remarks";
    }

    return "GREEN;can enter without remarks";
  };

  useEffect(() => {
    const sendReport = async (reportData: ReportData) => {
      try {
        const response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/reports`,
          reportData,
          {
            headers: {
              accept: "*/*",
              "Content-Type": "application/json",
              Authorization: `${token}`,
            },
          }
        );

        if (response.data) {
          console.log("Report sent successfully:", response.data);
        }
      } catch (error) {
        console.error("Error sending report:", error);
      }
    };

    // Get the latest scan from devicesData
    // const latestScan = Object.values(reportQueue)[0];

    // console.log(latestScan);

    // if (latestScan) {
    //   // Determine the type value based on conditions
    //   let typeValue = "";
    //   if (latestScan.eventTypeId?.includes("APB")) {
    //     typeValue = ""; // Empty string for APB events
    //   } else if (latestScan.tnaKey === "1") {
    //     typeValue = "1"; // Keep "1" for IN events
    //   } else if (latestScan.tnaKey === "2") {
    //     typeValue = "2"; // Explicitly set "2" for any non-IN events
    //   }
      
    //   const reportData: ReportData = {
    //     datetime: latestScan.datetime,
    //     type: typeValue,
    //     user_id: latestScan.user.user_id,
    //     name: latestScan.user.name,
    //     remarks: latestScan.remarks || "No remarks",
    //     status: getEntryStatus(latestScan),
    //     activity: latestScan.tnaKey === "1" ? "IN" : "OUT",
    //   };
    
    //   sendReport(reportData);
    // }
    Object.values(reportQueue).forEach(scan => {
      // Your existing logic to create and send reports
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
    
      sendReport(reportData);
    });
    
    // Clear the queue after processing
    if (Object.keys(reportQueue).length > 0) {
      setReportQueue({});
    }
    // include getEntryStatus if failing
  }, [reportQueue, token]);

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
