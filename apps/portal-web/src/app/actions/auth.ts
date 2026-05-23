import { cookies } from 'next/headers';
import { jwtDecode } from 'jwt-decode';

type TokenProps = {
    user: string;
    token: string;
  };

export async function getUser() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('user')?.value;
  
    if (!sessionCookie) {
      return null;
    }
  
    // Parse the JSON string from the cookie
    const parsedCookie = JSON.parse(sessionCookie);
  
    // Decode the accessToken from the parsed JSON
    const decoded = jwtDecode<TokenProps>(parsedCookie.token);
  
    return {
      user: decoded.user,
      token: parsedCookie.token,
    };
  }
  