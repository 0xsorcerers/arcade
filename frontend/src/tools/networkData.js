import { defineChain } from "thirdweb/chains";


export const TESTING_MODE = true;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const robinhoodMainnet = Object.freeze({
  name: "Robinhood",
  chainId: 4663,
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  blockExplorer: "https://robinhoodchain.blockscout.com/",
  decimals: 18,
  symbol: "ETH",
  tokenName: "Meme Arcade",
  tokenSymbol: "ARCADE",
  arcade_address: ZERO_ADDRESS,
  harvester: ZERO_ADDRESS,
  proof_of_access: ZERO_ADDRESS,
  legacyHarvester: ZERO_ADDRESS,
});

export const arcTestnet = Object.freeze({
  name: "Arc (Testnet)",
  chainId: 5042002,
  rpc: "https://arc-testnet-rpc.publicnode.com",
  blockExplorer: "https://explorer.testnet.arc.io/",
  decimals: 18,
  symbol: "USD",
  tokenName: "Meme Arcade",
  tokenSymbol: "ARCADE",
  arcade_address: "0x60566859A4355a321b5f2C9e25AB3f15cD5DCD11",
  harvester: "0x972eBf294FA2E96793789076554A543f43BD75d3", // 0xaad53593667ea033E5D19Dc84173ae5b39e0eA40 v2_1 (multi SetRewards gone)| 0x5aD80CD77daeF0fD54d2e31705cEf32BECd23A93 v2_2 | 0xDb4FDec1556617904A22Bcf0fe13b6496764CacA v2_1
  proof_of_access: "0xa0C4F4B66238FdaC52b0b42Fc7fCd243FdF66Cb7",
  legacyHarvester: ZERO_ADDRESS,
});

export const robinhoodNetwork = Object.freeze({
  // Mainnet
  ...robinhoodMainnet,
});

export const arcTestnetNetwork = Object.freeze({
  // Testnet
  ...arcTestnet,
});

export const blockchain = TESTING_MODE ? arcTestnetNetwork : robinhoodNetwork;
export const chains = [robinhoodNetwork, arcTestnetNetwork];

export const robinhood = defineChain({
  id: blockchain.chainId,
  name: TESTING_MODE ? "Arc Testnet" : "Robinhood Chain",
  rpc: blockchain.rpc,
  nativeCurrency: {
    name: TESTING_MODE ? "USD" : "ETH",
    symbol: blockchain.symbol,
    decimals: blockchain.decimals,
  },
  blockExplorers: [{
    name: TESTING_MODE ? "Arc Testnet Explorer" : "Robinhood Chain Explorer",
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
  // Bypass farm locked gate when in testnet mode
  if (TESTING_MODE) return true;
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

export const isMainnetWithValidContracts = () => {
  return blockchain.chainId === 4663 &&
    hasLiveAddress(blockchain.harvester) &&
    hasLiveAddress(blockchain.proof_of_access);
};