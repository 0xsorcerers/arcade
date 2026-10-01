import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { GAMES } from "../data";

const ease = [0.22, 1, 0.36, 1];

const Panel = ({ game, active, dim, onEnter, onLeave, onOpen }) => (
  <div
    className="gallery-panel group relative h-[58vh] cursor-pointer overflow-hidden border-l border-white/10 md:h-auto"
    style={{ flexGrow: active ? 2.6 : 1, flexBasis: 0 }}
    onMouseEnter={onEnter}
    onMouseLeave={onLeave}
    onClick={() => onOpen(game)}
    data-testid={`exhibit-panel-${game.id}`}
  >
    <img
      src={game.image}
      alt={game.title}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
      style={{ filter: dim ? "grayscale(0.4) brightness(0.55)" : "none", transition: "filter 0.5s ease, transform 0.9s ease" }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#09090A] via-[#09090A]/30 to-[#09090A]/40" />
    <div className="absolute inset-0 bg-gradient-to-r from-[#09090A]/50 to-transparent" />

    {/* top meta */}
    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-6">
      <span className="font-mono text-sm font-bold text-white/70">{game.num}</span>
      <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-white">
        <span
          className="live-dot inline-block h-2 w-2 rounded-full"
          style={{ background: game.theme, color: game.theme }}
        />
        Live Now
      </span>
    </div>

    {/* bottom content */}
    <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
      <h3 className="font-display leading-[0.85] tracking-tight text-white">
        {game.displayLines.map((l, i) => (
          <span key={i} className="block text-[12vw] sm:text-5xl lg:text-6xl">
            {l}
          </span>
        ))}
      </h3>

      <div
        className={`mt-4 max-h-40 overflow-hidden opacity-100 transition-all duration-500 ${
          active ? "md:mt-4 md:max-h-40 md:opacity-100" : "md:mt-0 md:max-h-0 md:opacity-0"
        }`}
      >
        <p className="font-body text-sm text-stone-300">{game.tagline}</p>
        <div
          className="mt-4 flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.25em]"
          style={{ color: game.theme }}
        >
          <span className="h-px w-8" style={{ background: game.theme }} />
          Enter Exhibition
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>

    {/* themed bottom glow line */}
    <div
      className="absolute inset-x-0 bottom-0 h-[3px] origin-left transition-transform duration-500"
      style={{
        background: game.theme,
        boxShadow: `0 0 18px ${game.theme}`,
        transform: active ? "scaleX(1)" : "scaleX(0)",
      }}
    />
  </div>
);

export const Gallery = ({ onOpen }) => {
  const [hovered, setHovered] = useState(null);

  return (
    <section id="gallery" className="relative w-full py-24 sm:py-28">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease }}
          className="mb-8"
        >
          <div className="mb-5 flex items-center gap-4">
            <span className="h-px w-10 bg-[var(--gold)]" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-gold sm:text-sm">
              The Monolith Gallery
            </span>
          </div>
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
            <h2 className="font-display text-[16vw] leading-[0.82] tracking-tight text-white sm:text-7xl lg:text-8xl">
              EXHIBITIONS
            </h2>
            <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-stone-500">
              Scroll to Traverse →
            </span>
          </div>
        </motion.div>
      </div>

      <div className="gallery-row flex-col md:h-[74vh] md:flex-row">
        {GAMES.map((game) => (
          <Panel
            key={game.id}
            game={game}
            active={hovered === game.id}
            dim={hovered !== null && hovered !== game.id}
            onEnter={() => setHovered(game.id)}
            onLeave={() => setHovered(null)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
};
