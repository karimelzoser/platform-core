import type { Metadata } from 'next';
import { DisplayLocaleProvider, LocalizedText } from './display-locale';
import { PlatformNavigation } from './platform-navigation';
import './styles.css';
import './design-system.css';
import './platform-navigation.css';
import './preview-interactions.css';
import './global-states.css';

export const metadata: Metadata = {
  title: 'PRENEURA Platform',
  description: 'Operations platform for commerce, customer teams, automation, and controlled AI',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <DisplayLocaleProvider>
          <a className="skip-link" href="#main-content">
            <LocalizedText en="Skip to main content" ar="تخطَّ إلى المحتوى الرئيسي" />
          </a>
          <PlatformNavigation />
          <div id="main-content" tabIndex={-1}>
            {children}
          </div>
        </DisplayLocaleProvider>
      </body>
    </html>
  );
}
