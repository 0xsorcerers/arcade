import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Play, Share2 } from "lucide-react";
import { fetchTotalPlays } from "../utils/contract";

const ease = [0.22, 1, 0.36, 1];

export const GameTakeover = ({ game, onClose }) => {
  const [totalPlays, setTotalPlays] = useState(null);
  const [displayPlays, setDisplayPlays] = useState(0);

  useEffect(() => {
    const loadTotalPlays = async () => {
      const plays = await fetchTotalPlays(game);
      if (plays) {
        setTotalPlays(plays);
      }
    };
    loadTotalPlays();
  }, [game]);

  useEffect(() => {
    if (totalPlays !== null) {
      const target = Number(totalPlays);
      const duration = 2000;
      const startTime = performance.now();
      const startValue = displayPlays;

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = Math.floor(startValue + (target - startValue) * easeOutQuart);
        
        setDisplayPlays(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [totalPlays]);

  const share = async (platform = 'native') => {
    const shareText = `Check out ${game.title} on Meme Arcade! ${game.href}`;
    const shareUrl = game.href;

    try {
      if (platform === 'twitter') {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
      } else if (platform === 'native') {
        if (navigator.share) {
          await navigator.share({ title: game.title, url: game.href });
        } else {
          await navigator.clipboard.writeText(game.href);
        }
      }
    } catch (e) {
      /* user dismissed */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-[100] overflow-y-auto"
      data-testid={`takeover-${game.id}`}
    >
      {/* background art */}
      <motion.div
        initial={{ scale: 1.08 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.8, ease }}
        className="fixed inset-0"
      >
        <img src={game.image} alt={game.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090A] via-[#09090A]/75 to-[#09090A]/50" />
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 80% at 10% 100%, ${game.themeSoft}, transparent 60%)` }}
        />
      </motion.div>

      {/* close */}
      <button
        onClick={onClose}
        data-testid="takeover-close-btn"
        className="fixed right-5 top-5 z-10 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:text-gold sm:right-10 sm:top-8"
      >
        Close <X className="h-5 w-5" />
      </button>

      <div className="relative z-[1] mx-auto flex min-h-screen max-w-[1500px] flex-col justify-end px-5 pb-16 pt-24 sm:px-10 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease }}
        >
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em]">
            <span style={{ color: game.theme }}>{game.category}</span>
            <span className="text-stone-400">{game.mode}</span>
            <span className="flex items-center gap-2 text-white">
              <span className="live-dot inline-block h-2 w-2 rounded-full" style={{ background: game.theme, color: game.theme }} />
              Live Now
            </span>
          </div>

          <h2 className="font-display leading-[0.85] tracking-tight text-white">
            {game.displayLines.map((l, i) => (
              <span key={i} className="block text-6xl sm:text-7xl lg:text-8xl">{l}</span>
            ))}
          </h2>

          <p className="mt-6 max-w-2xl font-body text-base leading-relaxed text-stone-300 sm:text-lg">
            {game.description}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {game.chips.map((chip) => (
              <span
                key={chip}
                className="border-l-2 bg-white/5 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-stone-200 backdrop-blur-sm"
                style={{ borderColor: game.theme }}
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={game.href}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="takeover-enter-btn"
                className="flex items-center gap-3 px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#09090A] transition-transform hover:scale-[1.03]"
                style={{ background: game.theme, boxShadow: `0 0 30px ${game.themeSoft}` }}
              >
                <Play className="h-4 w-4 fill-current" /> Enter Universe
              </a>
              {/* <a
                href={game.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-white/20 px-6 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:border-white/50"
              >
                <Download className="h-4 w-4" /> Download
              </a> */}
              <button
                onClick={() => share('twitter')}
                className="flex items-center gap-2 border border-white/20 px-6 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:border-white/50"
                data-testid="share-twitter-btn"
              >
                <Share2 className="h-4 w-4" /> Share on X
              </button>
            </div>

            <div className="border border-white/15 bg-black/40 px-6 py-4 backdrop-blur-sm">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400">Active Plays</div>
              <div className="font-display text-3xl tracking-tight text-white">
                {displayPlays.toLocaleString()}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
