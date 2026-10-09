export const SOCIALS = {
  x: "https://x.com/myMemeArcade",
  telegram: "https://t.me/mymemearcade",
  stake: "/staking",
};

export const GAMES = [
  {
    id: "allstars",
    num: "01",
    title: "BundleCat All Stars",
    displayLines: ["ALL", "STARS"],
    category: "Tournament Themed Crypto Game",
    mode: "SOLO PLAY / SQUAD PLAY",
    tagline: "Cats vs NBA legends. Winner takes the pot.",
    description:
      "All Star Cats hold off the NBA All Stars in a high-stakes arena showdown. Out-play legends to cash out each season's pot in $BUN memecoin.",
    chips: ["SEASON WINNERS", "PLAY IN $BUN", "LOW RISK / HIGH REWARD", "LIVE PAYOUTS"],
    ticker: "$BUN",
    community: "Robinhood",
    href: "https://allstars.memearcade.my",
    image: "/images/allstars.webp",
    theme: "#F4B223",
    themeSoft: "rgba(244,178,35,0.16)",
    activeNow: "0",
    // mainnet (Robinhood Chain) 
    name: 'Robinhood',
    // Native coin symbol (entry fee / native pot). 
    symbol: 'ETH',
    // ERC20 token symbol (token fee / token pot). 
    tokenSymbol: 'BUN',
    address: '0xcfcc1ce8Ee743E44F9936d0Eb4ea143a0a46aA87', // AllStarCat NFT address
    chainId: 4663, 
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    blockExplorer: 'https://robinhoodchain.blockscout.com/',
    contract_address: "0x07EBB29a38Fbcb41563817e5E19f2ceC619C90D2", // ERC20 
    decimals: 18,
    legend_contract_address: "0x077B57fC172750445251Cc370B0131e865e315b7", // Legend contract address
  },
  {
    id: "feferdream",
    num: "02",
    title: "Feferdream Apocalypse",
    displayLines: ["FEFERDREAM", "APOCALYPSE"],
    category: "Hunt Themed Crypto Game",
    mode: "SOLO PLAY / SQUAD PLAY",
    tagline: "Dream hard. win harder.",
    description:
      "Dino hunters take on Dragons to stop the apocalypse. Reality is melting and only the sharpest survive the dream — run the wasteland, stack rewards, and cash out in $fefer before the sky falls.",
    chips: ["HUNTING ROUNDS", "PLAY IN $FEFER", "LOW RISK / HIGH REWARD", "LIVE PAYOUTS"],
    ticker: "$FEFER",
    community: "Stable",
    href: "https://feferdream.memearcade.my",
    image: "/images/feferdream.webp",
    theme: "#FF3B30",
    themeSoft: "rgba(255,59,48,0.16)",
    activeNow: "0",
    // mainnet (Stable Chain) 
    name: 'Stable',
    // Native coin symbol (entry fee / native pot). 
    symbol: 'USD',
    // ERC20 token symbol (token fee / token pot). 
    tokenSymbol: 'FEFER',
    address: '0x26ec9f79A4A7Ca29fe75C3D70363FFcaCC42A2b7', // DINOS NFT address
    chainId: 988, 
    rpc: 'https://rpc.stable.xyz',
    blockExplorer: 'https://stablescan.xyz/',
    contract_address: "0xdeee8f25fe3b5c33aef78637278acbff23eebfa6", // ERC20
    decimals: 18,
    legend_contract_address: "0x781081aa457f1816cdD95656FeA72B1B505db35D", // Feferdream money game
  },
  {
    id: "cashcats",
    num: "03",
    title: "Cash Cats 'n' Money Mice",
    displayLines: ["CASH CATS", " 'N' MONEY MICE"],
    category: "Bounty themed Crypto Game",
    mode: "SOLO / SQUAD",
    tagline: "Street cats. Suited mice. One pot.",
    description:
      "Street-cat crews versus suited mouse syndicates in a neon-soaked heist for the pot. Outsmart the mafia, grab the loot, and get that cash, Cat.",
    chips: ["BOUNTY RUNS", "PLAY IN $CASHCAT", "LOW RISK / HIGH REWARD", "LIVE PAYOUTS"],
    ticker: "$CASHCAT",
    community: "Robinhood",
    href: "https://cashcats.memearcade.my",
    image: "/images/cashcats.webp",
    theme: "#22C55E",
    themeSoft: "rgba(34,197,94,0.16)",
    activeNow: "0",    
    // mainnet (Robinhood Chain) 
    name: 'Robinhood',
    // Native coin symbol (entry fee / native pot). 
    symbol: 'ETH',
    // ERC20 token symbol (token fee / token pot). 
    tokenSymbol: 'CASHCAT',
    address: '0xB5Fd5e8e9712123C895D6666bC7F42E9D18c19b9', // CASHCATS NFT address
    chainId: 4663, 
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    blockExplorer: 'https://robinhoodchain.blockscout.com/',
    contract_address: "0x020bfC650A365f8BB26819deAAbF3E21291018b4", // ERC20
    decimals: 18,
    legend_contract_address: "0x21e33d9480D82D055aD2B2d721CDdbCe389A8861", // CashCat_n_MoneyMouse
  },
];
