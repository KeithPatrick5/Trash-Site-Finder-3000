import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trash Site Finder 3000',
  description: 'Find busted local business websites, audit them, and generate sharp outreach.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
