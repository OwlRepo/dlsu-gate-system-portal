import axios from "axios";
import Cookies from "js-cookie";

const LOGIN_PATH = "/login";

function requestHadToken(config: unknown): boolean {
  const headers = (config as { headers?: Record<string, unknown> } | undefined)
    ?.headers;
  if (!headers) return false;

  const authorization = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  )?.[1];

  return typeof authorization === "string" && authorization.trim().length > 0;
}

// Add a response interceptor
axios.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Only a request that actually carried a token can tell us the session is
      // dead. A 401 on a tokenless request says nothing, and clearing cookies
      // for it logged out users who had just signed in - a validation poll
      // fired before login could land after it and wipe the fresh session.
      const alreadyOnLogin =
        typeof window !== "undefined" &&
        window.location.pathname.startsWith(LOGIN_PATH);

      if (requestHadToken(error.config) && !alreadyOnLogin) {
        Cookies.remove("user");
        Cookies.remove("role");

        // One redirect mechanism only. Calling window.location.href and
        // next/navigation redirect() together raced each other.
        window.location.href = LOGIN_PATH;
      }
    }

    // Return the error so it can still be handled by the calling code if needed
    return Promise.reject(error);
  },
);

export default axios;
