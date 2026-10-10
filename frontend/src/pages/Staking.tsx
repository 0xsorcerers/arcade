import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle,
  Leaf,
  Sparkles,
  Sprout,
  Wallet,
  Coins,
  Layers,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Fuel,
  AlertTriangle,
  ImageOff,
  Search,
  Plus,
  X,
  Radio,
  Gift,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { waitForReceipt } from "thirdweb";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import type { Address } from "viem";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNetworkStore } from "@/store/networkStore";
import {
  canAccessFarm,
  hasLegacyHarvester,
  hasLiveHarvester,
  hasLiveProofOfAccess,
} from "@/tools/networkData";
import {
  STAKING_TIERS,
  getTier,
  getTierByContractName,
  pickHighestBasketNft,
  type TierId,
} from "@/tools/stakingTiers";
import {
  getTokenName,
  getWhitelistedTokensByCategory,
  resolveRewardTokenLabel,
  shortTokenLabel,
  type RewardTokenCategory,
  type WhitelistedRewardToken,
} from "@/tools/whitelisted";
import {
  client,
  Connector,
  checkHarvesterDepositReadiness,
  checkProofOfAccessMintReadiness,
  clearFormerHarvesterClientCaches,
  createHarvesterClaimsCache,
  ensureHarvesterClaimsPage,
  fetchHarvesterFarmStats,
  fetchHarvesterSyncStatus,
  fetchHarvesterUserClaimsCount,
  fetchProofOfAccessMintConfig,
  fetchTotalArcadeSent,
  fetchUserSubscriptions,
  fetchWalletStakingBalances,
  fetchWithdrawTimelock,
  formatCompactTokenAmount,
  formatDurationCountdown,
  formatEther,
  formatExactTokenAmount,
  getPlayerOwners,
  getThirdwebNetwork,
  harvesterClaimsPageRange,
  HARVESTER_CLAIMS_MAX_BATCH,
  HARVESTER_CLAIMS_PAGE_SIZE,
  isHarvesterClaimsRangeLoaded,
  loadLegacyHarvesterMigrationStatus,
  loadUserRewardStreamsSnapshot,
  planFarmDepositSteps,
  prepareHarvesterSyncClaim,
  resolveMaxRewardStreams,
  fromTokenSmallestUnit,
  toTokenSmallestUnit,
  useHarvesterFarm,
  useProofOfAccessGift,
  useProofOfAccessMint,
  validateErc20Token,
  type ClaimableRewardStream,
  type HarvesterSyncStatus,
  type HarvesterClaimDisplay,
  type HarvesterClaimsCache,
  type HarvesterDepositReadiness,
  type HarvesterFarmStep,
  type HarvesterWithdrawTimelock,
  type LegacyHarvesterMigrationStatus,
  type ProofOfAccessMintConfig,
  type ProofOfAccessMintReadiness,
  type ProofOfAccessPlayer,
  type UserRewardStreamsSnapshot,
} from "@/tools/utils";

const STAKE_TOKEN = "ARCADE";

/** Soft color accents for estimated-reward chips (cycles by index). */
const STREAM_CHIP_COLORS = [
  "from-emerald-400 to-teal-500",
  "from-indigo-400 to-violet-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-cyan-400 to-sky-500",
  "from-lime-400 to-green-500",
];

const CATEGORY_LABELS: Record<RewardTokenCategory, string> = {
  crypto: "Crypto",
  stock: "Stocks",
  etf: "ETFs",
  commodity: "Commodities",
  other: "Other",
};

const CATEGORY_ORDER: RewardTokenCategory[] = [
  "crypto",
  "stock",
  "etf",
  "commodity",
  "other",
];

function isValidAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

function normalizeAddr(a: string): string {
  return a.trim().toLowerCase();
}

function sameAddressSet(a: Address[], b: Address[]): boolean {
  if (a.length !== b.length) return false;
  const sa = a.map(normalizeAddr).sort();
  const sb = b.map(normalizeAddr).sort();
  return sa.every((v, i) => v === sb[i]);
}

const TIER_STORAGE_KEY = "arcade4thots-staking-last-tier";

function readCachedTierId(): TierId {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(TIER_STORAGE_KEY);
    if (raw === null) return 0; // first visit → Marble
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 5) return n as TierId;
  } catch {
    /* ignore */
  }
  return 0;
}

function writeCachedTierId(id: TierId) {
  try {
    localStorage.setItem(TIER_STORAGE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

type ActionColumnProps = {
  title: string;
  subtitle: string;
  background: string;
  children: React.ReactNode;
  delay?: number;
};

/** Art columns keep a dark overlay for character readability on top of tier art.
 * Desktop (lg+): fill remaining viewport height so Stake/Withdraw/Harvest CTAs stay in view. */
function ActionColumn({ title, subtitle, background, children, delay = 0 }: ActionColumnProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      className="group relative min-h-[320px] flex-1 overflow-hidden rounded-2xl border border-border/60 shadow-xl sm:min-h-[360px] lg:min-h-0 lg:h-full"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={background}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.45 }}
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-700 group-hover:scale-105"
          style={{
            backgroundImage: `url(${background})`,
            backgroundPosition: "center top",
          }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/25" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_20%,rgba(0,0,0,0.35)_100%)]" />

      <div className="absolute left-3 right-3 top-3 z-10 sm:left-4 sm:right-4 sm:top-4">
        <p className="font-sora text-[10px] font-semibold uppercase tracking-[0.28em] text-white/70">
          {subtitle}
        </p>
        <h3 className="font-cinzel text-xl font-bold tracking-wide text-white drop-shadow-lg">
          {title}
        </h3>
      </div>

      <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-end p-3 pb-4 sm:min-h-[360px] sm:p-4 lg:min-h-0 lg:p-4 lg:pb-4">
        {children}
      </div>
    </motion.div>
  );
}

function StatCard({
  label,
  value,
  unit,
  accentClass,
  delay = 0,
  onClick,
  title,
}: {
  label: string;
  value: string;
  unit: string;
  accentClass: string;
  delay?: number;
  onClick?: () => void;
  title?: string;
}) {
  const interactive = typeof onClick === "function";
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "rounded-xl border border-border/50 theme-surface px-3 py-2 sm:px-4 lg:py-1.5",
        interactive &&
          "cursor-pointer transition hover:border-amber-500/40 hover:bg-amber-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
      )}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={title}
    >
      <p className={cn("font-sora text-[10px] font-medium tracking-wide sm:text-[11px]", accentClass)}>{label}</p>
      <p className="mt-0.5 font-jetbrains text-[13px] font-semibold tracking-tight text-foreground sm:text-sm">
        {value} <span className="font-sora text-[11px] font-semibold text-muted-foreground sm:text-xs">{unit}</span>
      </p>
    </motion.div>
  );
}

function formatClaimWhen(timestamp: number): string {
  if (!timestamp) return "—";
  try {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function TierCarousel({
  tierId,
  onChange,
}: {
  tierId: TierId;
  onChange: (id: TierId) => void;
}) {
  const tier = getTier(tierId);
  const prev = () => onChange(((tierId + STAKING_TIERS.length - 1) % STAKING_TIERS.length) as TierId);
  const next = () => onChange(((tierId + 1) % STAKING_TIERS.length) as TierId);

  const playLoopVideo = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    void el.play().catch(() => {
      /* autoplay may be blocked until interaction; poster still shows */
    });
  }, []);

  return (
    <div className="relative">
      <div
        className="relative overflow-hidden rounded-xl border-2 border-border/70 shadow-lg"
        style={{ boxShadow: `0 0 28px ${tier.glow}` }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tier.id}
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24, scale: 0.96 }}
            transition={{ duration: 0.35 }}
            className="relative aspect-[1.75/1] w-full sm:aspect-[2/1] lg:aspect-[4/3]"
          >
            {/* Static poster while video loads / as accessible fallback */}
            <img
              src={tier.art.nft}
              alt={`${tier.title} NFT`}
              className="absolute inset-0 h-full w-full object-cover object-top"
              draggable={false}
            />
            <video
              src={tier.art.nftVideo}
              poster={tier.art.nft}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onLoadedData={(e) => playLoopVideo(e.currentTarget)}
              onCanPlay={(e) => playLoopVideo(e.currentTarget)}
              ref={playLoopVideo}
              aria-label={`${tier.title} animated character`}
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-1.5 pt-8 lg:pb-1 lg:pt-6">
          <p className="font-orbitron text-[9px] font-bold uppercase tracking-[0.22em] text-white/70">
            Tier {tier.id} · {tier.contractName}
          </p>
          <p className="font-cinzel text-sm font-bold text-white drop-shadow sm:text-base">
            {tier.title}
          </p>
          <p className="hidden font-sora text-[10px] leading-snug text-white/75 sm:block lg:hidden xl:block">
            {tier.tagline}
          </p>
        </div>

        <motion.button
          type="button"
          aria-label="Previous tier"
          onClick={prev}
          animate={{ x: [0, -4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </motion.button>
        <motion.button
          type="button"
          aria-label="Next tier"
          onClick={next}
          animate={{ x: [0, 4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
          className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:bg-primary hover:text-primary-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </motion.button>
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {STAKING_TIERS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Select ${t.title}`}
            onClick={() => onChange(t.id)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              t.id === tierId ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function formatArcadeDisplay(amount: bigint, decimals = 18): string {
  return formatCompactTokenAmount(amount, decimals, 2);
}

export default function Staking() {
  const navigate = useNavigate();
  const account = useActiveAccount();
  const selectedNetwork = useNetworkStore((state) => state.selectedNetwork);
  const canAccessStaking = canAccessFarm(selectedNetwork);
  const poaLive = hasLiveProofOfAccess(selectedNetwork);
  const harvesterLive = hasLiveHarvester(selectedNetwork);
  const { mintTier, isPending: isMinting } = useProofOfAccessMint();
  const { giftNft, isPending: isGifting } = useProofOfAccessGift();
  const {
    farmDeposit,
    updateSubscriptions,
    farmWithdraw,
    farmClaim,
    isPending: isFarming,
  } = useHarvesterFarm();
  const { mutateAsync: sendSyncTx, isPending: isSyncing } = useSendTransaction();

  // Marble (0) on first visit; restore last choice on return
  const [tierId, setTierId] = useState<TierId>(() => readCachedTierId());
  const [mintConfig, setMintConfig] = useState<ProofOfAccessMintConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [farmAmount, setFarmAmount] = useState("");
  const [selectedRewardAddress, setSelectedRewardAddress] = useState<Address | null>(null);
  const [showRewardPicker, setShowRewardPicker] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"mint" | "streams" | "info">("mint");
  const [mintDialogOpen, setMintDialogOpen] = useState(false);
  const [mintReadiness, setMintReadiness] = useState<ProofOfAccessMintReadiness | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [mintStep, setMintStep] = useState<"idle" | "checking" | "approving" | "minting">("idle");

  // Farm / Harvester
  const [farmStep, setFarmStep] = useState<HarvesterFarmStep>("idle");
  const [farmStatus, setFarmStatus] = useState("Ready to farm ARCADE");
  const [farmReadiness, setFarmReadiness] = useState<HarvesterDepositReadiness | null>(null);
  const [loadingFarmReadiness, setLoadingFarmReadiness] = useState(false);
  const [totalFarmArcadeSent, setTotalFarmArcadeSent] = useState<bigint | null>(null);
  const [currentFarmBalance, setCurrentFarmBalance] = useState<bigint | null>(null);
  const [liveSubscriptions, setLiveSubscriptions] = useState<Address[]>([]);
  const [loadingFarmStats, setLoadingFarmStats] = useState(false);
  const [syncStatus, setSyncStatus] = useState<HarvesterSyncStatus | null>(null);
  const [syncTransactionsRemaining, setSyncTransactionsRemaining] = useState(0);
  const [syncActionStep, setSyncActionStep] = useState<"idle" | "checking" | "syncing">("idle");

  // Withdraw timelock
  const [withdrawLock, setWithdrawLock] = useState<HarvesterWithdrawTimelock | null>(null);
  const [withdrawCountdown, setWithdrawCountdown] = useState(0);
  const [withdrawStep, setWithdrawStep] = useState<"idle" | "checking" | "withdrawing">("idle");
  const [loadingWithdrawLock, setLoadingWithdrawLock] = useState(false);

  // Claim / harvest streams (full on-chain snapshot + era math when staked)
  const [claimableStreams, setClaimableStreams] = useState<ClaimableRewardStream[]>([]);
  const [rewardSnapshot, setRewardSnapshot] = useState<UserRewardStreamsSnapshot | null>(null);
  const [loadingClaimables, setLoadingClaimables] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [claimSelection, setClaimSelection] = useState<Address[]>([]);
  const [claimStep, setClaimStep] = useState<"idle" | "claiming">("idle");

  // Harvested claim history (Harvester.userTotalClaimHistory + getUserClaims)
  // Cache holds up to 200-entry on-chain batches so Older/Newer is local until the next batch.
  const [harvestedCount, setHarvestedCount] = useState<number | null>(null);
  const [loadingHarvestedCount, setLoadingHarvestedCount] = useState(false);
  const [claimHistoryOpen, setClaimHistoryOpen] = useState(false);
  const [claimHistoryPage, setClaimHistoryPage] = useState(0);
  const [claimHistoryPageCount, setClaimHistoryPageCount] = useState(0);
  const [claimHistoryRows, setClaimHistoryRows] = useState<HarvesterClaimDisplay[]>([]);
  const [loadingClaimHistory, setLoadingClaimHistory] = useState(false);
  const claimHistoryCacheRef = useRef<HarvesterClaimsCache | null>(null);
  const harvestedCountRef = useRef<number | null>(null);
  harvestedCountRef.current = harvestedCount;

  // Subscription dialog
  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [subDialogMode, setSubDialogMode] = useState<"farm" | "manage">("manage");
  const [selectedStreams, setSelectedStreams] = useState<Address[]>([]);
  const [streamSearch, setStreamSearch] = useState("");
  const [customTokenInput, setCustomTokenInput] = useState("");
  /** On-chain ERC20 names for non-whitelisted stream addresses (keyed lowercased). */
  const [customStreamLabels, setCustomStreamLabels] = useState<Record<string, string>>({});
  const customStreamLabelsRef = useRef<Record<string, string>>({});
  customStreamLabelsRef.current = customStreamLabels;
  const [validatingCustomToken, setValidatingCustomToken] = useState(false);
  /**
   * Debounced ERC-20 lookup when the stream search box contains a 0x address.
   * Shows a clickable token-name row after validation (2s bounce).
   */
  const [searchAddressHit, setSearchAddressHit] = useState<{
    address: Address;
    name: string;
    symbol: string;
  } | null>(null);
  const [searchAddressStatus, setSearchAddressStatus] = useState<
    "idle" | "waiting" | "loading" | "ready" | "invalid"
  >("idle");
  const searchAddressLookupGen = useRef(0);
  const [maxStreams, setMaxStreams] = useState(1);
  /** Token id of designated basket NFT for Harvester subscribe limits (0 = standard / no NFT) */
  const [designatedNftId, setDesignatedNftId] = useState<bigint | null>(null);
  const [subscribeNftId, setSubscribeNftId] = useState<bigint>(0n);

  // Live wallet balances (viem reads)
  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [arcadeBalance, setArcadeBalance] = useState<bigint | null>(null);
  const [walletArcadeDecimals, setWalletArcadeDecimals] = useState(18);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Owned ProofOfAccess NFTs (basket)
  const [ownedNfts, setOwnedNfts] = useState<ProofOfAccessPlayer[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [selectedNft, setSelectedNft] = useState<ProofOfAccessPlayer | null>(null);
  const [nftDialogOpen, setNftDialogOpen] = useState(false);

  // Gift NFT (ERC-721 transferFrom)
  const [giftDialogOpen, setGiftDialogOpen] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState("");
  const [giftStep, setGiftStep] = useState<"idle" | "sending">("idle");

  // Legacy Harvester migration gate — claim pending rewards only (same Harvester.json ABI)
  const legacyHarvesterLive = hasLegacyHarvester(selectedNetwork);
  const [legacyStatus, setLegacyStatus] = useState<LegacyHarvesterMigrationStatus | null>(null);
  const [loadingLegacyStatus, setLoadingLegacyStatus] = useState(false);
  const [legacyClaimStep, setLegacyClaimStep] = useState<"idle" | "claiming">("idle");
  /**
   * Never show while loading / unknown. Only freeze after on-chain confirmation
   * of pending rewards on the legacy Harvester.
   */
  const legacyGateActive =
    legacyHarvesterLive &&
    !!account?.address &&
    legacyStatus !== null &&
    legacyStatus.isBlocked;

  const tier = useMemo(() => getTier(tierId), [tierId]);
  const arcadeDecimals =
    mintConfig?.arcadeDecimals ??
    mintReadiness?.arcadeDecimals ??
    farmReadiness?.arcadeDecimals ??
    walletArcadeDecimals ??
    18;

  const whitelistByCategory = useMemo(
    () => getWhitelistedTokensByCategory(selectedNetwork.chainId),
    [selectedNetwork.chainId],
  );

  /** Prefer whitelist name, then cached ERC20 name for custom streams, then short address. */
  const streamLabel = useCallback(
    (addr: Address) => {
      const key = normalizeAddr(addr);
      const whitelisted = getTokenName(selectedNetwork.chainId, addr);
      if (whitelisted) return whitelisted;
      if (customStreamLabels[key]) return customStreamLabels[key];
      return resolveRewardTokenLabel(selectedNetwork.chainId, addr);
    },
    [customStreamLabels, selectedNetwork.chainId],
  );

  /**
   * Cache ERC20 names for addresses not on the official whitelist (readable chips).
   * Reads the labels ref so this callback stays stable (avoids refresh loops).
   */
  const resolveCustomStreamLabels = useCallback(
    async (addresses: Address[]) => {
      const chainId = selectedNetwork.chainId;
      const cached = customStreamLabelsRef.current;
      const unknown = addresses.filter(
        (a) => !getTokenName(chainId, a) && !cached[normalizeAddr(a)],
      );
      if (unknown.length === 0) return;

      const results = await Promise.allSettled(
        unknown.map(async (addr) => {
          const meta = await validateErc20Token(addr);
          return { key: normalizeAddr(addr), name: meta.name };
        }),
      );

      setCustomStreamLabels((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const r of results) {
          if (r.status === "fulfilled" && !next[r.value.key]) {
            next[r.value.key] = r.value.name;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [selectedNetwork.chainId],
  );

  const handleTierChange = useCallback((id: TierId) => {
    setTierId(id);
    writeCachedTierId(id);
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!account?.address) {
      setNativeBalance(null);
      setArcadeBalance(null);
      return;
    }
    setLoadingBalances(true);
    try {
      const bal = await fetchWalletStakingBalances(account.address as Address);
      setNativeBalance(bal.ethBalance);
      setArcadeBalance(bal.arcadeBalance);
      setWalletArcadeDecimals(bal.arcadeDecimals);
    } catch (err) {
      console.error("refreshBalances failed", err);
      setNativeBalance(null);
      setArcadeBalance(null);
    } finally {
      setLoadingBalances(false);
    }
  }, [account?.address]);

  /**
   * Legacy status: pending claimables on the old Harvester only.
   * Gate stays hidden until status is known (no loading flash).
   */
  const refreshLegacyMigrationStatus = useCallback(async () => {
    if (!account?.address || !legacyHarvesterLive) {
      setLegacyStatus(null);
      return;
    }
    setLoadingLegacyStatus(true);
    try {
      const status = await loadLegacyHarvesterMigrationStatus(account.address as Address);
      setLegacyStatus(status);
    } catch (err) {
      console.error("refreshLegacyMigrationStatus failed", err);
      // Do not block on error — only confirmed pending rewards gate the UI
      setLegacyStatus(null);
    } finally {
      setLoadingLegacyStatus(false);
    }
  }, [account?.address, legacyHarvesterLive]);

  const refreshOwnedNfts = useCallback(async () => {
    if (!account?.address || !poaLive) {
      setOwnedNfts([]);
      return;
    }
    setLoadingNfts(true);
    try {
      const players = await getPlayerOwners(account.address as Address);
      setOwnedNfts(players);
    } catch (err) {
      console.error("refreshOwnedNfts failed", err);
      setOwnedNfts([]);
    } finally {
      setLoadingNfts(false);
    }
  }, [account?.address, poaLive]);

  /**
   * Pull Total Farm from Harvester.TotalARCADESent and user stake from balances[user].
   * Safe to call before/after deposit or withdraw so the dashboard stays in sync.
   */
  const refreshFarmStats = useCallback(async () => {
    if (!harvesterLive) {
      setTotalFarmArcadeSent(null);
      setCurrentFarmBalance(null);
      setLiveSubscriptions([]);
      return;
    }
    setLoadingFarmStats(true);
    try {
      if (account?.address) {
        const stats = await fetchHarvesterFarmStats(account.address as Address);
        setTotalFarmArcadeSent(stats.totalFarmArcadeSent);
        setCurrentFarmBalance(stats.stakedBalance);
        setLiveSubscriptions(stats.subscriptions);
        void resolveCustomStreamLabels(stats.subscriptions);
      } else {
        // Global TotalARCADESent does not require a wallet
        const total = await fetchTotalArcadeSent();
        setTotalFarmArcadeSent(total);
        setCurrentFarmBalance(null);
        setLiveSubscriptions([]);
      }
    } catch (err) {
      console.error("refreshFarmStats failed", err);
      setTotalFarmArcadeSent(null);
      setCurrentFarmBalance(null);
      setLiveSubscriptions([]);
    } finally {
      setLoadingFarmStats(false);
    }
  }, [account?.address, harvesterLive, resolveCustomStreamLabels]);

  const refreshSyncStatus = useCallback(async () => {
    if (!account?.address || !harvesterLive) {
      setSyncStatus(null);
      return;
    }
    try {
      const status = await fetchHarvesterSyncStatus(account.address as Address);
      setSyncStatus(status);
    } catch (err) {
      console.error("refreshSyncStatus failed", err);
      setSyncStatus(null);
    }
  }, [account?.address, harvesterLive]);

  const syncMissingEras = useCallback(
    async (statusOverride?: HarvesterSyncStatus | null) => {
      if (!account || !harvesterLive) return false;

      const status =
        statusOverride ??
        syncStatus ??
        (await fetchHarvesterSyncStatus(account.address as Address));
      const pending = status.subscriptions.filter((entry) => entry.loopsNeeded > 0);
      if (pending.length === 0) {
        setSyncStatus(status);
        setSyncTransactionsRemaining(0);
        return true;
      }

      const totalSyncCalls = pending.reduce((sum, entry) => sum + entry.loopsNeeded, 0);
      setSyncTransactionsRemaining(totalSyncCalls);

      try {
        for (const entry of pending) {
          for (let i = 0; i < entry.loopsNeeded; i++) {
            const tx = await sendSyncTx(
              prepareHarvesterSyncClaim(entry.token, BigInt(entry.maxBatchSize || 50)),
            );
            await waitForReceipt({
              client,
              chain: getThirdwebNetwork(),
              transactionHash: tx.transactionHash,
            });
            setSyncTransactionsRemaining((remaining) => Math.max(0, remaining - 1));
          }
        }

        const refreshed = await fetchHarvesterSyncStatus(account.address as Address);
        setSyncStatus(refreshed);
        return !refreshed.requiresSync;
      } finally {
        setSyncTransactionsRemaining(0);
      }
    },
    [account, harvesterLive, sendSyncTx, syncStatus],
  );

  const ensureSyncForAction = useCallback(async () => {
    if (!account || !harvesterLive) return true;

    setSyncActionStep("checking");
    try {
      const status = await fetchHarvesterSyncStatus(account.address as Address);
      setSyncStatus(status);

      if (!status.requiresSync) {
        setSyncTransactionsRemaining(0);
        return true;
      }

      const pending = status.subscriptions.filter((entry) => entry.loopsNeeded > 0);
      const totalSyncCalls = pending.reduce((sum, entry) => sum + entry.loopsNeeded, 0);
      setSyncActionStep("syncing");

      toast.message("Sync before action", {
        description: `You need ${totalSyncCalls} separate sync call${totalSyncCalls === 1 ? "" : "s"} across ${pending.length} token${pending.length === 1 ? "" : "s"}. Each sync must finish before the next batch can run.`,
      });

      const ok = await syncMissingEras(status);
      if (!ok) {
        toast.error("Sync was interrupted", {
          description: "Your claim/withdraw action was halted until the stale claim state is caught up.",
        });
      }

      return ok;
    } finally {
      setSyncActionStep("idle");
    }
  }, [account, harvesterLive, syncMissingEras]);

  /** entryMap + timeLock for withdraw countdown / button lock. */
  const refreshWithdrawLock = useCallback(async () => {
    if (!account?.address || !harvesterLive) {
      setWithdrawLock(null);
      setWithdrawCountdown(0);
      return;
    }
    setLoadingWithdrawLock(true);
    try {
      const lock = await fetchWithdrawTimelock(account.address as Address);
      setWithdrawLock(lock);
      setWithdrawCountdown(lock.remainingSeconds);
    } catch (err) {
      console.error("refreshWithdrawLock failed", err);
      setWithdrawLock(null);
      setWithdrawCountdown(0);
    } finally {
      setLoadingWithdrawLock(false);
    }
  }, [account?.address, harvesterLive]);

  /**
   * Staking page reward load path:
   * - Always re-read balances, subscriptions, globals, claimRewards, tokenEconomics, eras
   * - Run stored-era accrual math only when balances[user] > 0 (active stake)
   * - Display claimable amounts to the last token unit
   */
  const refreshClaimables = useCallback(async () => {
    if (!account?.address || !harvesterLive) {
      setClaimableStreams([]);
      setRewardSnapshot(null);
      return;
    }
    setLoadingClaimables(true);
    try {
      const snapshot = await loadUserRewardStreamsSnapshot(account.address as Address);
      setRewardSnapshot(snapshot);
      setClaimableStreams(snapshot.streams);
      // Keep Current Farm aligned with the same balances[] read used for era gate
      setCurrentFarmBalance(snapshot.stakedBalance);
      if (snapshot.subscriptions.length) {
        setLiveSubscriptions(snapshot.subscriptions);
      }
      // Prefer names already loaded with claimable streams; fill gaps via ERC20 reads
      if (snapshot.streams.length) {
        setCustomStreamLabels((prev) => {
          const next = { ...prev };
          for (const s of snapshot.streams) {
            if (!getTokenName(selectedNetwork.chainId, s.address) && s.name) {
              next[normalizeAddr(s.address)] = s.name;
            }
          }
          return next;
        });
      } else if (snapshot.subscriptions.length) {
        void resolveCustomStreamLabels(snapshot.subscriptions);
      }
      setSelectedRewardAddress((prev) => {
        if (
          prev &&
          snapshot.streams.some((s) => normalizeAddr(s.address) === normalizeAddr(prev))
        ) {
          return prev;
        }
        return snapshot.streams[0]?.address ?? null;
      });
    } catch (err) {
      console.error("refreshClaimables failed", err);
      setClaimableStreams([]);
      setRewardSnapshot(null);
    } finally {
      setLoadingClaimables(false);
    }
  }, [
    account?.address,
    harvesterLive,
    resolveCustomStreamLabels,
    selectedNetwork.chainId,
  ]);

  /** Total harvest claims — Harvester.userTotalClaimHistory (claims count). */
  const refreshHarvestedCount = useCallback(async () => {
    if (!account?.address || !harvesterLive) {
      setHarvestedCount(null);
      return;
    }
    setLoadingHarvestedCount(true);
    try {
      const count = await fetchHarvesterUserClaimsCount(account.address as Address);
      setHarvestedCount(count);
    } catch (err) {
      console.error("refreshHarvestedCount failed", err);
      setHarvestedCount(null);
    } finally {
      setLoadingHarvestedCount(false);
    }
  }, [account?.address, harvesterLive]);

  /**
   * Resolve a claim-history UI page from the local batch cache when possible.
   * userTotalClaimHistory tells us how many entries exist; getUserClaims only
   * runs when the needed ≤200 batch is missing (or forceRefresh is set).
   */
  const refreshClaimHistoryPage = useCallback(
    async (
      page: number,
      options?: { totalHint?: number | null; forceRefresh?: boolean },
    ) => {
      if (!account?.address || !harvesterLive) {
        claimHistoryCacheRef.current = null;
        setClaimHistoryRows([]);
        setClaimHistoryPageCount(0);
        setHarvestedCount(null);
        return;
      }

      const wallet = account.address as Address;
      const forceRefresh = options?.forceRefresh === true;
      const knownTotal = harvestedCountRef.current;

      try {
        let total: number;
        if (forceRefresh) {
          setLoadingClaimHistory(true);
          total = await fetchHarvesterUserClaimsCount(wallet);
        } else if (typeof options?.totalHint === "number" && options.totalHint >= 0) {
          total = options.totalHint;
        } else if (typeof knownTotal === "number" && knownTotal >= 0) {
          total = knownTotal;
        } else {
          setLoadingClaimHistory(true);
          total = await fetchHarvesterUserClaimsCount(wallet);
        }

        const walletKey = wallet.toLowerCase();
        let cache = claimHistoryCacheRef.current;
        if (
          forceRefresh ||
          !cache ||
          cache.wallet !== walletKey ||
          cache.total !== total
        ) {
          cache = createHarvesterClaimsCache(wallet, total);
          claimHistoryCacheRef.current = cache;
        }

        const pageCount = total === 0 ? 0 : Math.max(1, Math.ceil(total / HARVESTER_CLAIMS_PAGE_SIZE));
        const safePage =
          pageCount === 0 ? 0 : Math.min(Math.max(0, page), pageCount - 1);
        const { start, count } = harvesterClaimsPageRange(
          total,
          safePage,
          HARVESTER_CLAIMS_PAGE_SIZE,
        );
        const needsFetch =
          total > 0 &&
          count > 0 &&
          !isHarvesterClaimsRangeLoaded(cache, start, count);

        if (needsFetch) setLoadingClaimHistory(true);

        const result = await ensureHarvesterClaimsPage(
          wallet,
          cache,
          safePage,
          HARVESTER_CLAIMS_PAGE_SIZE,
        );
        claimHistoryCacheRef.current = cache;
        setHarvestedCount(result.total);
        setClaimHistoryPage(result.page);
        setClaimHistoryPageCount(result.pageCount);
        setClaimHistoryRows(result.claims);
      } catch (err) {
        console.error("refreshClaimHistoryPage failed", err);
        setClaimHistoryRows([]);
        setClaimHistoryPageCount(0);
      } finally {
        setLoadingClaimHistory(false);
      }
    },
    [account?.address, harvesterLive],
  );

  const openClaimHistory = useCallback(() => {
    if (!account?.address) {
      toast.error("Connect your wallet to view claim history");
      return;
    }
    if (!harvesterLive) {
      toast.error("Harvester not live yet");
      return;
    }
    setClaimHistoryPage(0);
    setClaimHistoryOpen(true);
  }, [account?.address, harvesterLive]);

  useEffect(() => {
    if (!canAccessStaking) {
      toast.error("Farm unavailable on this network", {
        description: "Switch to a chain with live ProofOfAccess and Harvester contracts.",
      });
      navigate("/app", { replace: true });
    }
  }, [canAccessStaking, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoadingConfig(true);
    fetchProofOfAccessMintConfig(tierId)
      .then((cfg) => {
        if (!cancelled) setMintConfig(cfg);
      })
      .catch(() => {
        if (!cancelled) setMintConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tierId, selectedNetwork.chainId]);

  // Load / refresh balances when wallet or network changes
  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances, selectedNetwork.chainId]);

  /**
   * Every staking load: drop client caches that may still hold data from the
   * former Harvester, then recheck migration status.
   */
  useEffect(() => {
    clearFormerHarvesterClientCaches({
      wallet: (account?.address as Address | undefined) ?? null,
      chainId: selectedNetwork.chainId,
    });
    claimHistoryCacheRef.current = null;
    setClaimHistoryRows([]);
    setClaimHistoryPage(0);
    setClaimHistoryPageCount(0);
  }, [account?.address, selectedNetwork.chainId]);

  // Legacy Harvester migration gate (pending rewards on previous deploy)
  useEffect(() => {
    void refreshLegacyMigrationStatus();
  }, [refreshLegacyMigrationStatus, selectedNetwork.chainId]);

  // Load owned NFTs when wallet or network changes
  useEffect(() => {
    void refreshOwnedNfts();
  }, [refreshOwnedNfts, selectedNetwork.chainId]);

  // Live farm totals from Harvester
  useEffect(() => {
    void refreshFarmStats();
  }, [refreshFarmStats, selectedNetwork.chainId]);

  // Withdraw timelock after last deposit entry
  useEffect(() => {
    void refreshWithdrawLock();
  }, [refreshWithdrawLock, selectedNetwork.chainId]);

  // Tick withdraw countdown once per second while locked (strict > unlockAt)
  useEffect(() => {
    if (!withdrawLock?.unlockAt || withdrawLock.stakedBalance <= 0n) {
      setWithdrawCountdown(0);
      return;
    }
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      // Match contract: need now > unlockAt
      const remaining =
        now <= withdrawLock.unlockAt ? withdrawLock.unlockAt - now + 1 : 0;
      setWithdrawCountdown(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [withdrawLock?.unlockAt, withdrawLock?.stakedBalance]);

  // On every staking page load / wallet / network change: fresh contract data + estimates
  useEffect(() => {
    void refreshClaimables();
  }, [refreshClaimables, selectedNetwork.chainId]);

  // Harvested total from userTotalClaimHistory
  useEffect(() => {
    void refreshHarvestedCount();
  }, [refreshHarvestedCount, selectedNetwork.chainId]);

  // Drop claim-history batch cache when wallet or network changes
  useEffect(() => {
    claimHistoryCacheRef.current = null;
  }, [account?.address, selectedNetwork.chainId]);

  // While claim-history dialog is open, serve pages from the ≤200 batch cache;
  // only missing batches trigger getUserClaims.
  useEffect(() => {
    if (!claimHistoryOpen) return;
    void refreshClaimHistoryPage(claimHistoryPage);
  }, [
    claimHistoryOpen,
    claimHistoryPage,
    refreshClaimHistoryPage,
    account?.address,
    selectedNetwork.chainId,
  ]);

  // While user has active stake, re-read chain params + re-run era math on a cadence
  // (owner can change tax/timeLock; new ERAs complete over time)
  useEffect(() => {
    if (!account?.address || !harvesterLive) return;
    if (!rewardSnapshot?.hasActiveStake) return;
    const id = window.setInterval(() => {
      void refreshClaimables();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [account?.address, harvesterLive, rewardSnapshot?.hasActiveStake, refreshClaimables]);

  /**
   * Designated NFT for farm / subscribe limits:
   * - No NFTs → standard (1 stream, nftId 0)
   * - First load / invalid previous → highest NFT in basket
   * - Manual switch only via "Choose this Tier" (does not follow mint carousel)
   */
  useEffect(() => {
    const usable = ownedNfts.filter((n) => !n.BLACKLIST);
    if (usable.length === 0) {
      setDesignatedNftId(null);
      setMaxStreams(1);
      setSubscribeNftId(0n);
      return;
    }

    setDesignatedNftId((prev) => {
      const stillOwned = prev !== null && usable.some((n) => n.ID === prev);
      if (stillOwned) return prev;
      const highest = pickHighestBasketNft(usable);
      return highest?.ID ?? null;
    });
  }, [ownedNfts]);

  // Keep maxStreams + subscribeNftId aligned with designated basket NFT
  useEffect(() => {
    const { maxStreams: max, nftId } = resolveMaxRewardStreams(ownedNfts, designatedNftId);
    setMaxStreams(max);
    setSubscribeNftId(nftId);
    // Clamp selection if tier/pass now allows fewer streams (avoids on-chain errors)
    setSelectedStreams((prev) => (prev.length > max ? prev.slice(0, max) : prev));
  }, [ownedNfts, designatedNftId]);

  /** True until the user has at least one Harvester reward stream */
  const needsStreamSubscription = Boolean(
    account && harvesterLive && liveSubscriptions.length === 0,
  );

  // Red status: prompt stream subscription when none yet (standard or with NFTs)
  useEffect(() => {
    if (!account || !harvesterLive) return;
    if (farmStep !== "idle" || loadingFarmReadiness || isFarming) return;

    if (needsStreamSubscription) {
      setFarmStatus("Subscribe to at least 1 reward stream to farm");
    } else if (liveSubscriptions.length > 0) {
      setFarmStatus((prev) =>
        prev.toLowerCase().includes("subscribe") || prev.toLowerCase().includes("reward stream")
          ? "Ready to farm ARCADE"
          : prev,
      );
    }
  }, [
    account,
    harvesterLive,
    needsStreamSubscription,
    liveSubscriptions.length,
    farmStep,
    loadingFarmReadiness,
    isFarming,
  ]);

  const selectedRewardData = useMemo(() => {
    if (!selectedRewardAddress) return null;
    return (
      claimableStreams.find(
        (s) => normalizeAddr(s.address) === normalizeAddr(selectedRewardAddress),
      ) ?? null
    );
  }, [claimableStreams, selectedRewardAddress]);

  const canWithdrawNow = useMemo(() => {
    if (!account || !harvesterLive) return false;
    if (!withdrawLock || withdrawLock.stakedBalance <= 0n) return false;
    if (loadingWithdrawLock || withdrawStep !== "idle" || isFarming) return false;
    // Live countdown: 0 means now is strictly past entryMap + timeLock
    return withdrawCountdown <= 0 && withdrawLock.entryTimestamp > 0;
  }, [
    account,
    harvesterLive,
    withdrawLock,
    loadingWithdrawLock,
    withdrawStep,
    isFarming,
    withdrawCountdown,
  ]);

  /** Live plan: skip approve when pre-approved; include subscribe when streams changed */
  const farmPlan = useMemo(() => {
    if (!farmReadiness || selectedStreams.length === 0) return null;
    return planFarmDepositSteps({
      allowance: farmReadiness.allowance,
      depositAmount: farmReadiness.depositAmount,
      priorSubscriptions: farmReadiness.subscriptions,
      nextSubscriptions: selectedStreams,
    });
  }, [farmReadiness, selectedStreams]);

  const preApprovedDisplay =
    farmReadiness != null
      ? formatArcadeDisplay(farmReadiness.allowance, farmReadiness.arcadeDecimals)
      : null;

  const farmStatusTone = /not enough|failed|failure|could not|invalid|error|rejected|denied/i.test(
    farmStatus,
  )
    ? "error"
    : /needs approve|subscribe to at least|pick reward streams|select reward streams/i.test(
          farmStatus,
        )
      ? "warning"
      : /deposited|subscribed|ready|pre-approved|complete/i.test(farmStatus)
        ? "success"
        : "pending";

  // Keep red status in sync with planned steps while dialog is open / amount ready
  useEffect(() => {
    if (farmStep !== "idle" || loadingFarmReadiness || isFarming) return;
    if (!farmReadiness || !farmPlan) return;
    if (subDialogMode === "farm" && subDialogOpen) {
      const steps = farmPlan.stepLabels.join(" → ");
      if (!farmPlan.needsApproval && farmReadiness.allowance > 0n) {
        setFarmStatus(
          `Pre-approved ${preApprovedDisplay} ARCADE · next: ${steps || "deposit"}`,
        );
      } else if (farmPlan.needsApproval) {
        setFarmStatus(`Needs approve · next: ${steps}`);
      } else {
        setFarmStatus(`Ready · ${steps}`);
      }
    }
  }, [
    farmPlan,
    farmReadiness,
    farmStep,
    loadingFarmReadiness,
    isFarming,
    subDialogMode,
    subDialogOpen,
    preApprovedDisplay,
  ]);

  const filteredCategories = useMemo(() => {
    const q = streamSearch.trim().toLowerCase();
    const result: Partial<Record<RewardTokenCategory, WhitelistedRewardToken[]>> = {};
    for (const cat of CATEGORY_ORDER) {
      const list = whitelistByCategory[cat] ?? [];
      if (!list.length) continue;
      const filtered = q
        ? list.filter(
            (t) =>
              t.name.toLowerCase().includes(q) ||
              t.address.toLowerCase().includes(q),
          )
        : list;
      if (filtered.length) result[cat] = filtered;
    }
    return result;
  }, [whitelistByCategory, streamSearch]);

  /**
   * When search looks like a contract address, wait 2s then validate ERC-20
   * (name + symbol + decimals) and surface a clickable token-name result.
   */
  useEffect(() => {
    const raw = streamSearch.trim();
    if (!isValidAddress(raw)) {
      searchAddressLookupGen.current += 1;
      setSearchAddressHit(null);
      setSearchAddressStatus("idle");
      return;
    }

    const addr = raw as Address;
    const key = normalizeAddr(addr);
    const gen = ++searchAddressLookupGen.current;

    // Whitelist / already-known labels: still bounce 2s so typing a full address feels consistent
    const knownName =
      getTokenName(selectedNetwork.chainId, addr) ||
      customStreamLabelsRef.current[key] ||
      null;

    setSearchAddressHit(null);
    setSearchAddressStatus("waiting");

    const timer = window.setTimeout(() => {
      if (searchAddressLookupGen.current !== gen) return;

      if (knownName) {
        setSearchAddressHit({
          address: addr,
          name: knownName,
          symbol: "",
        });
        setSearchAddressStatus("ready");
        return;
      }

      setSearchAddressStatus("loading");
      void (async () => {
        try {
          const meta = await validateErc20Token(addr);
          if (searchAddressLookupGen.current !== gen) return;
          setCustomStreamLabels((prev) => ({
            ...prev,
            [key]: meta.name,
          }));
          setSearchAddressHit({
            address: addr,
            name: meta.name,
            symbol: meta.symbol,
          });
          setSearchAddressStatus("ready");
        } catch (err) {
          console.error("Search address ERC20 check failed:", err);
          if (searchAddressLookupGen.current !== gen) return;
          setSearchAddressHit(null);
          setSearchAddressStatus("invalid");
        }
      })();
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [streamSearch, selectedNetwork.chainId]);

  const totalFarmDisplay =
    !harvesterLive
      ? "—"
      : loadingFarmStats && totalFarmArcadeSent === null
        ? "…"
        : totalFarmArcadeSent !== null
          ? formatArcadeDisplay(totalFarmArcadeSent, arcadeDecimals)
          : "0";

  const nativeBalanceDisplay = !account
    ? "—"
    : loadingBalances && nativeBalance === null
      ? "…"
      : nativeBalance !== null
        ? formatCompactTokenAmount(nativeBalance, 18, 4)
        : "—";

  const arcadeBalanceDisplay = !account
    ? "—"
    : loadingBalances && arcadeBalance === null
      ? "…"
      : arcadeBalance !== null
        ? formatArcadeDisplay(arcadeBalance, walletArcadeDecimals)
        : "—";

  const currentFarmDisplay =
    !account || !harvesterLive
      ? "—"
      : loadingFarmStats && currentFarmBalance === null
        ? "…"
        : currentFarmBalance !== null
          ? formatArcadeDisplay(currentFarmBalance, arcadeDecimals)
          : "0";

  const walletArcadeHuman =
    arcadeBalance !== null ? formatArcadeDisplay(arcadeBalance, walletArcadeDecimals) : "0";

  const parseFarmAmount = useCallback((): bigint | null => {
    const raw = farmAmount.trim();
    if (!raw || Number.isNaN(Number(raw)) || Number(raw) <= 0) return null;
    try {
      return toTokenSmallestUnit(raw, arcadeDecimals);
    } catch {
      return null;
    }
  }, [farmAmount, arcadeDecimals]);

  const setFarmAmountPercent = useCallback(
    (pct: "25%" | "50%" | "MAX") => {
      if (arcadeBalance === null || arcadeBalance <= 0n) {
        setFarmAmount("0");
        return;
      }
      const portion =
        pct === "MAX"
          ? arcadeBalance
          : (arcadeBalance * BigInt(pct === "25%" ? 25 : 50)) / 100n;
      setFarmAmount(fromTokenSmallestUnit(portion, walletArcadeDecimals));
    },
    [arcadeBalance, walletArcadeDecimals],
  );

  /** Full unstake via Harvester.withdraw() after timelock. */
  const handleWithdrawNow = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to withdraw");
      return;
    }
    if (!harvesterLive) {
      toast.error("Harvester not live yet");
      return;
    }
    if (!canWithdrawNow) {
      toast.error("Withdraw locked", {
        description:
          withdrawCountdown > 0
            ? `Timelock remaining: ${formatDurationCountdown(withdrawCountdown)}`
            : "No stake available to withdraw.",
      });
      return;
    }

    const ready = await ensureSyncForAction();
    if (!ready) return;

    setWithdrawStep("checking");
    try {
      await farmWithdraw({
        onStep: (step) => {
          setWithdrawStep(step === "idle" ? "idle" : step);
        },
      });
      toast.success("Withdraw complete", {
        description: "Your ARCADE stake was returned to your wallet.",
      });
      await Promise.all([
        refreshFarmStats(),
        refreshWithdrawLock(),
        refreshBalances(),
        refreshClaimables(),
      ]);
    } catch (err) {
      console.error("withdraw failed", err);
      const msg = err instanceof Error ? err.message : "Withdraw failed";
      toast.error("Withdraw failed", { description: msg });
    } finally {
      setWithdrawStep("idle");
    }
  }, [
    account,
    harvesterLive,
    canWithdrawNow,
    withdrawCountdown,
    farmWithdraw,
    ensureSyncForAction,
    refreshFarmStats,
    refreshWithdrawLock,
    refreshBalances,
    refreshClaimables,
  ]);

  /** Claim all pending rewards on the legacy Harvester. */
  const handleLegacyClaimAll = useCallback(async () => {
    if (!account || !legacyStatus?.harvester) {
      toast.error("Connect your wallet");
      return;
    }
    const tokens = legacyStatus.pendingClaimStreams
      .filter((s) => !s.isClaimLocked && (s.claimableAmount > 0n || s.rewardsOwedRaw > 0n))
      .map((s) => s.address);
    if (tokens.length === 0) {
      const anyLocked = legacyStatus.pendingClaimStreams.some((s) => s.isClaimLocked);
      toast.error(anyLocked ? "Claims still locked" : "Nothing to claim", {
        description: anyLocked
          ? "Wait for per-token claim cooldowns, then try again."
          : "No pending rewards found on the old contract.",
      });
      return;
    }

    setLegacyClaimStep("claiming");
    try {
      await farmClaim({
        tokens,
        wallet: account.address as Address,
        harvester: legacyStatus.harvester,
        onStep: (step) => {
          setLegacyClaimStep(step === "idle" ? "idle" : "claiming");
        },
      });
      toast.success("Legacy rewards claimed", {
        description: `Claimed ${tokens.length} stream${tokens.length === 1 ? "" : "s"} from the old contract.`,
      });
      await Promise.all([refreshLegacyMigrationStatus(), refreshBalances()]);
    } catch (err) {
      console.error("legacy claim failed", err);
      const msg = err instanceof Error ? err.message : "Legacy claim failed";
      toast.error("Legacy claim failed", { description: msg });
    } finally {
      setLegacyClaimStep("idle");
    }
  }, [account, legacyStatus, farmClaim, refreshLegacyMigrationStatus, refreshBalances]);

  const openClaimDialog = useCallback(
    (preselectAll: boolean) => {
      if (!account) {
        toast.error("Connect your wallet to claim");
        return;
      }
      if (!harvesterLive) {
        toast.error("Harvester not live yet");
        return;
      }
      if (claimableStreams.length === 0) {
        toast.error("No reward streams", {
          description: "Subscribe to reward streams while farming first.",
        });
        return;
      }
      if (preselectAll) {
        setClaimSelection(claimableStreams.map((s) => s.address));
      } else if (selectedRewardAddress) {
        setClaimSelection([selectedRewardAddress]);
      } else {
        setClaimSelection(claimableStreams.map((s) => s.address));
      }
      setClaimDialogOpen(true);
    },
    [account, harvesterLive, claimableStreams, selectedRewardAddress],
  );

  const toggleClaimToken = useCallback((address: Address) => {
    setClaimSelection((prev) => {
      const exists = prev.some((a) => normalizeAddr(a) === normalizeAddr(address));
      if (exists) {
        return prev.filter((a) => normalizeAddr(a) !== normalizeAddr(address));
      }
      return [...prev, address];
    });
  }, []);

  const runClaim = useCallback(
    async (tokens: Address[], label: string) => {
      if (!account) {
        toast.error("Connect your wallet to claim");
        return;
      }
      if (!tokens.length) {
        toast.error("Select at least one reward stream");
        return;
      }

      const isReady = await ensureSyncForAction();
      if (!isReady) return;

      setClaimStep("claiming");
      try {
        await farmClaim({
          tokens,
          wallet: account.address as Address,
          onStep: (step) => {
            if (step === "idle") setClaimStep("idle");
            else setClaimStep("claiming");
          },
        });
        toast.success(label, {
          description: `Claimed ${tokens.length} stream${tokens.length === 1 ? "" : "s"}.`,
        });
        setClaimDialogOpen(false);
        await Promise.all([
          refreshClaimables(),
          refreshFarmStats(),
          refreshBalances(),
          refreshHarvestedCount(),
        ]);
        // New claims land at the end of history — drop cache and show newest page
        claimHistoryCacheRef.current = null;
        setClaimHistoryPage(0);
        if (claimHistoryOpen) {
          await refreshClaimHistoryPage(0, { forceRefresh: true });
        }
      } catch (err) {
        console.error("claim failed", err);
        const msg = err instanceof Error ? err.message : "Claim failed";
        toast.error("Claim failed", { description: msg });
      } finally {
        setClaimStep("idle");
      }
    },
    [
      account,
      farmClaim,
      ensureSyncForAction,
      refreshClaimables,
      refreshFarmStats,
      refreshBalances,
      refreshHarvestedCount,
      claimHistoryOpen,
      refreshClaimHistoryPage,
    ],
  );

  const handleHarvestSelected = useCallback(async () => {
    await runClaim(claimSelection, "Rewards claimed");
  }, [runClaim, claimSelection]);

  const handleHarvestAll = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to claim");
      return;
    }
    if (!harvesterLive) {
      toast.error("Harvester not live yet");
      return;
    }
    if (claimableStreams.length === 0) {
      toast.error("No reward streams", {
        description: "Subscribe to reward streams while farming first.",
      });
      return;
    }
    await runClaim(
      claimableStreams.map((s) => s.address),
      "Harvested all streams",
    );
  }, [account, harvesterLive, claimableStreams, runClaim]);

  const openNftDialog = useCallback((nft: ProofOfAccessPlayer) => {
    setSelectedNft(nft);
    setNftDialogOpen(true);
  }, []);

  const isAlreadyDesignated = useCallback(
    (nft: ProofOfAccessPlayer | null | undefined) => {
      if (!nft || designatedNftId === null) return false;
      return nft.ID === designatedNftId;
    },
    [designatedNftId],
  );

  /** Manual tier switch — only way to change designated basket NFT (not mint carousel) */
  const switchToNftTier = useCallback(() => {
    if (!selectedNft || selectedNft.BLACKLIST) return;
    if (isAlreadyDesignated(selectedNft)) return;

    const mapped = getTierByContractName(selectedNft.TIER);
    setDesignatedNftId(selectedNft.ID);
    setMaxStreams(Math.max(1, Number(selectedNft.LISTS)));
    setSubscribeNftId(selectedNft.ID);
    // Sync farm / viewing art to the chosen basket tier (mint carousel still free to browse)
    handleTierChange(mapped.id);
    setNftDialogOpen(false);
    toast.success(`Designated ${mapped.title}`, {
      description: `Token #${selectedNft.ID.toString()} · up to ${Number(selectedNft.LISTS)} revenue streams`,
    });
  }, [selectedNft, isAlreadyDesignated, handleTierChange]);

  const openGiftDialog = useCallback(() => {
    if (!selectedNft) return;
    if (isAlreadyDesignated(selectedNft)) {
      toast.error("Switch off this tier first", {
        description: "You can’t gift the NFT that’s currently active for farming.",
      });
      return;
    }
    if (!account) {
      toast.error("Connect your wallet to gift an NFT");
      return;
    }
    if (!poaLive) {
      toast.error("Proof of Access is not live on this network yet");
      return;
    }
    setGiftRecipient("");
    setGiftStep("idle");
    setGiftDialogOpen(true);
  }, [selectedNft, isAlreadyDesignated, account, poaLive]);

  /** ERC-721 transferFrom: send selected PoA NFT to any wallet the user enters */
  const confirmGiftNft = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to gift an NFT");
      return;
    }
    if (!selectedNft) {
      toast.error("No NFT selected");
      return;
    }
    if (isAlreadyDesignated(selectedNft)) {
      toast.error("This NFT is your active tier — choose another tier before gifting it.");
      return;
    }

    const recipient = giftRecipient.trim();
    if (!isValidAddress(recipient)) {
      toast.error("Enter a valid wallet address", {
        description: "Addresses look like 0x followed by 40 hex characters.",
      });
      return;
    }
    if (normalizeAddr(recipient) === normalizeAddr(account.address)) {
      toast.error("Cannot gift to your own wallet");
      return;
    }

    const nftTier = getTierByContractName(selectedNft.TIER);
    const tokenId = selectedNft.ID;

    try {
      setGiftStep("sending");
      toast.loading("Confirm gift in your wallet…", {
        id: "gift-poa",
        description: `transferFrom → Token #${tokenId.toString()}`,
      });

      const result = await giftNft({
        from: account.address as Address,
        to: recipient,
        tokenId,
      });

      const shortTo = `${result.to.slice(0, 6)}…${result.to.slice(-4)}`;
      toast.success(`Gifted ${nftTier.title}`, {
        id: "gift-poa",
        description: `Token #${tokenId.toString()} sent to ${shortTo}`,
      });

      setGiftDialogOpen(false);
      setGiftRecipient("");
      setNftDialogOpen(false);
      setSelectedNft(null);
      // Basket refresh re-resolves designated tier (highest remaining, or standard if empty)
      void refreshOwnedNfts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gift failed";
      toast.error(message, { id: "gift-poa" });
    } finally {
      setGiftStep("idle");
    }
  }, [account, selectedNft, isAlreadyDesignated, giftRecipient, giftNft, refreshOwnedNfts]);

  const streamLimitDescription = useMemo(() => {
    const hasPass = ownedNfts.some((n) => !n.BLACKLIST);
    return hasPass
      ? "Your designated NFT unlocks this many revenue streams."
      : "Standard access (no NFT) — you can pick only 1 reward stream.";
  }, [ownedNfts]);

  const notifyStreamLimit = useCallback(() => {
    toast.error(`Max ${maxStreams} stream${maxStreams === 1 ? "" : "s"}`, {
      description: streamLimitDescription,
    });
  }, [maxStreams, streamLimitDescription]);

  const isStreamSelected = useCallback(
    (address: Address) =>
      selectedStreams.some((a) => normalizeAddr(a) === normalizeAddr(address)),
    [selectedStreams],
  );

  const canAddMoreStreams = selectedStreams.length < maxStreams;

  /**
   * Add a stream only if under the tier cap. Never exceeds maxStreams.
   * Outcome is computed inside the state updater so async races stay safe.
   */
  const tryAddStream = useCallback(
    (address: Address): "added" | "already" | "limit" => {
      const key = normalizeAddr(address);
      let outcome: "added" | "already" | "limit" = "limit";
      setSelectedStreams((prev) => {
        if (prev.some((a) => normalizeAddr(a) === key)) {
          outcome = "already";
          return prev;
        }
        if (prev.length >= maxStreams) {
          outcome = "limit";
          return prev;
        }
        outcome = "added";
        return [...prev, address];
      });
      if (outcome === "limit") {
        notifyStreamLimit();
      }
      return outcome;
    },
    [maxStreams, notifyStreamLimit],
  );

  const removeStream = useCallback((address: Address) => {
    const key = normalizeAddr(address);
    setSelectedStreams((prev) => prev.filter((a) => normalizeAddr(a) !== key));
  }, []);

  /** Checkbox / chip toggle — remove if selected, else add within tier limit. */
  const toggleStream = useCallback(
    (address: Address) => {
      if (isStreamSelected(address)) {
        removeStream(address);
        return;
      }
      tryAddStream(address);
    },
    [isStreamSelected, removeStream, tryAddStream],
  );

  /**
   * Shared path for custom address Add + search-hit click.
   * Respects tier stream caps before any success messaging.
   */
  const addStreamWithLabel = useCallback(
    (
      address: Address,
      label?: { name: string; symbol?: string },
    ): "added" | "already" | "limit" => {
      const key = normalizeAddr(address);
      if (label?.name && !getTokenName(selectedNetwork.chainId, address)) {
        setCustomStreamLabels((prev) => ({ ...prev, [key]: label.name }));
      }
      const result = tryAddStream(address);
      if (result === "added") {
        toast.success(`Added ${label?.name || streamLabel(address)}`, {
          description: label?.symbol
            ? `Symbol: ${label.symbol} · ${selectedStreams.length + 1}/${maxStreams} streams`
            : `${selectedStreams.length + 1}/${maxStreams} streams`,
        });
      } else if (result === "already") {
        toast.message("Already on your list", {
          description: label?.name || streamLabel(address),
        });
      }
      // "limit" already toasts via tryAddStream
      return result;
    },
    [
      tryAddStream,
      selectedNetwork.chainId,
      streamLabel,
      selectedStreams.length,
      maxStreams,
    ],
  );

  const addCustomToken = useCallback(async () => {
    const raw = customTokenInput.trim();
    if (!isValidAddress(raw)) {
      toast.error("Enter a valid token contract address (0x…)");
      return;
    }
    const addr = raw as Address;
    const key = normalizeAddr(addr);

    // Cap first — avoid chain reads / false "Added" toasts when list is full
    if (!isStreamSelected(addr) && !canAddMoreStreams) {
      notifyStreamLimit();
      return;
    }
    if (isStreamSelected(addr)) {
      toast.message("Already on your list", {
        description: streamLabel(addr),
      });
      setCustomTokenInput("");
      return;
    }

    // Already whitelisted — add within cap (no chain read needed)
    const whitelistName = getTokenName(selectedNetwork.chainId, addr);
    if (whitelistName) {
      addStreamWithLabel(addr, { name: whitelistName });
      setCustomTokenInput("");
      setStreamSearch("");
      return;
    }

    // Already validated earlier this session
    if (customStreamLabels[key]) {
      addStreamWithLabel(addr, { name: customStreamLabels[key] });
      setCustomTokenInput("");
      setStreamSearch("");
      return;
    }

    setValidatingCustomToken(true);
    try {
      // Same ERC20 gate as market create: name + symbol + decimals must exist
      const meta = await validateErc20Token(addr);
      // Re-check cap after async gap (user may have filled slots meanwhile)
      if (selectedStreams.length >= maxStreams && !isStreamSelected(addr)) {
        setCustomStreamLabels((prev) => ({ ...prev, [key]: meta.name }));
        notifyStreamLimit();
        return;
      }
      addStreamWithLabel(addr, { name: meta.name, symbol: meta.symbol });
      setCustomTokenInput("");
      setStreamSearch("");
    } catch (err) {
      console.error("Custom stream ERC20 check failed:", err);
      toast.error("Not a valid ERC-20 token", {
        description:
          "Contract must expose name(), symbol(), and decimals() — same check as creating a market.",
      });
    } finally {
      setValidatingCustomToken(false);
    }
  }, [
    customStreamLabels,
    customTokenInput,
    selectedNetwork.chainId,
    isStreamSelected,
    canAddMoreStreams,
    notifyStreamLimit,
    streamLabel,
    addStreamWithLabel,
    selectedStreams.length,
    maxStreams,
  ]);

  const openSubscriptionDialog = useCallback(
    async (mode: "farm" | "manage") => {
      if (!account) {
        toast.error("Connect your wallet first");
        return;
      }
      if (!harvesterLive) {
        toast.error("Harvester not live yet", {
          description:
            "Using zero stand-in address. Deploy Harvester, then set harvester in networkData.",
        });
        return;
      }

      setSubDialogMode(mode);
      setStreamSearch("");
      setCustomTokenInput("");
      setSearchAddressHit(null);
      setSearchAddressStatus("idle");
      searchAddressLookupGen.current += 1;
      setSubDialogOpen(true);
      setFarmStatus(
        mode === "farm"
          ? "Pick reward streams, then confirm deposit…"
          : "Update your reward stream subscriptions…",
      );

      // Seed selection from on-chain subscriptions (clamp to current tier cap)
      try {
        const { maxStreams: streamCap } = resolveMaxRewardStreams(
          ownedNfts,
          designatedNftId,
        );
        const subs = await fetchUserSubscriptions(account.address as Address);
        const tokens = subs.tokens.length ? [...subs.tokens] : [];
        const capped =
          tokens.length > streamCap ? tokens.slice(0, streamCap) : tokens;
        setSelectedStreams(capped);
        setLiveSubscriptions(subs.tokens);
        // Resolve readable names for any custom (non-whitelist) streams already on-chain
        void resolveCustomStreamLabels(tokens);
        if (tokens.length > streamCap) {
          toast.message(`Showing ${streamCap} of ${tokens.length} streams`, {
            description:
              "Your current pass allows fewer streams — trim the list before confirming.",
          });
        }
      } catch {
        setSelectedStreams([]);
      }
    },
    [account, harvesterLive, resolveCustomStreamLabels, ownedNfts, designatedNftId],
  );

  /** Stake Now → readiness check + subscription dialog */
  const openFarmFlow = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to farm");
      return;
    }
    if (!harvesterLive) {
      toast.error("Harvester not live yet", {
        description:
          "Using zero stand-in address. Deploy Harvester, then set harvester in networkData.",
      });
      return;
    }

    const amount = parseFarmAmount();
    if (amount === null) {
      toast.error("Enter a valid ARCADE amount to farm");
      return;
    }

    // Snapshot TotalARCADESent before deposit flow
    void refreshFarmStats();

    setFarmStep("checking");
    setFarmStatus("Checking ARCADE balance and gas…");
    setLoadingFarmReadiness(true);
    setFarmReadiness(null);

    try {
      const readiness = await checkHarvesterDepositReadiness(
        account.address as Address,
        amount,
        {
          ownedNfts,
          preferredNftId: subscribeNftId,
          expectedTxCount: 3,
        },
      );
      setFarmReadiness(readiness);
      setMaxStreams(readiness.maxStreams);
      setSubscribeNftId(readiness.nftId);

      if (!readiness.hasEnoughArcade) {
        setFarmStatus(
          `Not enough ARCADE — need ${formatArcadeDisplay(amount, readiness.arcadeDecimals)}, have ${formatArcadeDisplay(readiness.arcadeBalance, readiness.arcadeDecimals)}`,
        );
        toast.error("Not enough ARCADE", {
          description: `You need ${formatArcadeDisplay(amount, readiness.arcadeDecimals)} ARCADE in your wallet to deposit.`,
        });
      } else if (!readiness.hasEnoughGas) {
        setFarmStatus(
          `Not enough ${selectedNetwork.symbol} for gas (need ~${formatEther(readiness.ethNeeded)})`,
        );
        toast.error(`Not enough ${selectedNetwork.symbol} for gas`, {
          description: `Approve + subscribe + deposit need gas. Mint fee buffer ${formatEther(readiness.mintFee)} ${selectedNetwork.symbol} + est. gas ~${formatEther(readiness.ethGasReserve)}.`,
        });
      } else {
        setFarmStatus("Select reward streams, then confirm deposit");
      }

      await openSubscriptionDialog("farm");
      setFarmStep("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not prepare farm";
      setFarmStatus(message);
      toast.error(message);
      setFarmStep("idle");
    } finally {
      setLoadingFarmReadiness(false);
    }
  }, [
    account,
    harvesterLive,
    parseFarmAmount,
    ownedNfts,
    subscribeNftId,
    selectedNetwork.symbol,
    openSubscriptionDialog,
    refreshFarmStats,
  ]);

  const confirmFarmDeposit = useCallback(async () => {
    if (!account || !farmReadiness) {
      toast.error("Farm readiness not loaded");
      return;
    }
    if (selectedStreams.length === 0) {
      toast.error("Pick at least one reward stream");
      return;
    }
    if (selectedStreams.length > maxStreams) {
      toast.error(`Max ${maxStreams} stream(s) for your pass`);
      return;
    }
    if (!farmReadiness.hasEnoughArcade) {
      toast.error("Not enough ARCADE for this deposit");
      return;
    }

    setFarmStep("checking");
    setFarmStatus("Preparing deposit…");

    // Plan from dialog state (fresh on-chain re-check happens inside farmDeposit)
    const planned = planFarmDepositSteps({
      allowance: farmReadiness.allowance,
      depositAmount: farmReadiness.depositAmount,
      priorSubscriptions: farmReadiness.subscriptions,
      nextSubscriptions: selectedStreams,
    });

    try {
      // TotalARCADESent snapshot before deposit txs
      await refreshFarmStats();

      toast.loading(
        planned.needsApproval
          ? "Preparing approve → …"
          : planned.needsSubscribe
            ? "Preparing subscribe → deposit…"
            : "Preparing deposit…",
        { id: "farm-harvester" },
      );
      const result = await farmDeposit({
        wallet: account.address as Address,
        amount: farmReadiness.depositAmount,
        selectedTokens: selectedStreams,
        nftId: subscribeNftId,
        readiness: farmReadiness,
        beforeDeposit: () => ensureSyncForAction(),
        onStep: (step, detail) => {
          setFarmStep(step);
          if (detail) setFarmStatus(detail);
          if (step === "approving") {
            toast.loading("Approve ARCADE in your wallet…", {
              id: "farm-harvester",
              description: `Allow Harvester to spend ${formatArcadeDisplay(farmReadiness.depositAmount, farmReadiness.arcadeDecimals)} ARCADE`,
            });
          } else if (step === "subscribing") {
            toast.loading("Confirm reward streams in your wallet…", {
              id: "farm-harvester",
              description: `subscribeToToken · tokenId ${subscribeNftId.toString()} · ${selectedStreams.length} stream(s) (list changed)`,
            });
          } else if (step === "depositing") {
            toast.loading("Confirm deposit in your wallet…", {
              id: "farm-harvester",
              description: `deposit(${formatArcadeDisplay(farmReadiness.depositAmount, farmReadiness.arcadeDecimals)} ARCADE)`,
            });
          } else if (step === "checking" && detail) {
            toast.loading(detail, { id: "farm-harvester" });
          }
        },
      });

      const ran: string[] = [];
      if (result.didApprove) ran.push("approved");
      if (result.didSubscribe) ran.push("subscribed");
      ran.push("deposited");
      toast.success("ARCADE deposited to Harvester", {
        id: "farm-harvester",
        description: ran.join(" · "),
      });
      setFarmStatus(
        `Deposited ${formatArcadeDisplay(farmReadiness.depositAmount, farmReadiness.arcadeDecimals)} ARCADE`,
      );
      setSubDialogOpen(false);
      setFarmAmount("");
      setFarmReadiness(null);
      void refreshBalances();
      // TotalARCADESent + balances + timelock + claimables after successful deposit
      await Promise.all([
        refreshFarmStats(),
        refreshWithdrawLock(),
        refreshClaimables(),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Farm deposit failed";
      setFarmStatus(message);
      toast.error(message, { id: "farm-harvester" });
      // Still re-read TotalARCADESent after a failed mid-flow attempt
      void refreshFarmStats();
    } finally {
      setFarmStep("idle");
    }
  }, [
    account,
    farmReadiness,
    selectedStreams,
    maxStreams,
    farmDeposit,
    subscribeNftId,
    ensureSyncForAction,
    refreshBalances,
    refreshFarmStats,
    refreshWithdrawLock,
    refreshClaimables,
  ]);

  const confirmManageSubscriptions = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet");
      return;
    }
    if (selectedStreams.length === 0) {
      toast.error("Pick at least one reward stream");
      return;
    }
    if (selectedStreams.length > maxStreams) {
      toast.error(`Max ${maxStreams} stream(s) for your pass`);
      return;
    }

    // Unchanged list — nothing to send
    if (sameAddressSet(liveSubscriptions, selectedStreams)) {
      toast.message("No changes", { description: "Your streams already match this list." });
      setSubDialogOpen(false);
      return;
    }

    try {
      setFarmStep("subscribing");
      setFarmStatus("Confirm subscription list in your wallet…");
      toast.loading("Confirm subscriptions…", { id: "farm-subscribe" });
      let statusDetail = "";
      await updateSubscriptions({
        tokens: selectedStreams,
        nftId: subscribeNftId,
        maxStreams,
        wallet: account.address as Address,
        onStep: (step, detail) => {
          setFarmStep(step);
          if (detail) {
            setFarmStatus(detail);
            if (step === "idle") statusDetail = detail;
          }
        },
      });
      const keptPrior = /kept for claim/i.test(statusDetail);
      toast.success("Reward streams updated", {
        id: "farm-subscribe",
        description: keptPrior
          ? `${selectedStreams.length} stream(s) active · prior unclaimed streams stay in claim list`
          : `${selectedStreams.length} stream(s) active`,
      });
      setFarmStatus(
        keptPrior
          ? statusDetail
          : `Subscribed to ${selectedStreams.length} stream(s)`,
      );
      setSubDialogOpen(false);
      void refreshFarmStats();
      void refreshClaimables();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Subscription update failed";
      setFarmStatus(message);
      toast.error(message, { id: "farm-subscribe" });
    } finally {
      setFarmStep("idle");
    }
  }, [
    account,
    selectedStreams,
    maxStreams,
    liveSubscriptions,
    updateSubscriptions,
    subscribeNftId,
    refreshFarmStats,
    refreshClaimables,
  ]);

  /** Open confirm dialog + load gas / approval readiness for the chosen tier */
  const openMintDialog = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to mint");
      return;
    }
    if (!poaLive) {
      toast.error("ProofOfAccess not live yet", {
        description:
          "Using zero stand-in address. Deploy the contract, then set proof_of_access in networkData.",
      });
      return;
    }
    if (mintConfig?.paused) {
      toast.error("Minting is paused");
      return;
    }

    setActiveSidebarTab("mint");
    setMintDialogOpen(true);
    setLoadingReadiness(true);
    setMintReadiness(null);

    try {
      const readiness = await checkProofOfAccessMintReadiness(
        account.address as Address,
        tierId,
      );
      setMintReadiness(readiness);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not check mint requirements";
      toast.error(message);
      setMintDialogOpen(false);
    } finally {
      setLoadingReadiness(false);
    }
  }, [account, poaLive, mintConfig?.paused, tierId]);

  const confirmMint = useCallback(async () => {
    if (!account) {
      toast.error("Connect your wallet to mint");
      return;
    }
    if (!mintReadiness?.canMint) {
      if (mintReadiness && !mintReadiness.hasEnoughArcade) {
        toast.error("Not enough ARCADE", {
          description: `You need ${formatArcadeDisplay(mintReadiness.config.burnAmount, mintReadiness.arcadeDecimals)} ARCADE to burn for this tier.`,
        });
      } else if (mintReadiness && !mintReadiness.hasEnoughGas) {
        toast.error(`Not enough ${selectedNetwork.symbol} for gas`, {
          description: `Mint fee is ${formatEther(mintReadiness.config.mintFee)} ${selectedNetwork.symbol}, plus gas for approve + mint. Add more ${selectedNetwork.symbol} and try again.`,
        });
      }
      return;
    }

    try {
      setMintStep("checking");
      toast.loading("Preparing mint…", { id: "mint-poa" });
      await mintTier(tierId, {
        wallet: account.address as Address,
        readiness: mintReadiness,
        onStep: (step) => {
          setMintStep(step);
          if (step === "approving") {
            toast.loading("Approve ARCADE burn in your wallet…", {
              id: "mint-poa",
              description: `Allow ProofOfAccess to spend ${formatArcadeDisplay(mintReadiness.config.burnAmount, mintReadiness.arcadeDecimals)} ARCADE`,
            });
          } else if (step === "minting") {
            toast.loading("Confirm mint in your wallet…", {
              id: "mint-poa",
              description: `mint(${tierId}) · fee ${formatEther(mintReadiness.config.mintFee)} ${selectedNetwork.symbol}`,
            });
          }
        },
      });
      toast.success(`Minted ${tier.title} (${tier.contractName})`, {
        id: "mint-poa",
        description: `Tier level ${tierId} · ${tier.lists} revenue streams`,
      });
      setMintDialogOpen(false);
      setMintReadiness(null);
      // Refresh ARCADE / native balances and NFT row after mint
      void refreshBalances();
      void refreshOwnedNfts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mint failed";
      toast.error(message, { id: "mint-poa" });
    } finally {
      setMintStep("idle");
    }
  }, [
    account,
    mintReadiness,
    mintTier,
    tierId,
    tier,
    selectedNetwork.symbol,
    refreshBalances,
    refreshOwnedNfts,
  ]);

  if (!canAccessStaking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center textured-bg">
        <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
          <ShieldAlert className="h-10 w-10 text-amber-500" />
          <p className="font-cinzel text-xl font-semibold text-foreground">Farm locked</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This network needs live ProofOfAccess and Harvester contracts. Redirecting...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden textured-bg font-sora text-foreground lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      {/* Soft network accent washes (same language as History / Markets) */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25"
          style={{ backgroundImage: "url('/images/hero.webp')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#09090A]/65 via-[#09090A]/85 to-[#09090A]/95" />
        <div
          className="absolute -right-1/2 -top-1/2 h-full w-full animate-pulse bg-gradient-to-bl from-primary/5 via-transparent to-transparent"
          style={{ animationDuration: "4s" }}
        />
        <div
          className="absolute -bottom-1/2 -left-1/2 h-full w-full animate-pulse bg-gradient-to-tr from-accent/5 via-transparent to-transparent"
          style={{ animationDuration: "6s" }}
        />
      </div>

      {/*
        In-app legacy claim only (same Harvester.json ABI).
        Only after status is confirmed blocked — never while loading / for clear wallets.
      */}
      {legacyGateActive && legacyStatus && (() => {
        const legacyPendingClaimableCount = legacyStatus.pendingClaimStreams.filter(
          (s) => !s.isClaimLocked && (s.claimableAmount > 0n || s.rewardsOwedRaw > 0n),
        ).length;
        const legacyBusy =
          loadingLegacyStatus ||
          legacyClaimStep !== "idle" ||
          isFarming;

        return (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="legacy-migration-title"
          aria-describedby="legacy-migration-desc"
        >
          <div className="max-h-[min(92dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-amber-500/40 bg-background shadow-2xl shadow-amber-900/30">
            <div className="space-y-4 p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/40">
                  <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h2
                    id="legacy-migration-title"
                    className="font-cinzel text-lg font-semibold leading-tight text-foreground sm:text-xl"
                  >
                    Staking contract upgraded
                  </h2>
                  <p
                    id="legacy-migration-desc"
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    We upgraded our staking contract and will relegate the old one in a few hours.
                    Please{" "}
                    <span className="font-medium text-foreground">claim your pending rewards + initial deposit</span>
                    {" "}from the old farm to unlock the new one. 
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "rounded-xl border px-3 py-2.5",
                  legacyStatus.hasPendingClaims
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-success/30 bg-success/10",
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Claim pending rewards
                </p>
                <p className="mt-0.5 font-jetbrains text-sm font-semibold text-foreground">
                  {legacyStatus.hasPendingClaims
                    ? `${legacyStatus.pendingClaimStreams.length} stream${legacyStatus.pendingClaimStreams.length === 1 ? "" : "s"} pending`
                    : "Complete"}
                </p>
                {!legacyStatus.hasPendingClaims && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Rewards claimed
                  </p>
                )}
              </div>

              {legacyStatus.pendingClaimStreams.length > 0 && (
                <div className="rounded-xl border border-border/60 bg-muted/30">
                  <p className="border-b border-border/50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Pending rewards on legacy contract
                  </p>
                  <ul className="max-h-36 space-y-1.5 overflow-y-auto px-3 py-2">
                    {legacyStatus.pendingClaimStreams.map((s) => (
                      <li
                        key={s.address}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate font-medium text-foreground">
                          {s.symbol || shortTokenLabel(s.address)}
                        </span>
                        <span className="shrink-0 font-jetbrains text-xs text-muted-foreground">
                          {s.isClaimLocked
                            ? `Locked · ${formatDurationCountdown(Math.max(0, s.claimUnlockAt - Math.floor(Date.now() / 1000)))}`
                            : formatExactTokenAmount(s.claimableAmount, s.decimals)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-60"
                  disabled={
                    legacyBusy ||
                    legacyPendingClaimableCount === 0 ||
                    legacyClaimStep !== "idle"
                  }
                  onClick={() => void handleLegacyClaimAll()}
                >
                  {legacyClaimStep !== "idle" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirm claim in wallet…
                    </>
                  ) : !legacyStatus.hasPendingClaims ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      No pending legacy rewards
                    </>
                  ) : legacyPendingClaimableCount === 0 ? (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      Wait for claim cooldown
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4" />
                      Claim pending rewards ({legacyPendingClaimableCount})
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  disabled={legacyBusy}
                  onClick={() => void refreshLegacyMigrationStatus()}
                >
                  {loadingLegacyStatus ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Rechecking legacy contract…
                    </>
                  ) : (
                    "Recheck legacy contract"
                  )}
                </Button>
              </div>

              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                This screen unlocks once your pending rewards are claimed so you can farm on the new
                contract for enhanced rewards.
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      <div
        className={cn(
          "contents",
          legacyGateActive && "pointer-events-none select-none",
        )}
        aria-hidden={legacyGateActive || undefined}
      >
      <Header
        nativeBalance={nativeBalanceDisplay}
        nativeSymbol={selectedNetwork.symbol}
        arcadeBalance={arcadeBalanceDisplay}
      />

      <main
        className={cn(
          "relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col px-2 pb-3 pt-14 sm:px-4 sm:pt-14 lg:h-[100dvh] lg:min-h-0 lg:max-h-[100dvh] lg:overflow-hidden lg:px-5 lg:pb-1.5 lg:pt-14",
          legacyGateActive && "opacity-40",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row lg:gap-2.5 lg:overflow-hidden">
          {/* Left rail — tier picker + mint */}
          <aside className="flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 theme-surface-elevated shadow-xl lg:w-[272px] lg:max-h-full lg:shrink-0 xl:w-[292px]">
            <div className="border-b border-border/50 bg-muted/30 px-2 py-1.5 sm:px-2.5 sm:py-2 lg:py-1.5">
              <p className="mb-1 text-center font-orbitron text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Pick your tier
              </p>
              <TierCarousel tierId={tierId} onChange={handleTierChange} />
            </div>

            <div className="flex shrink-0 items-center justify-center border-b border-border/50 px-2.5 py-1.5">
              <button
                type="button"
                disabled={isMinting || loadingReadiness}
                onClick={() => {
                  void openMintDialog();
                }}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary px-4 py-1.5 font-orbitron text-sm font-bold tracking-wide text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.3)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70 sm:text-base",
                )}
              >
                {isMinting || loadingReadiness ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {isMinting ? "minting…" : "checking…"}
                  </>
                ) : (
                  "mint"
                )}
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 sm:p-2.5 lg:gap-1.5 lg:overflow-hidden">
              <div className="flex shrink-0 gap-1 rounded-xl bg-muted/40 p-1">
                {(
                  [
                    { id: "mint" as const, label: "Mint", icon: Coins },
                    { id: "streams" as const, label: "Streams", icon: Layers },
                    { id: "info" as const, label: "Info", icon: HelpCircle },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveSidebarTab(id)}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1 font-sora text-[11px] font-semibold transition",
                      activeSidebarTab === id
                        ? "bg-card text-foreground shadow-sm border border-border/50"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

              <div className="min-h-[120px] flex-1 overflow-y-auto rounded-xl border border-border/50 bg-card/60 p-2 font-sora text-xs sm:min-h-[140px] lg:min-h-[170px] lg:p-2">
                <AnimatePresence mode="wait">
                  {activeSidebarTab === "mint" && (
                    <motion.div
                      key={`mint-${tierId}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="space-y-1.5"
                    >
                      <p className="font-orbitron text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Proof of Access
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground lg:text-[11px]">
                        Mint a{" "}
                        <span className="font-bold text-foreground">{tier.title}</span>{" "}
                        <span className="font-jetbrains text-[10px] text-muted-foreground">
                          ({tier.contractName})
                        </span>{" "}
                        · tier{" "}
                        <span className="font-jetbrains font-bold text-foreground">{tierId}</span>
                      </p>
                      <div className="space-y-1 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 font-jetbrains text-xs text-muted-foreground">
                        {loadingConfig ? (
                          <p className="flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading fee…
                          </p>
                        ) : (
                          <>
                            <div className="flex justify-between gap-2">
                              <span>Burn</span>
                              <span className="font-semibold text-foreground">
                                {mintConfig
                                  ? `${formatArcadeDisplay(mintConfig.burnAmount, arcadeDecimals)} ARCADE`
                                  : `${tier.multiplier}× base`}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Mint fee</span>
                              <span className="font-semibold text-foreground">
                                {mintConfig
                                  ? `${formatEther(mintConfig.mintFee)} ${selectedNetwork.symbol}`
                                  : `0.00001 ${selectedNetwork.symbol}`}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Streams</span>
                              <span className="font-semibold text-foreground">{tier.lists}</span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Multiplier</span>
                              <span className="font-semibold text-foreground">{tier.multiplier}×</span>
                            </div>
                          </>
                        )}
                        <div className="mt-1 border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
                          {selectedNetwork.name} ·{" "}
                          {poaLive ? (
                            <span className="text-success">contract live</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">
                              zero stand-in · set proof_of_access after deploy
                            </span>
                          )}
                        </div>
                      </div>
                      {!account && (
                        <div className="pt-1">
                          <Connector />
                        </div>
                      )}
                    </motion.div>
                  )}
                  {activeSidebarTab === "streams" && (
                    <motion.div
                      key="streams"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="space-y-2"
                    >
                      <p className="font-orbitron text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Reward streams
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Subscribed {liveSubscriptions.length}/{maxStreams}
                        {ownedNfts.filter((n) => !n.BLACKLIST).length === 0 ? (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                            Standard access · max 1 stream
                          </span>
                        ) : designatedNftId !== null ? (
                          <span className="block text-[10px] text-muted-foreground">
                            Designated NFT #{designatedNftId.toString()}
                          </span>
                        ) : null}
                      </p>
                      <ul className="grid grid-cols-2 gap-1">
                        {liveSubscriptions.length === 0 && (
                          <li className="col-span-2 rounded-lg border border-border/40 bg-background/50 px-2 py-1.5 font-sora text-[11px] text-muted-foreground">
                            No streams yet — farm or open Subscriptions
                          </li>
                        )}
                        {liveSubscriptions.map((addr) => (
                          <li
                            key={addr}
                            className="flex min-w-0 items-center justify-between gap-1 rounded-lg border border-border/40 bg-background/50 px-2 py-1 font-jetbrains text-[10px] font-semibold text-foreground"
                          >
                            <span className="truncate pr-2" title={addr}>
                              {streamLabel(addr)}
                            </span>
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        className="mt-0.5 w-full rounded-lg bg-primary font-sora text-xs text-primary-foreground hover:opacity-90"
                        onClick={() => {
                          void openSubscriptionDialog("manage");
                        }}
                      >
                        Manage streams
                      </Button>
                    </motion.div>
                  )}
                  {activeSidebarTab === "info" && (
                    <motion.div
                      key="info"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="space-y-2 text-xs text-muted-foreground"
                    >
                      <p className="font-orbitron text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        Protocol
                      </p>
                      <div className="space-y-1.5 rounded-lg border border-border/40 bg-background/50 p-2 font-sora text-foreground">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Stake token</span>
                          <span className="font-jetbrains font-semibold">ARCADE</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Harvester</span>
                          <span
                            className={cn(
                              "font-semibold",
                              harvesterLive ? "text-success" : "text-amber-600 dark:text-amber-400",
                            )}
                          >
                            {harvesterLive ? "live" : "stand-in"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max streams</span>
                          <span className="font-jetbrains font-semibold">{maxStreams}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Model</span>
                          <span className="font-semibold">Multi-token V2</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Owned NFT thumbnails — scroll/swipe; Subscriptions + Help pinned right */}
              <div className="mt-auto flex shrink-0 items-center gap-1.5 border-t border-border/50 pt-1.5 lg:pt-1">
                <div
                  className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  style={{ WebkitOverflowScrolling: "touch" }}
                  aria-label="Your Proof of Access NFTs"
                >
                  {loadingNfts && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/40">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!loadingNfts && !account && (
                    <p className="truncate px-1 font-sora text-[10px] text-muted-foreground">
                      Connect to see NFTs
                    </p>
                  )}
                  {!loadingNfts && account && ownedNfts.length === 0 && (
                    <p className="truncate px-1 font-sora text-[10px] text-muted-foreground">
                      No PoA NFTs yet
                    </p>
                  )}
                  {!loadingNfts &&
                    ownedNfts.map((nft) => {
                      const nftTier = getTierByContractName(nft.TIER);
                      const tokenId = nft.ID.toString();
                      const isDesignated = designatedNftId !== null && nft.ID === designatedNftId;
                      return (
                        <button
                          key={`${tokenId}-${nft.TIER}`}
                          type="button"
                          title={
                            isDesignated
                              ? `${nftTier.title} #${tokenId} · designated`
                              : `${nftTier.title} #${tokenId}`
                          }
                          onClick={() => openNftDialog(nft)}
                          className={cn(
                            "relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            nft.BLACKLIST
                              ? "border-destructive/50 opacity-70"
                              : isDesignated
                                ? "border-primary ring-2 ring-primary/70"
                                : "border-border/60 hover:border-primary/60",
                          )}
                          style={{ boxShadow: `0 0 10px ${nftTier.glow}` }}
                        >
                          <img
                            src={nftTier.art.nft}
                            alt={`${nftTier.title} #${tokenId}`}
                            className="h-full w-full object-cover object-top"
                            draggable={false}
                          />
                          <span className="absolute inset-x-0 bottom-0 bg-black/65 py-px text-center font-jetbrains text-[8px] font-bold leading-none text-white">
                            #{tokenId.length > 4 ? tokenId.slice(-3) : tokenId}
                          </span>
                          {isDesignated && (
                            <span className="absolute left-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary shadow" />
                          )}
                        </button>
                      );
                    })}
                </div>
                <motion.button
                  type="button"
                  title={
                    needsStreamSubscription
                      ? "Subscribe to a reward stream (required)"
                      : "Access your reward stream subscriptions"
                  }
                  onClick={() => {
                    void openSubscriptionDialog("manage");
                  }}
                  animate={
                    needsStreamSubscription
                      ? {
                          rotate: [0, -14, 14, -12, 12, -8, 8, 0],
                          scale: [1, 1.1, 1.1, 1.06, 1],
                        }
                      : subDialogOpen
                        ? { scale: [1, 1.04, 1] }
                        : { rotate: 0, scale: 1 }
                  }
                  transition={
                    needsStreamSubscription
                      ? { duration: 0.65, repeat: Infinity, repeatDelay: 0.85, ease: "easeInOut" }
                      : { duration: 0.25 }
                  }
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-md transition",
                    needsStreamSubscription
                      ? "border-amber-400 bg-amber-500 text-white shadow-[0_0_18px_rgba(245,158,11,0.65)]"
                      : subDialogOpen
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.55)]"
                        : "border-border/50 bg-emerald-600 text-white hover:opacity-90",
                  )}
                >
                  <Radio className="h-4 w-4" />
                  {liveSubscriptions.length > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-jetbrains text-[8px] font-bold text-primary-foreground">
                      {liveSubscriptions.length}
                    </span>
                  ) : needsStreamSubscription ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-amber-200" />
                  ) : null}
                </motion.button>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/50 bg-accent text-accent-foreground shadow-md transition hover:opacity-90"
                  title="Help / Support"
                  onClick={() => setActiveSidebarTab("info")}
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* Main stage */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:overflow-hidden lg:gap-1.5">
            <div className="grid shrink-0 grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2">
              <StatCard
                label="Total Farm"
                value={totalFarmDisplay}
                unit={STAKE_TOKEN}
                accentClass="text-primary"
                delay={0.05}
              />
              <StatCard
                label="Current Farm"
                value={currentFarmDisplay}
                unit={STAKE_TOKEN}
                accentClass="text-accent"
                delay={0.1}
              />
              <StatCard
                label="Harvested"
                value={
                  !account || !harvesterLive
                    ? "—"
                    : loadingHarvestedCount && harvestedCount === null
                      ? "…"
                      : String(harvestedCount ?? 0)
                }
                unit={
                  !account || !harvesterLive
                    ? ""
                    : (harvestedCount ?? 0) === 1
                      ? "claim"
                      : "claims"
                }
                accentClass="text-amber-600 dark:text-amber-300"
                delay={0.15}
                onClick={account && harvesterLive ? openClaimHistory : undefined}
                title={
                  account && harvesterLive
                    ? "View claim history"
                    : undefined
                }
              />
              <StatCard
                label="Estimated Rewards"
                value={
                  !account || !harvesterLive
                    ? "—"
                    : loadingClaimables && claimableStreams.length === 0
                      ? "…"
                      : String(claimableStreams.length || liveSubscriptions.length || 0)
                }
                unit="streams"
                accentClass="text-success"
                delay={0.2}
              />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-xl border border-border/50 theme-surface px-2.5 py-1.5 lg:px-3 lg:py-1"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-sora text-xs font-medium tracking-wide text-muted-foreground">
                Viewing · {tier.title}
              </span>
              <span
                className={cn(
                  "rounded-full bg-gradient-to-r px-2.5 py-0.5 font-orbitron text-[10px] font-bold text-white shadow",
                  tier.accent,
                )}
              >
                {tier.contractName}
              </span>
              {claimableStreams.length === 0 ? (
                <span className="font-sora text-[11px] text-muted-foreground">
                  {account && harvesterLive
                    ? loadingClaimables
                      ? "Loading streams…"
                      : "No claimable streams yet"
                    : "Connect to view reward streams"}
                </span>
              ) : (
                claimableStreams.map((r, i) => (
                  <button
                    key={r.address}
                    type="button"
                    title={
                      r.isRetainedUnsubscribed
                        ? "Prior subscription — claim remaining rewards"
                        : undefined
                    }
                    onClick={() => setSelectedRewardAddress(r.address)}
                    className={cn(
                      "rounded-full px-2.5 py-1 font-jetbrains text-xs font-semibold transition",
                      selectedRewardAddress &&
                        normalizeAddr(selectedRewardAddress) === normalizeAddr(r.address)
                        ? "bg-gradient-to-r text-white shadow-md " +
                            STREAM_CHIP_COLORS[i % STREAM_CHIP_COLORS.length]
                        : "theme-chip-secondary hover:opacity-90",
                      r.isRetainedUnsubscribed &&
                        !(
                          selectedRewardAddress &&
                          normalizeAddr(selectedRewardAddress) === normalizeAddr(r.address)
                        ) &&
                        "ring-1 ring-amber-500/50",
                    )}
                  >
                    {r.claimableDisplay} {r.symbol}
                    {r.isRetainedUnsubscribed ? " · claim" : ""}
                  </button>
                ))
              )}
            </motion.div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 md:grid-cols-3 md:gap-2.5 lg:min-h-0 lg:overflow-hidden">
              <ActionColumn
                title="Farm"
                subtitle="Stake ARCADE · Start"
                background={tier.art.farm}
                delay={0.15}
              >
                <div className="space-y-2 lg:space-y-1.5">
                  <div
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-center backdrop-blur-sm sm:py-2",
                      farmStatusTone === "error"
                        ? "border-destructive/50 bg-destructive/10"
                        : farmStatusTone === "success"
                          ? "border-success/40 bg-success/10"
                          : farmStatusTone === "warning"
                            ? "border-amber-400/50 bg-amber-500/10"
                            : "border-primary/45 bg-black/65",
                    )}
                  >
                    <p
                      className={cn(
                        "font-sora text-[11px] font-medium tracking-wide sm:text-xs",
                        farmStatusTone === "error"
                          ? "text-destructive"
                          : farmStatusTone === "success"
                            ? "text-success"
                            : farmStatusTone === "warning"
                              ? "text-amber-300"
                              : "text-primary",
                      )}
                    >
                      {farmStep !== "idle" || loadingFarmReadiness
                        ? "In progress"
                        : farmReadiness && !farmReadiness.needsApproval
                          ? "Pre-Approved"
                          : "Status"}
                    </p>
                    {farmReadiness && farmReadiness.allowance > 0n && farmStep === "idle" && !loadingFarmReadiness ? (
                      <p className="font-jetbrains text-base font-bold text-foreground sm:text-lg">
                        {preApprovedDisplay}{" "}
                        <span className="font-sora text-sm font-semibold text-muted-foreground">
                          ARCADE
                        </span>
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        "font-sora text-xs font-semibold leading-snug sm:text-sm",
                        farmStatusTone === "error"
                          ? "text-destructive"
                          : farmStatusTone === "success"
                            ? "text-success"
                            : farmStatusTone === "warning"
                              ? "text-amber-200"
                              : "text-foreground",
                      )}
                    >
                      {loadingFarmReadiness || farmStep === "checking" ? (
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {farmStatus}
                        </span>
                      ) : farmStep === "approving" ||
                        farmStep === "subscribing" ||
                        farmStep === "depositing" ? (
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {farmStatus}
                        </span>
                      ) : (
                        farmStatus
                      )}
                    </p>
                    {account && arcadeBalance !== null && (
                      <p className="mt-0.5 font-jetbrains text-[10px] text-muted-foreground">
                        Wallet {walletArcadeHuman} ARCADE
                        {farmPlan && farmStep === "idle" ? (
                          <span className="block opacity-90">
                            Flow: {farmPlan.stepLabels.join(" → ") || "—"}
                          </span>
                        ) : null}
                      </p>
                    )}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Enter ARCADE amount"
                    value={farmAmount}
                    onChange={(e) => setFarmAmount(e.target.value)}
                    disabled={isFarming}
                    className="h-10 rounded-xl border border-border/50 theme-input-surface text-center font-jetbrains font-medium text-foreground placeholder:font-sora placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary lg:h-9"
                  />
                  <div className="flex gap-1.5">
                    {(["25%", "50%", "MAX"] as const).map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={isFarming}
                        onClick={() => setFarmAmountPercent(pct)}
                        className="flex-1 rounded-lg border border-primary/45 bg-black/55 py-1 font-orbitron text-[10px] font-bold uppercase tracking-wide text-primary backdrop-blur-sm transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                      >
                        {pct}
                      </button>
                    ))}
                  </div>
                  <Button
                    className="h-11 w-full rounded-xl bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground shadow-lg hover:opacity-90 sm:text-base lg:h-10"
                    disabled={isFarming || loadingFarmReadiness}
                    onClick={() => {
                      void openFarmFlow();
                    }}
                  >
                    {syncActionStep === "syncing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {syncTransactionsRemaining > 0
                          ? `Syncing… (${syncTransactionsRemaining})`
                          : "Sync complete…"}
                      </>
                    ) : isFarming || loadingFarmReadiness ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {farmStep === "approving"
                          ? "Approving…"
                          : farmStep === "subscribing"
                            ? "Subscribing…"
                            : farmStep === "depositing"
                              ? "Depositing…"
                              : "Checking…"}
                      </>
                    ) : (
                      <>
                        <Sprout className="h-4 w-4" />
                        Stake Now
                      </>
                    )}
                  </Button>
                </div>
              </ActionColumn>

              <ActionColumn
                title="Withdraw"
                subtitle="Unstake · Game Over"
                background={tier.art.withdraw}
                delay={0.25}
              >
                <div className="space-y-2 lg:space-y-1.5">
                  <div className="rounded-xl border border-white/20 bg-black/55 px-3 py-1.5 text-center backdrop-blur-sm sm:py-2">
                    <p className="font-sora text-[11px] font-medium tracking-wide text-amber-200/90 sm:text-xs">Your stake</p>
                    <p className="font-jetbrains text-base font-bold text-white sm:text-lg">
                      {currentFarmDisplay}{" "}
                      <span className="font-sora text-sm font-semibold text-white/70">{STAKE_TOKEN}</span>
                    </p>
                    {withdrawLock && withdrawLock.stakedBalance > 0n ? (
                      withdrawCountdown > 0 ? (
                        <p className="mt-0.5 font-sora text-[10px] text-amber-200/90">
                          Timelock{" "}
                          <span className="font-jetbrains font-semibold tabular-nums">
                            {formatDurationCountdown(withdrawCountdown)}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 font-sora text-[10px] text-emerald-300/90">
                          Ready to withdraw
                        </p>
                      )
                    ) : (
                      <p className="mt-0.5 font-sora text-[10px] text-white/50">
                        {loadingWithdrawLock
                          ? "Checking timelock…"
                          : "Timelock starts after your last deposit"}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/50 theme-input-surface px-3 py-2 text-center lg:py-1.5">
                    <p className="font-sora text-[10px] text-muted-foreground">Full unstake</p>
                    <p className="font-jetbrains text-sm font-semibold text-foreground">
                      {currentFarmDisplay} {STAKE_TOKEN}
                    </p>
                  </div>
                  {syncStatus?.requiresSync ? (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left">
                      <p className="font-sora text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Sync required
                      </p>
                      <p className="mt-1 font-sora text-xs text-amber-800 dark:text-amber-100">
                        Catch up {syncStatus.totalLoopsNeeded} batch transaction{syncStatus.totalLoopsNeeded === 1 ? "" : "s"} before withdrawal.
                      </p>
                    </div>
                  ) : null}
                  <Button
                    className={cn(
                      "h-11 w-full rounded-xl bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground shadow-lg sm:text-base lg:h-10",
                      !canWithdrawNow && "opacity-40 grayscale hover:opacity-40",
                    )}
                    disabled={
                      !canWithdrawNow ||
                      withdrawStep !== "idle" ||
                      syncActionStep !== "idle"
                    }
                    onClick={() => {
                      void handleWithdrawNow();
                    }}
                  >
                    {syncActionStep === "syncing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {syncTransactionsRemaining > 0
                          ? `Syncing… (${syncTransactionsRemaining})`
                          : "Sync complete…"}
                      </>
                    ) : syncActionStep === "checking" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking sync…
                      </>
                    ) : withdrawStep !== "idle" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {withdrawStep === "withdrawing" ? "Withdrawing…" : "Checking…"}
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4" />
                        Withdraw Now
                      </>
                    )}
                  </Button>
                </div>
              </ActionColumn>

              <ActionColumn
                title="Harvest"
                subtitle="Claim · 1UP+"
                background={tier.art.harvest}
                delay={0.35}
              >
                <div className="space-y-2 lg:space-y-1.5">
                  {syncStatus?.requiresSync ? (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left">
                      <p className="font-sora text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Sync required
                      </p>
                      <p className="mt-1 font-sora text-xs text-amber-800 dark:text-amber-100">
                        {syncStatus.totalLoopsNeeded} gas tx{syncStatus.totalLoopsNeeded === 1 ? "" : "s"} needed to catch up stale claim eras before harvest.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 rounded-lg border-amber-500/60 text-amber-700 dark:text-amber-200"
                        disabled={isSyncing || syncTransactionsRemaining > 0}
                        onClick={() => {
                          void syncMissingEras();
                        }}
                      >
                        {syncTransactionsRemaining > 0
                          ? `Syncing… (${syncTransactionsRemaining})`
                          : isSyncing
                            ? "Syncing…"
                            : "Sync now"}
                      </Button>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/20 bg-black/55 px-3 py-1.5 backdrop-blur-sm sm:py-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowRewardPicker((v) => !v)}
                        disabled={claimableStreams.length === 0}
                        className="flex w-full items-center justify-between gap-2 text-left disabled:opacity-60"
                      >
                        <div>
                          <p className="font-sora text-[11px] font-medium tracking-wide text-emerald-200/90 sm:text-xs">
                            Claimable · {selectedRewardData?.symbol ?? "—"}
                          </p>
                          <p className="font-jetbrains text-base font-bold text-white sm:text-lg">
                            {loadingClaimables && !selectedRewardData ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                …
                              </span>
                            ) : (
                              <>
                                {selectedRewardData?.claimableDisplay ?? "0"}{" "}
                                <span className="font-sora text-sm font-semibold text-white/70">
                                  {selectedRewardData?.symbol ?? ""}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-white/70 transition",
                            showRewardPicker && "rotate-180",
                          )}
                        />
                      </button>
                      <AnimatePresence>
                        {showRewardPicker && claimableStreams.length > 0 && (
                          <motion.ul
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border/60 theme-surface-elevated shadow-xl"
                          >
                            {claimableStreams.map((r) => (
                              <li key={r.address}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-sora text-sm text-foreground hover:bg-muted/50"
                                  onClick={() => {
                                    setSelectedRewardAddress(r.address);
                                    setShowRewardPicker(false);
                                  }}
                                >
                                  <span className="min-w-0 font-medium">
                                    {r.symbol}
                                    {r.isRetainedUnsubscribed ? (
                                      <span className="ml-1.5 font-sora text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                        prior
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="shrink-0 font-jetbrains text-success">
                                    {r.claimableDisplay}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="mt-1 font-sora text-[10px] text-white/50">
                      {claimableStreams.length === 0
                        ? "Subscribe while farming to unlock streams"
                        : rewardSnapshot?.hasActiveStake
                          ? `${claimableStreams.length} stream${claimableStreams.length === 1 ? "" : "s"} · era math (active stake)${
                              (rewardSnapshot?.retainedUnsubscribed?.length ?? 0) > 0
                                ? ` · ${rewardSnapshot!.retainedUnsubscribed.length} prior to claim`
                                : ""
                            }`
                          : `${claimableStreams.length} stream${claimableStreams.length === 1 ? "" : "s"} · stake to accrue eras${
                              (rewardSnapshot?.retainedUnsubscribed?.length ?? 0) > 0
                                ? ` · ${rewardSnapshot!.retainedUnsubscribed.length} prior to claim`
                                : ""
                            }`}
                    </p>
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      className="h-11 flex-1 rounded-xl bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground shadow-lg hover:opacity-90 sm:text-base lg:h-10"
                      disabled={
                        claimStep === "claiming" ||
                        isFarming ||
                        claimableStreams.length === 0
                      }
                      onClick={() => openClaimDialog(false)}
                    >
                      {claimStep === "claiming" ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Claiming…
                        </>
                      ) : (
                        <>
                          <Leaf className="h-4 w-4" />
                          Harvest Now
                        </>
                      )}
                    </Button>
                  </div>
                  <button
                    type="button"
                    disabled={
                      claimStep === "claiming" ||
                      isFarming ||
                      claimableStreams.length === 0
                    }
                    onClick={() => {
                      void handleHarvestAll();
                    }}
                    className="w-full rounded-lg border border-primary/40 bg-black/55 py-1.5 font-sora text-xs font-semibold tracking-wide text-primary backdrop-blur-sm transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 lg:py-1"
                  >
                    Harvest all streams
                  </button>
                </div>
              </ActionColumn>
            </div>
          </section>
        </div>

      </main>

      {/* Claim rewards — select streams (name, symbol, amount) then claim(address[]) */}
      <Dialog
        open={claimDialogOpen}
        onOpenChange={(open) => {
          if (claimStep === "claiming" || syncActionStep !== "idle") return;
          setClaimDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-md gap-2 overflow-y-auto border-border/60 theme-surface-elevated p-3 font-sora sm:max-w-lg sm:p-4">
          <DialogHeader>
            <DialogTitle className="font-cinzel text-lg">Claim rewards</DialogTitle>
            <DialogDescription className="font-sora text-xs text-muted-foreground">
              Choose which reward streams to harvest. Amounts are estimated with the same
              era math the Harvester runs on claim — final on-chain accounting settles at
              transaction time. Streams you left after a subscription change stay here
              until their unclaimed rewards are harvested.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[min(42vh,300px)] pr-2">
            <ul className="space-y-1.5">
              {claimableStreams.map((stream) => {
                const checked = claimSelection.some(
                  (a) => normalizeAddr(a) === normalizeAddr(stream.address),
                );
                return (
                  <li key={stream.address}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-xl border px-2.5 py-1.5 transition",
                        checked
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/50 theme-surface hover:border-border",
                        stream.isRetainedUnsubscribed &&
                          "border-amber-500/40 bg-amber-500/5",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleClaimToken(stream.address)}
                        disabled={claimStep === "claiming"}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-sora text-sm font-semibold text-foreground">
                            {stream.name}
                          </p>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-orbitron text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            {stream.symbol}
                          </span>
                        </div>
                        <p className="mt-0.5 font-jetbrains text-xs font-semibold text-success">
                          {stream.claimableDisplay}{" "}
                          <span className="font-sora text-xs font-medium text-muted-foreground">
                            {stream.symbol}
                          </span>
                          <span className="ml-1 font-sora text-[10px] font-medium text-muted-foreground/80">
                            est.
                          </span>
                        </p>
                        {stream.isRetainedUnsubscribed ? (
                          <p className="mt-0.5 font-sora text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            Prior subscription · claim remaining rewards
                          </p>
                        ) : null}
                        {stream.eraMathApplied && stream.erasProcessed > 0 ? (
                          <p className="mt-0.5 font-sora text-[10px] text-muted-foreground">
                            {stream.erasProcessed} era
                            {stream.erasProcessed === 1 ? "" : "s"} · ERA{" "}
                            {stream.eraAtBlock.toString()}→
                            {stream.simulatedCurrentERA.toString()}
                          </p>
                        ) : !stream.eraMathApplied ? (
                          <p className="mt-0.5 font-sora text-[10px] text-muted-foreground">
                            Stored bucket only · stake to accrue new eras
                          </p>
                        ) : null}
                        {stream.isClaimLocked ? (
                          <p className="mt-0.5 font-sora text-[10px] text-amber-600 dark:text-amber-400">
                            Per-token claim timelock may skip this stream
                          </p>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="font-sora text-xs font-semibold text-primary hover:underline"
              disabled={claimStep === "claiming" || syncActionStep !== "idle"}
              onClick={() =>
                setClaimSelection(claimableStreams.map((s) => s.address))
              }
            >
              Select all
            </button>
            <button
              type="button"
              className="font-sora text-xs font-semibold text-muted-foreground hover:underline"
              disabled={claimStep === "claiming" || syncActionStep !== "idle"}
              onClick={() => setClaimSelection([])}
            >
              Clear
            </button>
          </div>

          <DialogFooter className="gap-1.5 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={claimStep === "claiming" || syncActionStep !== "idle"}
              onClick={() => setClaimDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                claimStep === "claiming" ||
                syncActionStep !== "idle" ||
                claimSelection.length === 0
              }
              onClick={() => {
                void handleHarvestSelected();
              }}
            >
              {syncActionStep === "syncing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {syncTransactionsRemaining > 0
                    ? `Syncing… (${syncTransactionsRemaining})`
                    : "Sync complete…"}
                </>
              ) : syncActionStep === "checking" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking sync…
                </>
              ) : claimStep === "claiming" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Claiming…
                </>
              ) : (
                <>
                  <Leaf className="h-4 w-4" />
                  Claim selected ({claimSelection.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Harvested claim history — userTotalClaimHistory + paginated getUserClaims */}
      <Dialog open={claimHistoryOpen} onOpenChange={setClaimHistoryOpen}>
        <DialogContent className="max-h-[90dvh] max-w-md gap-2 overflow-y-auto border-border/60 theme-surface-elevated p-3 font-sora sm:max-w-lg sm:p-4">
          <DialogHeader>
            <DialogTitle className="font-cinzel text-lg">Claim history</DialogTitle>
            <DialogDescription className="font-sora text-xs text-muted-foreground">
              Your harvest claims on this network, newest first. Shown{" "}
              {HARVESTER_CLAIMS_PAGE_SIZE} at a time; chain reads load up to{" "}
              {HARVESTER_CLAIMS_MAX_BATCH} claims per call so paging stays fast.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-1.5">
            <div>
              <p className="font-sora text-[11px] font-medium tracking-wide text-amber-700 dark:text-amber-300">
                Total claims
              </p>
              <p className="font-jetbrains text-base font-bold text-foreground">
                {loadingClaimHistory && harvestedCount === null
                  ? "…"
                  : String(harvestedCount ?? 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-sora text-[11px] text-muted-foreground">Page</p>
              <p className="font-jetbrains text-sm font-semibold text-foreground">
                {claimHistoryPageCount > 0
                  ? `${claimHistoryPage + 1} / ${claimHistoryPageCount}`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 theme-surface overflow-hidden">
            {loadingClaimHistory ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8">
                <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
                <p className="font-sora text-sm text-muted-foreground">Loading claims…</p>
              </div>
            ) : claimHistoryRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Leaf className="h-8 w-8 text-muted-foreground/60" />
                <p className="font-sora text-sm font-medium text-foreground">No claims yet</p>
                <p className="font-sora text-xs text-muted-foreground max-w-xs">
                  Harvest reward streams while farming and your history will show up here.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[min(42vh,300px)]">
                <ul className="divide-y divide-border/50">
                  {claimHistoryRows.map((row, index) => (
                    <li
                      key={`${row.timestamp}-${row.token}-${row.amount}-${index}`}
                      className="flex items-start justify-between gap-3 px-3 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-sora text-sm font-semibold text-foreground">
                          {row.name}
                        </p>
                        <p className="font-sora text-[11px] text-muted-foreground">
                          {formatClaimWhen(row.timestamp)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-jetbrains text-sm font-bold text-amber-600 dark:text-amber-300">
                          +{row.displayAmount}{" "}
                          <span className="font-sora text-xs font-semibold text-muted-foreground">
                            {row.symbol}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                loadingClaimHistory || claimHistoryPage <= 0 || claimHistoryPageCount <= 1
              }
              onClick={() => setClaimHistoryPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Newer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingClaimHistory}
              onClick={() => {
                void refreshClaimHistoryPage(claimHistoryPage, {
                  forceRefresh: true,
                });
              }}
            >
              {loadingClaimHistory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Refresh"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                loadingClaimHistory ||
                claimHistoryPageCount <= 1 ||
                claimHistoryPage >= claimHistoryPageCount - 1
              }
              onClick={() =>
                setClaimHistoryPage((p) =>
                  claimHistoryPageCount > 0
                    ? Math.min(claimHistoryPageCount - 1, p + 1)
                    : p,
                )
              }
            >
              Older
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Owned NFT detail — large preview + revenue streams + switch tier */}
      <Dialog
        open={nftDialogOpen}
        onOpenChange={(open) => {
          setNftDialogOpen(open);
          if (!open) setSelectedNft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-md gap-2 overflow-y-auto border-border/60 theme-surface-elevated p-3 font-sora sm:max-w-lg sm:p-4">
          {selectedNft && (() => {
            const nftTier = getTierByContractName(selectedNft.TIER);
            const tokenId = selectedNft.ID.toString();
            const streams = Number(selectedNft.LISTS);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-cinzel text-lg">
                    {nftTier.title}
                  </DialogTitle>
                  <DialogDescription className="font-sora text-xs text-muted-foreground">
                    {nftTier.tagline}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <div
                    className="relative overflow-hidden rounded-xl border-2 border-border/60 shadow-lg"
                    style={{ boxShadow: `0 0 32px ${nftTier.glow}` }}
                  >
                    <img
                      src={nftTier.art.nft}
                      alt={`${nftTier.title} NFT #${tokenId}`}
                      className="aspect-[16/10] w-full object-cover object-top"
                      draggable={false}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2.5 pt-10">
                      <p className="font-orbitron text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                        Token #{tokenId} · {selectedNft.TIER}
                      </p>
                      <p className="font-cinzel text-lg font-bold text-white drop-shadow">
                        {nftTier.title}
                      </p>
                    </div>
                    {selectedNft.BLACKLIST && (
                      <div className="absolute left-2 top-2 rounded-full border border-destructive/60 bg-destructive/90 px-2 py-0.5 font-orbitron text-[9px] font-bold uppercase tracking-wider text-destructive-foreground">
                        Blacklisted
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/50 bg-background/60 p-2 font-jetbrains text-xs">
                    <div>
                      <p className="font-sora text-[10px] uppercase tracking-wide text-muted-foreground">
                        Contract tier
                      </p>
                      <p className="font-semibold text-foreground">{selectedNft.TIER}</p>
                    </div>
                    <div>
                      <p className="font-sora text-[10px] uppercase tracking-wide text-muted-foreground">
                        Token ID
                      </p>
                      <p className="font-semibold text-foreground">#{tokenId}</p>
                    </div>
                    <div>
                      <p className="font-sora text-[10px] uppercase tracking-wide text-muted-foreground">
                        Revenue streams
                      </p>
                      <p className="font-semibold text-foreground">
                        {streams} list{streams === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <p className="font-sora text-[10px] uppercase tracking-wide text-muted-foreground">
                        Multiplier
                      </p>
                      <p className="font-semibold text-foreground">{nftTier.multiplier}×</p>
                    </div>
                    <div className="col-span-2">
                      <p className="font-sora text-[10px] uppercase tracking-wide text-muted-foreground">
                        Income access
                      </p>
                      <p className="mt-0.5 font-sora text-xs leading-relaxed text-foreground">
                        This pass unlocks up to{" "}
                        <span className="font-jetbrains font-semibold">{streams}</span> concurrent
                        reward streams on the Harvester. Higher tiers allow more simultaneous income
                        subscriptions.
                      </p>
                    </div>
                    {selectedNft.BLACKLIST && (
                      <div className="col-span-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 font-sora text-xs text-destructive">
                        This NFT is blacklisted and cannot grant farm access until cleared.
                      </div>
                    )}
                  </div>
                </div>

                  <DialogFooter className="flex-col gap-1.5 sm:flex-row sm:justify-stretch">
                  {(() => {
                    const already = isAlreadyDesignated(selectedNft);
                    const blocked = selectedNft.BLACKLIST;
                    const giftDisabled =
                      already || !account || !poaLive || isGifting;
                    return (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={giftDisabled}
                          className={cn(
                            "w-full rounded-xl font-orbitron text-xs font-bold tracking-wide sm:flex-1",
                            already || !account || !poaLive
                              ? "cursor-not-allowed border-border/40 bg-muted text-muted-foreground opacity-60 hover:bg-muted"
                              : "border-border/60",
                          )}
                          onClick={openGiftDialog}
                        >
                          <Gift className="mr-2 h-4 w-4" />
                          {already ? "Can't gift this NFT" : "Gift this NFT"}
                        </Button>
                        <Button
                          type="button"
                          disabled={already || blocked}
                          className={cn(
                            "w-full rounded-xl font-orbitron text-xs font-bold tracking-wide sm:flex-1",
                            already || blocked
                              ? "cursor-not-allowed bg-muted text-muted-foreground opacity-60 hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:opacity-90",
                          )}
                          onClick={switchToNftTier}
                        >
                          {blocked
                            ? "Blacklisted"
                            : already
                              ? "You're already on this Tier"
                              : "Choose this Tier"}
                        </Button>
                      </>
                    );
                  })()}
                </DialogFooter>
              </>
            );
          })()}
          {!selectedNft && (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">No NFT selected</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Gift NFT — transferFrom to any address */}
      <AlertDialog
        open={giftDialogOpen}
        onOpenChange={(open) => {
          if (isGifting || giftStep === "sending") return;
          setGiftDialogOpen(open);
          if (!open) {
            setGiftRecipient("");
            setGiftStep("idle");
          }
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] max-w-md gap-2 overflow-y-auto border-border/60 theme-surface-elevated p-3 font-sora sm:p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-cinzel text-lg">
              Gift this NFT
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-left text-xs text-muted-foreground">
                {selectedNft ? (
                  <>
                    <p>
                      Send{" "}
                      <span className="font-semibold text-foreground">
                        {getTierByContractName(selectedNft.TIER).title}
                      </span>{" "}
                      token{" "}
                      <span className="font-jetbrains font-semibold text-foreground">
                        #{selectedNft.ID.toString()}
                      </span>{" "}
                      to another wallet via ERC-721{" "}
                      <span className="font-jetbrains text-xs">transferFrom</span>.
                      This cannot be undone from the app.
                    </p>
                    <div className="space-y-1">
                      <label
                        htmlFor="gift-recipient"
                        className="font-sora text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Recipient address
                      </label>
                      <Input
                        id="gift-recipient"
                        value={giftRecipient}
                        onChange={(e) => setGiftRecipient(e.target.value)}
                        placeholder="0x…"
                        disabled={isGifting || giftStep === "sending"}
                        spellCheck={false}
                        autoComplete="off"
                        className="h-9 font-jetbrains text-xs"
                      />
                      {giftRecipient.trim().length > 0 &&
                        !isValidAddress(giftRecipient) && (
                          <p className="text-xs text-destructive">
                            Enter a valid 0x address (40 hex characters).
                          </p>
                        )}
                      {isValidAddress(giftRecipient) &&
                        account &&
                        normalizeAddr(giftRecipient) ===
                          normalizeAddr(account.address) && (
                          <p className="text-xs text-destructive">
                            That is your own wallet — pick a different address.
                          </p>
                        )}
                    </div>
                    {designatedNftId !== null &&
                      designatedNftId === selectedNft.ID && (
                        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                          This is your designated tier pass. After gifting, the app
                          will switch to your highest remaining NFT, or standard
                          access (1 stream) if the basket is empty.
                        </p>
                      )}
                  </>
                ) : (
                  <p>No NFT selected.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isGifting || giftStep === "sending"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !selectedNft ||
                !account ||
                !poaLive ||
                isGifting ||
                giftStep === "sending" ||
                !isValidAddress(giftRecipient) ||
                (account != null &&
                  normalizeAddr(giftRecipient) === normalizeAddr(account.address))
              }
              onClick={(e) => {
                e.preventDefault();
                void confirmGiftNft();
              }}
              className="bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground"
            >
              {isGifting || giftStep === "sending" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Gift className="mr-2 h-4 w-4" />
                  Confirm gift
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mint confirmation — gas + ARCADE approval transparency */}
      <AlertDialog
        open={mintDialogOpen}
        onOpenChange={(open) => {
          if (isMinting) return;
          setMintDialogOpen(open);
          if (!open) {
            setMintReadiness(null);
            setMintStep("idle");
          }
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] max-w-md gap-2 overflow-y-auto border-border/60 theme-surface-elevated p-3 font-sora sm:p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-cinzel text-lg">
              Mint {tier.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5 text-left text-xs text-muted-foreground">
                <p>
                  This mints a{" "}
                  <span className="font-semibold text-foreground">
                    {tier.title} ({tier.contractName})
                  </span>{" "}
                  Proof of Access NFT via{" "}
                  <span className="font-jetbrains text-xs">mint({tierId})</span> on{" "}
                  {selectedNetwork.name}.
                </p>

                {loadingReadiness && (
                  <p className="flex items-center gap-2 text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking balances and gas…
                  </p>
                )}

                {mintReadiness && (
                  <>
                    <div className="space-y-1 rounded-xl border border-border/50 bg-background/60 p-2.5 font-jetbrains text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">ARCADE to burn</span>
                        <span className="font-semibold text-foreground">
                          {formatArcadeDisplay(
                            mintReadiness.config.burnAmount,
                            mintReadiness.arcadeDecimals,
                          )}{" "}
                          ARCADE
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Your ARCADE</span>
                        <span
                          className={cn(
                            "font-semibold",
                            mintReadiness.hasEnoughArcade ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatArcadeDisplay(
                            mintReadiness.arcadeBalance,
                            mintReadiness.arcadeDecimals,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Mint fee</span>
                        <span className="font-semibold text-foreground">
                          {formatEther(mintReadiness.config.mintFee)} {selectedNetwork.symbol}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Est. gas reserve</span>
                        <span className="font-semibold text-foreground">
                          ~{formatEther(mintReadiness.ethGasReserve)} {selectedNetwork.symbol}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2 border-t border-border/40 pt-1.5">
                        <span className="text-muted-foreground">Your {selectedNetwork.symbol}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            mintReadiness.hasEnoughGas ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatEther(mintReadiness.ethBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Streams unlocked</span>
                        <span className="font-semibold text-foreground">{tier.lists}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-[11px] leading-snug text-foreground">
                      <p className="flex items-start gap-2 font-sora">
                        <Fuel className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>
                          You need enough{" "}
                          <strong>{selectedNetwork.symbol}</strong> for the mint fee plus gas for
                          {mintReadiness.needsApproval
                            ? " two wallet popups (approve + mint)"
                            : " the mint transaction"}
                          . Keep a little extra so the txs don&apos;t fail.
                        </span>
                      </p>
                      {mintReadiness.needsApproval ? (
                        <p className="flex items-start gap-2 font-sora">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          <span>
                            First you&apos;ll <strong>approve</strong> the ProofOfAccess contract to
                            spend{" "}
                            <strong>
                              {formatArcadeDisplay(
                                mintReadiness.config.burnAmount,
                                mintReadiness.arcadeDecimals,
                              )}{" "}
                              ARCADE
                            </strong>
                            . Those tokens are burned to mint this tier. Confirm the amount in your
                            wallet carefully.
                          </span>
                        </p>
                      ) : (
                        <p className="flex items-start gap-2 font-sora text-success">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            ARCADE allowance is already set for this burn amount — only the mint
                            transaction is needed.
                          </span>
                        </p>
                      )}
                    </div>

                    {!mintReadiness.hasEnoughArcade && (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Not enough ARCADE in this wallet for the selected tier burn.
                      </p>
                    )}
                    {!mintReadiness.hasEnoughGas && (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        Not enough {selectedNetwork.symbol} for fee + gas. Add more and try again.
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMinting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isMinting ||
                loadingReadiness ||
                !mintReadiness?.canMint ||
                mintStep !== "idle"
              }
              onClick={(e) => {
                e.preventDefault();
                void confirmMint();
              }}
              className="bg-primary text-primary-foreground hover:opacity-90"
            >
              {isMinting || mintStep !== "idle" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mintStep === "approving"
                    ? "Approving…"
                    : mintStep === "minting"
                      ? "Minting…"
                      : "Working…"}
                </span>
              ) : mintReadiness?.needsApproval ? (
                "Approve & Mint"
              ) : (
                "Confirm Mint"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reward stream subscription + farm confirm */}
      <Dialog
        open={subDialogOpen}
        onOpenChange={(open) => {
          if (isFarming || syncActionStep !== "idle") return;
          setSubDialogOpen(open);
          if (!open) {
            setStreamSearch("");
            setCustomTokenInput("");
            setSearchAddressHit(null);
            setSearchAddressStatus("idle");
            searchAddressLookupGen.current += 1;
            if (subDialogMode === "farm" && farmStep === "idle") {
              setFarmStatus("Ready to farm ARCADE");
            }
          }
        }}
      >
        <DialogContent className="flex max-h-[96dvh] max-w-lg flex-col gap-0 overflow-hidden border-border/60 p-0 theme-surface-elevated font-sora sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-1 border-b border-border/50 px-3 pb-2 pt-3 sm:px-4">
            <DialogTitle className="font-cinzel text-base">
              {subDialogMode === "farm" ? "Farm ARCADE · Streams" : "Reward streams"}
            </DialogTitle>
              <DialogDescription className="font-sora text-[11px] leading-snug text-muted-foreground">
              Choose up to{" "}
              <span className="font-jetbrains font-semibold text-foreground">{maxStreams}</span>{" "}
              revenue stream{maxStreams === 1 ? "" : "s"}
              {ownedNfts.filter((n) => !n.BLACKLIST).length === 0
                ? " (standard access — no NFT, limit is 1)."
                : designatedNftId !== null
                  ? ` unlocked by designated NFT #${designatedNftId.toString()}.`
                  : " unlocked by your designated NFT."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 sm:px-4">
            {/* Search + custom address */}
            <div className="space-y-1">
              <div className="space-y-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={streamSearch}
                    onChange={(e) => setStreamSearch(e.target.value)}
                    placeholder="Search name or paste 0x address…"
                    className="h-8 rounded-xl border-border/50 pl-9 font-sora text-[11px]"
                  />
                  {(searchAddressStatus === "waiting" ||
                    searchAddressStatus === "loading") && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {/* Debounced address → ERC-20 name result (click to add) */}
                {searchAddressStatus === "waiting" && (
                  <p className="px-1 font-sora text-[10px] text-muted-foreground">
                    Address detected — checking token in a moment…
                  </p>
                )}
                {searchAddressStatus === "loading" && (
                  <p className="flex items-center gap-1.5 px-1 font-sora text-[10px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Reading name, symbol & decimals…
                  </p>
                )}
                {searchAddressStatus === "invalid" && (
                  <p className="px-1 font-sora text-[10px] text-destructive">
                    Not a valid ERC-20 — needs name(), symbol(), and decimals().
                  </p>
                )}
                {searchAddressStatus === "ready" && searchAddressHit && (
                  <button
                    type="button"
                    onClick={() => {
                      const hit = searchAddressHit;
                      const already = isStreamSelected(hit.address);
                      if (already) {
                        removeStream(hit.address);
                        setStreamSearch("");
                        setSearchAddressHit(null);
                        setSearchAddressStatus("idle");
                        searchAddressLookupGen.current += 1;
                        return;
                      }
                      if (!canAddMoreStreams) {
                        notifyStreamLimit();
                        return;
                      }
                      const result = addStreamWithLabel(hit.address, {
                        name: hit.name,
                        symbol: hit.symbol,
                      });
                      if (result === "added" || result === "already") {
                        setStreamSearch("");
                        setSearchAddressHit(null);
                        setSearchAddressStatus("idle");
                        searchAddressLookupGen.current += 1;
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition",
                      isStreamSelected(searchAddressHit.address)
                        ? "border-primary/50 bg-primary/10"
                        : !canAddMoreStreams
                          ? "border-border/50 bg-muted/30 opacity-80"
                          : "border-primary/30 bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <Plus
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isStreamSelected(searchAddressHit.address) || canAddMoreStreams
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sora text-xs font-semibold text-foreground">
                        {searchAddressHit.name}
                        {searchAddressHit.symbol ? (
                          <span className="ml-1.5 font-jetbrains text-[10px] font-normal text-muted-foreground">
                            {searchAddressHit.symbol}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate font-jetbrains text-[10px] text-muted-foreground">
                        {shortTokenLabel(searchAddressHit.address)}
                        {isStreamSelected(searchAddressHit.address)
                          ? " · on your list · click to remove"
                          : !canAddMoreStreams
                            ? ` · list full (${maxStreams}/${maxStreams}) · remove one first`
                            : " · click to add"}
                      </p>
                    </div>
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={customTokenInput}
                  onChange={(e) => setCustomTokenInput(e.target.value)}
                  placeholder={
                    canAddMoreStreams
                      ? "Custom token contract address"
                      : `List full (${maxStreams}/${maxStreams}) — remove a stream first`
                  }
                  className="h-8 flex-1 rounded-xl border-border/50 font-jetbrains text-[11px]"
                  disabled={validatingCustomToken}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addCustomToken();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0 rounded-xl text-xs"
                  onClick={() => void addCustomToken()}
                  disabled={
                    validatingCustomToken ||
                    !customTokenInput.trim() ||
                    (!canAddMoreStreams &&
                      !(
                        isValidAddress(customTokenInput.trim()) &&
                        isStreamSelected(customTokenInput.trim() as Address)
                      ))
                  }
                >
                  {validatingCustomToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {validatingCustomToken ? "Checking…" : "Add"}
                </Button>
              </div>
              {!canAddMoreStreams && (
                <p className="px-0.5 font-sora text-[10px] text-amber-700 dark:text-amber-400">
                  Stream limit reached ({selectedStreams.length}/{maxStreams}). Remove a
                  stream before adding another.
                </p>
              )}
            </div>

            {/* Selection chips */}
              <div className="max-h-[min(18vh,130px)] overflow-y-auto rounded-xl border border-border/50 bg-background/50 p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="font-orbitron text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Your list · {selectedStreams.length}/{maxStreams}
                </p>
                {selectedStreams.length > 0 && (
                  <button
                    type="button"
                    className="font-sora text-[9px] font-semibold text-muted-foreground hover:text-destructive"
                    onClick={() => setSelectedStreams([])}
                  >
                    Clear
                  </button>
                )}
              </div>
              {selectedStreams.length === 0 ? (
                <p className="font-sora text-[11px] text-muted-foreground">
                  No streams selected yet
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedStreams.map((addr) => (
                    <button
                      key={addr}
                      type="button"
                      onClick={() => toggleStream(addr)}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-sora text-[10px] font-semibold text-foreground transition hover:bg-destructive/15"
                      title={addr}
                    >
                      <span className="truncate">{streamLabel(addr)}</span>
                      <X className="h-3 w-3 shrink-0 opacity-70" />
                    </button>
                  ))}
                </div>
              )}
              {liveSubscriptions.length > 0 && (
                <p className="mt-1 font-sora text-[9px] text-muted-foreground">
                  On-chain now:{" "}
                  {liveSubscriptions.map((a) => streamLabel(a)).join(", ")}
                </p>
              )}
            </div>

            {/* Farm readiness summary */}
            {subDialogMode === "farm" && (
              <div className="space-y-1 rounded-xl border border-primary/30 bg-primary/5 p-2 text-[11px] leading-snug">
                {loadingFarmReadiness && (
                  <p className="flex items-center gap-2 text-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking balances and gas…
                  </p>
                )}
                {farmReadiness && (
                  <>
                    <div className="space-y-0.5 font-jetbrains text-[10px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Deposit</span>
                        <span className="font-semibold text-foreground">
                          {formatArcadeDisplay(
                            farmReadiness.depositAmount,
                            farmReadiness.arcadeDecimals,
                          )}{" "}
                          ARCADE
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Pre-approved</span>
                        <span
                          className={cn(
                            "font-semibold",
                            farmReadiness.allowance >= farmReadiness.depositAmount
                              ? "text-success"
                              : "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {formatArcadeDisplay(
                            farmReadiness.allowance,
                            farmReadiness.arcadeDecimals,
                          )}{" "}
                          ARCADE
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Your ARCADE</span>
                        <span
                          className={cn(
                            "font-semibold",
                            farmReadiness.hasEnoughArcade ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatArcadeDisplay(
                            farmReadiness.arcadeBalance,
                            farmReadiness.arcadeDecimals,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Your {selectedNetwork.symbol}</span>
                        <span
                          className={cn(
                            "font-semibold",
                            farmReadiness.hasEnoughGas ? "text-success" : "text-destructive",
                          )}
                        >
                          {formatEther(farmReadiness.ethBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Wallet steps</span>
                        <span className="font-semibold text-foreground">
                          {farmPlan?.stepLabels.join(" → ") ?? "deposit"}
                        </span>
                      </div>
                    </div>
                    <p className="flex items-start gap-2 font-sora text-foreground">
                      <Fuel className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        You need enough <strong>{selectedNetwork.symbol}</strong> for{" "}
                        <strong>{farmPlan?.stepLabels.join(" → ") || "deposit"}</strong>
                        . Changing streams always adds a subscribe confirm. Extra pre-approval is
                        fine — we skip approve when allowance covers the deposit.
                      </span>
                    </p>
                    {farmPlan?.needsApproval ? (
                      <p className="flex items-start gap-2 font-sora text-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <span>
                          You&apos;ll <strong>approve</strong> Harvester for at least the deposit
                          amount
                          {farmPlan.needsSubscribe ? ", then subscribe, " : ", "}
                          then deposit. Approving more than needed is OK for future farms.
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-start gap-2 font-sora text-success">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Pre-approved{" "}
                          <strong>
                            {formatArcadeDisplay(
                              farmReadiness.allowance,
                              farmReadiness.arcadeDecimals,
                            )}{" "}
                            ARCADE
                          </strong>{" "}
                          — pre-approve to skip.
                          {farmPlan?.needsSubscribe
                            ? " Stream list changed: subscribe then deposit."
                            : " Deposit only."}
                        </span>
                      </p>
                    )}
                    {farmPlan?.needsSubscribe && (
                      <p className="flex items-start gap-2 font-sora text-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>
                          Since reward streams differ from your on-chain list — a{" "}
                          <strong>subscribeToStream</strong> confirmation is included before deposit.
                        </span>
                      </p>
                    )}
                    {!farmReadiness.hasEnoughArcade && (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                        Not enough ARCADE in this wallet for the amount you entered.
                      </p>
                    )}
                    {!farmReadiness.hasEnoughGas && (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                        Not enough {selectedNetwork.symbol} for gas. Add more and try again.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Categorized whitelist */}
            <ScrollArea className="h-[min(36vh,280px)] rounded-xl border border-border/50">
              <div className="space-y-2 p-2">
                {CATEGORY_ORDER.map((cat) => {
                  const list = filteredCategories[cat];
                  if (!list?.length) return null;
                  return (
                    <div key={cat}>
                      <p className="mb-1 px-1 font-orbitron text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                        {CATEGORY_LABELS[cat]}
                      </p>
                      <ul className="space-y-1">
                        {list.map((token) => {
                          const checked = selectedStreams.some(
                            (a) => normalizeAddr(a) === normalizeAddr(token.address),
                          );
                          const wasFormer = liveSubscriptions.some(
                            (a) => normalizeAddr(a) === normalizeAddr(token.address),
                          );
                          return (
                            <li key={token.address}>
                              <label
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 transition",
                                  checked
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-border/40 bg-background/40 hover:bg-muted/40",
                                )}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={!checked && !canAddMoreStreams}
                                  onCheckedChange={() => toggleStream(token.address)}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-sora text-xs font-semibold text-foreground">
                                    {token.name}
                                    {wasFormer && (
                                      <span className="ml-1.5 font-jetbrains text-[10px] font-normal text-primary">
                                        active
                                      </span>
                                    )}
                                  </p>
                                  <p className="truncate font-jetbrains text-[10px] text-muted-foreground">
                                    {shortTokenLabel(token.address)}
                                  </p>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
                {Object.keys(filteredCategories).length === 0 &&
                  searchAddressStatus === "idle" && (
                  <p className="px-2 py-6 text-center font-sora text-xs text-muted-foreground">
                    {streamSearch.trim()
                      ? "No whitelist match — paste a 0x address in search to look up a custom token."
                      : "No whitelisted tokens on this network yet. Paste a custom address in search."}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="shrink-0 gap-1.5 border-t border-border/50 px-3 py-2 sm:px-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={isFarming || syncActionStep !== "idle"}
              onClick={() => setSubDialogOpen(false)}
            >
              Cancel
            </Button>
            {subDialogMode === "farm" ? (
              <Button
                type="button"
                className="rounded-xl bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground"
                disabled={
                  isFarming ||
                  syncActionStep !== "idle" ||
                  loadingFarmReadiness ||
                  !farmReadiness?.canDeposit ||
                  selectedStreams.length === 0 ||
                  selectedStreams.length > maxStreams ||
                  farmStep !== "idle"
                }
                onClick={() => {
                  void confirmFarmDeposit();
                }}
              >
                {syncActionStep === "syncing" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {syncTransactionsRemaining > 0
                      ? `Syncing… (${syncTransactionsRemaining})`
                      : "Sync complete…"}
                  </span>
                ) : syncActionStep === "checking" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking sync…
                  </span>
                ) : isFarming || farmStep !== "idle" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {farmStep === "approving"
                      ? "Approving…"
                      : farmStep === "subscribing"
                        ? "Subscribing…"
                        : farmStep === "depositing"
                          ? "Depositing…"
                          : "Working…"}
                  </span>
                ) : (
                  farmPlan?.ctaLabel ?? "Confirm Deposit"
                )}
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-xl bg-primary font-orbitron text-sm font-bold tracking-wide text-primary-foreground"
                disabled={
                  isFarming ||
                  selectedStreams.length === 0 ||
                  selectedStreams.length > maxStreams ||
                  farmStep !== "idle"
                }
                onClick={() => {
                  void confirmManageSubscriptions();
                }}
              >
                {isFarming || farmStep === "subscribing" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating…
                  </span>
                ) : (
                  "Update Streams"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
