"use client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "../ui/button";
import { useState } from "react";
import axios from "axios";
import Cookies from "js-cookie";
import { useToast } from "@/hooks/use-toast";

interface formProps {
  onClose: () => void;
}

export default function AdminForm({ onClose }: formProps) {
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const userData = Cookies.get("user");
    const token = userData ? JSON.parse(userData).token : null;

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/super-admin/register`,
        {
          first_name: firstName,
          last_name: lastName,
          username,
          email,
          password,
        },
        {
          headers: {
            Authorization: `${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.status === 201) {
        // Handle successful creation
        toast({
          title: "Success",
          description: "Super Admin created successfully",
          duration: 3000,
        });
        onClose();
      } else {
        // Handle unexpected response
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      // Handle error with proper error typing
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // Handle bad request (validation errors, etc)
          const errorMessage =
            error.response.data?.message || "Invalid information provided";
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
            duration: 3000,
          });
          console.error("Error creating super admin:", errorMessage);
        } else {
          // Handle other types of errors
          toast({
            title: "Error",
            description: error.message || "An unexpected error occurred",
            variant: "destructive",
            duration: 3000,
          });
        }
      } else {
        // Handle non-axios errors
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
          duration: 3000,
        });
      }
      console.error("Error creating admin:", error);
    } finally {
      setLoading(false);
    }
  };

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

      <div className="text-right !mt-8">
        <Button className="" type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}
