import type { Metadata } from "next";

import "./globals.css";
import ContextProvider from "@/context";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { wagmiAdapter } from "@/config";
import Navbar from "@/components/Navbar/Navbar";
import { Toaster } from "sonner";
import Providers from "./Providers";

export const metadata: Metadata = {
  title: "Lucky Moon Swap",
  description: "Swap MOON for LUCKYMOON",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig,
    headers().get("cookie")
  );

  return (
    <html lang="en">
      <body
        className={`font-poppins antialiased bg-cover bg-no-repeat bg-[url(/assets/images/bg.png)] min-h-screen`}
      >
        <ContextProvider initialState={initialState}>
          <Providers>
            <Navbar />
            {children}
            <Toaster richColors />
          </Providers>
        </ContextProvider>
      </body>
    </html>
  );
}
