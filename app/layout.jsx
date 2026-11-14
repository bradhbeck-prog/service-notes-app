import "./globals.css";
import "./refresh.css";
import "./album-cut.css";
import Appearance from "./components/Appearance";

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
        <Appearance />
        <div className="dn-app">{children}</div>
      </body>
    </html>
  )
}
