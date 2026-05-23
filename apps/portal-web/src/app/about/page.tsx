"use client";
import Image from "next/image";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { useEffect } from "react";
import Cookies from "js-cookie";
import axios from "@/lib/axios-interceptor";
// import axios from "axios";

export default function Page() {
  useEffect(() => {
    const validateToken = async () => {
      try {
        // Get token from cookies if available
        const user = Cookies.get("user");
        const token = user ? JSON.parse(user).token : null;

        const res = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/validate`,
          {
            headers: {
              accept: "application/json",
              Authorization: token ? token : "",
            },
          }
        );

        console.log(res);
      } catch (err) {
        console.debug("Token validation failed:", err);
      }
    };

    // Initial validation
    validateToken();
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center text-center space-y-6 py-16 px-8">
      {/* Logo */}
      <div className="w-64 h-auto relative">
        <Image
          src="/elid.png"
          alt="ELID Technology Intl. Inc. Logo"
          width={400}
          height={200}
          priority
        />
      </div>

      {/* Description */}
      <p className="text-gray-800 text-sm max-w-2xl">
        Providing innovative technology solutions and exceptional service to
        meet your business needs since 1995. Your trusted partner in security
        and access control systems.
      </p>

      {/* Address */}
      <div className="flex items-center gap-2 text-sm">
        <div className="text-blue-500">
          <MapPin size={18} />
        </div>
        <span className="text-gray-700">
          1410 Annapolis Wilshire Plaza Building, 11 Annapolis St., Greenhills,
          San Juan, Metro Manila, Philippines
        </span>
      </div>

      {/* Contact Information */}
      <div className="flex items-center justify-center gap-12 w-full pt-2">
        {/* Landline */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <div className="text-blue-500">
            <Phone size={18} />
          </div>
          <span className="text-gray-700">+(632) 8724-0191</span>
        </div>

        {/* Email */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <div className="text-blue-500">
            <Mail size={18} />
          </div>
          <span className="text-gray-700">info@elidtech.com.ph</span>
        </div>
      </div>

      {/* Business Development Manager */}
      <div className="w-full mt-6">
        <p className="text-gray-800 font-medium">Melanie C. Santos</p>
        <p className="text-gray-700 text-sm">Business Development Manager</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">Globe: 0917 7600126</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">Smart: 0998 865 1190</span>
          </div>
        </div>
      </div>

      {/* Service Support */}
      <div className="w-full">
        <h2 className="text-blue-500 font-medium mb-2">Service Support:</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">09989920302</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">09988651225</span>
          </div>
        </div>
      </div>

      {/* Business Hours */}
      <div className="w-full">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="text-blue-500">
            <Clock size={18} />
          </div>
          <h2 className="text-blue-500 font-medium">Business Hours</h2>
        </div>
        <div className="text-sm text-gray-700">
          <p>Monday to Thursday: 8:00AM to 6:30PM</p>
          <p>Friday: 8:00AM to 5:00PM</p>
        </div>
      </div>
    </div>
  );
}
