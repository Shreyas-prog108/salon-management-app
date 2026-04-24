import { Inter, Playfair_Display } from 'next/font/google'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './globals.css'
import { UIProvider } from '@/context/UIContext'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })

export const metadata = {
  title: 'Baalbar',
  description: 'Baalbar — Salon Management App',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`} data-scroll-behavior="smooth">
      <body>
        <UIProvider>
          {children}
        </UIProvider>
      </body>
    </html>
  )
}
