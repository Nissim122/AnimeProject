import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
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

const clerkAppearance = {
  variables: {
    colorBackground: '#13131f',
    colorInputBackground: '#1e1e2e',
    colorInputText: '#ffffff',
    colorText: '#ffffff',
    colorTextSecondary: '#9ca3af',
    colorPrimary: '#e0176b',
    colorDanger: '#f87171',
    borderRadius: '0.75rem',
    fontFamily: 'inherit',
  },
  elements: {
    card: 'shadow-2xl border border-gray-700/50',
    headerTitle: 'text-white',
    headerSubtitle: 'text-gray-400',
    socialButtonsBlockButton: 'border-gray-600 hover:border-pink-500 text-white',
    formFieldLabel: 'text-gray-300',
    footerActionLink: 'text-pink-400 hover:text-pink-300',
    identityPreviewText: 'text-white',
    identityPreviewEditButtonIcon: 'text-gray-400',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="he" dir="rtl">
        <body className={`min-h-screen bg-[#0f0f1a] ${exo2.variable}`}>{children}</body>
      </html>
    </ClerkProvider>
  )
}
