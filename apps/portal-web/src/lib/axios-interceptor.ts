import axios from "axios";
import Cookies from "js-cookie";
import { redirect } from "next/navigation";

// Add a response interceptor
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {

    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Clear user data from cookies/localStorage
      Cookies.remove("user");
      Cookies.remove("role")

      window.location.href = '/login';
      redirect("/login");
      
    } 

    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        console.log("Unhandled rejection:", event);
        if (event.reason?.isAxiosError && event.reason?.response?.status === 401) {
          console.log("Caught 401 through unhandledrejection - redirecting");
          Cookies.remove("user");
          Cookies.remove("role");
          window.location.href = '/login';
        }
      });
    }

    // Return the error so it can still be handled by the calling code if needed
    return Promise.reject(error);
  }
);

export default axios;
