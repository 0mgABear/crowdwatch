import "./globals.css";
import { SessionBoot } from "./SessionBoot";

export const metadata = {
  title: "CrowdWatch",
  description: "CrowdWatch dashboard",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-black text-white antialiased">
        <SessionBoot />
        {children}
      </body>
    </html>
  );
}
