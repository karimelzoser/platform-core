import type { Metadata } from 'next';
import { AppNavigation } from './app-navigation';
import { DirectionControl } from './direction-control';
import './styles.css';
import './design-system.css';

export const metadata: Metadata = {
  title: 'PRENEURA Platform',
  description: 'Operations platform for customer operations, commerce, automation, and AI',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <AppNavigation />
        <DirectionControl />
        {children}
      </body>
    </html>
  );
}
