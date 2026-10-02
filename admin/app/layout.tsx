import './globals.css';
import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata = { title: 'Carrom Arena Admin' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
