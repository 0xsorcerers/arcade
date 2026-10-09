import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Connector } from "@/tools/utils";

export function Header({ nativeBalance, nativeSymbol, arcadeBalance }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-white/10 bg-[#090908]/90 px-3 backdrop-blur sm:px-5 lg:px-7">
      <Link className="flex shrink-0 items-center gap-1.5 text-base font-bold text-stone-100 no-underline" to="/" aria-label="Return to Arcade">
        <img className="h-7 w-7 object-contain" src="/logo.webp" alt="Arcade" />
        <span className="hidden sm:inline">MEME ARCADE<span className="text-amber-400">.</span></span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-5">
        <div className="min-w-0 text-right font-sora">
          <p className="hidden text-[9px] uppercase tracking-wide text-stone-500 sm:block">{nativeSymbol} balance</p>
          <p className="truncate font-jetbrains text-[10px] font-semibold text-stone-200 sm:text-xs">{nativeBalance} {nativeSymbol}</p>
        </div>
        <div className="min-w-0 text-left font-sora">
          <p className="hidden text-[9px] uppercase tracking-wide text-stone-500 sm:block">ARCADE balance</p>
          <p className="truncate font-jetbrains text-[10px] font-semibold text-amber-400 sm:text-xs">{arcadeBalance} ARCADE</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Link className="flex items-center gap-1.5 font-sora text-xs text-stone-300 no-underline hover:text-amber-400" to="/"><ArrowLeft size={14} /> <span className="hidden sm:inline">Arcade</span></Link>
        <Connector />
      </div>
    </header>
  );
}