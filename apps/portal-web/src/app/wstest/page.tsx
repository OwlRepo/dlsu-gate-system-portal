'use client'

import axios from 'axios';
import React, { useEffect } from 'react'

const Page = () => {

    // const BIOSTAR_URI = 'https://127.0.0.1:4431'; // BioStar 2 IP and HTTPS port
				
    const WS_HOST ='wss://127.0.0.1:4439' // same here as in the above line
  // const API_HOST = '/api/proxy';
  const BIOSTAR2_WS_URI = `${WS_HOST}/wsapi`;
  // const PROXY_WS_URI = 'wss://localhost:3000/wsapi';

  // const bsSessionId = '1a089fc5956b42e29d5726c164c89334';

  useEffect(() => {
    const fetchSessionId = async () => {
      try {
        const response = await axios.post(
          '/api/login',
          {
            User: {
              login_id: process.env.NEXT_PUBLIC_BIOSTAR_LOGIN_ID,
              password: process.env.NEXT_PUBLIC_BIOSTAR_PASSWORD,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );

        if (response) {
          // setBsSessionId(response.data.bsSessionId);
          const ws = new WebSocket(BIOSTAR2_WS_URI);

          ws.onopen = () => {
            console.log('WebSocket connection established.');
            // Send the session ID to the WebSocket server
            ws.send(`bs-session-id=${response.data.bsSessionId}`);

            // Optionally call the event API after WebSocket connection is established
            setTimeout(() => {
            //   fetchUserData(response.data.bsSessionId);
              fetchEventData(response.data.bsSessionId);
            }, 1000);
          };

          ws.onmessage = (event) => {
            console.log('WebSocket message received:', event);
          };

          ws.onerror = (error) => {
            console.error('WebSocket error:', error);
          };

          ws.onclose = () => {
            console.log('WebSocket connection closed.');
          };

          // Cleanup on component unmount
          return () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          };
        } else {
          console.error(
            'Session ID is missing. Cannot establish WebSocket connection.',
          );
          return;
        }

        // console.log('Login response:', response.data);
      } catch (error) {
        console.error('Error logging in:', error);
      }
    };

    fetchSessionId();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const fetchUserData = async (bsSessionId: string) => {
  //   console.log(bsSessionId);
  //   try {
  //     const response = await axios.get('api/users', {
  //       headers: {
  //         'bs-session-id': bsSessionId,
  //       },
  //       params: {
  //         params: '2123456',
  //       },
  //     });

  //     console.log('Fetched event data:', response.data);
  //   } catch (error) {
  //     console.error('Error fetching event data:', error);
  //   }
  // };

  const fetchEventData = async (bsSessionId: string) => {
    try {
      const response = await axios.post(
        '/api/events',
        {
          Query: {
            limit: 51,
            conditions: [
              {
                column: 'datetime',
                operator: 3,
                values: ['2019-07-30T15:00:00.000Z'],
              },
            ],
            orders: [
              {
                column: 'datetime',
                descending: false,
              },
            ],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'bs-session-id': bsSessionId,
          },
        },
      );

      console.log('Fetched event data:', response.data);
    } catch (error) {
      console.error('Error fetching event data:', error);
    }
  };
  return (
    <div>page</div>
  )
}

export default Page