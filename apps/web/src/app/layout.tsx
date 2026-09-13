import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../components/auth-provider";

export const metadata: Metadata = {
  title: "KharCha",
  description: "Personal expense tracker",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><a href="#main-content" className="skip-link">Skip to content</a><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
