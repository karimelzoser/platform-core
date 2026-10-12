import type { Metadata } from 'next';
import { AppShell } from './app-shell';
import './styles.css';
import './design-system.css';
import './product-shell.css';
import './review-mode.css';
import './frontend-review.css';
import './review-interactions.css';
import './review-specialty.css';

export const metadata: Metadata = {
  title: 'PRENEURA Platform',
  description: 'Operations platform for customer operations, commerce, automation, and AI',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
