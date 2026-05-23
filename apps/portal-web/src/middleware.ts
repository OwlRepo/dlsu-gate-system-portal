import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtDecode } from "jwt-decode";

interface DecodedToken {
  exp: number;
  // Add other properties as needed
}

export function middleware(request: NextRequest) {
  // Check if the user cookie exists
  const userCookie = request.cookies.get("user");
  const user = userCookie ? JSON.parse(userCookie.value) : null;

  if (userCookie) {
    const token = JSON.parse(userCookie.value).token.replace("Bearer ", "");

    try {
      const decoded: DecodedToken = jwtDecode(token);
      const currentTime = Math.floor(Date.now() / 1000);

      if (decoded.exp < currentTime) {
        // Token is expired, remove the user cookie
        const response = NextResponse.next();
        response.cookies.set("user", "", { expires: new Date(0) });
        return response;
      }
    } catch (error) {
      console.error("Failed to decode token", error);
      const response = NextResponse.next();
      response.cookies.set("user", "", { expires: new Date(0) });
      return response;
    }
  }

  // Define the protected routes
  const protectedRoutes = [
    "/",
    "dashboard",
    "/reports",
    "/user-management",
    "/settings",
    "/settings/operation",
    "/employee-dashboard",
    "/about",
  ];

  console.log(user);

  // If the user cookie does not exist and the request is for the protected routes
  if (!userCookie && protectedRoutes.includes(request.nextUrl.pathname)) {
    // Redirect to the /login page
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If the user cookie does not exist, user role is employee, and the request is for the protected routes
  // if (
  //   !userCookie &&
  //   user.role === "employee" &&
  //   protectedRoutes.includes(request.nextUrl.pathname)
  // ) {
  //   // Redirect to the /login page
  //   return NextResponse.redirect(new URL("/login/employee", request.url));
  // }

  if (userCookie && request.nextUrl.pathname === "/login") {
    // Redirect to the dashboard page
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Allow the request to proceed
  return NextResponse.next();
}

// Specify the paths where the middleware should run
export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/reports",
    "/user-management",
    "/settings",
    "/settings/operation",
    "/employee-dashboard",
    "/login",
    "/login/employee",
    "/about",
  ],
};
