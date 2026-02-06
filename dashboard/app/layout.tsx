import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AdversaRL - Adaptive Curriculum RL Training",
  description: "Real-time dashboard for reinforcement learning with adaptive curriculum using Odyssey-2 World Model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
