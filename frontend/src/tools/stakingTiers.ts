/** ProofOfAccess NFT tiers — indices match on-chain mint(uint256 _tierLevel) 0..5 */

export type TierId = 0 | 1 | 2 | 3 | 4 | 5;

export interface StakingTier {
  id: TierId;
  /** On-chain TierByName */
  contractName: string;
  /** Fantasy display title for GameFi UI */
  title: string;
  tagline: string;
  /** On-chain TierByLadder list weight (from contract defaults) */
  lists: number;
  /** ARCADE burn multiplier (from contract defaults) */
  multiplier: number;
  accent: string;
  glow: string;
  /** Public asset paths under /staking/tiers/{id}-{slug}/ */
  art: {
    nft: string;
    /** Seamless loop video of the mint-section character (under /mint/) */
    nftVideo: string;
    farm: string;
    withdraw: string;
    harvest: string;
  };
}

const tierArt = (id: number, slug: string) => ({
  nft: `/staking/tiers/${id}-${slug}/nft.jpg`,
  nftVideo: `/mint/${id}-${slug}.mp4`,
  farm: `/staking/tiers/${id}-${slug}/farm.jpg`,
  withdraw: `/staking/tiers/${id}-${slug}/withdraw.jpg`,
  harvest: `/staking/tiers/${id}-${slug}/harvest.jpg`,
});

/** Six tiers matching ProofOfAccess.sol TierByName / multipliers / TierByLadder */
export const STAKING_TIERS: StakingTier[] = [
  {
    id: 0,
    contractName: "Marble",
    title: "Deckhand",
    tagline: "Humble marble servant of the fleet",
    lists: 2,
    multiplier: 1,
    accent: "from-slate-300 to-stone-500",
    glow: "rgba(203,213,225,0.45)",
    art: tierArt(0, "marble"),
  },
  {
    id: 1,
    contractName: "Bronze",
    title: "Pirate",
    tagline: "Storm-born bronze freebooter",
    lists: 4,
    multiplier: 2,
    accent: "from-amber-600 to-orange-800",
    glow: "rgba(217,119,6,0.5)",
    art: tierArt(1, "bronze"),
  },
  {
    id: 2,
    contractName: "Silver",
    title: "Corsair",
    tagline: "Moonlit silver captain of the deep",
    lists: 8,
    multiplier: 4,
    accent: "from-slate-200 to-sky-500",
    glow: "rgba(148,163,184,0.55)",
    art: tierArt(2, "silver"),
  },
  {
    id: 3,
    contractName: "Gold",
    title: "Admiral",
    tagline: "Gilded privateer of the golden armada",
    lists: 12,
    multiplier: 8,
    accent: "from-yellow-300 to-amber-600",
    glow: "rgba(251,191,36,0.55)",
    art: tierArt(3, "gold"),
  },
  {
    id: 4,
    contractName: "Platinum",
    title: "Dragonlord",
    tagline: "Ice-scale rider of the platinum wyrm",
    lists: 15,
    multiplier: 16,
    accent: "from-cyan-200 to-indigo-500",
    glow: "rgba(103,232,249,0.5)",
    art: tierArt(4, "platinum"),
  },
  {
    id: 5,
    contractName: "Emerald",
    title: "Emperor",
    tagline: "Sovereign of emerald dragons",
    lists: 20,
    multiplier: 32,
    accent: "from-emerald-300 to-green-700",
    glow: "rgba(52,211,153,0.55)",
    art: tierArt(5, "emerald"),
  },
];

export function getTier(id: number): StakingTier {
  return STAKING_TIERS[Math.max(0, Math.min(5, id))] ?? STAKING_TIERS[0];
}

/**
 * Map on-chain Player.TIER to UI tier config.
 * Live contract TierByName uses fantasy titles (Deckhand, Pirate, …);
 * also accept material names (Marble, Bronze, …) for flexibility.
 */
export function getTierByContractName(name: string): StakingTier {
  const key = (name || "").trim().toLowerCase();
  if (!key) return STAKING_TIERS[0];
  const found = STAKING_TIERS.find(
    (t) =>
      t.title.toLowerCase() === key ||
      t.contractName.toLowerCase() === key,
  );
  return found ?? STAKING_TIERS[0];
}

/** Format ARCADE burn display (contract uses 18-decimal requiredAmount by default) */
export function formatArcadeBurn(requiredAmount: bigint, multiplier: number, decimals = 18): string {
  const burn = requiredAmount * BigInt(multiplier);
  const whole = burn / 10n ** BigInt(decimals);
  return whole.toLocaleString();
}

/**
 * Highest Proof of Access NFT in a wallet basket.
 * Ranks by LISTS (stream slots), then tier level, then token id.
 * Blacklisted NFTs are ignored. Returns null when none usable.
 */
export function pickHighestBasketNft<
  T extends { ID: bigint; LISTS: bigint; BLACKLIST: boolean; TIER: string },
>(owned: T[]): T | null {
  const usable = owned.filter((n) => !n.BLACKLIST);
  if (usable.length === 0) return null;

  return usable.reduce((best, cur) => {
    if (cur.LISTS !== best.LISTS) return cur.LISTS > best.LISTS ? cur : best;
    const curTier = getTierByContractName(cur.TIER).id;
    const bestTier = getTierByContractName(best.TIER).id;
    if (curTier !== bestTier) return curTier > bestTier ? cur : best;
    return cur.ID > best.ID ? cur : best;
  });
}
