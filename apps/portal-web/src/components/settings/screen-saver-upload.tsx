"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderClosed, SlidersHorizontal, Upload, X } from "lucide-react";
// import Image from "next/image";
import axios from "@/lib/axios-interceptor";
import { transformScreensaverImageUrl } from "@/lib/screensaver-url";
import Cookies from "js-cookie";
import { useDropzone } from "react-dropzone";
import { useToast } from "@/hooks/use-toast";

export function ScreenSaverUpload() {
  const { toast } = useToast();
  const [image, setImage] = useState<string | null>(null);
  const [showConfigure, setShowConfigure] = useState(false);
  const [defaultScreensaverUrl, setDefaultScreensaverUrl] = useState<
    string | null
  >(null);
  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/*": [],
    },
    multiple: false,
    onDrop: (acceptedFiles) => {
      handleImageUpload(acceptedFiles);
    },
  });
  const [interval, setInterval] = useState<string>("60000");

  const user = Cookies.get("user");
  const token = user ? JSON.parse(user).token : null;

  const withCacheBust = (url: string, version?: string) => {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(version ?? Date.now().toString())}`;
  };

  const fetchScreensaverPreview = async () => {
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/screensaver`,
        {
          headers: {
            Authorization: `${token}`,
          },
        },
      );
      if (res.status === 200 && res.data?.data?.url) {
        const url = withCacheBust(
          transformScreensaverImageUrl(res.data.data.url),
          res.data?.data?.lastModified
            ? new Date(res.data.data.lastModified).getTime().toString()
            : undefined,
        );
        setDefaultScreensaverUrl(url);
        setImage(url);
      }
    } catch {
      setDefaultScreensaverUrl(null);
      setImage(null);
    }
  };

  const handleImageUpload = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/screensaver/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `${token}`,
          },
        },
      );

      // Refresh preview from GET to ensure correct URL and display
      await fetchScreensaverPreview();
      toast({
        title: "Success",
        description: "Screensaver image uploaded successfully",
        duration: 3000,
      });
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error(error);
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? error.response.data.message
          : "Unable to save or upload image.";
      toast({
        variant: "destructive",
        title: "Screensaver error",
        description: message,
        duration: 5000,
      });
    }
  };

  const handleIntervalChange = () => {
    if (interval) {
      localStorage.setItem("screensaverInterval", interval.toString());
    }
    setShowConfigure(false);
  };

  useEffect(() => {
    const storedInterval = localStorage.getItem("screensaverInterval");
    if (storedInterval) {
      setInterval(storedInterval);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/screensaver`,
          {
            headers: {
              Authorization: `${token}`,
            },
          },
        );

        if (res.status === 200 && res.data?.data?.url) {
          setDefaultScreensaverUrl(
            transformScreensaverImageUrl(res.data.data.url),
          );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch screensaver:", err);
        setDefaultScreensaverUrl(null);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token]);

  return (
    <Card className="h-fit">
      <CardHeader>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <CardTitle>{showConfigure ? "Configure" : "Screen Saver"}</CardTitle>
          {showConfigure && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowConfigure(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <CardDescription>
          Upload an image to be used as the screen saver
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!image && !showConfigure ? (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`flex flex-col items-center justify-center rounded-lg border border-dashed cursor-pointer ${
                image || defaultScreensaverUrl ? "py-2" : "p-8"
              }`}
            >
              <input {...getInputProps()} />
              {image || defaultScreensaverUrl ? (
                // <Image
                //   src={image || defaultScreensaverUrl || '/placeholder.svg'}
                //   alt="Screensaver"
                //   width={400}
                //   height={400}
                //   className="h-auto object-cover rounded-lg"
                // />
                // eslint-disable-next-line @next/next/no-img-element -- Dynamic upload preview
                <img
                  src={image || defaultScreensaverUrl || "/placeholder.svg"}
                  alt="Screensaver"
                  className="w-[400px] max-w-full h-auto object-cover rounded-lg"
                />
              ) : (
                <>
                  <Upload className="mb-5 h-[4.5rem] w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag or Drop to upload image
                  </p>
                </>
              )}
            </div>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handleImageUpload(Array.from(e.target.files || []))
                }
                className="absolute inset-0 cursor-pointer opacity-0"
              />

              {!defaultScreensaverUrl && (
                <Button className="flex items-center gap-2 w-full mb-2">
                  <FolderClosed className="h-5 w-5" />
                  Choose an image
                </Button>
              )}
            </div>
            {!image && defaultScreensaverUrl && (
              <Button
                className="flex items-center gap-2 w-full"
                onClick={() => setShowConfigure(true)}
              >
                <SlidersHorizontal className="h-5 w-5" />
                Configure
              </Button>
            )}
          </div>
        ) : showConfigure ? (
          <div className="space-y-4">
            {/* <div className="flex justify-between">
              <h3 className="text-sm font-medium">Configure</h3>
            </div> */}
            <p className="text-sm text-muted-foreground">
              Set the interval for the screen saver
            </p>
            <Select
              onValueChange={(value) => {
                setInterval(value);
              }}
              value={interval}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60000">Every 1 minute</SelectItem>
                <SelectItem value="300000">Every 5 minutes</SelectItem>
                <SelectItem value="600000">Every 10 minutes</SelectItem>
                <SelectItem value="900000">Every 15 minutes</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleIntervalChange} className="w-full">
              Save
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-auto overflow-hidden">
              {/* <Image
                src={image || '/placeholder.svg'}
                alt="Screen saver preview"
                width={300}
                height={300}
                className="h-auto object-cover rounded-lg mx-auto"
              /> */}
              {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic upload preview */}
              <img
                src={image || "/placeholder.svg"}
                alt="Screen saver preview"
                className="w-[300px] max-w-full h-auto object-cover rounded-lg mx-auto"
              />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowConfigure(true)}
            >
              Configure
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
