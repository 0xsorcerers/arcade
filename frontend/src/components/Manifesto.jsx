import { motion } from "framer-motion";
import { SOCIALS } from "../data";
import { XIcon, TelegramIcon } from "./icons";

const ease = [0.22, 1, 0.36, 1];

const words = ["WIN", "BIG", "IN", "YOUR", "OWN", "MEMECOIN."];

export const Manifesto = () => (
  <section id="manifesto" className="relative w-full px-5 py-28 sm:px-10 sm:py-36">
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex items-center gap-4">
        <span className="h-px w-10 bg-[var(--gold)]" />
        <span className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-gold sm:text-sm">
          Manifesto
        </span>
      </div>

      <h2 className="font-display text-5xl leading-[0.9] tracking-tight text-white sm:text-7xl lg:text-8xl">
        {words.map((w, i) => (
          <motion.span
            key={i}
            className="mr-[0.25em] inline-block"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.06, ease }}
          >
            {w === "OWN" || w === "MEMECOIN." ? <span className="text-gold">{w}</span> : w}
          </motion.span>
        ))}
      </h2>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="mt-8 max-w-2xl font-body text-base leading-relaxed text-stone-400 sm:text-lg"
      >
        Meme Arcade gives the strongest meme communities a crypto money game where they can
        win big in their own memecoins — offering the lowest-risk to high-reward ratio on the planet!
      </motion.p>

      <div className="mt-20 h-px w-full bg-white/10" />

      <div className="mt-6 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-stone-500">
          © 2026 Meme Arcade
        </span>
        <div className="flex items-center gap-8">
          <a
            href={SOCIALS.x}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="social-link-x"
            className="sweep flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:text-gold"
          >
            <XIcon className="h-4 w-4" /> X
          </a>
          <a
            href={SOCIALS.telegram}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="social-link-telegram"
            className="sweep flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-[0.25em] text-white transition-colors hover:text-gold"
          >
            <TelegramIcon className="h-4 w-4" /> Telegram
          </a>
        </div>
      </div>
    </div>
  </section>
);
