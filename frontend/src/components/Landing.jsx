import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { TopNav, StatusBar } from "./Chrome";
import { Hero } from "./Hero";
import { Gallery } from "./Gallery";
import { GameTakeover } from "./GameTakeover";
import { Manifesto } from "./Manifesto";
import { GAMES } from "../data";

export default function Landing() {
  const [activeGame, setActiveGame] = useState(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("exhibit");
    if (id) {
      const g = GAMES.find((x) => x.id === id);
      if (g) setActiveGame(g);
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = activeGame ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeGame]);

  return (
    <div className="relative">
      <TopNav />
      <main className="relative z-10">
        <Hero />
        <Gallery onOpen={setActiveGame} />
        <Manifesto />
      </main>
      <StatusBar />

      <AnimatePresence>
        {activeGame && <GameTakeover game={activeGame} onClose={() => setActiveGame(null)} />}
      </AnimatePresence>
    </div>
  );
}
