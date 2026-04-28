import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Floci Ops Console',
  description: 'Multi-service Floci console for local AWS-style elements',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
