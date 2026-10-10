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
  nftVideo: `/staking/tiers/${id}-${slug}/loop.mp4`,
  farm: `/staking/tiers/${id}-${slug}/farm.jpg`,
  withdraw: `/staking/tiers/${id}-${slug}/withdraw.jpg`,
  harvest: `/staking/tiers/${id}-${slug}/harvest.jpg`,
});

/** Six tiers matching ProofOfAccess.sol TierByName / multipliers / TierByLadder */
export const STAKING_TIERS: StakingTier[] = [
  {
    id: 0,
    contractName: "Pong",
    title: "Pong",
    tagline: "The first cabinet. Two paddles. Infinite rematches.",
    lists: 2,
    multiplier: 1,
    accent: "from-slate-300 to-stone-500",
    glow: "rgba(203,213,225,0.45)",
    art: tierArt(0, "pong"),
  },
  {
    id: 1,
    contractName: "Space Invaders",
    title: "Space Invaders",
    tagline: "Hold the line. The sky is dropping.",
    lists: 4,
    multiplier: 2,
    accent: "from-green-400 to-green-600",
    glow: "rgba(127,255,0,0.45)",
    art: tierArt(1, "invaders"),
  },
  {
    id: 2,
    contractName: "Pac-Man",
    title: "Pac-Man",
    tagline: "Chase the dots. Outrun the ghosts.",
    lists: 8,
    multiplier: 4,
    accent: "from-yellow-300 to-amber-500",
    glow: "rgba(255,208,40,0.5)",
    art: tierArt(2, "pacman"),
  },
  {
    id: 3,
    contractName: "Tetris",
    title: "Tetris",
    tagline: "Stack the lines. Sovereign of the high score.",
    lists: 12,
    multiplier: 8,
    accent: "from-pink-400 to-purple-600",
    glow: "rgba(255,43,214,0.5)",
    art: tierArt(3, "tetris"),
  },
  {
    id: 4,
    contractName: "Street Fighter",
    title: "Street Fighter",
    tagline: "Best of best. Hadouken in the hall.",
    lists: 15,
    multiplier: 16,
    accent: "from-red-400 to-red-600",
    glow: "rgba(255,80,80,0.5)",
    art: tierArt(4, "fighter"),
  },
  {
    id: 5,
    contractName: "Mortal Kombat",
    title: "Mortal Kombat",
    tagline: "Finish him. Finish the pot.",
    lists: 20,
    multiplier: 32,
    accent: "from-cyan-300 to-blue-600",
    glow: "rgba(46,231,255,0.5)",
    art: tierArt(5, "kombat"),
  },
];

export function getTier(id: number): StakingTier {
  return STAKING_TIERS[Math.max(0, Math.min(5, id))] ?? STAKING_TIERS[0];
}

/** 1-based number shown in the UI. On-chain mint() still uses id 0..5. */
export function displayTierNumber(id: number): number {
  return getTier(id).id + 1;
}

export function compactTierKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Map on-chain Player.TIER to UI tier config.
 * Live contract TierByName uses arcade game titles (Pong, Space Invaders, …);
 * also accept compacted names for flexibility.
 */
export function getTierByContractName(name: string, liveNames?: readonly string[]): StakingTier {
  const key = compactTierKey(name || '');
  if (!key) return STAKING_TIERS[0];
  const found = STAKING_TIERS.find((tier) => {
    if (compactTierKey(tier.title) === key || compactTierKey(tier.contractName) === key) return true;
    const live = liveNames?.[tier.id];
    return Boolean(live && compactTierKey(live) === key);
  });
  return found ?? STAKING_TIERS[0];
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
