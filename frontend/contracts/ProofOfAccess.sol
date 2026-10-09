// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/utils/SafeERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/utils/ReentrancyGuard.sol";

interface IHarvester {
    function blacklist(address _requester) external view returns (bool);
}

/**
 * @title Proof of Access Mint contract
 */
contract ProofOfAccess is ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor(string memory _name, string memory _symbol, address _harvester, address _arcadeToken, address _newGuard) 
    ERC721(_name, _symbol) Ownable(msg.sender) {
        arcadeToken = _arcadeToken;
        harvester = _harvester;
        arcadeDAO = _newGuard;
        harvestlookup = IHarvester(harvester);
    }

    uint256 private _currentSupply; 
    uint256 public mintFee = 10000000000000;
    uint256 public requiredAmount = 2000000 * 10**18;
    string public baseURI;
    address private arcadeDAO; 
    address public harvester;
    address public arcadeToken;
    address deadAddress = 0x000000000000000000000000000000000000dEaD;
    IHarvester public harvestlookup; 
    string public Author = "0xSorcerer | Dark-Viper";
    bool public paused = false; 

    uint256 public TotalContractBurns;
    
    modifier onlyGuard() {
        require(msg.sender == arcadeDAO, "Not authorized.");
        _;
    }

    // Structs
    struct Player {
        string TIER;
        uint256 ID;
        uint256 LISTS;
        bool BLACKLIST;
    }

    // Mapping
    mapping (uint256 => Player) public players;
    
    // Arrays
    string[] public TierByName = ["Deckhand", "Pirate", "Corsair", "Admiral", "Dragonlord", "Emperor"]; 
    uint256[] public TierByLadder = [2, 4, 8, 12, 15, 20]; 
    uint256[] public multipliers = [1, 2, 4, 8, 16, 32]; 

    // Events
    event TokenMinted(uint256 indexed _tokenId, uint256 indexed _lists, string indexed tier);
    event Pause();
    event Unpause();

    // Mints
    function mint(uint256 _tierLevel) public payable nonReentrant {
        require(!paused, "Paused Contract");
        require(msg.value == mintFee, "Insufficient fee");
        require(_tierLevel < TierByLadder.length, "Non-existent tier");

        // 1. Calculate the burn multiplier and total burn amount
        uint256 multiplier = multipliers[_tierLevel];
        uint256 burnAmount = requiredAmount * multiplier;

        // 2. Transfer tokens to the dead address
        // NOTE: The caller must have already called approve() on the arcadeToken contract 
        IERC20(arcadeToken).safeTransferFrom(msg.sender, deadAddress, burnAmount);
        
        TotalContractBurns += burnAmount;

        // 3. Mint and map the NFT
        uint256 _tokenId = ++_currentSupply;
        string memory _tier = TierByName[_tierLevel];
        uint256 tierLevel = TierByLadder[_tierLevel];

        players[_tokenId] = Player({
            TIER: _tier,
            ID: _tokenId,
            LISTS: tierLevel, 
            BLACKLIST: false
        });
        
        _mint(msg.sender, _tokenId);
        
        emit TokenMinted(_tokenId, tierLevel, _tier);
    }

    // Helper functions to verify nft ownership and return required struct
    function getPlayers(uint256 _tokenId) public view returns (Player memory) { 
        return players[_tokenId];
    }
    
    function getPlayer(address _player, uint256 _nft) public view returns (uint256) {
        bool blacklisted = harvestlookup.blacklist(_player);
        if (blacklisted || players[_nft].BLACKLIST) return 1;
        
        uint256 total = balanceOf(_player);
        for (uint256 i = 0; i < total; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(_player, i);
            if (tokenId == _nft) {
                return players[tokenId].LISTS;
            } 
        } 
        return 1;
    }   

    function getPlayerOwners(address _player) public view returns (Player[] memory) {
        uint256 total = balanceOf(_player);
        Player[] memory result = new Player[](total);     
        for (uint256 i = 0; i < total; i++) {
          uint256 tokenId = tokenOfOwnerByIndex(_player, i);
                result[i] = players[tokenId];
        }
        return result;
    } 

    // Admin Functions
    function setAddresses(address _harvester, address _arcadeToken, address _deadAddress, address _newGuard) external onlyGuard {
        harvester = _harvester;
        arcadeToken = _arcadeToken;
        deadAddress = _deadAddress;
        arcadeDAO = _newGuard;
        harvestlookup = IHarvester(harvester);
    }

    function setTierByLadder(uint256[] calldata _ladders) external onlyGuard {
        TierByLadder = _ladders;
    }

    function setValues(uint256[] calldata _values) external onlyGuard() {
        mintFee = _values[0];
        requiredAmount = _values[1];
    }

    function withdraw(uint256 _amount) external payable onlyGuard {
        (bool success, ) = payable(msg.sender).call{value: _amount}("");
        require(success, "Funds transfer failed.");
    }

    function withdrawERC20(address _token, uint256 _amount) external payable onlyGuard {
        IERC20(_token).safeTransfer(msg.sender, _amount);
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    function updateBaseURI(string memory _newLink) external onlyOwner() {
        baseURI = _newLink;
    }

    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        require(_tokenId <= _currentSupply, "Not Found");
        string memory uriBase = baseURI;
        string memory tier = players[_tokenId].TIER; 

        if (players[_tokenId].BLACKLIST) { 
            return
            bytes(uriBase).length > 0
                ? string(abi.encodePacked(uriBase, "blacklisted", ".json"))
                : "";
        }
        
        return bytes(baseURI).length > 0
            ? string(abi.encodePacked(uriBase, tier, ".json"))
            : "";
    }

    function pause() public onlyGuard {
        require(!paused, "Contract already paused.");
        paused = true;
        emit Pause();
    }

    function unpause() public onlyGuard {
        require(paused, "Contract not paused.");
        paused = false;
        emit Unpause();
    } 
}