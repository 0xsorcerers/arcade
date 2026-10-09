import { defineChain } from "thirdweb/chains";
import { getContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { useSendTransaction } from "thirdweb/react";
import {
  createPublicClient,
  http,
  formatEther,
  parseEther,
  parseUnits,
  getAddress,
  isAddress,
  type Address,
  type Abi,
  type AbiFunction,
  type AbiParameter,
} from "viem";
import erc20 from "../abi/ERC20.json";
import erc721 from "../abi/ERC721.json";
import proofOfAccessAbiJson from "../abi/proofOfAccess.json";
import harvesterAbiJson from "../abi/Harvester.json";
import {
  ZERO_ADDRESS as ZERO_ADDRESS_CONFIG,
  hasLiveAddress,
  hasLiveHarvester,
  hasLegacyHarvester,
  hasLiveProofOfAccess,
} from "./networkData";
import { getCurrentNetwork } from "../store/networkStore";
import { getTokenName } from "./whitelisted";
import { client, Connector } from "./utils.js";

export { client, Connector };
export { formatEther, parseEther, parseUnits };

const ZERO_ADDRESS = ZERO_ADDRESS_CONFIG as Address;
const erc20ABI = erc20.abi as Abi;
const erc721ABI = erc721.abi as Abi;
const proofOfAccessABI = proofOfAccessAbiJson.abi as Abi;
const harvesterABI = harvesterAbiJson.abi as Abi;

function getHarvesterAbiFunction(name: string): AbiFunction {
  const item = harvesterABI.find(
    (entry): entry is AbiFunction =>
      entry.type === "function" && "name" in entry && entry.name === name,
  );
  if (!item) throw new Error(`${name} not found in Harvester.json ABI`);
  return item;
}

const harvesterWithdrawAbi = getHarvesterAbiFunction("withdraw");
const harvesterClaimAbi = getHarvesterAbiFunction("claim");
const harvesterSyncMyClaimAbi = getHarvesterAbiFunction("syncMyClaim");
const harvesterDepositAbi = getHarvesterAbiFunction("deposit");
const harvesterSubscribeToTokenAbi = getHarvesterAbiFunction("subscribeToToken");

const erc721TransferFromAbi: AbiFunction = (() => {
  const item = erc721ABI.find(
    (entry): entry is AbiFunction =>
      entry.type === "function" && "name" in entry && entry.name === "transferFrom",
  );
  if (!item) throw new Error("transferFrom not found in ERC721.json ABI");
  return item;
})();

const erc721TransferFromSignature = (() => {
  const inputs = (erc721TransferFromAbi.inputs ?? [])
    .map((input: AbiParameter) => {
      const name = "name" in input && input.name ? ` ${input.name}` : "";
      return `${input.type}${name}`;
    })
    .join(", ");
  return `function ${erc721TransferFromAbi.name}(${inputs})` as const;
})();

export const getThirdwebNetwork = () => {
  const network = getCurrentNetwork();
  return defineChain({ id: network.chainId, rpc: network.rpc });
};

export const getPublicClient = (network = getCurrentNetwork()) =>
  createPublicClient({ transport: http(network.rpc) });

export function getArcadeTokenAddress(): Address | null {
  const network = getCurrentNetwork();
  return hasLiveAddress(network.arcade_address)
    ? (network.arcade_address as Address)
    : null;
}

export function getProofOfAccessAddress(): Address | null {
  const network = getCurrentNetwork();
  return hasLiveProofOfAccess(network)
    ? (network.proof_of_access as Address)
    : null;
}

export const getProofOfAccessContract = () => {
  const address = getProofOfAccessAddress();
  if (!address) throw new Error("ProofOfAccess not deployed on this network");
  return getContract({ client, chain: getThirdwebNetwork(), address, abi: proofOfAccessABI });
};

export async function resolveArcadeTokenAddress(): Promise<Address> {
  const configured = getArcadeTokenAddress();
  if (configured) return configured;
  const poa = getProofOfAccessAddress();
  if (!poa) throw new Error("ARCADE token not configured on this network");
  const arcadeToken = (await getPublicClient().readContract({
    address: poa,
    abi: proofOfAccessABI,
    functionName: "arcadeToken",
  })) as Address;
  if (!arcadeToken || arcadeToken === ZERO_ADDRESS) {
    throw new Error("ProofOfAccess has no ARCADE token set");
  }
  return arcadeToken;
}
export const toTokenSmallestUnit = (amount: string | number, decimals: number): bigint => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }

  return parseUnits(String(amount), decimals);
};

/**
 * Convert a token amount from its smallest unit to a readable string based on token decimals
 * @param amount - Amount in the token's smallest unit (bigint)
 * @param decimals - Number of decimals the token uses (e.g., 6 for USDC, 18 for WETH)
 * @returns Formatted string with appropriate decimal places
 */
export const fromTokenSmallestUnit = (amount: bigint, decimals: number): string => {
  // For common decimal values, use optimized approach
  if (decimals === 18) {
    return formatEther(amount);
  }
  
  // For other decimal values, use manual formatting
  const amountStr = amount.toString();
  
  // Pad with leading zeros to ensure we can place decimal point
  const padded = amountStr.padStart(decimals + 1, '0');
  
  // Split into integer and fractional parts
  const integerPart = padded.slice(0, -decimals) || '0';
  const fractionalPart = padded.slice(-decimals);
  
  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalPart.replace(/0+$/, '');
  
  // Combine parts
  if (trimmedFractional) {
    return `${integerPart}.${trimmedFractional}`;
  }
  return integerPart;
};

export function displayDecimalPlaces(absValue: number): number {
  if (!Number.isFinite(absValue) || absValue === 0) return 0;
  if (absValue >= 10) return 1;
  if (absValue >= 1) return 2;
  return 6;
}

/**
 * Format a number/string with thousand separators and magnitude-based decimals.
 * Trailing zeros are stripped so we show as few decimals as we can within the cap.
 *
 * @example formatThousands(1234.56) → "1,234.6"
 * @example formatThousands(3.14159) → "3.14"
 * @example formatThousands(0.000123456) → "0.000123"
 */
export function formatThousands(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0";

  const cleaned =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/,/g, "").trim());

  if (!Number.isFinite(cleaned) || cleaned === 0) return "0";

  const abs = Math.abs(cleaned);
  const places = displayDecimalPlaces(abs);
  const factor = 10 ** places;
  // Round half away from zero toward the configured precision ("rounded up" places)
  const rounded =
    places === 0
      ? Math.round(cleaned)
      : Math.round(cleaned * factor) / factor;

  // Avoid "-0"
  if (rounded === 0) return "0";

  let fixed = rounded.toFixed(places);
  // Keep decimals as few as possible: drop trailing zeros / bare "."
  if (fixed.includes(".")) {
    fixed = fixed.replace(/\.?0+$/, "");
  }

  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [intPart, fracPart] = unsigned.split(".");
  const intFormatted = Number(intPart).toLocaleString("en-US");
  const body =
    fracPart !== undefined && fracPart.length > 0
      ? `${intFormatted}.${fracPart}`
      : intFormatted;
  return negative ? `-${body}` : body;
}

/**
 * Convert token smallest-units → human amount, then formatThousands for UI.
 */
export function formatTokenAmountThousands(
  amount: bigint,
  decimals: number,
): string {
  if (amount <= 0n) return "0";
  const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : 18;
  try {
    const full = fromTokenSmallestUnit(amount, dec);
    return formatThousands(full);
  } catch {
    return amount.toString();
  }
}


export const isZeroAddress = (address: Address | string | null | undefined): boolean => {
  if (!address) return true;
  return String(address).trim().toLowerCase() === ZERO_ADDRESS.toLowerCase();
};

/**
 * Read the current allowance for a spender on a token
 */
export const readTokenAllowance = async (
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<bigint> => {
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  return result as bigint;
};

/**
 * Read the token balance for an address
 */
export const readTokenBalance = async (
  tokenAddress: Address,
  ownerAddress: Address
): Promise<bigint> => {
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "balanceOf",
    args: [ownerAddress],
  });
  return result as bigint;
};

/**
 * Read the token decimals
 */
export const readTokenDecimalsStrict = async (tokenAddress: Address): Promise<number> => {
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "decimals",
  });
  const decimals = Number(result);

  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid token decimals for ${tokenAddress}`);
  }

  return decimals;
};

export const readTokenDecimals = async (tokenAddress: Address): Promise<number> => {
  try {
    return await readTokenDecimalsStrict(tokenAddress);
  } catch (err) {
    console.error('Error reading token decimals:', err);
    return 18; // Display fallback only. Transaction paths should use readTokenDecimalsStrict.
  }
};

/**
 * Read the token symbol (throws if the contract has no ERC20 symbol()).
 */
export const readTokenSymbolStrict = async (tokenAddress: Address): Promise<string> => {
  if (isZeroAddress(tokenAddress) || !tokenAddress) {
    const network = getCurrentNetwork();
    return network.symbol || "ETH";
  }
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "symbol",
  });
  const symbol = String(result ?? "").trim();
  if (!symbol) {
    throw new Error(`Token at ${tokenAddress} has empty symbol()`);
  }
  return symbol;
};

/**
 * Read the token symbol
 */
export const readTokenSymbol = async (tokenAddress: Address): Promise<string> => {
  try {
    return await readTokenSymbolStrict(tokenAddress);
  } catch (err) {
    console.error('Error reading token symbol:', err);
    return 'TOKEN';
  }
};

/**
 * Read the ERC20 token name() (throws if missing / empty).
 */
export const readTokenNameStrict = async (tokenAddress: Address): Promise<string> => {
  if (isZeroAddress(tokenAddress) || !tokenAddress) {
    const network = getCurrentNetwork();
    const whitelistName = getTokenName(network.chainId, ZERO_ADDRESS);
    return whitelistName || `Native ${network.symbol}`;
  }
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "name",
  });
  const name = String(result ?? "").trim();
  if (!name) {
    throw new Error(`Token at ${tokenAddress} has empty name()`);
  }
  return name;
};

/**
 * Read the ERC20 token name() for display (e.g. custom reward stream addresses).
 */
export const readTokenName = async (tokenAddress: Address): Promise<string> => {
  try {
    return await readTokenNameStrict(tokenAddress);
  } catch (err) {
    console.error("Error reading token name:", err);
    return "Unknown token";
  }
};

export interface Erc20TokenMeta {
  name: string;
  symbol: string;
  decimals: number;
}

/**
 * Strict ERC20 check used when adding custom reward streams (same idea as
 * market create: contract must expose name, symbol, and decimals).
 * Throws if any required field is missing or unreadable.
 */
export const validateErc20Token = async (
  tokenAddress: Address,
): Promise<Erc20TokenMeta> => {
  if (isZeroAddress(tokenAddress) || !tokenAddress) {
    const network = getCurrentNetwork();
    const whitelistName = getTokenName(network.chainId, ZERO_ADDRESS);
    return {
      name: whitelistName || `Native ${network.symbol}`,
      symbol: network.symbol || "ETH",
      decimals: 18,
    };
  }
  const [name, symbol, decimals] = await Promise.all([
    readTokenNameStrict(tokenAddress),
    readTokenSymbolStrict(tokenAddress),
    readTokenDecimalsStrict(tokenAddress),
  ]);
  return { name, symbol, decimals };
};

/**
 * Prepare an ERC20 approve transaction
 */

export const PROOF_OF_ACCESS_DEFAULTS = {
  mintFee: 10_000_000_000_000n, // 0.00001 ether
  /** 2_000_000 ARCADE with 18 decimals (requiredAmount = 2000000 * 10**18) */
  requiredAmount: 2_000_000n * 10n ** 18n,
  multipliers: [1n, 2n, 4n, 8n, 16n, 32n] as const,
  /** Rough gas units for approve + mint when estimating ETH reserve */
  gasUnitsReserve: 350_000n,
};

export interface ProofOfAccessMintConfig {
  mintFee: bigint;
  requiredAmount: bigint;
  multiplier: bigint;
  burnAmount: bigint;
  paused: boolean;
  deployed: boolean;
  arcadeToken: Address | null;
  arcadeDecimals: number;
}

export interface ProofOfAccessMintReadiness {
  config: ProofOfAccessMintConfig;
  arcadeToken: Address;
  arcadeDecimals: number;
  ethBalance: bigint;
  arcadeBalance: bigint;
  allowance: bigint;
  gasPrice: bigint;
  ethGasReserve: bigint;
  ethNeeded: bigint;
  needsApproval: boolean;
  hasEnoughArcade: boolean;
  hasEnoughGas: boolean;
  canMint: boolean;
}

/** Read mint fee / burn requirements for a tier (falls back to contract defaults if undeployed). */
export async function fetchProofOfAccessMintConfig(tierLevel: number): Promise<ProofOfAccessMintConfig> {
  const address = getProofOfAccessAddress();
  const clamped = Math.max(0, Math.min(5, tierLevel));

  if (!address) {
    const multiplier = PROOF_OF_ACCESS_DEFAULTS.multipliers[clamped] ?? 1n;
    return {
      mintFee: PROOF_OF_ACCESS_DEFAULTS.mintFee,
      requiredAmount: PROOF_OF_ACCESS_DEFAULTS.requiredAmount,
      multiplier,
      burnAmount: PROOF_OF_ACCESS_DEFAULTS.requiredAmount * multiplier,
      paused: false,
      deployed: false,
      arcadeToken: null,
      arcadeDecimals: 18,
    };
  }

  const client_ = getPublicClient();
  try {
    const [mintFee, requiredAmount, multiplier, paused, arcadeToken] = await Promise.all([
      client_.readContract({
        address,
        abi: proofOfAccessABI,
        functionName: "mintFee",
      }) as Promise<bigint>,
      client_.readContract({
        address,
        abi: proofOfAccessABI,
        functionName: "requiredAmount",
      }) as Promise<bigint>,
      client_.readContract({
        address,
        abi: proofOfAccessABI,
        functionName: "multipliers",
        args: [BigInt(clamped)],
      }) as Promise<bigint>,
      client_.readContract({
        address,
        abi: proofOfAccessABI,
        functionName: "paused",
      }) as Promise<boolean>,
      client_.readContract({
        address,
        abi: proofOfAccessABI,
        functionName: "arcadeToken",
      }) as Promise<Address>,
    ]);

    let arcadeDecimals = 18;
    if (arcadeToken && arcadeToken !== ZERO_ADDRESS) {
      try {
        arcadeDecimals = await readTokenDecimalsStrict(arcadeToken);
      } catch {
        arcadeDecimals = 18;
      }
    }

    return {
      mintFee,
      requiredAmount,
      multiplier,
      burnAmount: requiredAmount * multiplier,
      paused,
      deployed: true,
      arcadeToken: arcadeToken && arcadeToken !== ZERO_ADDRESS ? arcadeToken : null,
      arcadeDecimals,
    };
  } catch (err) {
    console.error("fetchProofOfAccessMintConfig failed, using defaults", err);
    const multiplier = PROOF_OF_ACCESS_DEFAULTS.multipliers[clamped] ?? 1n;
    return {
      mintFee: PROOF_OF_ACCESS_DEFAULTS.mintFee,
      requiredAmount: PROOF_OF_ACCESS_DEFAULTS.requiredAmount,
      multiplier,
      burnAmount: PROOF_OF_ACCESS_DEFAULTS.requiredAmount * multiplier,
      paused: false,
      deployed: true,
      arcadeToken: null,
      arcadeDecimals: 18,
    };
  }
}

/**
 * Pre-flight checks before mint: balances, allowance, and rough ETH gas + fee reserve.
 * Call this when the user opens the mint confirm dialog.
 */
export async function checkProofOfAccessMintReadiness(
  wallet: Address,
  tierLevel: number,
): Promise<ProofOfAccessMintReadiness> {
  const config = await fetchProofOfAccessMintConfig(tierLevel);
  if (!config.deployed) {
    throw new Error("ProofOfAccess contract is not deployed on this network yet");
  }
  if (config.paused) {
    throw new Error("Minting is paused");
  }

  const spender = getProofOfAccessAddress();
  if (!spender) throw new Error("ProofOfAccess not deployed on this network");

  const arcadeToken = config.arcadeToken ?? (await resolveArcadeTokenAddress());
  const client_ = getPublicClient();

  const [ethBalance, arcadeBalance, allowance, gasPrice, arcadeDecimals] = await Promise.all([
    client_.getBalance({ address: wallet }),
    readTokenBalance(arcadeToken, wallet),
    readTokenAllowance(arcadeToken, wallet, spender),
    client_.getGasPrice(),
    config.arcadeDecimals
      ? Promise.resolve(config.arcadeDecimals)
      : readTokenDecimals(arcadeToken),
  ]);

  const ethGasReserve = gasPrice * PROOF_OF_ACCESS_DEFAULTS.gasUnitsReserve;
  const ethNeeded = config.mintFee + ethGasReserve;
  const needsApproval = allowance < config.burnAmount;
  const hasEnoughArcade = arcadeBalance >= config.burnAmount;
  const hasEnoughGas = ethBalance >= ethNeeded;

  return {
    config: { ...config, arcadeToken, arcadeDecimals },
    arcadeToken,
    arcadeDecimals,
    ethBalance,
    arcadeBalance,
    allowance,
    gasPrice,
    ethGasReserve,
    ethNeeded,
    needsApproval,
    hasEnoughArcade,
    hasEnoughGas,
    canMint: hasEnoughArcade && hasEnoughGas,
  };
}

/** Approve ARCADE burn amount for the ProofOfAccess spender. */
export const prepareArcadeApproveForProofOfAccess = (amount: bigint, arcadeAddress?: Address) => {
  const network = getCurrentNetwork();
  const arcade = (arcadeAddress || (network.arcade_address as Address)) as Address;
  const spender = getProofOfAccessAddress();
  if (!spender) throw new Error("ProofOfAccess not deployed on this network");
  if (!arcade || arcade === ZERO_ADDRESS) throw new Error("ARCADE token not configured");

  const tokenContract = getContract({
    client,
    chain: getThirdwebNetwork(),
    address: arcade,
  });

  return prepareContractCall({
    contract: tokenContract,
    method: "function approve(address spender, uint256 amount) external returns (bool)",
    params: [spender, amount],
  });
};

export const prepareProofOfAccessMint = (tierLevel: number) => {
  return prepareContractCall({
    contract: getProofOfAccessContract(),
    method: "function mint(uint256 _tierLevel) public payable",
    params: [BigInt(tierLevel)],
  });
};

/**
 * Hook: approve ARCADE (if needed) then mint ProofOfAccess NFT for tierLevel (0–5).
 * Requires wallet connection via thirdweb (user signs — not a backend key).
 *
 * Flow:
 * 1) Readiness check (balances / gas) — pass wallet or precomputed readiness
 * 2) Wallet popup: approve ProofOfAccess to spend burnAmount ARCADE (if needed)
 * 3) Wallet popup: mint(_tierLevel) payable with mintFee
 */
export const useProofOfAccessMint = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const mintTier = async (
    tierLevel: number,
    options: {
      wallet: Address;
      readiness?: ProofOfAccessMintReadiness;
      onStep?: (step: "checking" | "approving" | "minting") => void;
    },
  ) => {
    options.onStep?.("checking");
    const readiness =
      options.readiness ??
      (await checkProofOfAccessMintReadiness(options.wallet, tierLevel));

    const { config, arcadeToken, needsApproval, hasEnoughArcade, hasEnoughGas, canMint } =
      readiness;

    if (!config.deployed) {
      throw new Error("ProofOfAccess contract is not deployed on this network yet");
    }
    if (config.paused) {
      throw new Error("Minting is paused");
    }
    if (!hasEnoughArcade) {
      throw new Error(
        `Not enough ARCADE to mint. Need ${formatCompactTokenAmount(config.burnAmount, readiness.arcadeDecimals)} ARCADE to burn.`,
      );
    }
    if (!hasEnoughGas) {
      throw new Error(
        `Not enough ${getCurrentNetwork().symbol} for mint fee + gas. Keep a little extra for the approve and mint transactions.`,
      );
    }
    if (!canMint) {
      throw new Error("Cannot mint right now — check ARCADE balance and gas.");
    }

    // 1) Approve ARCADE burn when allowance is insufficient
    if (needsApproval) {
      options.onStep?.("approving");
      const approveTx = prepareArcadeApproveForProofOfAccess(config.burnAmount, arcadeToken);
      const approveResult = await sendTx(approveTx);
      await waitForReceipt({
        client,
        chain: getThirdwebNetwork(),
        transactionHash: approveResult.transactionHash,
      });
    }

    // 2) Mint with fee
    options.onStep?.("minting");
    const mintTx = {
      ...prepareProofOfAccessMint(tierLevel),
      value: config.mintFee,
    };
    const mintResult = await sendTx(mintTx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: mintResult.transactionHash,
    });

    return mintResult;
  };

  return { mintTier, isPending, error };
};

// ============================================================================
// ProofOfAccess NFT gift (ERC-721 transferFrom via ERC721.json)
// ============================================================================

/**
 * ProofOfAccess address wired with the standard ERC-721 ABI
 * (webapp/src/abi/ERC721.json) for transfer / ownership calls.
 */
export const getProofOfAccessErc721Contract = () => {
  const address = getProofOfAccessAddress();
  if (!address) throw new Error("ProofOfAccess not deployed on this network");
  return getContract({
    client,
    chain: getThirdwebNetwork(),
    address,
    abi: erc721ABI,
  });
};

/**
 * Prepare ERC-721 transferFrom on the live ProofOfAccess address.
 * Method ABI comes from ERC721.json (not ProofOfAccess-specific ABI).
 * Caller must own the token (or be approved); wallet signs the tx.
 */
export const prepareProofOfAccessTransferFrom = (
  from: Address,
  to: Address,
  tokenId: bigint,
) => {
  return prepareContractCall({
    contract: getProofOfAccessErc721Contract(),
    // Signature is derived from ERC721.json transferFrom (see erc721TransferFromAbi)
    method: erc721TransferFromSignature,
    params: [from, to, tokenId],
  });
};

/**
 * Hook: gift a ProofOfAccess NFT to any wallet via ERC-721 transferFrom.
 * Uses ERC721.json transferFrom against the PoA contract address.
 * Requires the connected wallet to own the tokenId (msg.sender = from).
 */
export const useProofOfAccessGift = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const giftNft = async (params: {
    from: Address;
    to: string;
    tokenId: bigint;
  }) => {
    const toRaw = params.to.trim();
    if (!isAddress(toRaw)) {
      throw new Error("Enter a valid wallet address (0x…)");
    }

    const from = getAddress(params.from);
    const to = getAddress(toRaw);

    if (to === ZERO_ADDRESS) {
      throw new Error("Cannot gift to the zero address");
    }
    if (to.toLowerCase() === from.toLowerCase()) {
      throw new Error("Cannot gift an NFT to your own wallet");
    }
    if (params.tokenId < 0n) {
      throw new Error("Invalid NFT token id");
    }

    const transferTx = prepareProofOfAccessTransferFrom(from, to, params.tokenId);
    const result = await sendTx(transferTx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    return { ...result, to };
  };

  return { giftNft, isPending, error };
};

/**
 * Compact token amount for staking / mint UI.
 * Uses formatThousands (thousand separators + magnitude-based decimals).
 * `maxFrac` is kept for call-site compatibility but caps are driven by formatThousands.
 */
export function formatCompactTokenAmount(
  amount: bigint,
  decimals: number,
  _maxFrac = 2,
): string {
  try {
    return formatTokenAmountThousands(amount, decimals);
  } catch {
    return amount.toString();
  }
}

// ============================================================================
// ProofOfAccess ownership + wallet balances (viem reads)
// ============================================================================

/** On-chain Player struct from ProofOfAccess.getPlayerOwners / getPlayers */
export interface ProofOfAccessPlayer {
  TIER: string;
  ID: bigint;
  LISTS: bigint;
  BLACKLIST: boolean;
}

/**
 * List all ProofOfAccess NFTs owned by a wallet (viem read).
 * Returns empty array when PoA is not live or the call fails.
 */
export async function getPlayerOwners(wallet: Address): Promise<ProofOfAccessPlayer[]> {
  const poa = getProofOfAccessAddress();
  if (!poa) return [];

  try {
    const result = await getPublicClient().readContract({
      address: poa,
      abi: proofOfAccessABI,
      functionName: "getPlayerOwners",
      args: [wallet],
    });

    const rows = result as Array<{
      TIER: string;
      ID: bigint;
      LISTS: bigint;
      BLACKLIST: boolean;
    }>;

    return rows.map((p) => {
      // Player.ID is the minted ERC-721 tokenId (set in mint as ID: _tokenId)
      const tokenId = BigInt(
        (p as { ID?: bigint | number | string }).ID ??
          (Array.isArray(p) ? (p as unknown[])[1] : 0) ??
          0,
      );
      return {
        TIER: String((p as { TIER?: string }).TIER ?? (Array.isArray(p) ? (p as unknown[])[0] : "")),
        ID: tokenId,
        LISTS: BigInt(
          (p as { LISTS?: bigint | number | string }).LISTS ??
            (Array.isArray(p) ? (p as unknown[])[2] : 1) ??
            1,
        ),
        BLACKLIST: Boolean(
          (p as { BLACKLIST?: boolean }).BLACKLIST ??
            (Array.isArray(p) ? (p as unknown[])[3] : false),
        ),
      };
    });
  } catch (err) {
    console.error("getPlayerOwners failed", err);
    return [];
  }
}

export interface WalletStakingBalances {
  ethBalance: bigint;
  arcadeBalance: bigint;
  arcadeDecimals: number;
  arcadeToken: Address | null;
}

/**
 * Native gas token + ARCADE balances via viem (getBalance + ERC20 balanceOf).
 * Safe when ARCADE is not configured — returns 0n for arcade.
 */
export async function fetchWalletStakingBalances(
  wallet: Address,
): Promise<WalletStakingBalances> {
  const client_ = getPublicClient();
  const ethBalance = await client_.getBalance({ address: wallet });

  let arcadeToken: Address | null = null;
  let arcadeBalance = 0n;
  let arcadeDecimals = 18;

  try {
    arcadeToken = await resolveArcadeTokenAddress();
    const [bal, dec] = await Promise.all([
      readTokenBalance(arcadeToken, wallet),
      readTokenDecimals(arcadeToken),
    ]);
    arcadeBalance = bal;
    arcadeDecimals = dec;
  } catch {
    /* ARCADE not configured or RPC error — leave zeros */
  }

  return { ethBalance, arcadeBalance, arcadeDecimals, arcadeToken };
}

// ============================================================================
// Harvester V2 — deposit ARCADE + reward stream subscriptions
// ============================================================================

/** Rough gas units per farm step (approve / subscribe / deposit) */
export const HARVESTER_FARM_DEFAULTS = {
  gasUnitsPerTx: 280_000n,
  /** Fallback when PoA mintFee cannot be read */
  ethBufferFallback: 10_000_000_000_000n, // 0.00001 ether
};

export function getHarvesterAddress(): Address | null {
  const network = getCurrentNetwork();
  if (!hasLiveHarvester(network)) return null;
  return network.harvester;
}

/** Previous Harvester still holding stakes during an upgrade (if configured). */
export function getLegacyHarvesterAddress(): Address | null {
  const network = getCurrentNetwork();
  if (!hasLegacyHarvester(network) || !network.legacyHarvester) return null;
  return network.legacyHarvester;
}

/**
 * Live Harvester thirdweb contract — always includes Harvester.json ABI so
 * deposit / withdraw / claim encode without free-form method strings.
 */
export const getHarvesterContract = () => {
  const address = getHarvesterAddress();
  if (!address) throw new Error("Harvester not deployed on this network");
  return getContract({
    client,
    chain: getThirdwebNetwork(),
    address,
    abi: harvesterABI,
  });
};

/**
 * Harvester contract at an explicit address (live or legacy).
 * Same Harvester.json ABI for both deploys.
 */
export function getHarvesterContractAt(address: Address) {
  return getContract({
    client,
    chain: getThirdwebNetwork(),
    address,
    abi: harvesterABI,
  });
}

export interface HarvesterUserSubscriptions {
  tokens: Address[];
  count: number;
}

/**
 * Read active reward streams for a wallet via Harvester.getUserSubscriptions.
 * Returns [] when the user has never farmed / has no streams.
 * Pass `harvesterOverride` to read a legacy deploy instead of the live farm.
 */
export async function fetchUserSubscriptions(
  wallet: Address,
  harvesterOverride?: Address | null,
): Promise<HarvesterUserSubscriptions> {
  const harvester = harvesterOverride ?? getHarvesterAddress();
  if (!harvester) return { tokens: [], count: 0 };

  const client_ = getPublicClient();
  try {
    const subs = (await client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "getUserSubscriptions",
      args: [wallet],
    })) as Address[];

    const tokens = (subs ?? []).map((a) => a as Address);
    return { tokens, count: tokens.length };
  } catch (err) {
    console.error("fetchUserSubscriptions failed", err);
    return { tokens: [], count: 0 };
  }
}

export interface HarvesterFarmStats {
  /** balances[user] — this wallet's ARCADE staked in Harvester (Current Farm) */
  stakedBalance: bigint;
  /**
   * Harvester.TotalARCADESent — protocol-wide ARCADE accounted in the farm (Total Farm).
   * Updated on deposit (+) and withdraw (−) on-chain.
   */
  totalFarmArcadeSent: bigint;
  firstToken: Address | null;
  subscriptions: Address[];
  paused: boolean;
  deployed: boolean;
}

/** Read Harvester.TotalARCADESent (global farm total). Returns 0n if not deployed. */
export async function fetchTotalArcadeSent(): Promise<bigint> {
  const harvester = getHarvesterAddress();
  if (!harvester) return 0n;
  try {
    const value = (await getPublicClient().readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "TotalARCADESent",
    })) as bigint;
    return value ?? 0n;
  } catch (err) {
    console.error("fetchTotalArcadeSent failed", err);
    return 0n;
  }
}

/** Live Total Farm (TotalARCADESent) / Current Farm (balances[user]) for the dashboard. */
export async function fetchHarvesterFarmStats(wallet: Address): Promise<HarvesterFarmStats> {
  const harvester = getHarvesterAddress();
  if (!harvester) {
    return {
      stakedBalance: 0n,
      totalFarmArcadeSent: 0n,
      firstToken: null,
      subscriptions: [],
      paused: false,
      deployed: false,
    };
  }

  const client_ = getPublicClient();
  const [stakedBalance, paused, totalFarmArcadeSent, subs] = await Promise.all([
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "balances",
      args: [wallet],
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "paused",
    }) as Promise<boolean>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "TotalARCADESent",
    }) as Promise<bigint>,
    fetchUserSubscriptions(wallet),
  ]);

  const firstToken = subs.tokens[0] ?? null;

  return {
    stakedBalance,
    totalFarmArcadeSent: totalFarmArcadeSent ?? 0n,
    firstToken,
    subscriptions: subs.tokens,
    paused,
    deployed: true,
  };
}

export interface HarvesterSyncStatusItem {
  token: Address;
  unsyncedEras: number;
  loopsNeeded: number;
  liveCurrentEra: number;
  userEra: number;
  maxBatchSize: number;
}

export interface HarvesterSyncStatus {
  subscriptions: HarvesterSyncStatusItem[];
  totalLoopsNeeded: number;
  requiresSync: boolean;
  maxBatchSize: number;
}

interface HarvesterSyncLimits {
  maxBatchSize: number;
  maxInlineEras: number;
}

export async function getPendingSyncInfo(
  wallet: Address,
  token: Address,
  harvesterAddress?: Address | null,
  syncLimits?: HarvesterSyncLimits,
): Promise<HarvesterSyncStatusItem> {
  const harvester = harvesterAddress ?? getHarvesterAddress();
  if (!harvester) {
    return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra: 0, userEra: 0, maxBatchSize: 0 };
  }

  try {
    const client_ = getPublicClient();
    const limitsPromise = syncLimits
      ? Promise.resolve(syncLimits)
      : Promise.all([
          client_.readContract({
            address: harvester,
            abi: harvesterABI,
            functionName: "MAX_BATCH_SIZE",
          }) as Promise<bigint>,
          client_.readContract({
            address: harvester,
            abi: harvesterABI,
            functionName: "MAX_ERA",
          }) as Promise<bigint>,
        ]).then(([maxBatchSize, maxInlineEras]) => ({
          maxBatchSize: Number(maxBatchSize),
          maxInlineEras: Number(maxInlineEras),
        }));
    const [tEco, eralength, limits, claimTuple] = await Promise.all([
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "tokenEconomics",
        args: [token],
      }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint, boolean]>,
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "eralength",
      }) as Promise<bigint>,
      limitsPromise,
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "claimRewards",
        args: [wallet, token],
      }) as Promise<readonly [bigint, bigint, bigint]>,
    ]);

    if (!tEco?.[5]) {
      return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra: 0, userEra: 0, maxBatchSize: limits.maxBatchSize };
    }

    const startTime = Number(tEco?.[4] ?? 0n);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec < startTime) {
      return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra: 0, userEra: 0, maxBatchSize: limits.maxBatchSize };
    }

    const eraLength = Number(eralength ?? 0n);
    const liveCurrentEra = eraLength > 0 ? Math.floor((nowSec - startTime) / eraLength) : 0;
    const userEra = Number(claimTuple?.[0] ?? 0n);
    const stakedAmount = claimTuple?.[2] ?? 0n;

    // A user with no active ARCADE balance in a token is effectively a fresh depositor or
    // a fully paid-out user; they should not be forced through stale-era sync before a new deposit.
    if (stakedAmount === 0n) {
      return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra, userEra, maxBatchSize: limits.maxBatchSize };
    }

    if (liveCurrentEra <= userEra) {
      return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra, userEra, maxBatchSize: Number(maxBatchSize ?? 0n) };
    }

    const batchSize = limits.maxBatchSize;
    const unsyncedEras = liveCurrentEra - userEra;
    const erasBeyondInlineLimit = Math.max(0, unsyncedEras - limits.maxInlineEras);
    const loopsNeeded = batchSize > 0 ? Math.ceil(erasBeyondInlineLimit / batchSize) : 0;

    return {
      token: getAddress(token),
      unsyncedEras,
      loopsNeeded,
      liveCurrentEra,
      userEra,
      maxBatchSize: batchSize,
    };
  } catch (err) {
    console.error("getPendingSyncInfo failed", token, err);
    return { token: getAddress(token), unsyncedEras: 0, loopsNeeded: 0, liveCurrentEra: 0, userEra: 0, maxBatchSize: 0 };
  }
}

export async function fetchHarvesterSyncStatus(
  wallet: Address,
  harvesterAddress?: Address | null,
): Promise<HarvesterSyncStatus> {
  const harvester = harvesterAddress ?? getHarvesterAddress();
  if (!harvester) {
    return { subscriptions: [], totalLoopsNeeded: 0, requiresSync: false, maxBatchSize: 0 };
  }

  try {
    const { tokens } = await fetchUserSubscriptions(wallet, harvester);
    const [maxBatchSize, maxInlineEras] = await Promise.all([
      getPublicClient().readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "MAX_BATCH_SIZE",
      }) as Promise<bigint>,
      getPublicClient().readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "MAX_ERA",
      }) as Promise<bigint>,
    ]);
    const syncLimits = {
      maxBatchSize: Number(maxBatchSize),
      maxInlineEras: Number(maxInlineEras),
    };

    let totalLoopsNeeded = 0;
    const subscriptions: HarvesterSyncStatusItem[] = [];
    for (const token of tokens) {
      const next = await getPendingSyncInfo(wallet, token, harvester, syncLimits);
      subscriptions.push(next);
      totalLoopsNeeded += next.loopsNeeded;
    }

    return {
      subscriptions,
      totalLoopsNeeded,
      requiresSync: totalLoopsNeeded > 0,
      maxBatchSize: syncLimits.maxBatchSize,
    };
  } catch (err) {
    console.error("fetchHarvesterSyncStatus failed", err);
    return { subscriptions: [], totalLoopsNeeded: 0, requiresSync: false, maxBatchSize: 0 };
  }
}

// ============================================================================
// Harvester claim history — userTotalClaimHistory + getUserClaims
// ============================================================================

/** Max records per getUserClaims call (enforced on-chain). */
export const HARVESTER_CLAIMS_MAX_BATCH = 200;

/**
 * Default page size for the Harvested claim-history UI.
 * Kept small so one screen of rows maps 1:1 to a contract batch.
 */
export const HARVESTER_CLAIMS_PAGE_SIZE = 10;

/**
 * One Harvester claim history row (on-chain ClaimRecord).
 * Distinct from market ClaimRecord (which has marketId / positionId).
 */
export interface HarvesterClaimRecord {
  timestamp: number;
  token: Address;
  /** Raw amount in token smallest units (string for safe serialization). */
  amount: string;
}

/** Claim row enriched with ERC20 / native display metadata. */
export interface HarvesterClaimDisplay extends HarvesterClaimRecord {
  name: string;
  symbol: string;
  decimals: number;
  displayAmount: string;
}

/**
 * Total number of harvest claims for a user.
 * On-chain: Harvester.userTotalClaimHistory(user) (user-facing "claims count").
 */
export async function fetchHarvesterUserClaimsCount(wallet: Address): Promise<number> {
  const harvester = getHarvesterAddress();
  if (!harvester) return 0;
  try {
    const result = await getPublicClient().readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "userTotalClaimHistory",
      args: [wallet],
    });
    const n = Number(result);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (err) {
    console.error("fetchHarvesterUserClaimsCount failed", err);
    return 0;
  }
}

/**
 * Read a slice of Harvester claim history.
 * Contract: getUserClaims(user, _start, _finish) where _finish is the batch length
 * (not an exclusive end index), max 200, and _start + _finish <= total.
 *
 * Entries keep storage order (index 0 in the array = on-chain index `start`).
 * Empty / zero-timestamp slots are kept so callers can map back to storage indices.
 */
export async function fetchHarvesterUserClaims(
  wallet: Address,
  start: number,
  count: number,
): Promise<HarvesterClaimRecord[]> {
  const harvester = getHarvesterAddress();
  if (!harvester || count <= 0) return [];

  const safeStart = Math.max(0, Math.floor(start));
  const safeCount = Math.min(HARVESTER_CLAIMS_MAX_BATCH, Math.max(0, Math.floor(count)));
  if (safeCount === 0) return [];

  try {
    const result = await getPublicClient().readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "getUserClaims",
      args: [wallet, BigInt(safeStart), BigInt(safeCount)],
    });

    const raw = result as Array<{
      timestamp: bigint;
      token: Address;
      amount: bigint;
    }>;

    return (raw ?? []).map((claim) => ({
      timestamp: Number(claim.timestamp),
      token: claim.token as Address,
      amount: claim.amount.toString(),
    }));
  } catch (err) {
    console.error("fetchHarvesterUserClaims failed", err);
    return [];
  }
}

/**
 * Map a UI page (0 = newest) to storage start index + length.
 * History is stored oldest-first at index 0.
 */
export function harvesterClaimsPageRange(
  total: number,
  page: number,
  pageSize: number = HARVESTER_CLAIMS_PAGE_SIZE,
): { start: number; count: number } {
  if (total <= 0 || pageSize <= 0 || page < 0) return { start: 0, count: 0 };
  const remainingFromEnd = page * pageSize;
  if (remainingFromEnd >= total) return { start: 0, count: 0 };
  const endExclusive = total - remainingFromEnd;
  const start = Math.max(0, endExclusive - pageSize);
  return { start, count: endExclusive - start };
}

/**
 * Map a UI page to the on-chain getUserClaims window (≤ maxBatch) that covers it.
 *
 * - If total ≤ maxBatch (200): one call loads the entire history.
 * - If total > maxBatch: batches are aligned from the newest end so "Older"
 *   stays inside the same RPC window for many UI pages before the next call.
 */
export function harvesterClaimsBatchRangeForPage(
  total: number,
  page: number,
  pageSize: number = HARVESTER_CLAIMS_PAGE_SIZE,
  maxBatch: number = HARVESTER_CLAIMS_MAX_BATCH,
): { start: number; count: number } {
  if (total <= 0 || maxBatch <= 0) return { start: 0, count: 0 };

  if (total <= maxBatch) {
    return { start: 0, count: total };
  }

  const { start: pageStart, count: pageLen } = harvesterClaimsPageRange(
    total,
    page,
    pageSize,
  );
  if (pageLen === 0) return { start: 0, count: 0 };

  // Align batches from the newest end: batch 0 = [total-200, total), batch 1 = previous 200, …
  const batchFromEnd = Math.floor((total - 1 - pageStart) / maxBatch);
  const batchEndExclusive = total - batchFromEnd * maxBatch;
  const batchStart = Math.max(0, batchEndExclusive - maxBatch);
  return { start: batchStart, count: batchEndExclusive - batchStart };
}

/** In-memory cache of enriched claims keyed by on-chain storage index. */
export type HarvesterClaimsCache = {
  wallet: string;
  total: number;
  byIndex: Map<number, HarvesterClaimDisplay>;
};

export function createHarvesterClaimsCache(
  wallet: Address,
  total: number,
): HarvesterClaimsCache {
  return {
    wallet: wallet.toLowerCase(),
    total: Math.max(0, Math.floor(total)),
    byIndex: new Map(),
  };
}

export function isHarvesterClaimsRangeLoaded(
  cache: HarvesterClaimsCache,
  start: number,
  count: number,
): boolean {
  if (count <= 0) return true;
  for (let i = start; i < start + count; i++) {
    if (!cache.byIndex.has(i)) return false;
  }
  return true;
}

/**
 * Enrich raw claim rows with ERC20 / native display metadata.
 * Zero-timestamp rows are dropped (empty slots).
 */
export async function enrichHarvesterClaims(
  records: HarvesterClaimRecord[],
): Promise<HarvesterClaimDisplay[]> {
  const valid = records.filter((c) => c.timestamp > 0);
  if (valid.length === 0) return [];

  const uniqueTokens = [
    ...new Set(valid.map((c) => c.token.toLowerCase())),
  ] as string[];

  const metaByToken = new Map<
    string,
    { name: string; symbol: string; decimals: number }
  >();
  await Promise.all(
    uniqueTokens.map(async (key) => {
      const addr = valid.find((c) => c.token.toLowerCase() === key)?.token;
      if (!addr) return;
      try {
        const meta = await readRewardTokenMeta(addr);
        metaByToken.set(key, meta);
      } catch (err) {
        console.error("token meta for claim failed", key, err);
        metaByToken.set(key, { name: "Unknown", symbol: "???", decimals: 18 });
      }
    }),
  );

  return valid.map((claim) => {
    const meta = metaByToken.get(claim.token.toLowerCase()) ?? {
      name: "Unknown",
      symbol: "???",
      decimals: 18,
    };
    let amountBi = 0n;
    try {
      amountBi = BigInt(claim.amount);
    } catch {
      amountBi = 0n;
    }
    return {
      ...claim,
      name: meta.name,
      symbol: meta.symbol,
      decimals: meta.decimals,
      displayAmount: formatTokenAmountThousands(amountBi, meta.decimals),
    };
  });
}

/**
 * Fetch one on-chain batch (≤200), enrich, and merge into the cache by storage index.
 * Returns how many new indices were written.
 */
export async function loadHarvesterClaimsBatchIntoCache(
  wallet: Address,
  cache: HarvesterClaimsCache,
  start: number,
  count: number,
): Promise<number> {
  const safeStart = Math.max(0, Math.floor(start));
  const safeCount = Math.min(
    HARVESTER_CLAIMS_MAX_BATCH,
    Math.max(0, Math.floor(count)),
  );
  if (safeCount === 0) return 0;

  // Skip RPC when this whole window is already cached.
  if (isHarvesterClaimsRangeLoaded(cache, safeStart, safeCount)) {
    return 0;
  }

  const raw = await fetchHarvesterUserClaims(wallet, safeStart, safeCount);

  // Keep storage indices stable; empty slots are marked so we never re-fetch them.
  const nonEmpty: { storageIndex: number; claim: HarvesterClaimRecord }[] = [];
  let written = 0;
  for (let i = 0; i < raw.length; i++) {
    const claim = raw[i];
    const storageIndex = safeStart + i;
    if (!claim || claim.timestamp <= 0) {
      cache.byIndex.set(storageIndex, {
        timestamp: 0,
        token: (claim?.token ??
          "0x0000000000000000000000000000000000000000") as Address,
        amount: "0",
        name: "",
        symbol: "",
        decimals: 18,
        displayAmount: "0",
      });
      written += 1;
      continue;
    }
    nonEmpty.push({ storageIndex, claim });
  }

  const enriched = await enrichHarvesterClaims(nonEmpty.map((x) => x.claim));
  for (let j = 0; j < nonEmpty.length; j++) {
    const row = enriched[j];
    if (!row) continue;
    cache.byIndex.set(nonEmpty[j].storageIndex, row);
    written += 1;
  }
  return written;
}

/**
 * Slice a UI page (newest first) from a populated cache. Empty slots are omitted.
 */
export function sliceHarvesterClaimsPageFromCache(
  cache: HarvesterClaimsCache,
  page: number,
  pageSize: number = HARVESTER_CLAIMS_PAGE_SIZE,
): HarvesterClaimDisplay[] {
  const { start, count } = harvesterClaimsPageRange(cache.total, page, pageSize);
  if (count === 0) return [];
  const rows: HarvesterClaimDisplay[] = [];
  for (let i = start; i < start + count; i++) {
    const row = cache.byIndex.get(i);
    if (row && row.timestamp > 0) rows.push(row);
  }
  // Storage is oldest→newest; reverse for newest-first UI.
  return rows.reverse();
}

/**
 * Ensure the cache holds the on-chain batch covering `page`, then return that page.
 * Makes at most one getUserClaims RPC when the needed batch is missing;
 * subsequent pages inside the same ≤200 window are free.
 */
export async function ensureHarvesterClaimsPage(
  wallet: Address,
  cache: HarvesterClaimsCache,
  page: number,
  pageSize: number = HARVESTER_CLAIMS_PAGE_SIZE,
): Promise<{
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  claims: HarvesterClaimDisplay[];
  fetched: boolean;
}> {
  const total = cache.total;
  if (total === 0) {
    return { total: 0, page: 0, pageSize, pageCount: 0, claims: [], fetched: false };
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const { start: pageStart, count: pageLen } = harvesterClaimsPageRange(
    total,
    safePage,
    pageSize,
  );

  if (pageLen === 0) {
    return {
      total,
      page: safePage,
      pageSize,
      pageCount,
      claims: [],
      fetched: false,
    };
  }

  let fetched = false;
  if (!isHarvesterClaimsRangeLoaded(cache, pageStart, pageLen)) {
    const batch = harvesterClaimsBatchRangeForPage(
      total,
      safePage,
      pageSize,
      HARVESTER_CLAIMS_MAX_BATCH,
    );
    const written = await loadHarvesterClaimsBatchIntoCache(
      wallet,
      cache,
      batch.start,
      batch.count,
    );
    fetched = written > 0 || batch.count > 0;
  }

  return {
    total,
    page: safePage,
    pageSize,
    pageCount,
    claims: sliceHarvesterClaimsPageFromCache(cache, safePage, pageSize),
    fetched,
  };
}

export interface HarvesterDepositReadiness {
  depositAmount: bigint;
  arcadeToken: Address;
  arcadeDecimals: number;
  ethBalance: bigint;
  arcadeBalance: bigint;
  allowance: bigint;
  gasPrice: bigint;
  ethGasReserve: bigint;
  mintFee: bigint;
  requiredAmount: bigint;
  ethNeeded: bigint;
  needsApproval: boolean;
  hasEnoughArcade: boolean;
  hasEnoughGas: boolean;
  canDeposit: boolean;
  paused: boolean;
  subscriptions: Address[];
  maxStreams: number;
  nftId: bigint;
  expectedTxCount: number;
}

/**
 * Max reward streams for the designated NFT in the user's basket.
 * - No usable NFT → standard access: 1 stream, nftId 0 (Harvester getPlayer fallback).
 * - preferredNftId when still owned → that NFT's LISTS.
 * - Otherwise → highest LISTS in basket.
 */
export function resolveMaxRewardStreams(
  ownedNfts: Array<{ ID: bigint; LISTS: bigint; BLACKLIST: boolean }>,
  preferredNftId?: bigint | null,
): { maxStreams: number; nftId: bigint } {
  const usable = ownedNfts.filter((n) => !n.BLACKLIST);
  if (usable.length === 0) {
    return { maxStreams: 1, nftId: 0n };
  }

  if (preferredNftId !== undefined && preferredNftId !== null) {
    const match = usable.find((n) => n.ID === preferredNftId);
    if (match) {
      return { maxStreams: Math.max(1, Number(match.LISTS)), nftId: match.ID };
    }
  }

  const best = usable.reduce((a, b) => (b.LISTS > a.LISTS ? b : a));
  return { maxStreams: Math.max(1, Number(best.LISTS)), nftId: best.ID };
}

/**
 * Pre-flight for farm deposit: ARCADE balance, gas, allowance, PoA mintFee/requiredAmount context.
 * @param expectedTxCount 1–3 (approve / subscribe / deposit steps that need gas)
 */
export async function checkHarvesterDepositReadiness(
  wallet: Address,
  depositAmount: bigint,
  options?: {
    ownedNfts?: Array<{ ID: bigint; LISTS: bigint; BLACKLIST: boolean }>;
    preferredNftId?: bigint | null;
    /** Override expected wallet confirmations for gas reserve (default 3) */
    expectedTxCount?: number;
  },
): Promise<HarvesterDepositReadiness> {
  const harvester = getHarvesterAddress();
  if (!harvester) {
    throw new Error("Harvester contract is not deployed on this network yet");
  }
  if (depositAmount <= 0n) {
    throw new Error("Enter an amount greater than zero to farm");
  }

  const client_ = getPublicClient();
  const arcadeToken = await resolveArcadeTokenAddress();
  const { maxStreams, nftId } = resolveMaxRewardStreams(
    options?.ownedNfts ?? [],
    options?.preferredNftId,
  );

  // PoA mintFee / requiredAmount for gas guidance (same network context as mint)
  let mintFee = PROOF_OF_ACCESS_DEFAULTS.mintFee;
  let requiredAmount = PROOF_OF_ACCESS_DEFAULTS.requiredAmount;
  const poa = getProofOfAccessAddress();
  if (poa) {
    try {
      const [fee, req] = await Promise.all([
        client_.readContract({
          address: poa,
          abi: proofOfAccessABI,
          functionName: "mintFee",
        }) as Promise<bigint>,
        client_.readContract({
          address: poa,
          abi: proofOfAccessABI,
          functionName: "requiredAmount",
        }) as Promise<bigint>,
      ]);
      mintFee = fee;
      requiredAmount = req;
    } catch {
      /* keep defaults */
    }
  }

  const [ethBalance, arcadeBalance, allowance, gasPrice, arcadeDecimals, paused, subs] =
    await Promise.all([
      client_.getBalance({ address: wallet }),
      readTokenBalance(arcadeToken, wallet),
      readTokenAllowance(arcadeToken, wallet, harvester),
      client_.getGasPrice(),
      readTokenDecimals(arcadeToken),
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "paused",
      }) as Promise<boolean>,
      fetchUserSubscriptions(wallet),
    ]);

  if (paused) {
    throw new Error("Harvester is paused");
  }

  const expectedTxCount = Math.max(1, Math.min(3, options?.expectedTxCount ?? 3));
  const ethGasReserve =
    gasPrice * HARVESTER_FARM_DEFAULTS.gasUnitsPerTx * BigInt(expectedTxCount);
  // Include PoA mintFee as a conservative native buffer (user asked to read mintFee for gas checks)
  const ethNeeded = mintFee + ethGasReserve;
  const needsApproval = allowance < depositAmount;
  const hasEnoughArcade = arcadeBalance >= depositAmount;
  const hasEnoughGas = ethBalance >= ethNeeded;

  return {
    depositAmount,
    arcadeToken,
    arcadeDecimals,
    ethBalance,
    arcadeBalance,
    allowance,
    gasPrice,
    ethGasReserve,
    mintFee,
    requiredAmount,
    ethNeeded,
    needsApproval,
    hasEnoughArcade,
    hasEnoughGas,
    canDeposit: hasEnoughArcade && hasEnoughGas && !paused,
    paused,
    subscriptions: subs.tokens,
    maxStreams,
    nftId,
    expectedTxCount,
  };
}

/** Approve ARCADE for the Harvester spender. */
export const prepareArcadeApproveForHarvester = (amount: bigint, arcadeAddress?: Address) => {
  const network = getCurrentNetwork();
  const arcade = (arcadeAddress || (network.arcade_address as Address)) as Address;
  const spender = getHarvesterAddress();
  if (!spender) throw new Error("Harvester not deployed on this network");
  if (!arcade || arcade === ZERO_ADDRESS) throw new Error("ARCADE token not configured");

  const tokenContract = getContract({
    client,
    chain: getThirdwebNetwork(),
    address: getAddress(arcade),
  });

  return prepareContractCall({
    contract: tokenContract,
    method: "function approve(address spender, uint256 amount) external returns (bool)",
    params: [getAddress(spender), amount],
  });
};

/**
 * Normalize reward-token addresses for Harvester.subscribeToToken(_newTokens, _nft):
 * - Must be valid 20-byte hex addresses
 * - EIP-55 checksum via getAddress (ABI-safe address format)
 * - Case-insensitive dedupe (contract reverts: "Duplicate token in array")
 */
export function normalizeRewardTokenAddresses(tokens: readonly string[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];

  for (const raw of tokens) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed || !isAddress(trimmed)) {
      throw new Error(`Invalid reward token address: ${raw}`);
    }
    // getAddress checksums; zero address is allowed if used as a stream id
    const checksummed = getAddress(trimmed);
    const key = checksummed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(checksummed);
  }

  if (out.length === 0) {
    throw new Error("Select at least one reward stream address");
  }
  return out;
}

/**
 * Build args for Harvester.subscribeToToken(address[] _newTokens, uint256 _nft).
 *
 * @_newTokens checksummed reward-token contract addresses (from whitelist / custom)
 * @_nft minted ProofOfAccess ERC-721 tokenId (Player.ID). Use 0n when user has no NFT
 *       (standard access → getPlayer falls back to 1 stream).
 */
export function buildSubscribeToTokenArgs(
  tokens: readonly string[],
  nftTokenId: bigint | number | string,
): { newTokens: Address[]; nftTokenId: bigint } {
  const newTokens = normalizeRewardTokenAddresses(tokens);
  let nft: bigint;
  try {
    nft = typeof nftTokenId === "bigint" ? nftTokenId : BigInt(nftTokenId);
  } catch {
    throw new Error(`Invalid NFT tokenId for subscribeToToken: ${String(nftTokenId)}`);
  }
  if (nft < 0n) {
    throw new Error("NFT tokenId cannot be negative");
  }
  return { newTokens, nftTokenId: nft };
}

/**
 * Prepare Harvester.subscribeToToken from Harvester.json ABI.
 * Optional `harvesterAddress` targets live or legacy deploy (same ABI).
 */
export const prepareSubscribeToToken = (
  tokens: readonly string[],
  nftTokenId: bigint | number | string,
  harvesterAddress?: Address | null,
) => {
  const { newTokens, nftTokenId: nft } = buildSubscribeToTokenArgs(tokens, nftTokenId);
  const contract = harvesterAddress
    ? getHarvesterContractAt(harvesterAddress)
    : getHarvesterContract();

  return prepareContractCall({
    contract,
    method: harvesterSubscribeToTokenAbi,
    params: [newTokens, nft],
  });
};

/**
 * Prepare Harvester.deposit(uint256) from Harvester.json ABI.
 * Optional `harvesterAddress` targets live or legacy deploy (same ABI).
 */
export const prepareHarvesterDeposit = (
  amount: bigint,
  harvesterAddress?: Address | null,
) => {
  const contract = harvesterAddress
    ? getHarvesterContractAt(harvesterAddress)
    : getHarvesterContract();
  return prepareContractCall({
    contract,
    method: harvesterDepositAbi,
    params: [amount],
  });
};

/** Case-insensitive set equality for token address lists (order does not matter). */
export function addressesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = a.map((x) => x.toLowerCase()).sort();
  const setB = b.map((x) => x.toLowerCase()).sort();
  return setA.every((v, i) => v === setB[i]);
}

/**
 * Tokens present in `prior` but missing from `next` (case-insensitive).
 * Used when a user replaces their reward subscription list.
 */
export function addressesLeftOut(
  prior: readonly string[],
  next: readonly string[],
): Address[] {
  const nextKeys = new Set(
    (next ?? [])
      .filter((a) => isAddress(String(a ?? "").trim()))
      .map((a) => getAddress(String(a).trim()).toLowerCase()),
  );
  const out: Address[] = [];
  const seen = new Set<string>();
  for (const raw of prior ?? []) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed || !isAddress(trimmed)) continue;
    const addr = getAddress(trimmed);
    const key = addr.toLowerCase();
    if (seen.has(key) || nextKeys.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

// ============================================================================
// Pending unclaimed streams after subscription changes
// (localStorage — tokens left off the new list that still have rewardsOwed)
// ============================================================================

const PENDING_UNCLAIMED_STREAMS_KEY_PREFIX = "arcade:pendingUnclaimedStreams";

/**
 * Pending left-out streams keyed by chain + live harvester + wallet so a
 * contract upgrade never reuses the former deploy's list.
 */
function pendingUnclaimedStreamsStorageKey(
  wallet: Address,
  chainId?: number,
  harvester?: Address | null,
): string {
  const chain = chainId ?? getCurrentNetwork().chainId;
  const w = getAddress(wallet).toLowerCase();
  const h = (harvester ?? getHarvesterAddress() ?? "none").toString().toLowerCase();
  return `${PENDING_UNCLAIMED_STREAMS_KEY_PREFIX}:${chain}:${h}:${w}`;
}

/** Pre-upgrade key: arcade:pendingUnclaimedStreams:{chain}:{wallet} */
function pendingUnclaimedStreamsLegacyFormatKey(
  wallet: Address,
  chainId?: number,
): string {
  const chain = chainId ?? getCurrentNetwork().chainId;
  const w = getAddress(wallet).toLowerCase();
  return `${PENDING_UNCLAIMED_STREAMS_KEY_PREFIX}:${chain}:${w}`;
}

/**
 * Wipe client caches that may still hold data from a former Harvester deploy.
 * Call on every staking page load.
 */
export function clearFormerHarvesterClientCaches(options?: {
  wallet?: Address | null;
  chainId?: number;
}): number {
  if (typeof localStorage === "undefined") return 0;

  const chain = options?.chainId ?? getCurrentNetwork().chainId;
  const chainPrefix = `${PENDING_UNCLAIMED_STREAMS_KEY_PREFIX}:${chain}:`;
  const legacyHarvester = getLegacyHarvesterAddress()?.toLowerCase() ?? null;
  const wallet = options?.wallet
    ? getAddress(options.wallet).toLowerCase()
    : null;

  let removed = 0;
  const keysToRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(chainPrefix)) continue;

      const rest = key.slice(chainPrefix.length);
      const parts = rest.split(":");

      // Old format: {wallet} only
      if (parts.length === 1) {
        if (!wallet || parts[0].toLowerCase() === wallet) keysToRemove.push(key);
        continue;
      }

      // New format: {harvester}:{wallet}
      if (parts.length >= 2) {
        const harvesterPart = parts[0].toLowerCase();
        const walletPart = parts[parts.length - 1].toLowerCase();
        if (legacyHarvester && harvesterPart === legacyHarvester) {
          if (!wallet || walletPart === wallet) keysToRemove.push(key);
        }
      }
    }

    if (wallet) {
      const w = wallet as Address;
      keysToRemove.push(pendingUnclaimedStreamsLegacyFormatKey(w, chain));
      if (legacyHarvester) {
        keysToRemove.push(
          pendingUnclaimedStreamsStorageKey(w, chain, legacyHarvester as Address),
        );
      }
    }

    for (const key of new Set(keysToRemove)) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed += 1;
      }
    }
  } catch (err) {
    console.error("clearFormerHarvesterClientCaches failed", err);
  }

  return removed;
}

function normalizeAddressList(tokens: readonly string[]): Address[] {
  const out: Address[] = [];
  const seen = new Set<string>();
  for (const raw of tokens ?? []) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) continue;
    try {
      const addr = isZeroAddress(trimmed)
        ? ZERO_ADDRESS
        : isAddress(trimmed)
          ? getAddress(trimmed)
          : null;
      if (!addr) continue;
      const key = addr.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(addr);
    } catch {
      // skip invalid
    }
  }
  return out;
}

/**
 * Cached stream token addresses left off a prior subscription that still may
 * have unclaimed Harvester rewards. Survives reloads until claimed (or zeroed).
 */
export function getPendingUnclaimedStreamTokens(
  wallet: Address,
  chainId?: number,
  harvester?: Address | null,
): Address[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(
      pendingUnclaimedStreamsStorageKey(wallet, chainId, harvester),
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeAddressList(parsed.map(String));
  } catch {
    return [];
  }
}

export function setPendingUnclaimedStreamTokens(
  wallet: Address,
  tokens: readonly string[],
  chainId?: number,
  harvester?: Address | null,
): Address[] {
  const normalized = normalizeAddressList(tokens);
  if (typeof localStorage === "undefined") return normalized;
  try {
    const key = pendingUnclaimedStreamsStorageKey(wallet, chainId, harvester);
    if (normalized.length === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(normalized));
    }
  } catch (err) {
    console.error("setPendingUnclaimedStreamTokens failed", err);
  }
  return normalized;
}

/** Merge token addresses into the pending-unclaimed cache (deduped). */
export function addPendingUnclaimedStreamTokens(
  wallet: Address,
  tokens: readonly string[],
  chainId?: number,
): Address[] {
  const existing = getPendingUnclaimedStreamTokens(wallet, chainId);
  return setPendingUnclaimedStreamTokens(
    wallet,
    [...existing, ...normalizeAddressList(tokens)],
    chainId,
  );
}

/** Drop token addresses from the pending-unclaimed cache. */
export function removePendingUnclaimedStreamTokens(
  wallet: Address,
  tokens: readonly string[],
  chainId?: number,
): Address[] {
  const drop = new Set(normalizeAddressList(tokens).map((a) => a.toLowerCase()));
  if (drop.size === 0) {
    return getPendingUnclaimedStreamTokens(wallet, chainId);
  }
  const remaining = getPendingUnclaimedStreamTokens(wallet, chainId).filter(
    (a) => !drop.has(a.toLowerCase()),
  );
  return setPendingUnclaimedStreamTokens(wallet, remaining, chainId);
}

/**
 * True when claimRewards still holds a non-zero rewardsOwed bucket and/or a
 * non-zero ARCADESent snapshot (will finalize into rewardsOwed on next process).
 */
export async function hasPendingHarvesterRewards(
  wallet: Address,
  token: Address,
): Promise<boolean> {
  const harvester = getHarvesterAddress();
  if (!harvester) return false;
  try {
    const address = normalizePayTokenAddress(token);
    const claimTuple = (await getPublicClient().readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "claimRewards",
      args: [wallet, address],
    })) as readonly [bigint, bigint, bigint];
    const rewardsOwed = claimTuple?.[1] ?? 0n;
    const arcadeSent = claimTuple?.[2] ?? 0n;
    return rewardsOwed > 0n || arcadeSent > 0n;
  } catch (err) {
    console.error("hasPendingHarvesterRewards failed", token, err);
    return false;
  }
}

/**
 * After a subscription list change: for each token dropped from the prior list,
 * if the user still has unclaimed rewards, cache that stream address so the
 * claim UI keeps showing it until claimed.
 *
 * Prefer calling **after** a successful subscribeToToken (rewardsOwed is then
 * finalized and ARCADESent is zeroed for left-out tokens).
 */
export async function cacheLeftOutStreamsWithPendingRewards(options: {
  wallet: Address;
  priorSubscriptions: readonly string[];
  nextSubscriptions: readonly string[];
  chainId?: number;
}): Promise<Address[]> {
  const leftOut = addressesLeftOut(
    options.priorSubscriptions,
    options.nextSubscriptions,
  );
  if (leftOut.length === 0) return [];

  const withPending: Address[] = [];
  await Promise.all(
    leftOut.map(async (token) => {
      const pending = await hasPendingHarvesterRewards(options.wallet, token);
      if (pending) withPending.push(token);
    }),
  );

  if (withPending.length === 0) return [];

  addPendingUnclaimedStreamTokens(options.wallet, withPending, options.chainId);
  return withPending;
}

/**
 * Drop cached pending tokens that are active subscriptions again, or whose
 * on-chain rewardsOwed/ARCADESent buckets are already zero.
 */
export async function prunePendingUnclaimedStreamTokens(options: {
  wallet: Address;
  activeSubscriptions?: readonly string[];
  /** When set, only evaluate these cached tokens (e.g. just-claimed list). */
  onlyTokens?: readonly string[];
  chainId?: number;
}): Promise<Address[]> {
  const cached = getPendingUnclaimedStreamTokens(options.wallet, options.chainId);
  if (cached.length === 0) return [];

  const activeKeys = new Set(
    normalizeAddressList(options.activeSubscriptions ?? []).map((a) =>
      a.toLowerCase(),
    ),
  );
  const onlyKeys =
    options.onlyTokens != null
      ? new Set(normalizeAddressList(options.onlyTokens).map((a) => a.toLowerCase()))
      : null;

  const toRemove: Address[] = [];
  const toCheck: Address[] = [];

  for (const token of cached) {
    const key = token.toLowerCase();
    if (onlyKeys && !onlyKeys.has(key)) continue;
    if (activeKeys.has(key)) {
      toRemove.push(token);
      continue;
    }
    toCheck.push(token);
  }

  await Promise.all(
    toCheck.map(async (token) => {
      const stillPending = await hasPendingHarvesterRewards(options.wallet, token);
      if (!stillPending) toRemove.push(token);
    }),
  );

  if (toRemove.length) {
    removePendingUnclaimedStreamTokens(options.wallet, toRemove, options.chainId);
  }
  return getPendingUnclaimedStreamTokens(options.wallet, options.chainId);
}

/**
 * Plan wallet steps for a farm deposit.
 * - needsApproval only when on-chain allowance < deposit (extra pre-approval is fine)
 * - needsSubscribe when prior list is empty OR selected list differs from on-chain
 * - deposit always required for farmDeposit
 */
export function planFarmDepositSteps(options: {
  allowance: bigint;
  depositAmount: bigint;
  priorSubscriptions: readonly string[];
  nextSubscriptions: readonly string[];
}): {
  needsApproval: boolean;
  needsSubscribe: boolean;
  needsDeposit: boolean;
  txCount: number;
  stepLabels: string[];
  ctaLabel: string;
} {
  const needsApproval = options.allowance < options.depositAmount;
  let nextNormalized: Address[] = [];
  try {
    nextNormalized = normalizeRewardTokenAddresses(options.nextSubscriptions);
  } catch {
    nextNormalized = [];
  }
  const priorNormalized = (options.priorSubscriptions ?? [])
    .filter((a) => isAddress(String(a).trim()))
    .map((a) => getAddress(String(a).trim()));

  const needsSubscribe =
    nextNormalized.length > 0 &&
    (priorNormalized.length === 0 || !addressesEqual(priorNormalized, nextNormalized));

  const needsDeposit = options.depositAmount > 0n;
  const stepLabels: string[] = [];
  if (needsApproval) stepLabels.push("approve");
  if (needsSubscribe) stepLabels.push("subscribe");
  if (needsDeposit) stepLabels.push("deposit");

  const txCount = stepLabels.length;
  let ctaLabel = "Confirm Deposit";
  if (needsApproval && needsSubscribe) ctaLabel = "Approve, Subscribe & Deposit";
  else if (needsApproval) ctaLabel = "Approve & Deposit";
  else if (needsSubscribe) ctaLabel = "Subscribe & Deposit";
  else ctaLabel = "Deposit";

  return { needsApproval, needsSubscribe, needsDeposit, txCount, stepLabels, ctaLabel };
}

export type HarvesterFarmStep =
  | "idle"
  | "checking"
  | "approving"
  | "subscribing"
  | "depositing";

export interface FarmDepositResult {
  depositResult: unknown;
  didApprove: boolean;
  didSubscribe: boolean;
  newTokens: Address[];
  nftTokenId: bigint;
  allowanceBefore: bigint;
}

/**
 * Hook: approve ARCADE (only if allowance < amount) →
 * subscribeToToken (only if streams empty/changed) → deposit.
 *
 * Pre-approved wallets (allowance ≥ deposit) skip approve.
 * Stream list changes always trigger subscribe before deposit.
 */
export const useHarvesterFarm = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const farmDeposit = async (options: {
    wallet: Address;
    amount: bigint;
    /** Final reward stream list chosen in the subscription dialog */
    selectedTokens: Address[];
    nftId: bigint;
    readiness?: HarvesterDepositReadiness;
    beforeDeposit?: () => Promise<boolean>;
    onStep?: (step: HarvesterFarmStep, detail?: string) => void;
  }): Promise<FarmDepositResult> => {
    options.onStep?.("checking", "Checking balances, allowance, and streams…");

    const harvester = getHarvesterAddress();
    if (!harvester) throw new Error("Harvester not deployed on this network yet");

    // Fresh on-chain reads so we never skip/force steps from stale dialog state
    const arcadeToken =
      options.readiness?.arcadeToken ?? (await resolveArcadeTokenAddress());
    const [freshAllowance, freshSubs, arcadeBalance, ethBalance, gasPrice, arcadeDecimals, paused] =
      await Promise.all([
        readTokenAllowance(arcadeToken, options.wallet, harvester),
        fetchUserSubscriptions(options.wallet),
        readTokenBalance(arcadeToken, options.wallet),
        getPublicClient().getBalance({ address: options.wallet }),
        getPublicClient().getGasPrice(),
        options.readiness?.arcadeDecimals
          ? Promise.resolve(options.readiness.arcadeDecimals)
          : readTokenDecimals(arcadeToken),
        getPublicClient().readContract({
          address: harvester,
          abi: harvesterABI,
          functionName: "paused",
        }) as Promise<boolean>,
      ]);

    if (paused) throw new Error("Harvester is paused");
    if (options.amount <= 0n) throw new Error("Enter an amount greater than zero to farm");
    if (arcadeBalance < options.amount) {
      throw new Error(
        `Not enough ARCADE. Need ${formatCompactTokenAmount(options.amount, arcadeDecimals)} ARCADE to deposit.`,
      );
    }

    const { newTokens, nftTokenId } = buildSubscribeToTokenArgs(
      options.selectedTokens,
      options.nftId,
    );
    const maxStreams = options.readiness?.maxStreams ?? newTokens.length;
    if (newTokens.length > maxStreams) {
      throw new Error(`Too many reward streams. Your pass allows up to ${maxStreams}.`);
    }

    // allowance ≥ deposit → skip approve (wallets often pre-approve more than needed)
    const plan = planFarmDepositSteps({
      allowance: freshAllowance,
      depositAmount: options.amount,
      priorSubscriptions: freshSubs.tokens,
      nextSubscriptions: newTokens,
    });

    if (newTokens.length === 0) {
      throw new Error("Select at least one reward stream to subscribe to");
    }

    // Rough gas check based on actual planned txs
    const mintFee = options.readiness?.mintFee ?? PROOF_OF_ACCESS_DEFAULTS.mintFee;
    const ethGasReserve =
      gasPrice * HARVESTER_FARM_DEFAULTS.gasUnitsPerTx * BigInt(Math.max(1, plan.txCount));
    const ethNeeded = mintFee + ethGasReserve;
    if (ethBalance < ethNeeded) {
      throw new Error(
        `Not enough ${getCurrentNetwork().symbol} for gas (${plan.stepLabels.join(" → ")}). Keep a little extra.`,
      );
    }

    // 1) Approve only when current allowance is below the deposit amount
    let didApprove = false;
    if (plan.needsApproval) {
      options.onStep?.(
        "approving",
        `Approve ${formatCompactTokenAmount(options.amount, arcadeDecimals)} ARCADE for Harvester…`,
      );
      const approveTx = prepareArcadeApproveForHarvester(options.amount, arcadeToken);
      const approveResult = await sendTx(approveTx);
      await waitForReceipt({
        client,
        chain: getThirdwebNetwork(),
        transactionHash: approveResult.transactionHash,
      });
      didApprove = true;
    } else {
      options.onStep?.(
        "checking",
        `Pre-approved ${formatCompactTokenAmount(freshAllowance, arcadeDecimals)} ARCADE — skipping approve…`,
      );
    }

    // 2) Subscribe whenever list is new or differs from on-chain prior list
    let didSubscribe = false;
    if (plan.needsSubscribe) {
      options.onStep?.(
        "subscribing",
        `Confirm ${newTokens.length} reward stream${newTokens.length === 1 ? "" : "s"} (NFT #${nftTokenId.toString()})…`,
      );
      const subTx = prepareSubscribeToToken(newTokens, nftTokenId);
      const subResult = await sendTx(subTx);
      await waitForReceipt({
        client,
        chain: getThirdwebNetwork(),
        transactionHash: subResult.transactionHash,
      });
      didSubscribe = true;

      // Left-out streams may still hold finalized rewardsOwed — keep them claimable
      try {
        const retained = await cacheLeftOutStreamsWithPendingRewards({
          wallet: options.wallet,
          priorSubscriptions: freshSubs.tokens,
          nextSubscriptions: newTokens,
        });
        if (retained.length > 0) {
          options.onStep?.(
            "subscribing",
            `Kept ${retained.length} previous stream${retained.length === 1 ? "" : "s"} with unclaimed rewards in claim list…`,
          );
        }
      } catch (err) {
        console.error("cacheLeftOutStreamsWithPendingRewards (farm) failed", err);
      }
    }

    // 3) Deposit always
    if (options.beforeDeposit && !(await options.beforeDeposit())) {
      throw new Error("Deposit paused because reward streams still need syncing.");
    }

    options.onStep?.(
      "depositing",
      `Deposit ${formatCompactTokenAmount(options.amount, arcadeDecimals)} ARCADE…`,
    );
    const depositTx = prepareHarvesterDeposit(options.amount);
    const depositResult = await sendTx(depositTx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: depositResult.transactionHash,
    });

    options.onStep?.("idle", "Deposit complete");
    return {
      depositResult,
      didApprove,
      didSubscribe,
      newTokens,
      nftTokenId,
      allowanceBefore: freshAllowance,
    };
  };

  /**
   * Update reward streams only (subscribeToToken) — no deposit.
   * Used by the animated subscription button outside of farm flow.
   * Caches any left-out streams that still have unclaimed rewards so the claim
   * list keeps them until the user harvests.
   */
  const updateSubscriptions = async (options: {
    tokens: Address[];
    nftId: bigint;
    maxStreams: number;
    /** Connected wallet — used to cache left-out unclaimed streams */
    wallet?: Address;
    onStep?: (step: HarvesterFarmStep, detail?: string) => void;
  }) => {
    if (options.tokens.length === 0) {
      throw new Error("Select at least one reward stream");
    }
    if (options.tokens.length > options.maxStreams) {
      throw new Error(`Max ${options.maxStreams} reward stream(s) for your pass`);
    }
    if (!getHarvesterAddress()) {
      throw new Error("Harvester not deployed on this network yet");
    }

    const { newTokens, nftTokenId } = buildSubscribeToTokenArgs(options.tokens, options.nftId);
    if (newTokens.length > options.maxStreams) {
      throw new Error(`Max ${options.maxStreams} reward stream(s) for your pass`);
    }

    // Snapshot prior list before replace so we can retain unclaimed left-outs
    let priorTokens: Address[] = [];
    if (options.wallet) {
      try {
        const prior = await fetchUserSubscriptions(options.wallet);
        priorTokens = prior.tokens;
      } catch (err) {
        console.error("updateSubscriptions: prior subscriptions read failed", err);
      }
    }

    options.onStep?.(
      "subscribing",
      `Confirm subscription list (NFT tokenId ${nftTokenId.toString()})…`,
    );
    const subTx = prepareSubscribeToToken(newTokens, nftTokenId);
    const subResult = await sendTx(subTx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: subResult.transactionHash,
    });

    if (options.wallet && priorTokens.length > 0) {
      try {
        const retained = await cacheLeftOutStreamsWithPendingRewards({
          wallet: options.wallet,
          priorSubscriptions: priorTokens,
          nextSubscriptions: newTokens,
        });
        if (retained.length > 0) {
          options.onStep?.(
            "idle",
            `Subscriptions updated · ${retained.length} previous stream${retained.length === 1 ? "" : "s"} kept for claim`,
          );
          return subResult;
        }
      } catch (err) {
        console.error("cacheLeftOutStreamsWithPendingRewards (manage) failed", err);
      }
    }

    options.onStep?.("idle", "Subscriptions updated");
    return subResult;
  };

  /**
   * Full unstake via Harvester.withdraw() — only after entryMap + timeLock.
   * Pass `harvester` to target a legacy deploy (same Harvester.json ABI).
   */
  const farmWithdraw = async (options?: {
    /** Explicit Harvester address (defaults to live network.harvester) */
    harvester?: Address | null;
    onStep?: (step: "checking" | "withdrawing" | "idle", detail?: string) => void;
  }) => {
    const target = options?.harvester ?? getHarvesterAddress();
    if (!target) {
      throw new Error("Harvester not deployed on this network yet");
    }
    options?.onStep?.("checking", "Checking withdraw timelock…");
    options?.onStep?.("withdrawing", "Confirm withdraw in your wallet…");
    const tx = prepareHarvesterWithdraw(target);
    const result = await sendTx(tx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });
    options?.onStep?.("idle", "Withdraw complete");
    return result;
  };

  /**
   * Claim rewards for selected pay-token addresses via Harvester.claim(address[]).
   * Pass `harvester` to target a legacy deploy (same Harvester.json ABI).
   * Live-farm pending-stream cache is not pruned when claiming on legacy.
   */
  const farmClaim = async (options: {
    tokens: Address[];
    wallet?: Address;
    /** Explicit Harvester address (defaults to live network.harvester) */
    harvester?: Address | null;
    onStep?: (step: "checking" | "claiming" | "idle", detail?: string) => void;
  }) => {
    const target = options.harvester ?? getHarvesterAddress();
    if (!target) {
      throw new Error("Harvester not deployed on this network yet");
    }
    const tokens = normalizeRewardTokenAddresses(options.tokens);
    if (tokens.length === 0) {
      throw new Error("Select at least one reward stream to claim");
    }
    options.onStep?.(
      "claiming",
      `Claiming ${tokens.length} reward stream${tokens.length === 1 ? "" : "s"}…`,
    );
    const tx = prepareHarvesterClaim(tokens, target);
    const result = await sendTx(tx);
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    const legacy = getLegacyHarvesterAddress();
    const isLegacyTarget =
      !!options.harvester &&
      !!legacy &&
      options.harvester.toLowerCase() === legacy.toLowerCase();

    if (options.wallet && !isLegacyTarget) {
      try {
        await prunePendingUnclaimedStreamTokens({
          wallet: options.wallet,
          onlyTokens: tokens,
        });
      } catch (err) {
        console.error("prunePendingUnclaimedStreamTokens after claim failed", err);
      }
    }

    options.onStep?.("idle", "Claim complete");
    return result;
  };

  return { farmDeposit, updateSubscriptions, farmWithdraw, farmClaim, isPending, error };
};

// ============================================================================
// Harvester withdraw (timelock) + claim (reward streams)
// ============================================================================

/** Matches Harvester.divisor = 100 ether — rewardsOwed is scaled by this before payout. */
export const HARVESTER_REWARD_DIVISOR = 100n * 10n ** 18n;

export interface HarvesterWithdrawTimelock {
  entryTimestamp: number;
  timeLockSeconds: number;
  unlockAt: number;
  canWithdraw: boolean;
  stakedBalance: bigint;
  remainingSeconds: number;
  deployed: boolean;
}

/**
 * Read entryMap + timeLock for withdraw UI countdown.
 * Unlock when block.timestamp > entryMap + timeLock (contract: onlyAfterTimelock).
 * Pass `harvesterOverride` to inspect a legacy deploy.
 */
export async function fetchWithdrawTimelock(
  wallet: Address,
  harvesterOverride?: Address | null,
): Promise<HarvesterWithdrawTimelock> {
  const harvester = harvesterOverride ?? getHarvesterAddress();
  const empty: HarvesterWithdrawTimelock = {
    entryTimestamp: 0,
    timeLockSeconds: 0,
    unlockAt: 0,
    canWithdraw: false,
    stakedBalance: 0n,
    remainingSeconds: 0,
    deployed: false,
  };
  if (!harvester) return empty;

  const client_ = getPublicClient();
  try {
    const [entryMap, timeLock, stakedBalance] = await Promise.all([
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "entryMap",
        args: [wallet],
      }) as Promise<bigint>,
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "timeLock",
      }) as Promise<bigint>,
      client_.readContract({
        address: harvester,
        abi: harvesterABI,
        functionName: "balances",
        args: [wallet],
      }) as Promise<bigint>,
    ]);

    const entryTimestamp = Number(entryMap ?? 0n);
    const timeLockSeconds = Number(timeLock ?? 0n);
    // Contract onlyAfterTimelock: entryMap + timeLock < block.timestamp (strict)
    const lockedUntil =
      entryTimestamp > 0 && (stakedBalance ?? 0n) > 0n
        ? entryTimestamp + timeLockSeconds
        : 0;
    const now = Math.floor(Date.now() / 1000);
    const canWithdraw =
      (stakedBalance ?? 0n) > 0n && entryTimestamp > 0 && now > lockedUntil;
    // +1 so remaining hits 0 only when now is strictly past lockedUntil
    const remainingSeconds =
      lockedUntil > 0 && now <= lockedUntil ? lockedUntil - now + 1 : 0;

    return {
      entryTimestamp,
      timeLockSeconds,
      unlockAt: lockedUntil,
      canWithdraw,
      stakedBalance: stakedBalance ?? 0n,
      remainingSeconds,
      deployed: true,
    };
  } catch (err) {
    console.error("fetchWithdrawTimelock failed", err);
    return empty;
  }
}

export interface ClaimableRewardStream {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  /** On-chain claimRewards.rewardsOwed bucket (pre-sync, scaled). */
  rewardsOwedRaw: bigint;
  /** Simulated rewardsOwed after setTokenEra + era accrual at `estimatedAt`. */
  estimatedRewardsOwedRaw: bigint;
  /** Pending accrual added on top of the stored bucket (scaled). */
  pendingAccruedRaw: bigint;
  /**
   * Estimated token smallest units the user would receive if they claimed now
   * (after developTax, / divisor) — mirrors Harvester.claim payout.
   */
  claimableAmount: bigint;
  /** Full-precision display (token decimals, last wei/cent). */
  claimableDisplay: string;
  lastClaimAt: number;
  claimUnlockAt: number;
  isClaimLocked: boolean;
  /** User still has active ARCADE weight on this stream */
  arcadeSent: bigint;
  eraAtBlock: bigint;
  onChainCurrentERA: bigint;
  simulatedCurrentERA: bigint;
  rewardPerStamp: bigint;
  /** Unix seconds used for this estimate (present-day timestamp). */
  estimatedAt: number;
  /** True when era loop ran (requires active global stake). */
  eraMathApplied: boolean;
  /** Eras walked in this estimate [eraAtBlock, simulatedCurrentERA). */
  erasProcessed: number;
  /**
   * True when this stream is no longer in the live subscription list but was
   * retained because claimRewards still has unclaimed rewardsOwed.
   */
  isRetainedUnsubscribed?: boolean;
}

export interface UserRewardStreamsSnapshot {
  wallet: Address;
  /** Harvester.balances[user] — gate for era math */
  stakedBalance: bigint;
  hasActiveStake: boolean;
  /** Live on-chain getUserSubscriptions list (active streams only). */
  subscriptions: Address[];
  /**
   * Cached left-out stream addresses still showing in the claim list until
   * their rewardsOwed is claimed (or cleared on-chain).
   */
  retainedUnsubscribed: Address[];
  globals: HarvesterRewardGlobals;
  streams: ClaimableRewardStream[];
  estimatedAt: number;
  /** Fresh on-chain read always; era multicalls only when hasActiveStake */
  computationMode: "full_era_math" | "idle_no_stake" | "no_streams";
}

/**
 * Full ERC20 meta including decimals.
 * Zero-address (native stream): always 18 decimals; name from network whitelist;
 * symbol = network native symbol.
 */
export async function readRewardTokenMeta(
  tokenAddress: Address,
): Promise<{ name: string; symbol: string; decimals: number }> {
  // Harvester treats address(0) as native coin — always 18 decimals (wei)
  if (isZeroAddress(tokenAddress) || !tokenAddress) {
    const network = getCurrentNetwork();
    const whitelistName = getTokenName(network.chainId, ZERO_ADDRESS);
    return {
      name: whitelistName || `Native ${network.symbol}`,
      symbol: network.symbol || "ETH",
      decimals: 18,
    };
  }
  const [name, symbol, decimals] = await Promise.all([
    readTokenName(tokenAddress),
    readTokenSymbol(tokenAddress),
    readTokenDecimals(tokenAddress),
  ]);
  return { name, symbol, decimals: Number.isFinite(decimals) ? decimals : 18 };
}

/**
 * Format claimable / reward amounts for UI.
 * Delegates to formatTokenAmountThousands (thousands separators + smart decimals).
 */
export function formatExactTokenAmount(amount: bigint, decimals: number): string {
  return formatTokenAmountThousands(amount, decimals);
}

/**
 * Mirror Harvester.setTokenEra at `now`:
 *   totalDaysElapsed = (now - startTime) / eralength
 *   if totalDaysElapsed > currentERA → currentERA becomes totalDaysElapsed
 * Completed eras [oldERA, newERA) would be sealed with rewardPerStamp.
 */
export function simulateSetTokenEra(params: {
  isAdded: boolean;
  startTime: bigint;
  currentERA: bigint;
  eralength: bigint;
  nowSeconds: bigint;
}): { endPeriod: bigint; erasAdvanced: bigint } {
  if (!params.isAdded || params.eralength <= 0n) {
    return { endPeriod: params.currentERA, erasAdvanced: 0n };
  }
  if (params.nowSeconds < params.startTime) {
    return { endPeriod: params.currentERA, erasAdvanced: 0n };
  }
  const totalDaysElapsed = (params.nowSeconds - params.startTime) / params.eralength;
  if (totalDaysElapsed > params.currentERA) {
    return {
      endPeriod: totalDaysElapsed,
      erasAdvanced: totalDaysElapsed - params.currentERA,
    };
  }
  return { endPeriod: params.currentERA, erasAdvanced: 0n };
}

/**
 * Mirror Harvester._processSingleTokenClaim accrual loop (without writing state):
 *   for e in [eraAtBlock, endPeriod): rewardsAccrued += eraRate(e) * ARCADESent
 * Historical e < onChainCurrentERA → stored eraRewards[e]
 * Future/unfinalized e ≥ onChainCurrentERA → current rewardPerStamp (setTokenEra seal)
 */
export function simulateProcessRewardsOwed(params: {
  storedRewardsOwed: bigint;
  arcadeSent: bigint;
  eraAtBlock: bigint;
  onChainCurrentERA: bigint;
  endPeriod: bigint;
  rewardPerStamp: bigint;
  /** era index → stored eraRewards rate (only needed for e < onChainCurrentERA) */
  historicalEraRate: (era: bigint) => bigint;
}): { estimatedRewardsOwed: bigint; pendingAccrued: bigint; erasProcessed: number } {
  if (params.arcadeSent === 0n || params.eraAtBlock >= params.endPeriod) {
    return {
      estimatedRewardsOwed: params.storedRewardsOwed,
      pendingAccrued: 0n,
      erasProcessed: 0,
    };
  }

  let pendingAccrued = 0n;
  let erasProcessed = 0;
  for (let e = params.eraAtBlock; e < params.endPeriod; e++) {
    const rate =
      e < params.onChainCurrentERA
        ? params.historicalEraRate(e)
        : params.rewardPerStamp;
    pendingAccrued += rate * params.arcadeSent;
    erasProcessed += 1;
  }

  return {
    estimatedRewardsOwed: params.storedRewardsOwed + pendingAccrued,
    pendingAccrued,
    erasProcessed,
  };
}

/**
 * Mirror Harvester.claim payout math after rewardsOwed is synced:
 *   developed = (userRewards / 100) * developTax
 *   rewards   = (userRewards - developed) / divisor
 */
export function simulateClaimPayout(
  rewardsOwedScaled: bigint,
  developTax: bigint,
): bigint {
  if (rewardsOwedScaled <= 0n) return 0n;
  const tax = developTax < 0n ? 0n : developTax;
  const developed = (rewardsOwedScaled / 100n) * tax;
  const estimated = rewardsOwedScaled - developed;
  if (estimated <= 0n) return 0n;
  return estimated / HARVESTER_REWARD_DIVISOR;
}

function normalizePayTokenAddress(raw: string): Address {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed || isZeroAddress(trimmed as Address)) return ZERO_ADDRESS;
  if (!isAddress(trimmed)) {
    throw new Error(`Invalid reward token address: ${raw}`);
  }
  return getAddress(trimmed) as Address;
}

/** Batch-read eraRewards[token][era] for a contiguous range (multicall, always fresh). */
async function fetchHistoricalEraRewards(
  harvester: Address,
  token: Address,
  fromEra: bigint,
  toEraExclusive: bigint,
): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();
  if (fromEra >= toEraExclusive) return map;

  const client_ = getPublicClient();
  const eras: bigint[] = [];
  for (let e = fromEra; e < toEraExclusive; e++) {
    eras.push(e);
  }

  // Chunk to keep multicall payloads reasonable
  const CHUNK = 80;
  for (let i = 0; i < eras.length; i += CHUNK) {
    const slice = eras.slice(i, i + CHUNK);
    try {
      const results = await client_.multicall({
        contracts: slice.map((era) => ({
          address: harvester,
          abi: harvesterABI,
          functionName: "eraRewards" as const,
          args: [token, era] as const,
        })),
        allowFailure: true,
      });
      results.forEach((res, idx) => {
        const era = slice[idx];
        const key = era.toString();
        if (res.status === "success" && res.result != null) {
          map.set(key, res.result as bigint);
        } else {
          map.set(key, 0n);
        }
      });
    } catch (err) {
      console.error("fetchHistoricalEraRewards multicall failed", err);
      // Fallback sequential
      await Promise.all(
        slice.map(async (era) => {
          try {
            const rate = (await client_.readContract({
              address: harvester,
              abi: harvesterABI,
              functionName: "eraRewards",
              args: [token, era],
            })) as bigint;
            map.set(era.toString(), rate ?? 0n);
          } catch {
            map.set(era.toString(), 0n);
          }
        }),
      );
    }
  }

  return map;
}

export interface HarvesterRewardGlobals {
  eralength: bigint;
  developTax: bigint;
  timeLock: bigint;
  duration: bigint;
  paused: boolean;
}

/** Always re-read mutable protocol params (owner can change tax, timeLock, etc.). */
export async function fetchHarvesterRewardGlobals(
  harvester: Address,
): Promise<HarvesterRewardGlobals> {
  const client_ = getPublicClient();
  const [eralength, developTax, timeLock, duration, paused] = await Promise.all([
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "eralength",
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "developTax",
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "timeLock",
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "Duration",
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "paused",
    }) as Promise<boolean>,
  ]);
  return {
    eralength: eralength ?? 86400n,
    developTax: developTax ?? 0n,
    timeLock: timeLock ?? 86400n,
    duration: duration ?? 604800n,
    paused: Boolean(paused),
  };
}

type StreamOnChainBundle = {
  address: Address;
  eraAtBlock: bigint;
  storedRewardsOwed: bigint;
  arcadeSent: bigint;
  lastClaimAt: bigint;
  totalRewards: bigint;
  allRewardsOwed: bigint;
  rewardPerStamp: bigint;
  onChainCurrentERA: bigint;
  tokenStartTime: bigint;
  isAdded: boolean;
  tokenTotalStaked: bigint;
  meta: { name: string; symbol: string; decimals: number };
};

/**
 * Fresh multicall-style read of everything needed for one stream estimate.
 * No caching — safe to call on every staking page load.
 */
async function readStreamOnChainBundle(
  harvester: Address,
  wallet: Address,
  token: Address,
): Promise<StreamOnChainBundle> {
  const address = normalizePayTokenAddress(token);
  const client_ = getPublicClient();

  const [claimTuple, lastClaim, ecoTuple, tokenTotalStaked, meta] = await Promise.all([
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "claimRewards",
      args: [wallet, address],
    }) as Promise<readonly [bigint, bigint, bigint]>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "UserTokenClaims",
      args: [wallet, address],
    }) as Promise<bigint>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "tokenEconomics",
      args: [address],
    }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint, boolean]>,
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "tokenTotalStaked",
      args: [address],
    }) as Promise<bigint>,
    readRewardTokenMeta(address),
  ]);

  return {
    address,
    eraAtBlock: claimTuple?.[0] ?? 0n,
    storedRewardsOwed: claimTuple?.[1] ?? 0n,
    arcadeSent: claimTuple?.[2] ?? 0n,
    lastClaimAt: lastClaim ?? 0n,
    totalRewards: ecoTuple?.[0] ?? 0n,
    allRewardsOwed: ecoTuple?.[1] ?? 0n,
    rewardPerStamp: ecoTuple?.[2] ?? 0n,
    onChainCurrentERA: ecoTuple?.[3] ?? 0n,
    tokenStartTime: ecoTuple?.[4] ?? 0n,
    isAdded: Boolean(ecoTuple?.[5]),
    tokenTotalStaked: tokenTotalStaked ?? 0n,
    meta,
  };
}

/**
 * Build a ClaimableRewardStream from a fresh on-chain bundle.
 *
 * @param applyEraMath When false (no active stake), skip eraRewards reads and
 *   only convert the stored rewardsOwed bucket — no staking-time accrual.
 *   When true, walk every stored/pending ERA to the last cent.
 */
function computeStreamEstimateFromBundle(params: {
  bundle: StreamOnChainBundle;
  globals: HarvesterRewardGlobals;
  nowSec: number;
  applyEraMath: boolean;
  historicalEraRate?: (era: bigint) => bigint;
  endPeriod?: bigint;
}): ClaimableRewardStream {
  const { bundle, globals, nowSec, applyEraMath } = params;
  const decimals = isZeroAddress(bundle.address) ? 18 : bundle.meta.decimals;

  let estimatedRewardsOwed = bundle.storedRewardsOwed;
  let pendingAccrued = 0n;
  let erasProcessed = 0;
  let endPeriod = bundle.onChainCurrentERA;
  let eraMathApplied = false;

  if (applyEraMath) {
    endPeriod =
      params.endPeriod ??
      simulateSetTokenEra({
        isAdded: bundle.isAdded,
        startTime: bundle.tokenStartTime,
        currentERA: bundle.onChainCurrentERA,
        eralength: globals.eralength,
        nowSeconds: BigInt(nowSec),
      }).endPeriod;

    const rateFn =
      params.historicalEraRate ??
      ((_era: bigint) => 0n);

    const sim = simulateProcessRewardsOwed({
      storedRewardsOwed: bundle.storedRewardsOwed,
      // Accrual weight is the stream snapshot; global stake is the gate only
      arcadeSent: bundle.arcadeSent,
      eraAtBlock: bundle.eraAtBlock,
      onChainCurrentERA: bundle.onChainCurrentERA,
      endPeriod,
      rewardPerStamp: bundle.rewardPerStamp,
      historicalEraRate: rateFn,
    });
    estimatedRewardsOwed = sim.estimatedRewardsOwed;
    pendingAccrued = sim.pendingAccrued;
    erasProcessed = sim.erasProcessed;
    eraMathApplied = true;
  }

  const claimableAmount = simulateClaimPayout(
    estimatedRewardsOwed,
    globals.developTax,
  );

  const lastClaimAt = Number(bundle.lastClaimAt);
  const timeLockSeconds = Number(globals.timeLock);
  const claimUnlockAt = lastClaimAt > 0 ? lastClaimAt + timeLockSeconds : 0;
  const isClaimLocked = claimUnlockAt > 0 && nowSec < claimUnlockAt;

  return {
    address: bundle.address,
    name: bundle.meta.name,
    symbol: bundle.meta.symbol,
    decimals,
    rewardsOwedRaw: bundle.storedRewardsOwed,
    estimatedRewardsOwedRaw: estimatedRewardsOwed,
    pendingAccruedRaw: pendingAccrued,
    claimableAmount,
    claimableDisplay: formatExactTokenAmount(claimableAmount, decimals),
    lastClaimAt,
    claimUnlockAt,
    isClaimLocked,
    arcadeSent: bundle.arcadeSent,
    eraAtBlock: bundle.eraAtBlock,
    onChainCurrentERA: bundle.onChainCurrentERA,
    simulatedCurrentERA: endPeriod,
    rewardPerStamp: bundle.rewardPerStamp,
    estimatedAt: nowSec,
    eraMathApplied,
    erasProcessed,
  };
}

/**
 * Master load path for the staking page.
 *
 * 1. Always re-read balances, subscriptions, and mutable globals (tax, timeLock, …).
 * 2. Merge live subscriptions with any cached left-out tokens that still have
 *    unclaimed rewards (subscription change retention).
 * 3. Always re-read each stream’s claimRewards + tokenEconomics + meta.
 * 4. Run stored-era accrual math ONLY when balances[user] > 0 (active stake).
 * 5. Display amounts to the last token unit (full decimals).
 * 6. Prune the pending-unclaimed cache when rewards are gone or re-subscribed.
 *
 * Options:
 * - `harvester`: read a specific deploy (e.g. legacy) instead of live network.harvester
 * - `skipPendingCache`: do not merge/prune localStorage left-out streams (use for legacy)
 */
export async function loadUserRewardStreamsSnapshot(
  wallet: Address,
  options?: {
    harvester?: Address | null;
    skipPendingCache?: boolean;
  },
): Promise<UserRewardStreamsSnapshot> {
  const harvester = options?.harvester ?? getHarvesterAddress();
  const skipPendingCache = options?.skipPendingCache === true;
  const nowSec = Math.floor(Date.now() / 1000);
  const emptyGlobals: HarvesterRewardGlobals = {
    eralength: 86400n,
    developTax: 0n,
    timeLock: 86400n,
    duration: 604800n,
    paused: false,
  };

  if (!harvester) {
    return {
      wallet,
      stakedBalance: 0n,
      hasActiveStake: false,
      subscriptions: [],
      retainedUnsubscribed: [],
      globals: emptyGlobals,
      streams: [],
      estimatedAt: nowSec,
      computationMode: "no_streams",
    };
  }

  const client_ = getPublicClient();

  // --- Fresh protocol + user stake (params can change over time) ---
  const [stakedBalance, subs, globals] = await Promise.all([
    client_.readContract({
      address: harvester,
      abi: harvesterABI,
      functionName: "balances",
      args: [wallet],
    }) as Promise<bigint>,
    fetchUserSubscriptions(wallet, harvester),
    fetchHarvesterRewardGlobals(harvester).catch((err) => {
      console.error("fetchHarvesterRewardGlobals failed", err);
      return emptyGlobals;
    }),
  ]);

  const activeTokens = normalizeAddressList(subs.tokens);
  const activeKeySet = new Set(activeTokens.map((t) => t.toLowerCase()));

  // Live farm only — never touch pending cache when reading a legacy deploy
  const retainedAfterPrune = skipPendingCache
    ? ([] as Address[])
    : await prunePendingUnclaimedStreamTokens({
        wallet,
        activeSubscriptions: activeTokens,
      });
  const retainedUnsubscribed = retainedAfterPrune.filter(
    (t) => !activeKeySet.has(t.toLowerCase()),
  );
  const retainedKeySet = new Set(retainedUnsubscribed.map((t) => t.toLowerCase()));

  // Claim list = live subscriptions ∪ retained left-out streams with pending rewards
  const tokens: Address[] = [...activeTokens];
  for (const t of retainedUnsubscribed) {
    if (!activeKeySet.has(t.toLowerCase())) tokens.push(t);
  }

  const hasActiveStake = (stakedBalance ?? 0n) > 0n;

  if (!tokens.length) {
    return {
      wallet,
      stakedBalance: stakedBalance ?? 0n,
      hasActiveStake,
      subscriptions: activeTokens,
      retainedUnsubscribed: [],
      globals,
      streams: [],
      estimatedAt: nowSec,
      computationMode: "no_streams",
    };
  }

  // --- Fresh per-stream contract state ---
  const bundles = await Promise.all(
    tokens.map(async (t) => {
      try {
        return await readStreamOnChainBundle(harvester, wallet, t);
      } catch (err) {
        console.error("readStreamOnChainBundle failed", t, err);
        return null;
      }
    }),
  );

  const markRetained = (stream: ClaimableRewardStream): ClaimableRewardStream => ({
    ...stream,
    isRetainedUnsubscribed: retainedKeySet.has(stream.address.toLowerCase()),
  });

  // --- Era math only with active stake (staking-time accrual) ---
  // Retained unsubscribed streams usually have ARCADESent=0; stored rewardsOwed still shows.
  const streams: ClaimableRewardStream[] = [];

  if (!hasActiveStake) {
    // Still list streams + stored bucket / meta; do not walk eras
    for (const bundle of bundles) {
      if (!bundle) continue;
      streams.push(
        markRetained(
          computeStreamEstimateFromBundle({
            bundle,
            globals,
            nowSec,
            applyEraMath: false,
          }),
        ),
      );
    }
    return {
      wallet,
      stakedBalance: stakedBalance ?? 0n,
      hasActiveStake: false,
      subscriptions: activeTokens,
      retainedUnsubscribed,
      globals,
      streams,
      estimatedAt: nowSec,
      computationMode: "idle_no_stake",
    };
  }

  for (const bundle of bundles) {
    if (!bundle) continue;
    try {
      const { endPeriod } = simulateSetTokenEra({
        isAdded: bundle.isAdded,
        startTime: bundle.tokenStartTime,
        currentERA: bundle.onChainCurrentERA,
        eralength: globals.eralength,
        nowSeconds: BigInt(nowSec),
      });

      // Every sealed on-chain ERA the user has not yet claimed through
      const histFrom = bundle.eraAtBlock;
      const histTo =
        bundle.eraAtBlock < bundle.onChainCurrentERA && bundle.eraAtBlock < endPeriod
          ? bundle.onChainCurrentERA < endPeriod
            ? bundle.onChainCurrentERA
            : endPeriod
          : bundle.eraAtBlock;

      const historical = await fetchHistoricalEraRewards(
        harvester,
        bundle.address,
        histFrom,
        histTo,
      );

      streams.push(
        markRetained(
          computeStreamEstimateFromBundle({
            bundle,
            globals,
            nowSec,
            applyEraMath: true,
            endPeriod,
            historicalEraRate: (era) => historical.get(era.toString()) ?? 0n,
          }),
        ),
      );
    } catch (err) {
      console.error("era math failed for stream", bundle.address, err);
      streams.push(
        markRetained(
          computeStreamEstimateFromBundle({
            bundle,
            globals,
            nowSec,
            applyEraMath: false,
          }),
        ),
      );
    }
  }

  // Final safety prune: retained rows with zero claimable + zero stored bucket
  const drainedRetained = streams
    .filter(
      (s) =>
        s.isRetainedUnsubscribed &&
        s.claimableAmount <= 0n &&
        s.rewardsOwedRaw <= 0n &&
        s.arcadeSent <= 0n,
    )
    .map((s) => s.address);
  if (drainedRetained.length) {
    removePendingUnclaimedStreamTokens(wallet, drainedRetained);
  }
  const finalStreams = streams.filter(
    (s) =>
      !s.isRetainedUnsubscribed ||
      s.claimableAmount > 0n ||
      s.rewardsOwedRaw > 0n ||
      s.arcadeSent > 0n,
  );
  const finalRetained = finalStreams
    .filter((s) => s.isRetainedUnsubscribed)
    .map((s) => s.address);

  return {
    wallet,
    stakedBalance: stakedBalance ?? 0n,
    hasActiveStake: true,
    subscriptions: activeTokens,
    retainedUnsubscribed: finalRetained,
    globals,
    streams: finalStreams,
    estimatedAt: nowSec,
    computationMode: "full_era_math",
  };
}

/**
 * Prepare Harvester.withdraw() from Harvester.json ABI (empty inputs).
 * Pass `harvesterAddress` for legacy deploy; same ABI as live.
 */
export const prepareHarvesterWithdraw = (harvesterAddress?: Address | null) => {
  const contract = harvesterAddress
    ? getHarvesterContractAt(harvesterAddress)
    : getHarvesterContract();
  return prepareContractCall({
    contract,
    method: harvesterWithdrawAbi,
    params: [],
  });
};

/**
 * Prepare Harvester.claim(address[]) from Harvester.json ABI.
 * Pass `harvesterAddress` for legacy deploy; same ABI as live.
 */
export const prepareHarvesterClaim = (
  payTokens: readonly string[],
  harvesterAddress?: Address | null,
) => {
  const tokens = normalizeRewardTokenAddresses(payTokens);
  const contract = harvesterAddress
    ? getHarvesterContractAt(harvesterAddress)
    : getHarvesterContract();
  return prepareContractCall({
    contract,
    method: harvesterClaimAbi,
    params: [tokens],
  });
};

export const prepareHarvesterSyncClaim = (
  payToken: string,
  maxEras: bigint | number,
  harvesterAddress?: Address | null,
) => {
  const token = getAddress(payToken);
  const contract = harvesterAddress
    ? getHarvesterContractAt(harvesterAddress)
    : getHarvesterContract();
  return prepareContractCall({
    contract,
    method: harvesterSyncMyClaimAbi,
    params: [token, BigInt(maxEras)],
  });
};

export interface LegacyHarvesterMigrationStatus {
  harvester: Address;
  streams: ClaimableRewardStream[];
  pendingClaimStreams: ClaimableRewardStream[];
  hasPendingClaims: boolean;
  /** True when pending rewards remain on the legacy deploy (claim-only gate) */
  isBlocked: boolean;
  isCleared: boolean;
}

/**
 * Migration check against the legacy Harvester: claimable reward streams only.
 * Gate UI should only render after this resolves with isBlocked === true
 * (never show a loading flash for wallets with nothing to claim).
 * Returns null when no legacy address is configured.
 */
export async function loadLegacyHarvesterMigrationStatus(
  wallet: Address,
): Promise<LegacyHarvesterMigrationStatus | null> {
  const harvester = getLegacyHarvesterAddress();
  if (!harvester) return null;

  try {
    const snapshot = await loadUserRewardStreamsSnapshot(wallet, {
      harvester,
      skipPendingCache: true,
    });

    const pendingClaimStreams = snapshot.streams.filter(
      (s) => s.claimableAmount > 0n || s.rewardsOwedRaw > 0n || s.estimatedRewardsOwedRaw > 0n,
    );
    const hasPendingClaims = pendingClaimStreams.length > 0;
    const isBlocked = hasPendingClaims;

    return {
      harvester,
      streams: snapshot.streams,
      pendingClaimStreams,
      hasPendingClaims,
      isBlocked,
      isCleared: !isBlocked,
    };
  } catch (err) {
    console.error("loadLegacyHarvesterMigrationStatus failed", err);
    // Fail open: no confirmed pending rewards → do not block the user
    return {
      harvester,
      streams: [],
      pendingClaimStreams: [],
      hasPendingClaims: false,
      isBlocked: false,
      isCleared: true,
    };
  }
}

/** Human-readable countdown for withdraw / claim locks. */
export function formatDurationCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s <= 0) return "0s";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

