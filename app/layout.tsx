import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import './production.css'
import './tablet-layout-fix.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'GlobExplore — Earth Rotation Lab',
  description:
    "Interactive 3D exploration of how mass redistribution affects Earth's rotation, pole position, and length of day.",
  other: {
    'globexplore-release': 'pole-lens-3d-v1',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  )
}
