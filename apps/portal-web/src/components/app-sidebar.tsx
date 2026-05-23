"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Settings,
  BarChart2,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  // SidebarTrigger,
} from "@/components/ui/sidebar";
import Image from "next/image";
import Cookies from "js-cookie";
import { useEffect, useState } from "react";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    title: "Reports",
    icon: BarChart2,
    href: "/reports",
  },
  {
    title: "User Management",
    icon: Users,
    href: "/user-management",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/settings",
  },
  {
    title: "About",
    icon: Info,
    href: "/about",
  },
];

export function AppSidebar() {
  const { isLoggedIn } = useAuth();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);

  const user = Cookies.get("user");
  const role = Cookies.get("role");
  const token = user ? JSON.parse(user).token : null;

  useEffect(() => {
    // Check if we have all the required data
    if (isLoggedIn !== undefined && role !== undefined && token !== undefined) {
      setIsLoading(false);
    }
  }, [isLoggedIn, role, token]);

  // Show nothing while loading
  if (isLoading) {
    return null;
  }

  // Check permissions after loading
  if (!isLoggedIn || role === "employee" || !token) {
    return null;
  }

  const filteredMenuItems = menuItems.filter((item) => {
    if (role === "admin" && item.title === "User Management") {
      return false;
    }
    return true;
  });

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="p-4 mb-4">
        <div className="flex items-center justify-center gap-2 mb-2 h-32">
          <Image
            src="/dlsu-logo-horizontal.png"
            alt="DLSU"
            width={195}
            height={100} // Keep this for optimization
            className="auto-height"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {filteredMenuItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/settings" && pathname.startsWith("/settings/"));

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-10 justify-start px-4 w-52 mx-auto",
                    isActive
                      ? "text-[#00bc65] bg-[#ddf3ea] font-bold  hover:text-green-600 hover:bg-[#ddf3ea]"
                      : "text-gray-400 hover:bg-gray-100",
                  )}
                >
                  <Link href={item.href} className="flex items-center gap-3">
                    <item.icon className="h-5 w-5" />
                    <span className="text-sm">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 flex flex-col items-center">
        <Image
          src="/verifyi.png"
          alt="verifyi-logo"
          width={130}
          height={130}
          className="auto-height"
        />
        <p className="text-center text-muted-foreground text-sm">
          version 1.0.0
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
