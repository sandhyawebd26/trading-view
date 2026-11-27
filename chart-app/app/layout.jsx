import './globals.css'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

// Plex Sans is also the face the chart's Graphite look is drawn in, so the page and the widget match.
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' })

export const metadata = { title: 'Live Chart', description: 'Live charts with Pine Script' }

// Apply the saved theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('chart-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}`

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><div id="root">{children}</div></body>
    </html>
  )
}
