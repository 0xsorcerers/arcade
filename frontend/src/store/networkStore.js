import { robinhoodNetwork } from "@/tools/networkData";

const state = Object.freeze({ selectedNetwork: robinhoodNetwork });

export const useNetworkStore = (selector) => selector(state);
export const getCurrentNetwork = () => robinhoodNetwork;