import "./globals.css";
import { SessionBoot } from "./SessionBoot";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <SessionBoot />
        {children}
      </body>
    </html>
  );
}
