import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Floci - SQS/S3 Navigator',
  description: 'SQS and S3 explorer for local Floci instances',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
