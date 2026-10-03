import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const scrollTo = (id) => {
  const el = document.querySelector(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

const scrollToNextSection = () => {
  const hero = document.querySelector("#top");
  const gallery = document.querySelector("#gallery");
  const manifesto = document.querySelector("#manifesto");

  const scrollY = window.scrollY;
  const windowHeight = window.innerHeight;

  // If in Hero section (top half of viewport), scroll to Gallery
  if (scrollY < windowHeight * 0.5) {
    scrollTo("#gallery");
  }
  // If in Gallery section, scroll to Manifesto
  else if (gallery && manifesto && scrollY < manifesto.offsetTop - windowHeight * 0.5) {
    scrollTo("#manifesto");
  }
  // If in Manifesto section, scroll back to top
  else {
    scrollTo("#top");
  }
};

export const TopNav = () => (
  <motion.header
    initial={{ y: -40, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ duration: 0.7, ease: "easeOut" }}
    className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-5 sm:px-10 sm:py-7"
  >
    <button
      onClick={() => scrollTo("#top")}
      className="flex items-center gap-2.5"
      data-testid="brand-home-btn"
    >
      <span className="live-dot inline-block h-2 w-2 rounded-full bg-[var(--gold)] text-[var(--gold)]" />
      <img src="/logo.webp" alt="Meme Arcade" className="h-10 w-auto" />
    </button>
    <button
      onClick={() => scrollTo("#gallery")}
      className="group flex items-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.3em] text-gold sm:text-sm"
      data-testid="nav-archive-btn"
    >
      <span className="h-px w-6 bg-[var(--gold)] transition-all duration-300 group-hover:w-10" />
      ARCHIVE
    </button>
  </motion.header>
);

const Clock = () => {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
          .map((n) => String(n).padStart(2, "0"))
          .join(":")
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return <span data-testid="utc-clock">{time} UTC</span>;
};

export const StatusBar = () => {
  const [currentSection, setCurrentSection] = useState("hero");

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const manifesto = document.querySelector("#manifesto");
      const gallery = document.querySelector("#gallery");

      if (manifesto && scrollY >= manifesto.offsetTop - windowHeight * 0.5) {
        setCurrentSection("manifesto");
      } else if (gallery && scrollY >= gallery.offsetTop - windowHeight * 0.5) {
        setCurrentSection("gallery");
      } else {
        setCurrentSection("hero");
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-white/10 bg-gradient-to-t from-[#09090A] to-transparent px-5 py-3.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400 sm:px-10 sm:text-xs">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-[var(--gold)]">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 text-emerald-400" />
          LIVE
        </span>
        <Clock />
      </div>
      <button
        onClick={scrollToNextSection}
        className="hidden items-center gap-2 text-stone-500 sm:flex hover:text-gold transition-colors cursor-pointer"
        data-testid="scroll-down-btn"
      >
        <span className="scroll-bob">
          {currentSection === "manifesto" ? "RETURN TO TOP ↑" : "SCROLL ↓"}
        </span>
      </button>
      <div className="flex items-center gap-4">
        <span className="hidden text-stone-600 sm:inline">SYSTEM</span>
        <span>
          MOTION: <span className="text-gold">ON</span> · AUDIO: <span className="text-stone-600">OFF</span>
        </span>
      </div>
    </div>
  );
};
