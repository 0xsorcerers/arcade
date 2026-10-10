// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;
//Title A GameFi-Integrated Decentralized Multi-token Harvester contract
//Co-Developed and enhanced using Gemini Pro

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/utils/SafeERC20.sol";

// ==========================================
// EXTERNAL INTERFACES
// ==========================================

interface IProofOfAccess {
    function getPlayer(address _user, uint256 _nft) external view returns (uint256);
}

/**
 * @title Harvester
 * @dev Expanded Multi-Token Harvester Contract with User-Subscribed Reward Tiers
 */
contract Harvester is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor(address _ARCADEToken, address _developAddress, address _newGuard) Ownable(msg.sender){
        ARCADEToken = IERC20(_ARCADEToken);
        developAddress = _developAddress;
        arcadeDAO = _newGuard;
        startTime = block.timestamp;
        eraClock = startTime;
    }

    IERC20 public ARCADEToken;
    IProofOfAccess public proofOfAccess;

    // --- DECENTRALIZED TOKEN ARCHITECTURE ---
    
    uint256 public MAX_BATCH_SIZE = 50;

    // Maps a user to a list of tokens they've hand-picked to receive rewards from
    mapping(address => mapping(uint256 => address)) public activeTokenListByUser;
    // Tracks how many tokens a user is currently subscribed to
    mapping(address => uint256) public activeTokenListByUserCount;
    // O(1) lookup to check if a user is already subscribed to a specific token address
    mapping(address => mapping(address => bool)) public isSubscribed;
    // Tracks the total amount of ARCADE actively staked toward a specific reward token.
    mapping(address => uint256) public tokenTotalStaked;

    // --- GLOBAL ECONOMIC STATE PER TOKEN ---
    struct TokenEconomy {
        uint256 totalRewards;
        uint256 allRewardsOwed;
        uint256 rewardPerStamp;
        uint256 currentERA; // Local time-tracker for this specific token
        uint256 startTime;  // When this token was initialized
        bool isAdded;       // Verifies the token is active
    }
    mapping(address => TokenEconomy) public tokenEconomics;

    // The historical rate ledger: tokenAddress -> ERA -> rewardPerStamp
    mapping(address => mapping(uint256 => uint256)) public eraRewards;

    // --- GLOBAL STAKING VARIABLES ---
    uint256 public eralength = 86400;  // 1 day
    uint256 public immutable startTime;
    uint256 public numberOfParticipants = 0;
    uint256 public Duration = 604800; // 7 days 
    uint256 public timeLock = 86400; // 1 day
    uint256 public TotalARCADESent = 1;
    uint256 public tax = 0;
    uint256 public TaxTotal = 0;
    uint256 public developTax = 0;
    uint256 public MAX_ERA = 50;
    uint256 public eraClock;
    uint256 public liveDays;
    uint256 private divisor = 100 ether;
    address private arcadeDAO;
    address public developAddress;
    bool public paused = false;   

    // --- USER STATE & HISTORICAL RECORDING ---
    mapping(address => uint256) public balances;
    mapping(address => uint256) public entryMap;
    mapping(address => bool) public blacklist;

    // Per-Token Cooldown: User -> Token -> Last Claim Timestamp
    mapping(address => mapping(address => uint256)) public UserTokenClaims;

    struct Claim {
        uint256 eraAtBlock;  // The ERA timestamp when the user last synced this token
        uint256 rewardsOwed; // The static bucket where we dump their calculated rewards
        uint256 ARCADESent;   // Their staked ARCADE snapshot specifically for this token
    }
    
    // User -> payTokenAddress -> Claim State
    mapping(address => mapping(address => Claim)) public claimRewards;
    mapping(address => mapping(address => uint256)) public Claimants;

    // Historical Records for UX Frontends
    struct ClaimRecord {
        uint256 timestamp;
        address token;
        uint256 amount;
    }

    // User -> Claim Index -> Claim Details
    mapping(address => mapping(uint256 => ClaimRecord)) public userClaimHistory;
    // User -> Total Claim Counter
    mapping(address => uint256) public userTotalClaimHistory;

    // --- EVENTS ---
    event TokenSubscribed(address indexed user, uint256 currentCount, uint256 maxAllowed);
    event SyncProgress(address indexed user, bool done, uint256 remaining);
    event RewardClaimedByUser(address indexed user, address indexed token, uint256 amount);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event NativeCoinDrop(address indexed sender, uint256 amount);

    modifier onlyGuard() {
        require(msg.sender == arcadeDAO, "Not authorized.");
        _;
    }

    modifier onlyAfterTimelock() {             
        require(entryMap[msg.sender] + timeLock < block.timestamp, "Timelocked.");
        _;
    }

    // ==========================================
    // NATIVE COIN FALLBACK
    // ==========================================

    /**
     * @notice Allows the contract to accept raw ETH directly.
     * @dev Dynamically initializes the native reward pool on-the-fly.
     */
    receive() external payable {
        _initializeToken(address(0));
        emit NativeCoinDrop(msg.sender, msg.value);
    }

    // ==========================================
    // AUTO-INITIALIZATION ENGINE
    // ==========================================

    /**
     * @dev Internal helper to dynamically initialize a token stream upon first interaction.
     * @param _payToken The token address to initialize (address(0) for native ETH).
     */
    function _initializeToken(address _payToken) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        if (!tEco.isAdded) {
            tEco.isAdded = true;
            tEco.startTime = block.timestamp;
            tEco.currentERA = 0;
        }
    }

    // ==========================================
    // EXTERNAL CONTRACT CONFIGURATION
    // ==========================================

    /**
     * @notice Links the Harvester to the Proof_of_Access NFT collection.
     */
    function setProofOfAccessContract(address _proofOfAccessAddress) external onlyGuard {
        proofOfAccess = IProofOfAccess(_proofOfAccessAddress);
    }

    // ==========================================
    // DYNAMIC TIER LIMITS
    // ==========================================

    /**
     * @notice Calculates a user's maximum allowed token subscriptions.
     */
    function getMaxSubscriptions(address _user, uint256 _nft) internal view returns (uint256) {
        if (address(proofOfAccess) == address(0)) {
            return 1;
        }
        uint256 limit = proofOfAccess.getPlayer(_user, _nft);
        return limit;
    }

    // ==========================================
    // DYNAMIC SUBSCRIPTION MANAGEMENT
    // ==========================================

    /**
     * @notice Completely replaces a user's reward token subscription list.
     */
    function subscribeToToken(address[] calldata _newTokens, uint256 _nft) external nonReentrant {
        require(!paused, "Contract is paused.");
        require(!blacklist[msg.sender], "Address is blacklisted.");

        uint256 maxAllowed = getMaxSubscriptions(msg.sender, _nft);
        require(_newTokens.length <= maxAllowed, "Exceeds Proof_of_Access tier limit");
        require(_newTokens.length <= MAX_BATCH_SIZE, "Exceeds absolute batch limit");

        uint256 currentCount = activeTokenListByUserCount[msg.sender];
        uint256 userStake = balances[msg.sender];
        for (uint256 i = 0; i < currentCount; i++) {
            address oldToken = activeTokenListByUser[msg.sender][i];
            _processSingleTokenClaim(msg.sender, oldToken);
            if (userStake > 0) {
                tokenTotalStaked[oldToken] -= claimRewards[msg.sender][oldToken].ARCADESent;
            }
            
            claimRewards[msg.sender][oldToken].ARCADESent = 0;
            isSubscribed[msg.sender][oldToken] = false;
            
            _setRewards(oldToken);
        }

        for (uint256 i = 0; i < _newTokens.length; i++) {
            address newToken = _newTokens[i];
            require(!isSubscribed[msg.sender][newToken], "Duplicate token in array");
            
            // Auto-initialize the token stream if it is the first time being seen
            _initializeToken(newToken);

            activeTokenListByUser[msg.sender][i] = newToken;
            isSubscribed[msg.sender][newToken] = true;

            claimRewards[msg.sender][newToken].eraAtBlock = tokenEconomics[newToken].currentERA;
            if (userStake > 0) {
                tokenTotalStaked[newToken] += userStake;
                claimRewards[msg.sender][newToken].ARCADESent = userStake;
            }
            
            _setRewards(newToken);
        }

        activeTokenListByUserCount[msg.sender] = _newTokens.length;
        emit TokenSubscribed(msg.sender, _newTokens.length, maxAllowed);
    }

    /**
     * @notice Helper function to retrieve all currently subscribed tokens for a user.
     */
    function getUserSubscriptions(address _user) external view returns (address[] memory) {
        uint256 count = activeTokenListByUserCount[_user];
        address[] memory subs = new address[](count);
        
        for (uint256 i = 0; i < count; i++) {
            subs[i] = activeTokenListByUser[_user][i];
        }
        
        return subs;
    }

    function setTokenEra(address _payToken) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        if (!tEco.isAdded) return;

        uint256 timeElapsed = block.timestamp - tEco.startTime;
        uint256 totalDaysElapsed = timeElapsed / eralength;
        if (totalDaysElapsed > tEco.currentERA) {
            uint256 diff = totalDaysElapsed - tEco.currentERA;
            for (uint256 i = 0; i < diff; i++) {
                eraRewards[_payToken][tEco.currentERA] = tEco.rewardPerStamp;
                tEco.currentERA++;
            }
        }
    }

    function _processSingleTokenClaim(address user, address pToken) internal {
        setTokenEra(pToken);
        TokenEconomy storage tEco = tokenEconomics[pToken];
        Claim storage claimData = claimRewards[user][pToken];
        
        uint256 startPeriod = claimData.eraAtBlock;
        uint256 endPeriod = tEco.currentERA;
        if (claimData.ARCADESent == 0) {
            claimData.eraAtBlock = endPeriod;
            return;
        }

        if (startPeriod < endPeriod) {
            uint256 rewardsAccrued = 0;
            for (uint256 e = startPeriod; e < endPeriod; e++) {
                rewardsAccrued += (eraRewards[pToken][e] * claimData.ARCADESent);
            }
            
            claimData.rewardsOwed += rewardsAccrued;
            claimData.eraAtBlock = endPeriod;
            
            // FIX: Increment liability ONLY by the newly accrued chunk, not the cumulative total
            uint256 rewardsDue = rewardsAccrued / divisor;
            tEco.allRewardsOwed += rewardsDue;
        }
    }

    // ==========================================
    // DEPOSIT & WITHDRAWAL (State Protected)
    // ==========================================

    function deposit(uint256 _amount) public nonReentrant requireSynced {
        require(!paused, "Paused.");
        require(_amount > 0, "Amount > 0.");
        require(!blacklist[msg.sender], "Blacklisted.");

        uint256 received = transferTokens(_amount);

        uint256 toll = (_amount * tax) / 100;
        uint256 amount = received - toll;
        TaxTotal += toll;
        
        if (balances[msg.sender] == 0) {
            numberOfParticipants += 1;
        }

        balances[msg.sender] += amount;
        entryMap[msg.sender] = block.timestamp;
        TotalARCADESent += amount;
        uint256 totalTokens = activeTokenListByUserCount[msg.sender];
        for (uint256 i = 0; i < totalTokens; i++) {
            address pToken = activeTokenListByUser[msg.sender][i];
            _processSingleTokenClaim(msg.sender, pToken);
            tokenTotalStaked[pToken] -= claimRewards[msg.sender][pToken].ARCADESent;
            tokenTotalStaked[pToken] += balances[msg.sender];
            
            claimRewards[msg.sender][pToken].ARCADESent = balances[msg.sender];
            claimRewards[msg.sender][pToken].eraAtBlock = tokenEconomics[pToken].currentERA;
            _setRewards(pToken);
        }

        emit Deposit(msg.sender, _amount);
    }

    function withdraw() public nonReentrant onlyAfterTimelock requireSynced {
        require(!paused, "Paused.");
        require(balances[msg.sender] > 0, "No ARCADE."); 
        
        uint256 ARCADEAmount = balances[msg.sender];
        
        // 1. Zero out user's balance in state
        balances[msg.sender] = 0;
        TotalARCADESent -= ARCADEAmount;

        ARCADEToken.safeTransfer(msg.sender, ARCADEAmount);
        
        if (numberOfParticipants > 0) {
            numberOfParticipants -= 1;
            entryMap[msg.sender] = 0; 
        }

        uint256 totalTokens = activeTokenListByUserCount[msg.sender];
        for (uint256 i = 0; i < totalTokens; i++) {
            address pToken = activeTokenListByUser[msg.sender][i];
            _processSingleTokenClaim(msg.sender, pToken);
            tokenTotalStaked[pToken] -= claimRewards[msg.sender][pToken].ARCADESent;
            
            claimRewards[msg.sender][pToken].ARCADESent = 0;
            claimRewards[msg.sender][pToken].eraAtBlock = tokenEconomics[pToken].currentERA;
            _setRewards(pToken);
        }

        // 3. Emit the event with the correct withdrawn amount
        emit Withdraw(msg.sender, ARCADEAmount);
    }

    // ==========================================
    // REWARD CALCULATION & CLAIMING
    // ==========================================

    function addRewards(address _payToken, uint256 _amount) external payable onlyOwner {
        if (_payToken == address(0)) {
            require(msg.value > 0, "Must send ETH");
        } else {
            require(_amount > 0, "Must add more than zero");
            IERC20(_payToken).safeTransferFrom(msg.sender, address(this), _amount);
        }
        _initializeToken(_payToken); // Auto-initialize if not already done
        _setRewards(_payToken);
    }

    function _setRewards(address _payToken) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        uint256 stakedInThisToken = tokenTotalStaked[_payToken];
        
        if (stakedInThisToken == 0) return; 

        uint256 contract_balance;
        if (_payToken == address(0)) {
            contract_balance = address(this).balance;
        } else {
            contract_balance = IERC20(_payToken).balanceOf(address(this));
            if (_payToken == address(ARCADEToken)) {
                if (contract_balance > TotalARCADESent) {
                    contract_balance -= TotalARCADESent;
                } else {
                    contract_balance = 0;
                }
            }
        }

        if (contract_balance > tEco.allRewardsOwed) {            
            tEco.totalRewards = contract_balance - tEco.allRewardsOwed;
        } else {
            tEco.totalRewards = 0;
        }

        tEco.rewardPerStamp = (tEco.totalRewards * divisor * eralength) / (stakedInThisToken * Duration);           
        eraRewards[_payToken][tEco.currentERA] = tEco.rewardPerStamp;
    }

    /**
     * @notice The primary token claim function.
     * @dev Supports modular batch claiming to minimize gas footprints.
     * @param _payTokens Array of token addresses the user is attempting to claim.
     */
    function claim(address[] calldata _payTokens) public nonReentrant requireSynced {  
        require(!paused, "Contract is paused.");
        require(!blacklist[msg.sender], "Address is blacklisted.");
        require(_payTokens.length <= MAX_BATCH_SIZE, "Batch too large");
        for (uint256 i = 0; i < _payTokens.length; i++) {
            address pToken = _payTokens[i];
            // --- PER-TOKEN COOLDOWN CHECK ---
            if (UserTokenClaims[msg.sender][pToken] + timeLock >= block.timestamp) continue;
            _processSingleTokenClaim(msg.sender, pToken);
            Claim storage claimData = claimRewards[msg.sender][pToken];
            uint256 userRewards = claimData.rewardsOwed;
            
            if (userRewards == 0) continue;
            uint256 developed = (userRewards / 100) * developTax;
            uint256 estimatedRewards = userRewards - developed;

            uint256 rewards = estimatedRewards / divisor;
            uint256 develop = developed / divisor;

            claimData.rewardsOwed = 0;
            uint256 spentRewards = rewards + develop;
            tokenEconomics[pToken].allRewardsOwed -= spentRewards;
            Claimants[msg.sender][pToken] += rewards;

            if (pToken == address(0)) {
                // Native Coin Payout
                (bool success, ) = payable(msg.sender).call{value: rewards}("");
                require(success, "ETH transfer failed");
                
                if (develop > 0) {
                    (bool devSuccess, ) = payable(developAddress).call{value: develop}("");
                    require(devSuccess, "Dev ETH transfer failed");
                }
            } else {
                // ERC20 Payout
                IERC20 tkn = IERC20(pToken);
                tkn.safeTransfer(msg.sender, rewards);
                if (develop > 0) {
                    tkn.safeTransfer(developAddress, develop);
                }
            }

            _setRewards(pToken);
            // Apply per-token lock timestamp
            UserTokenClaims[msg.sender][pToken] = block.timestamp;
            // Record Claim History Chronologically
            uint256 recordIndex = userTotalClaimHistory[msg.sender];
            userClaimHistory[msg.sender][recordIndex] = ClaimRecord({
                timestamp: block.timestamp,
                token: pToken,
                amount: rewards
            });
            userTotalClaimHistory[msg.sender]++;

            emit RewardClaimedByUser(msg.sender, pToken, rewards);
        }
    }

    /**
     * @notice Helper function to retrieve a range of claims for any user address.
     * @dev Retrieves a slice of claim history starting at `_start` with a size of `_finish`.
     * @param _user The staker's wallet address.
     * @param _start The starting storage index in the user's claim history mapping.
     * @param _finish The total number of claim records to retrieve in this batch.
     */
    function getUserClaims(address _user, uint256 _start, uint256 _finish) external view returns (ClaimRecord[] memory) {
        uint256 end = userTotalClaimHistory[_user];
        // Ensure we do not attempt to read past the total historical records
        require(_start + _finish <= end, "Invalid request.");
        // Keep loop execution within a gas-safe range
        require(_finish <= 200, "Exceeds max query range of 200");
        ClaimRecord[] memory claims = new ClaimRecord[](_finish); 
        for (uint256 i = 0; i < _finish; i++) {
            claims[i] = userClaimHistory[_user][_start + i];
        }

        return claims;
    }

    /**
    * @notice Allows a user who missed many ERAs to catch up their personal claim state in safe batches.
    * @param _payToken The token stream to sync.
    * @param _maxEras The maximum number of ERAs to process in this transaction (e.g. 50).
    */
    function syncMyClaim(address _payToken, uint256 _maxEras) external nonReentrant {
        require(!paused, "Contract paused.");
        
        // 1. Advance global ERA first (fast if already updated by others)
        setTokenEra(_payToken);

        TokenEconomy storage tEco = tokenEconomics[_payToken];
        Claim storage claimData = claimRewards[msg.sender][_payToken];

        uint256 startPeriod = claimData.eraAtBlock;
        uint256 endPeriod = tEco.currentERA;

        if (startPeriod >= endPeriod) return;

        // Determine how many ERAs to process in this batch
        uint256 diff = endPeriod - startPeriod;
        uint256 steps = diff > _maxEras ? _maxEras : diff;
        uint256 limitEra = startPeriod + steps;

        // 2. Sum rewards only for this chunk
        uint256 rewardsAccrued = 0;
        for (uint256 e = startPeriod; e < limitEra; e++) {
            rewardsAccrued += (eraRewards[_payToken][e] * claimData.ARCADESent);
        }

        // 3. Update user's personal checkpoint
        claimData.rewardsOwed += rewardsAccrued;
        claimData.eraAtBlock = limitEra;

        uint256 rewardsDue = rewardsAccrued / divisor;
        tEco.allRewardsOwed += rewardsDue;
    }

    // sync helpers

    /**MAX_BATCH_SIZE
    * @notice Ensures user's era lag is within gas-safe limits before executing state changes.
    * @dev Only blocks transactions if pending ERAs exceed MAX_ERA (e.g. 50 ERAs).
    */
    modifier requireSynced() {
        uint256 count = activeTokenListByUserCount[msg.sender];
        
        if (count > 0) {
            uint256 cachedEraLength = eralength;
            uint256 maxBatch = MAX_ERA;
            uint256 currentTimestamp = block.timestamp;

            for (uint256 i = 0; i < count; i++) {
                address pToken = activeTokenListByUser[msg.sender][i];
                Claim storage claimData = claimRewards[msg.sender][pToken];

                // 1. Skip users with no active stake on this token stream
                if (claimData.ARCADESent == 0) continue;

                TokenEconomy storage tEco = tokenEconomics[pToken];

                if (tEco.isAdded && currentTimestamp >= tEco.startTime) {
                    uint256 liveCurrentEra = (currentTimestamp - tEco.startTime) / cachedEraLength;
                    uint256 userEra = claimData.eraAtBlock;

                    if (liveCurrentEra > userEra) {
                        uint256 lag = liveCurrentEra - userEra;
                        
                        // Only revert if the lag is too large to process inline safely
                        require(
                            lag <= maxBatch,
                            "Excessive era lag: Call syncMyClaim first"
                        );
                    }
                }
            }
        }
        _;
    }


    // ==========================================
    // ADMINISTRATIVE CONFIGURATION
    // ==========================================

    function setValues(uint256[] calldata _values) external onlyOwner { 
        tax = _values[0];
        developTax = _values[1]; 
        MAX_BATCH_SIZE = _values[2];
        MAX_ERA = _values[3];
        eralength = _values[4];
        Duration = _values[5];
        timeLock = _values[6];
    }
    
    //safely transfer and concisely register tokens to this contract.
    function transferTokens(uint256 _cost) internal returns (uint256) {
        uint256 before = ARCADEToken.balanceOf(address(this));
        ARCADEToken.safeTransferFrom(msg.sender, address(this), _cost);
        uint256 received = ARCADEToken.balanceOf(address(this)) - before;
        return received;
    } 

    function setAddresses(address _developerAddress) external onlyGuard { 
        developAddress = _developerAddress;
    }

    function setGuard(address _newGuard) external onlyGuard { 
        require(_newGuard != address(0), "Zero address");
        arcadeDAO = _newGuard; 
    }

    function addToBlacklist(address[] calldata _addresses) external onlyOwner { 
        for (uint256 i; i < _addresses.length; i++) blacklist[_addresses[i]] = true;
    }

    function removeFromBlacklist(address[] calldata _addresses) external onlyOwner { 
        for (uint256 i; i < _addresses.length; i++) blacklist[_addresses[i]] = false;
    }

    function pause(bool _p) external onlyGuard { 
        if (_p) {
            require(!paused, "Contract already paused.");
            paused = true; 
        } else {
            require(paused, "Contract not paused.");
            paused = false; 
        }
    }
}