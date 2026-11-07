import type { Metadata, Viewport } from 'next';
import { Figtree, JetBrains_Mono, Playfair_Display, UnifrakturMaguntia } from 'next/font/google';
import './globals.css';
import { BackendWake } from '@/components/backend-wake';
import { MotionProvider } from '@/components/motion';
import { THEME_SCRIPT } from '@/lib/theme-script';

const figtree = Figtree({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-figtree', display: 'swap' });
const newsSerif = Playfair_Display({ subsets: ['latin'], weight: ['400', '700', '900'], style: ['normal', 'italic'], variable: '--font-news-serif', display: 'swap' });
const newsMast = UnifrakturMaguntia({ subsets: ['latin'], weight: ['400'], variable: '--font-news-mast', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Zoro — runtime integrity for MCP tools', template: '%s · Zoro' },
  description: 'Zoro verifies every MCP tool at the moment an agent uses it, against a public, tamper-evident record of what that tool is supposed to be.',
};

export const viewport: Viewport = { themeColor: '#f4f4f5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${figtree.variable} ${jetbrains.variable} ${newsSerif.variable} ${newsMast.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-abyss font-sans text-quartz antialiased">
        <MotionProvider>{children}</MotionProvider>
        <BackendWake />
      </body>
    </html>
  );
}
