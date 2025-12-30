import type { Metadata } from 'next'
import { Inter, Orbitron } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
})

const orbitron = Orbitron({ 
  subsets: ['latin'],
  variable: '--font-orbitron',
})

export const metadata: Metadata = {
  title: 'Treasure Trail - Onchain Adventure',
  description: 'Explore deeper for bigger rewards. Risk vs Reward on Arc Network.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Icons+Round&display=swap" rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${orbitron.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}



