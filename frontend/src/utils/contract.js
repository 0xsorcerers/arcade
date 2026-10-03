import { ethers, JsonRpcProvider } from "ethers";
import Legend from "../abi/Legend.json";

/**
 * Fetch TotalPlays from a game's Legend contract
 * @param {Object} game - Game object containing blockchain config
 * @returns {Promise<string|null>} - TotalPlays as string or null on error
 */
export const fetchTotalPlays = async (game) => {
  try {
    const { legend_contract_address, rpc, chainId } = game;
    
    if (!legend_contract_address || !rpc || !chainId) {
      console.error('Missing blockchain config for game:', game.id);
      return null;
    }

    // Create provider for the game's network
    const provider = new JsonRpcProvider(rpc, chainId, { staticNetwork: true });
    
    // Create contract instance
    const contract = new ethers.Contract(legend_contract_address, Legend.abi, provider);
    
    // Fetch TotalPlays
    const totalPlays = await contract.TotalPlays();
    return totalPlays.toString();
  } catch (error) {
    console.error(`Error fetching TotalPlays for ${game.id}:`, error);
    return null;
  }
};
