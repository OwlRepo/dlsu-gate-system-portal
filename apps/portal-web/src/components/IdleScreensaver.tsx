"use client";

import { useState, useEffect } from "react";
import { useIdleTimer } from "../hooks/useIdleTimer";
// import Image from "next/image";
import Cookies from "js-cookie";
// import axios from '@/lib/axios-interceptor';
import { usePathname } from "next/navigation";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import { transformScreensaverImageUrl } from "@/lib/screensaver-url";

export function IdleScreensaver() {
  const { toast } = useToast();
  const pathname = usePathname();
  const user = Cookies.get("user");
  const token = user ? JSON.parse(user).token : null;

  const [showScreensaver, setShowScreensaver] = useState(false);
  const [screensaverUrl, setScreensaverUrl] = useState("");
  const [interval, setInterval] = useState<string>("");

  const handleActivity = () => {
    setShowScreensaver(false);
  };

  useEffect(() => {
    const interval = localStorage.getItem("screensaverInterval");
    setInterval(interval ?? "60000");
  }, []);

  const isIdle = useIdleTimer(parseInt(interval, 10));

  useEffect(() => {
    setShowScreensaver(isIdle);
  }, [isIdle]);

  useEffect(() => {
    if (
      pathname === "/login" ||
      pathname === "/login/employee" ||
      pathname === "/employee-dashboard" ||
      !token
    ) {
      return;
    }

    const fetchData = async () => {
      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/screensaver`,
          {
            headers: {
              Authorization: token,
            },
          }
        );

        if (res.status === 200 && res.data?.data?.url) {
          setScreensaverUrl(transformScreensaverImageUrl(res.data.data.url));
        } else {
          setScreensaverUrl("");
        }
      } catch (err) {
        if (axios.isAxiosError(err)) {
          // Handle Axios error
          console.log("Axios error:", err.message);
        } else {
          // Handle other errors
          console.log("Unexpected error:", err);
          toast({
            title: "Error",
            description:
              "An unexpected error occurred. Please try again later.",
            variant: "destructive",
            duration: 5000,
          });
        }
        setScreensaverUrl("");
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, token]);

  // console.log(screensaverUrl);

  if (!showScreensaver || !screensaverUrl || screensaverUrl === "") return null;

  return (
    <div
      className="fixed inset-0 w-full h-full z-[9999]"
      onClick={handleActivity}
      onMouseMove={handleActivity}
      onKeyDown={handleActivity}
    >
      {/* {screensaverUrl && (
        <Image
          src={screensaverUrl}
          alt="Screensaver"
          layout="fill"
          objectFit="cover"
          priority
        />
      )} */}
      {screensaverUrl && (
        /* eslint-disable-next-line @next/next/no-img-element -- Dynamic API URL bypasses Next.js Image loader */
        <img
          src={screensaverUrl}
          alt="Screensaver"
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}
