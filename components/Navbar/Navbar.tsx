"use client";
import React from "react";
// import { useAppKit } from "@reown/appkit/react";
export default function Navbar() {
  //   const { open, close } = useAppKit();
  return (
    <div className="px-[40px] pt-[40px] bg-transparent">
      <div className="flex items-center justify-between">
        <img src="/assets/images/logo.png" className="w-[120px] md:w-auto" />
        <appkit-button />
        {/* <button onClick={() => open()} className="text-white">
          Connect Wallet
        </button> */}
      </div>
    </div>
  );
}
