import { Contract, JsonRpcProvider, ethers, parseUnits, formatUnits } from "ethers";
import { createWallet, inAppWallet, walletConnect } from "thirdweb/wallets";
import { createThirdwebClient, getContract, prepareContractCall } from "thirdweb";
import { ConnectButton, darkTheme } from "thirdweb/react";
import { blockchain, hasLiveAddress, robinhood } from "./networkData";

export const client = createThirdwebClient({ clientId: "1a5b6cbe48f52555cc067d65e1842742" });

export const wallets = [
  createWallet("com.binance.wallet"),
  createWallet("com.coinbase.wallet"),
  createWallet("com.okex.wallet"),
  createWallet("com.trustwallet.app"),
  walletConnect(),
  inAppWallet({ auth: { options: ["google", "x", "facebook", "telegram", "discord", "farcaster", "apple", "phone", "email"] } }),
];

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const harvesterAbi = [
  "function TotalPENNYSent() view returns (uint256)",
  "function balances(address account) view returns (uint256)",
  "function claim(address[] payTokens)",
  "function claimRewards(address account, address token) view returns (uint256 eraAtBlock, uint256 rewardsOwed, uint256 PENNYSent)",
  "function deposit(uint256 amount)",
  "function withdraw()",
];

const provider = new JsonRpcProvider(blockchain.rpc, blockchain.chainId, { staticNetwork: true });

function getTokenContract() {
  return new Contract(blockchain.arcade_address, erc20Abi, provider);
}

function getHarvesterContract() {
  return new Contract(blockchain.harvester_address, harvesterAbi, provider);
}

export async function fetchStakingSnapshot(accountAddress) {
  const nativeBalance = accountAddress ? await provider.getBalance(accountAddress).catch(() => 0n) : 0n;
  const empty = {
    nativeBalance,
    tokenBalance: null,
    allowance: null,
    stakedBalance: null,
    totalStaked: null,
    claimable: null,
    tokenDecimals: blockchain.decimals,
  };

  if (!hasLiveAddress(blockchain.arcade_address) || !hasLiveAddress(blockchain.harvester_address)) {
    return empty;
  }

  const harvester = getHarvesterContract();
  const farmTotalPromise = harvester.TotalPENNYSent();
  if (!accountAddress) return { ...empty, totalStaked: await farmTotalPromise };

  const token = getTokenContract();
  const [tokenDecimals, tokenBalance, allowance, stakedBalance, farmTotal, rewards] = await Promise.all([
    token.decimals(),
    token.balanceOf(accountAddress),
    token.allowance(accountAddress, blockchain.harvester_address),
    harvester.balances(accountAddress),
    farmTotalPromise,
    harvester.claimRewards(accountAddress, blockchain.arcade_address),
  ]);

  return {
    nativeBalance,
    tokenBalance,
    allowance,
    stakedBalance,
    totalStaked: farmTotal,
    claimable: rewards.rewardsOwed ?? rewards[1],
    tokenDecimals: Number(tokenDecimals),
  };
}

function stakingContract() {
  return getContract({ client, chain: robinhood, address: blockchain.harvester_address, abi: harvesterAbi });
}

function tokenContract() {
  return getContract({ client, chain: robinhood, address: blockchain.arcade_address, abi: erc20Abi });
}

export function prepareArcadeApproval(amount) {
  return prepareContractCall({
    contract: tokenContract(),
    method: "function approve(address spender, uint256 amount) external returns (bool)",
    params: [blockchain.harvester_address, amount],
  });
}

export function prepareArcadeDeposit(amount) {
  return prepareContractCall({
    contract: stakingContract(),
    method: "function deposit(uint256 amount) external",
    params: [amount],
  });
}

export function prepareArcadeWithdraw() {
  return prepareContractCall({ contract: stakingContract(), method: "function withdraw() external", params: [] });
}

export function prepareArcadeClaim() {
  return prepareContractCall({
    contract: stakingContract(),
    method: "function claim(address[] payTokens) external",
    params: [[blockchain.arcade_address]],
  });
}

export { ethers, formatUnits, parseUnits };

export function Connector() {
  return (
    <ConnectButton
      client={client}
      chain={robinhood}
      wallets={wallets}
      theme={darkTheme({
        colors: {
          primaryText: "#fff8e7",
          secondaryText: "#c5b995",
          connectedButtonBg: "#211b0f",
          connectedButtonBgHover: "#332714",
          separatorLine: "#45371c",
          primaryButtonBg: "#f4b223",
        },
      })}
        supportedTokens={{
          [blockchain.chainId]: [{
            address: blockchain.arcade_address,
            name: blockchain.tokenName,
            symbol: blockchain.tokenSymbol,
            icon: '/logo.webp',
          },
          // {
          //   address: blockchain.partner1_contract_address,
          //   name: blockchain.partner1,
          //   symbol: blockchain.partner1_symbol,
          //   icon: '/partner1_logo.webp',
          // }
        ]
        }}
      connectButton={{ label: "Insert Coin" }}
      connectModal={{
        size: "wide",
        title: "Sign In",
        titleIcon: "/logo.webp",
        welcomeScreen: {
          title: "Enter the Arcade",
          subtitle: "...the BUN flywheel arcade.",
          img: {
            src: '/logo.webp',
            width: 200,
            height: 200,
          },
        },
      }}
      
    />
  );
}