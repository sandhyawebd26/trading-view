import './globals.css'

export const metadata = { title: 'Live Chart', description: 'Live charts with Pine Script' }

// Apply the saved theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('chart-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){}`

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><div id="root">{children}</div></body>
    </html>
  )
}
