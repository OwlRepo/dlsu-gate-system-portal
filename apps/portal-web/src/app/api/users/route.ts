import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import https from 'https';

export async function GET(req: NextRequest) {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    console.log(req);

    const params = req.nextUrl.searchParams.get('params');

    const response = await axios.get(
      `${process.env.NEXT_PUBLIC_BIOSTAR_API}/api/users/${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'bs-session-id': req.headers.get('bs-session-id') || '',
        },
        httpsAgent: agent,
      },
    );

    console.log('Response from backend:', response.data);

    return NextResponse.json({
      data: response.data,
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
