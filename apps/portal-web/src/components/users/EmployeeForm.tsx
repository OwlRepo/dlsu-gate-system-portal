"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "../ui/button";
import { useEffect, useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { CustomMultiSelect } from "../custom/CustomMultiSelect";

export interface Device {
  id: string;
  name: string;
}

interface formProps {
  onClose: () => void;
}

export default function EmployeeForm({ onClose }: formProps) {
  const { toast } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const userData = Cookies.get("user");
    const token = userData ? JSON.parse(userData).token : null;

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/employee`,
        {
          first_name: firstName,
          last_name: lastName,
          username,
          email,
          password,
          device_id: selectedDevices,
        },
        {
          headers: {
            Authorization: `${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.success) {
        // Handle successful creation
        toast({
          title: "Success",
          description: "Employee created successfully",
          duration: 3000,
        });
        onClose();
      } else {
        // Handle unexpected response
        toast({
          title: "Error",
          description: `An unexpected error occurred. ${response.data.message}`,
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      // Handle error
      console.error("Error creating employee:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        duration: 3000,
      });
    } finally {
      setFormLoading(false);
    }
  };

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
        setSessionId(response.data.bsSessionId);
      } catch {
        console.error(
          "Session ID is missing. Cannot establish WebSocket connection."
        );
        return;
      }
    };
    fetchSessionId();
  }, []);

  useEffect(() => {
    if (sessionId) {
      setLoading(true);
      const fetchDevices = async () => {
        try {
          const response = await axios.get("/api/devices", {
            headers: {
              "bs-session-id": sessionId,
            },
            params: {
              params: false,
            },
          });

          if (response) {
            setDevices(response.data.data.DeviceCollection.rows);
            setLoading(false);
          }
        } catch (err) {
          console.error("Error fetching event data:", err);
          setLoading(false);
        }
      };

      fetchDevices();
    }
  }, [sessionId]);

  return (
    <form className="space-y-4 pt-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          placeholder="Enter username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="first-name">First Name</Label>
        <Input
          id="first-name"
          placeholder="Enter first name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="last-name">Last Name</Label>
        <Input
          id="last-name"
          placeholder="Enter last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Devices</Label>
        {loading ? (
          <div className="flex justify-center items-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <CustomMultiSelect
            options={devices.map((device) => ({
              label: device.name,
              value: device.id,
            }))}
            value={selectedDevices}
            onChange={setSelectedDevices}
            placeholder="Select device..."
            description={`Selected: ${selectedDevices.length}`}
          />
        )}
      </div>
      <div className="text-right !mt-8">
        <Button className="" type="submit" disabled={formLoading}>
          {formLoading ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}
