import type { Metadata } from "next";
import "./globals.css";

// System font stack (no web-font download): the site works fully offline,
// e.g. on a presentation laptop without internet.

export const metadata: Metadata = {
  title: "AgriDrone AI · Autonomous Weed Detection & Spot-Spraying",
  description:
    "An autonomous drone that detects weeds with YOLO11, georeferences them and sprays herbicide only where it is needed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
