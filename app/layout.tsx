import type { Metadata } from 'next';
import { Inter, Spectral } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Serifa de transição para os títulos, como nas telas de referência.
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-spectral',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Assistente · Colégio Santa Dorotéia',
  description:
    'Assistente institucional com IA: respostas fundamentadas nos documentos oficiais do colégio.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${spectral.variable}`}>
      <body>{children}</body>
    </html>
  );
}
