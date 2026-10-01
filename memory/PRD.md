# Meme Arcade — Landing Page PRD

## Original Problem Statement
Build a cool animation landing site called **Meme Arcade** exhibiting 3 crypto meme games:
All Stars, Feferdream Apocalypse, and Cash Cats 'n' Money Mice. Each exhibit links to its subdomain.
Meme Arcade gives the strongest meme communities a crypto money game where they win big in their own
memecoins — the lowest-risk to high-reward ratio on the planet.

Redesign (user-provided reference screenshots): editorial "monolith gallery" aesthetic, **golden theme**
with a **golden glow that follows the pointer**, exhibitions that **animate on hover to reveal details**
and **expand into a full-screen takeover** with each game's own theme color. Fully responsive.

## Architecture
- Frontend-only React SPA (no backend). CRA + Tailwind + framer-motion + lenis (smooth scroll).
- Components: Chrome (TopNav + StatusBar w/ live UTC clock), Hero, Gallery (hover-expand monolith panels),
  GameTakeover (full-screen modal, per-game theme), Manifesto (footer). Data in `src/data.js`.
- Cursor-follow golden glow via `useCursorGlow` hook (CSS vars + radial gradient, mix-blend screen).
- Fonts: Anton (display), Archivo (body), JetBrains Mono (labels).
- AI-generated key art in `/public/images/` (hero, allstars, feferdream, cashcats).

## Links (as specified)
- Games: allstars.memearcade.my, feferdream.memearcade.my, cashcats.memearcade.my
- Stake: https://staking.memearcade ; Trade: disabled/"soon"
- Socials: x.com/myMemeArcade, t.me/memearcade

## Implemented (2026-06)
- Kinetic hero: masked line reveal "WIN BIG / IN MEMES", 3 CTAs (Enter the Arcade, Stake Arcade gold, Trade Soon dimmed).
- Monolith gallery "EXHIBITIONS": 3 panels, LIVE dots per theme (gold/red/green), hover expands panel + reveals tagline & "Enter Exhibition".
- Full-screen game takeover per game (category, title, description, feature chips, Enter Universe/Download/Share, Active Now stat), themed color. Opens on panel click.
- Shareable deep-link `?exhibit=<id>` auto-opens an exhibition.
- Manifesto/footer with socials + fixed status bar (live clock, SYSTEM MOTION/AUDIO).
- Golden cursor-follow glow, film grain, responsive (flex-col on mobile → flex-row desktop).

## Verified
- Hero, gallery, both takeover themes (allstars gold, feferdream red), manifesto — screenshot-verified.
- Build compiles clean, no console errors.

## Backlog / Next
- P1: Horizontal scroll ("traverse") for gallery on desktop; audio toggle wiring.
- P2: Real tokenomics/contract-address section; animated stat counters.
