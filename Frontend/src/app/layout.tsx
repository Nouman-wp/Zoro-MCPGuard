import type { Metadata, Viewport } from 'next';
import { Figtree, IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';
import { MotionProvider } from '@/components/motion';
import { THEME_SCRIPT } from '@/lib/theme-script';

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-inter', display: 'swap' });
const figtree = Figtree({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-figtree', display: 'swap' });
const plex = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Zoro — runtime integrity for MCP tools', template: '%s · Zoro' },
  description: 'Zoro verifies every MCP tool at the moment an agent uses it, against a public, tamper-evident record of what that tool is supposed to be.',
};

export const viewport: Viewport = { themeColor: '#0a0b0c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${figtree.variable} ${plex.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-abyss font-sans text-quartz antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
