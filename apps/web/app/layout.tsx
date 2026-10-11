import type { Metadata } from 'next';
import { DirectionControl } from './direction-control';
import { DisplayLocaleProvider } from './display-locale';
import { PlatformNavigation } from './platform-navigation';
import './styles.css';
import './design-system.css';
import './platform-navigation.css';

export const metadata: Metadata = {
  title: 'PRENEURA Platform',
  description: 'Operations platform for commerce, customer teams, automation, and controlled AI',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <DisplayLocaleProvider>
          <PlatformNavigation />
          <DirectionControl />
          {children}
        </DisplayLocaleProvider>
      </body>
    </html>
  );
}
