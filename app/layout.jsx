import "./globals.css";
import "./refresh.css";

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
          <img src="/dreamnote-d-transparent.png" alt="DreamNote" width="86" height="86" />
          <span aria-hidden="true">reamNote</span>
        </div>
        <div className="dn-app">{children}</div>
      </body>
    </html>
  )
}
