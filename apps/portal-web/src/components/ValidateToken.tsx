'use client';

import { useEffect } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';

export function ValidateToken() {
  useEffect(() => {
    const validateToken = async () => {
      try {
        // Get token from cookies if available
        const user = Cookies.get('user');
        const token = user ? JSON.parse(user).token : null;
        
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/auth/validate`, {
          headers: {
            'accept': 'application/json',
            'Authorization': token ? token : ''
          }
        });

        console.log(res);
      } catch (err) {
        console.debug('Token validation failed:', err);
      }
    };

    // Initial validation
    validateToken();
    
    // Set up interval for periodic validation
    const interval = setInterval(validateToken, 15000);
    
    return () => clearInterval(interval);
  }, []);
  
  return null;
}