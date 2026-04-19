import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { ThemeProvider, ThemePrePaintScript } from '@celebbase/ui-kit';
import '@/styles/globals.css';
import { AxeDevInit } from '@/lib/axe-dev';
import { Providers } from '@/providers';
import enMessages from '@/i18n/en.json';

const DEFAULT_LOCALE = 'en';
const DEFAULT_TIME_ZONE = 'UTC';

const fraunces = localFont({
  src: '../../public/fonts/Fraunces-Variable.woff2',
  variable: '--cb-font-family-display',
  display: 'swap',
  weight: '100 900',
});

const jakarta = localFont({
  src: '../../public/fonts/PlusJakartaSans-Variable.woff2',
  variable: '--cb-font-family-body',
  display: 'swap',
  weight: '200 800',
});

const jetbrains = localFont({
  src: '../../public/fonts/JetBrainsMono-Variable.woff2',
  variable: '--cb-font-family-mono',
  display: 'swap',
  weight: '100 800',
});

export const metadata: Metadata = {
  title: 'CelebBase Wellness',
  description: 'Premium wellness platform for celebrity-inspired health routines',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      className={`${fraunces.variable} ${jakarta.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemePrePaintScript />
      </head>
      <body>
        <ThemeProvider defaultMode="system">
          <Providers
            locale={DEFAULT_LOCALE}
            messages={enMessages}
            timeZone={DEFAULT_TIME_ZONE}
          >
            <AxeDevInit />
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
