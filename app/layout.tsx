import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Anime Tracker',
  description: 'עקוב אחרי האנימות שלך וקבל התראה כשיוצאת עונה חדשה',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-[#0f0f1a]">{children}</body>
    </html>
  )
}
