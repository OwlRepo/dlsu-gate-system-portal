"use client";
import React, { FormEvent, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { UserHeader } from "./UserManagementPageContainer";
import axios from "axios";
import Cookies from "js-cookie";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { CustomMultiSelect } from "../custom/CustomMultiSelect";

interface EditDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserHeader | null;
  refetchUserList: () => void;
  // onSave: (updatedUser: UserHeader) => void;
}

interface Device {
  id: string;
  name: string;
}

const EditDetailsDialog: React.FC<EditDetailsDialogProps> = ({
  isOpen,
  onClose,
  user,
  refetchUserList,
  // onSave,
}) => {
  const { toast } = useToast();

  const [role, setRole] = useState(user?.ROLE || "");
  const [username, setUsername] = useState(user?.USERNAME || "");
  const [firstName, setFirstName] = useState(user?.FIRST_NAME || "");
  const [lastName, setLastName] = useState(user?.LAST_NAME || "");
  const [email, setEmail] = useState(user?.EMAIL || "");
  const [password, setPassword] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (user) {
        const userData = Cookies.get("user");
        const token = userData ? JSON.parse(userData).token : null;

        const res = await axios.patch(
          `${process.env.NEXT_PUBLIC_API_URL}/${role}/${user.EMPLOYEE_ID}`,
          {
            first_name: firstName,
            last_name: lastName,
            email,
            password,
            // include device if role is employee
            ...(role === "employee" && { device_id: selectedDevices }),
          },
          {
            headers: {
              Authorization: `${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (res.data) {
          toast({
            title: "Success",
            description: "User details updated successfully",
            duration: 3000,
          });
          refetchUserList();
          setPassword("");
          onClose();
        } else {
          toast({
            title: "Error",
            description: "An unexpected error occurred",
            variant: "destructive",
            duration: 3000,
          });
        }
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: `An unexpected error occurred, ${e}`,
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  useEffect(() => {
    if (user) {
      setFirstName(user.FIRST_NAME);
      setLastName(user.LAST_NAME);
      setEmail(user.EMAIL || "");
      setRole(user.ROLE);
      setUsername(user.USERNAME);
    }
  }, [user]);

  const handleClose = () => {
    onClose();
    setPassword("");
  };

  useEffect(() => {
    if (user && role === "employee") {
      const fetchEmployeeById = async () => {
        try {
          const userData = Cookies.get("user");
          const token = userData ? JSON.parse(userData).token : null;

          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/employee/${user?.EMPLOYEE_ID}`,
            {
              headers: {
                Authorization: `${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (response.data) {
            const deviceIds = response.data.data.device_id;
            const selectedDevices = deviceIds.map((deviceId: string) => {
              const device = devices.find((d) => d.id === deviceId);
              return device
                ? { id: device.id, label: device.name }
                : { id: deviceId, label: deviceId };
            });
            setSelectedDevices(
              selectedDevices.map((device: Device) => device.id)
            );
          }
        } catch (err) {
          console.error("Error fetching employee data:", err);
        }
      };

      fetchEmployeeById();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user]);

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
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Edit User Details</DialogTitle>
          <DialogDescription>Edit the details of the user</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Username
              </p>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                First Name
              </p>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Last Name
              </p>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Password
              </p>
              <div className="relative mt-1">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  className="pr-10" // Add padding to the right for the icon
                />
                <button
                  type="button" // Ensure it doesn't submit the form
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
            {role === "employee" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Devices
                </p>
                {loading && selectedDevices ? (
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
            )}
            <DialogFooter>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditDetailsDialog;
