"use client"; // Mark this component as a client component

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation"; // Import usePathname
import { useAuth } from "@/lib/auth-context";
import { LogOut } from "lucide-react";
import Image from "next/image";
import Cookies from "js-cookie";

export function AppBar() {
  const { user, logout, isLoggedIn } = useAuth();
  const pathname = usePathname(); // Get the current pathname

  const userCookie = Cookies.get("user");
  const role = Cookies.get("role");
  const token = userCookie ? JSON.parse(userCookie).token : null;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [formattedDate, setFormattedDate] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isLoginPage = pathname === "/login" || pathname === "/login/employee";

  // Determine the title based on the current pathname
  const getTitle = () => {
    // Check if the pathname is 'settings/operation'
    if (pathname === "/settings/operation") {
      return "Settings"; // Return 'Settings' if the pathname matches
    }

    return (
      pathname
        .replace(/^\/|\/$/g, "") // Remove leading and trailing slashes
        .split("-") // Split by hyphens
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        ) // Capitalize first letter
        .join(" ") || "Dashboard" // Default title if pathname is empty
    );
  };

  // Update the date every second
  useEffect(() => {
    const updateDate = () => {
      setCurrentDate(new Date());
    };

    const intervalId = setInterval(updateDate, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Format the date in the user's locale
  useEffect(() => {
    if (isLoggedIn) {
      const formattedDate = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(currentDate);
      setFormattedDate(formattedDate);
    }
  }, [currentDate, isLoggedIn]);

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

  // Hide AppBar when on login pages
  if (isLoginPage) {
    return null;
  }

  if (!isLoggedIn || !role) {
    return null;
  }

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleLogout = () => {
    logout(); // Call the logout function
    setDropdownOpen(false); // Close the dropdown after logout
  };

  return (
    <header className="sticky top-0 z-10">
      {role === "employee" ? (
        <div className="flex justify-between items-center px-6 py-4 bg-[#f9fafb]">
          <div className="flex items-center justify-center gap-2">
            <Image
              src="/dlsu-logo-horizontal.png"
              alt="DLSU"
              width={220}
              height={100} // Keep this for optimization
              className="auto-height"
            />
          </div>
          <div>
            <p className="text-xl font-bold ml-[-3rem]">{formattedDate}</p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="relative">
              <button onClick={toggleDropdown} className="flex items-center">
                <span className="mr-2 text-[#708090]">{user?.username}</span>{" "}
                {/* Display username */}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#708090"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 9l6 6 6-6"
                  />
                </svg>
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-lg p-2">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full text-left p-2 text-sm text-red-500 hover:bg-white"
                  >
                    <LogOut />
                    Logout
                  </button>
                </div>
              )}
            </div>

            <Image
              src="/verifyi.png"
              alt="verifyi-logo"
              width={130}
              height={130}
              className="auto-height"
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-between items-center px-6 py-3 bg-[#f9fafb]">
          <div>
            <h1 className="text-2xl font-bold">{getTitle()}</h1>
            <p className="text-sm text-muted-foreground">
              As of {formattedDate}
            </p>
          </div>
          <div className="relative">
            <button onClick={toggleDropdown} className="flex items-center">
              <span className="mr-2 text-[#708090]">{user?.username}</span>{" "}
              {/* Display username */}
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="#708090"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 9l6 6 6-6"
                />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border rounded-xl shadow-lg p-2">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full text-left p-2 text-sm text-red-500 hover:bg-white"
                >
                  <LogOut />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
