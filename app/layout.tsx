import type { Metadata, Viewport } from 'next'
import { Exo_2 } from 'next/font/google'
import './globals.css'

const exo2 = Exo_2({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-heading',
})

export const metadata: Metadata = {
  title: 'Anime Tracker',
  description: 'עקוב אחרי האנימות שלך וקבל התראה כשיוצאת עונה חדשה',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`min-h-screen bg-[#0f0f1a] ${exo2.variable}`}>{children}</body>
    </html>
  )
}
