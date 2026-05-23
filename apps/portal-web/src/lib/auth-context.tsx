"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import axios from "axios";
type User = {
  username: string;
  // password: string;
  token: string;
};

type AuthContextType = {
  isLoggedIn: boolean;
  user: User | null;
  login: (
    username: string,
    email: string,
    role: string
  ) => Promise<string | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  // const role = Cookies.get("role");

  const router = useRouter();

  const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL, // Use your API base URL from environment variables
    timeout: 10000, // Optional: Set a timeout for requests
  });

  // Load user data from cookies on initial render
  useEffect(() => {
    const userFromCookie = Cookies.get("user");
    if (userFromCookie) {
      const parsedUser = JSON.parse(userFromCookie);
      setUser(parsedUser);
      setIsLoggedIn(true);
    }
  }, []);

  const login = async (username: string, password: string, role: string) => {
    try {
      const response = await api.post(
        `/auth/${role === "employee" ? "employee" : "login"}`,
        {
          username,
          password,
        }
      );

      if (response) {
        const userData = {
          username,
          user: response.data.user,
          token: response.data.access_token,
        };
        Cookies.set("user", JSON.stringify(userData));
        Cookies.set("role", userData.user.role);

        setUser(userData);

        if (role === "employee") {
          router.push("/employee-dashboard");
        } else {
          router.push("/dashboard");
        }
        setIsLoggedIn(true);
      }

      return response.data; // Return the response data (e.g., user info, tokens)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data.message || "Login failed");
      } else {
        throw new Error("Network error");
      }
    }
  };

  const logout = () => {
    Cookies.remove("user");
    // Remove user data from cookie

    setUser(null);
    setIsLoggedIn(false);
    router.push("/login");
    Cookies.remove("role");
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
