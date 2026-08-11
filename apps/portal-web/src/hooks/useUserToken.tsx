import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  role: string;
  sub: string;
  username: string;
  // Add other properties as needed
}

const useUserToken = () => {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const user = Cookies.get('user');
    if (user) {
      const parsedUser = JSON.parse(user);
      setToken(parsedUser.token);

      try {
        // The stored token keeps the "Bearer " prefix the API returns, and
        // jwtDecode throws on it - which left role, userId and username null
        // for every consumer of this hook. Same strip as middleware.ts.
        const decoded: DecodedToken = jwtDecode(
          String(parsedUser.token).replace('Bearer ', ''),
        );
        setRole(decoded.role);
        setUserId(decoded.sub);
        setUsername(decoded.username)
      } catch (error) {
        console.error('Failed to decode token', error);
      }
    }
  }, []);

  return { token, role, userId, username };
};

export default useUserToken;
