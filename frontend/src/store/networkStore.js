import { blockchain } from "@/tools/networkData";

const state = Object.freeze({ selectedNetwork: blockchain });

export const useNetworkStore = (selector) => selector(state);
export const getCurrentNetwork = () => blockchain;