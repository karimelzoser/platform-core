import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'Platform',
  description: 'Operations platform for commerce and customer teams',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
