import "./globals.css";

export const metadata = {
  title: "DreamNote",
  description: "Service note app",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="dn-color-ribbon" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <div className="dn-brandbar">
          <img src="/icon-192.png" alt="" width="46" height="46" />
          <span>DreamNote</span>
        </div>
        {children}
      </body>
    </html>
  )
}
