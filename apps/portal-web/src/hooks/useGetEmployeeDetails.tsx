import { useState, useEffect } from "react";
import axios from "axios";

interface EmployeeDetails {
  // Add your employee detail types here based on the API response
  id: string;
  device_id: string[];
  // ... other employee properties
}

interface UseGetEmployeeDetailsProps {
  employeeId?: string;
  username?: string;
  token?: string;
}

export const useGetEmployeeDetails = ({
  employeeId,
  username,
  token,
}: UseGetEmployeeDetailsProps) => {
  const [data, setData] = useState<EmployeeDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchEmployeeDetails = async () => {
      if (!token) return;

      // Build the URL based on which parameter is provided
      const endpoint = username
        ? `employee/${username}`
        : `employee/${employeeId}`;

      try {
        setIsLoading(true);
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/${endpoint}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `${token}`,
            },
          }
        );

        console.log(response);
        setData(response.data.data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to fetch employee details")
        );
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    // Check for either username or employeeId along with token
    if ((username || employeeId) && token) {
      fetchEmployeeDetails();
    }
  }, [employeeId, username, token]);

  return { data, isLoading, error };
};
