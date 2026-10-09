import type { Address } from "viem";
import { blockchain, ZERO_ADDRESS } from "./networkData";

export type RewardTokenCategory = "crypto" | "stock" | "etf" | "commodity" | "other";

export interface WhitelistedRewardToken {
  address: Address;
  name: string;
  type: RewardTokenCategory;
}

const arcadeAddress = blockchain.arcade_address as Address;

export function shortTokenLabel(address: string): string {
  if (!address || address.length < 10) return address || "Token";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function getWhitelistedRewardTokens(_chainId: number): WhitelistedRewardToken[] {
  const tokens: WhitelistedRewardToken[] = [
    { address: ZERO_ADDRESS as Address, name: "ETH", type: "crypto" },
  ];
  // if (arcadeAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
  //   tokens.push({ address: arcadeAddress, name: "ARCADE", type: "crypto" });
  // }

  tokens.push({ address: "0xF4cA5adcc58Ee0aCb3E442a6c5058f381B2F8E96", name: "SoulOfSparta", type: "crypto" });
  tokens.push({ address: "0x4c84B8B50a66bbc512C0154C4a16BA909789A8A3", name: "SpaceX", type: "stock" });

  return tokens;
}

export function getWhitelistedTokensByCategory(chainId: number): Record<RewardTokenCategory, WhitelistedRewardToken[]> {
  return getWhitelistedRewardTokens(chainId).reduce<Record<RewardTokenCategory, WhitelistedRewardToken[]>>(
    (groups, token) => {
      groups[token.type].push(token);
      return groups;
    },
    { crypto: [], stock: [], etf: [], commodity: [], other: [] },
  );
}

export function getTokenName(_chainId: number, address: Address): string | null {
  return getWhitelistedRewardTokens(blockchain.chainId).find(
    (token) => token.address.toLowerCase() === address.toLowerCase(),
  )?.name ?? null;
}

export function resolveRewardTokenLabel(chainId: number, address: Address): string {
  return getTokenName(chainId, address) ?? shortTokenLabel(address);
}