import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';

export async function POST(req: NextRequest) {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const body = await req.json();

    console.log('Request received:', { body });

    const response = await axios.post(
      `${process.env.NEXT_PUBLIC_BIOSTAR_API}/api/login`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        httpsAgent: agent,
      },
    );
    console.log('Response from backend:', response.data);

    const bsSessionId = response.headers['bs-session-id'];

    return NextResponse.json({
      data: response.data,
      bsSessionId: bsSessionId, // Include the custom header in the response
    });
  } catch (error) {
    console.error('Error from backend:', error);

    if (axios.isAxiosError(error)) {
      // Axios error
      return NextResponse.json(
        { message: error.response?.data || error.message },
        { status: error.response?.status || 500 },
      );
    } else {
      return NextResponse.json(
        { message: 'An unexpected error occurred' },
        { status: 500 },
      );
    }
  }
}
