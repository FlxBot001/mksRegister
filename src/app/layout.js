import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: { default: 'MKS Register | Church Operations', template: '%s | MKS Register' },
  description: 'A secure, multi-tenant platform for church registration, member records, services, and attendance management.',
  applicationName: 'MKS Register',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang='en' className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className='min-h-full flex flex-col'>{children}</body>
    </html>
  );
}
