"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import Cookies from "js-cookie";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";

interface TimePickerProps {
  defaultValue?: string;
  time?: string;
  onSave: (time: string) => void;
  onClose: () => void;
  endpoint?: string;
}

export function TimePicker({
  defaultValue = "00:00",
  time,
  onSave,
  onClose,
  endpoint = "/database-sync/schedule",
}: TimePickerProps) {
  const { toast } = useToast();
  const [hour, setHour] = useState(defaultValue.split(":")[0].padStart(2, "0"));
  const [minute, setMinute] = useState(
    defaultValue.split(":")[1].split(" ")[0]
  );

  const handleSave = async () => {
    onSave(`${hour}:${minute}`);
    const user = Cookies.get("user");
    const token = user ? JSON.parse(user).token : null;

    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}${endpoint}`,
        {
          scheduleNumber: time === "morning" ? 1 : 2,
          time: `${hour}:${minute}`,
        },
        {
          headers: {
            Authorization: `${token}`,
            Accept: "application/json",
          },
        }
      );
      if (res.data) {
        toast({
          title: "Success",
          description: "Sync schedule time saved.",
        });
        onClose();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 rounded-xl">
      <Card className="w-[300px]">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-medium">Set Time</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <Select value={hour} onValueChange={setHour}>
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent>
                {time === "evening"
                  ? Array.from({ length: 12 }, (_, i) => {
                      const hour = i + 12; // Start from 12 and go up to 23
                      return hour.toString().padStart(2, "0");
                    }).map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))
                  : Array.from({ length: 12 }, (_, i) => {
                      const hour = i; // Start from 0 and go up to 11
                      return hour.toString().padStart(2, "0");
                    }).map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
            <span className="text-xl">:</span>
            <Select value={minute} onValueChange={setMinute}>
              <SelectTrigger className="w-[70px]">
                <SelectValue placeholder="Minute" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 60 }, (_, i) =>
                  i.toString().padStart(2, "0")
                ).map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="mt-4 w-full" onClick={handleSave}>
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
