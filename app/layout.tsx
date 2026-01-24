import "./globals.css";
import { SessionBoot } from "./SessionBoot";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionBoot />
        {children}
      </body>
    </html>
  );
}
