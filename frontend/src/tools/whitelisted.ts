import type { Address } from "viem";
import { blockchain, ZERO_ADDRESS, TESTING_MODE } from "./networkData";

export type RewardTokenCategory = "stablecoin"| "crypto" | "stock" | "etf" | "commodity" | "meme" | "other";

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
  // Testnet 
  if (TESTING_MODE) {
    const tokens: WhitelistedRewardToken[] = [
      { address: ZERO_ADDRESS as Address, name: "USD", type: "stablecoin" },
    ];
    // if (arcadeAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
    //   tokens.push({ address: arcadeAddress, name: "ARCADE", type: "crypto" });
    // }

    tokens.push({ address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", name: "EURC", type: "stablecoin" });
    tokens.push({ address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", name: "Circle BTC", type: "crypto" });
    tokens.push({ address: "0xF4cA5adcc58Ee0aCb3E442a6c5058f381B2F8E96", name: "SoulOfSparta", type: "crypto" });
    tokens.push({ address: "0x4c84B8B50a66bbc512C0154C4a16BA909789A8A3", name: "SpaceX", type: "stock" });

    return tokens;
  } else {
    const tokens: WhitelistedRewardToken[] = [
      { address: ZERO_ADDRESS as Address, name: "Ethereum", type: "crypto" },
    ];
    // if (arcadeAddress.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
    //   tokens.push({ address: arcadeAddress, name: "ARCADE", type: "crypto" });
    // }

    tokens.push({ address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", name: "USDG", type: "stablecoin" });
    tokens.push({ address: "0x07EBB29a38Fbcb41563817e5E19f2ceC619C90D2", name: "BUN", type: "meme" });
    tokens.push({ address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", name: "TSLA", type: "stock" });
    tokens.push({ address: "0x39dbed3a2bd333467115de45665cc57f813c4571", name: "PONS", type: "crypto" });
    tokens.push({ address: "0xB6ff957E31286F748989Cbf69183b1b5e8d921A8", name: "CONV", type: "crypto" });
    tokens.push({ address: "0x56910D4409F3a0C78C64DD8D0545FF0705389870", name: "INDEX", type: "crypto" });
    tokens.push({ address: "0xBf818eFe65aac127AC8f9Fec6fEC203ee222C851", name: "BPEPE", type: "meme" });
    tokens.push({ address: "0x25db3541FCB9c41B1CA05b665a260D9d094B4B9C", name: "BEBIR", type: "meme" });
    tokens.push({ address: "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", name: "GLD", type: "commodity" });
    tokens.push({ address: "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", name: "SLV", type: "commodity" });
    tokens.push({ address: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", name: "QQQ", type: "etf" });

    return tokens;

  }
}

export function getWhitelistedTokensByCategory(chainId: number): Record<RewardTokenCategory, WhitelistedRewardToken[]> {
  return getWhitelistedRewardTokens(chainId).reduce<Record<RewardTokenCategory, WhitelistedRewardToken[]>>(
    (groups, token) => {
      groups[token.type].push(token);
      return groups;
    },
    { stablecoin: [], crypto: [], stock: [], etf: [], commodity: [], meme: [], other: [] },
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