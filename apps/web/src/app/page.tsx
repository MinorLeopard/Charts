"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background gradient / subtle candlestick vibe */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,40,40,0.8),rgba(0,0,0,1))]" />
      <div className="absolute inset-0 opacity-10 pointer-events-none select-none bg-[url('/candles-bg.svg')] bg-cover bg-center" />

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        <h1 className="text-5xl md:text-7xl font-serif tracking-wide mb-6">
          <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            Welcome to Empire
          </span>
        </h1>
        <p className="text-gray-400 text-lg md:text-xl mb-10 max-w-xl mx-auto">
          A next-generation charting experience for modern traders.
        </p>
        <Link
          href="/charts"
          className="inline-block px-8 py-3 rounded-lg bg-gradient-to-r from-yellow-500 to-yellow-700 text-black font-semibold text-lg shadow-lg hover:from-yellow-400 hover:to-yellow-600 transition"
        >
          Explore Charts
        </Link>
      </div>
    </div>
  );
}
