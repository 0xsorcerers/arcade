import { defineChain } from "thirdweb/chains";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const robinhoodNetwork = Object.freeze({
  // // Mainnet
  // name: "Robinhood",
  // chainId: 4663,
  // rpc: "https://rpc.mainnet.chain.robinhood.com",
  // blockExplorer: "https://robinhoodchain.blockscout.com/",
  // decimals: 18,
  // symbol: "ETH",
  // tokenName: "Meme Arcade",
  // tokenSymbol: "ARCADE",
  // arcade_address: ZERO_ADDRESS,
  // harvester: ZERO_ADDRESS,
  // proof_of_access: ZERO_ADDRESS,
  // legacyHarvester: ZERO_ADDRESS,

  // Testnet
  name: "Arc (Testnet)",
  chainId: 5042002,
  rpc: "https://arc-testnet-rpc.publicnode.com",
  blockExplorer: "https://explorer.testnet.arc.io/",
  decimals: 6,
  symbol: "USD",
  tokenName: "Meme Arcade",
  tokenSymbol: "ARCADE",
  arcade_address: "0x60566859A4355a321b5f2C9e25AB3f15cD5DCD11",
  harvester: "0xa0752b4542379D117179582851570E64F42063e6",
  proof_of_access: "0xa0C4F4B66238FdaC52b0b42Fc7fCd243FdF66Cb7",
  legacyHarvester: ZERO_ADDRESS,
});

export const blockchain = robinhoodNetwork;
export const chains = [robinhoodNetwork];

export const robinhood = defineChain({
  id: blockchain.chainId,
  name: "Robinhood Chain",
  rpc: blockchain.rpc,
  nativeCurrency: {
    name: "ETH",
    symbol: blockchain.symbol,
    decimals: 18,
  },
  blockExplorers: [{
    name: "Robinhood Chain Explorer",
    url: blockchain.blockExplorer,
  }],
  feeType: "legacy",
});

export function hasValidArcadeEntry(network) {
  return hasLiveAddress(network?.arcade_address);
}

export function hasValidProofOfAccess(network) {
  return hasAddress(network?.proof_of_access);
}

export function hasLiveProofOfAccess(network) {
  return hasValidArcadeEntry(network) && hasLiveAddress(network?.proof_of_access);
}

export function hasLiveHarvester(network) {
  return hasLiveAddress(network?.harvester);
}

export function hasLegacyHarvester(network) {
  return hasLiveAddress(network?.legacyHarvester);
}

export function canAccessFarm(network) {
  return hasLiveProofOfAccess(network) && hasLiveHarvester(network);
}

function hasAddress(address) {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function hasLiveAddress(address) {
  return typeof address === "string" && /^0x[a-fA-F0-9]{40}$/.test(address) && address.toLowerCase() !== ZERO_ADDRESS;
}

export const isStakingDeployed = () =>
  hasLiveAddress(blockchain.arcade_address) && hasLiveAddress(blockchain.harvester);