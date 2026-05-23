"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Info } from "lucide-react";
import axios from "axios";
import { useToast } from "@/hooks/use-toast";
import useUserToken from "@/hooks/useUserToken";
import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

const accountFormSchema = z.object({
  employeeId: z.string(),
  username: z.string(),
  first_name: z.string(),
  last_name: z.string(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const defaultValues: Partial<AccountFormValues> = {
  employeeId: "",
  username: "",
  first_name: "",
  last_name: "",
};

export function AccountForm() {
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues,
  });

  const passwordForm = useForm({
    defaultValues: {
      newPassword: "",
    },
  });

  const { toast } = useToast();
  const { token, userId, role } = useUserToken();
  const user = Cookies.get("user");
  const userInfo = user ? JSON.parse(user).user : null;
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const onSubmit = async (data: AccountFormValues) => {
    // TODO: Implement save functionality
    try {
      const res = await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/super-admin/${
          userInfo.super_admin_id || userInfo.admin_id
        }`,
        {
          username: data.username,
          first_name: data.first_name,
          last_name: data.last_name,
        },
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );
      if (res.status === 200) {
        toast({
          title: "Account Info Updated",
          description:
            "Your account information has been updated successfully.",
        });
      } else {
        toast({
          title: "Error",
          description:
            "An error occurred while updating your account information.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          "An error occurred while updating your account information.",
        variant: "destructive",
      });
    }
  };

  const onPasswordSubmit = async (data: { newPassword: string }) => {
    try {
      const res = await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/${role}/${
          userInfo.super_admin_id || userInfo.admin_id
        }`,
        {
          password: data.newPassword,
        },
        {
          headers: {
            Authorization: `${token}`,
          },
        }
      );

      if (res.status === 200) {
        toast({
          title: "Password Updated",
          description: "Your password has been updated successfully.",
        });
        setIsPasswordDialogOpen(false);
        passwordForm.reset();
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          "Failed to update password. Please check your current password.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const fetchUserDetails = async () => {
      if (!userId || !token || isInitialized) return;

      try {
        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/${role}/${
            userInfo.super_admin_id || userInfo.admin_id
          }`,
          {
            headers: {
              Authorization: `${token}`,
            },
          }
        );
        if (res.status === 200) {
          const user = res.data;
          form.setValue(
            "employeeId",
            role === "super-admin" ? user.super_admin_id : user.admin_id
          );
          form.setValue("username", user.username);
          form.setValue("first_name", user.first_name || "N/A");
          form.setValue("last_name", user.last_name || "N/A");
          setIsInitialized(true);
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchUserDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo, token, role, isInitialized]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">Account Info</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Update your account information.
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="employeeId"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User ID</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="flex justify-end space-x-4">
            <Button variant="outline" type="submit">
              Save Changes
            </Button>
            <Button
              variant="default"
              className="bg-[#00BC65] hover:bg-green-600"
              type="button"
              onClick={() => setIsPasswordDialogOpen(true)}
            >
              Update Password
            </Button>
          </div>
        </form>
      </Form>

      <Dialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Password</DialogTitle>
          </DialogHeader>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-4 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPasswordDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Update Password</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
