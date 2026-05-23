import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppBar } from '@/components/app-bar';

import { Toaster } from '@/components/ui/toaster';
import { IdleScreensaver } from '@/components/IdleScreensaver';
import { ValidateToken } from '@/components/ValidateToken';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Modern dashboard with real-time data',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <SidebarProvider>
            <div className="flex min-h-screen bg-gray-50 w-screen">
              <AppSidebar />
              {/* <main className="flex-1 overflow-auto">{children}</main> */}
              <div className="flex flex-col flex-1">
                <AppBar /> {/* Use the AppBar component here */}
                <main className="flex-1 overflow-auto">{children}</main>
              </div>
              <ValidateToken />
              <IdleScreensaver />
            </div>
            <Toaster />
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
