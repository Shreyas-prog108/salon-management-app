import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Glamour Studio — Salon Management',
  description: 'Professional salon management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-700 flex items-center justify-center shadow-sm">
                  <svg className="w-4.5 h-4.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
                <span className="font-bold text-gray-900 text-lg tracking-tight">Glamour Studio</span>
              </Link>

              <div className="flex items-center gap-1">
                <Link
                  href="/"
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  Book
                </Link>
                <Link
                  href="/owner"
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  Owner
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      </body>
    </html>
  );
}
