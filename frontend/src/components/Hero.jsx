import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SOCIALS } from "../data";

const scrollTo = (id) => {
  const el = document.querySelector(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

const ease = [0.22, 1, 0.36, 1];

const Line = ({ children, delay }) => (
  <span className="block overflow-hidden pb-[0.06em]">
    <motion.span
      className="block"
      initial={{ y: "115%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.9, delay, ease }}
    >
      {children}
    </motion.span>
  </span>
);

export const Hero = () => (
  <section id="top" className="relative min-h-screen w-full overflow-hidden">
    {/* right cinematic image */}
    <div className="absolute inset-y-0 right-0 w-full md:w-[62%]">
      <img
        src="/images/hero.webp"
        alt="Meme Arcade monolith"
        className="h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#09090A] via-[#09090A]/70 to-transparent md:via-[#09090A]/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#09090A] via-transparent to-[#09090A]/60" />
    </div>

    <div className="relative z-10 mx-auto flex min-h-screen max-w-[1500px] flex-col justify-center px-5 pb-24 pt-24 sm:px-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mb-6 flex items-center gap-4"
      >
        <span className="h-px w-10 bg-[var(--gold)]" />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-gold sm:text-sm">
          Meme Arcade — Crypto Money Games
        </span>
      </motion.div>

      <h1 className="font-display text-[13vw] leading-[0.9] tracking-tight sm:text-[10vw] md:text-7xl lg:text-8xl">
        <Line delay={0.3}>
          <span className="text-white">WIN BIG</span>
        </Line>
        <Line delay={0.44}>
          <span className="text-gold">IN MEMES</span>
        </Line>
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-6 max-w-lg font-body text-base leading-relaxed text-stone-300 sm:text-lg"
      >
        Meme Arcade gives the strongest meme communities a crypto money game where they can
        win big in their own memecoins — the lowest-risk to high-reward ratio on the planet.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5 }}
        className="mt-8 flex flex-wrap items-stretch gap-3"
      >
        <button
          onClick={() => scrollTo("#gallery")}
          data-testid="enter-arcade-btn"
          className="group flex items-center gap-3 border border-white/25 px-7 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-all hover:border-[var(--gold)] hover:text-gold"
        >
          Enter the Arcade
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
        <a
          href={SOCIALS.stake}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="stake-arcade-hero-btn"
          className="flex items-center bg-[var(--gold)] px-8 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#09090A] transition-all hover:bg-[var(--gold-bright)] hover:shadow-[0_0_30px_rgba(244,178,35,0.5)]"
        >
          Stake Arcade
        </a>
        <button
          disabled
          data-testid="trade-soon-btn"
          title="Trading coming soon"
          className="flex cursor-not-allowed items-center gap-2 border border-white/10 px-7 py-4 font-mono text-xs font-bold uppercase tracking-[0.25em] text-stone-600"
        >
          Trade <span className="text-[9px] tracking-[0.2em] text-stone-700">Soon</span>
        </button>
      </motion.div>
    </div>
  </section>
);
