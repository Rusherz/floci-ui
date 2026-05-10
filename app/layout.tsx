import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { ConsoleLayoutShell } from '@/components/floci/console-layout-shell';
import { VersionUpdateBanner } from '@/components/floci/version-update-banner';
import { getEnabledElements } from '@/lib/floci/elements';
import './globals.css';

export const metadata: Metadata = {
  title: 'Floci Ops Console',
  description: 'Multi-service Floci console for local AWS-style elements',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const enabledElements = getEnabledElements();
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get('floci_sidebar_collapsed')?.value;
  const initialSidebarCollapsed = sidebarCookie === '1';

  return (
    <html lang='en' suppressHydrationWarning>
      <body>
        <ConsoleLayoutShell enabledElements={enabledElements} initialSidebarCollapsed={initialSidebarCollapsed}>
          {children}
        </ConsoleLayoutShell>
        <VersionUpdateBanner />
      </body>
    </html>
  );
}
