// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @title Harvester V2
 * @notice Multi-token reward harvester with high-precision lazy accounting
 *         and true pool-wide liability booking.
 *
 * PRECISION MODEL
 * ---------------
 * 1. When eras close, the contract calculates rewardPerStamp and immediately
 *    books the FULL pool-wide liability into allRewardsOwed:
 *
 *      fullLiability = (rewardPerStamp * lag * totalStaked) / divisor
 *      allRewardsOwed += fullLiability
 *
 * 2. Individual users later only claim their personal share of an already
 *    reserved total. Their claim action never increases allRewardsOwed.
 *
 * 3. allRewardsOwed is only reduced when tokens are actually transferred out.
 *
 * This guarantees that the total liability is known and reserved the moment
 * the rate is stamped, based on the entire pool weight.
 *
 * Rate formula (with effectiveDuration):
 *   timeFactor        = lag * eralength
 *   effectiveDuration = max(Duration, timeFactor)
 *   rewardPerStamp    = (available * divisor * eralength) / (staked * effectiveDuration)
 */

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/access/Ownable.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/utils/SafeERC20.sol";

interface IProofOfAccess {
    function getPlayer(address _user, uint256 _nft) external view returns (uint256);
}

contract Harvester is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==========================================
    // STATE
    // ==========================================

    IERC20 public ARCADEToken;
    IProofOfAccess public proofOfAccess;

    uint256 public MAX_BATCH_SIZE = 50;

    mapping(address => mapping(uint256 => address)) public activeTokenListByUser;
    mapping(address => uint256) public activeTokenListByUserCount;
    mapping(address => mapping(address => bool)) public isSubscribed;
    mapping(address => uint256) public tokenTotalStaked;

    struct TokenEconomy {
        uint256 totalRewards;      // Available for future rates
        uint256 allRewardsOwed;    // Full pool-wide reserved liability
        uint256 rewardPerStamp;
        uint256 currentERA;
        uint256 startTime;
        bool isAdded;
    }
    mapping(address => TokenEconomy) public tokenEconomics;
    mapping(address => mapping(uint256 => uint256)) public eraRewards;

    uint256 public eralength = 86400;
    uint256 public immutable startTime;
    uint256 public numberOfParticipants = 0;
    uint256 public Duration = 604800;
    uint256 public timeLock = 86400;
    uint256 public TotalARCADESent = 1;
    uint256 public tax = 0;
    uint256 public TaxTotal = 0;
    uint256 public developTax = 0;
    uint256 public MAX_ERA = 50;
    uint256 private constant divisor = 100 ether;

    address private arcadeDAO;
    address public developAddress;
    bool public paused = false;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public entryMap;
    mapping(address => bool) public blacklist;
    mapping(address => mapping(address => uint256)) public UserTokenClaims;

    struct Claim {
        uint256 eraAtBlock;
        uint256 rewardsOwed;       // User's personal share (scaled)
        uint256 ARCADESent;
    }
    mapping(address => mapping(address => Claim)) public claimRewards;
    mapping(address => mapping(address => uint256)) public Claimants;

    struct ClaimRecord {
        uint256 timestamp;
        address token;
        uint256 amount;
    }
    mapping(address => mapping(uint256 => ClaimRecord)) public userClaimHistory;
    mapping(address => uint256) public userTotalClaimHistory;

    // ==========================================
    // EVENTS
    // ==========================================

    event TokenSubscribed(address indexed user, uint256 currentCount, uint256 maxAllowed);
    event SyncProgress(address indexed user, bool done, uint256 remaining);
    event RewardClaimedByUser(address indexed user, address indexed token, uint256 amount);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event NativeCoinDrop(address indexed sender, uint256 amount);
    event RewardsUpdated(address indexed token, uint256 totalRewards);
    event FullLiabilityBooked(address indexed token, uint256 liability, uint256 lag);

    // ==========================================
    // MODIFIERS
    // ==========================================

    modifier onlyGuard() {
        require(msg.sender == arcadeDAO, "Not authorized.");
        _;
    }

    modifier onlyAfterTimelock() {
        require(entryMap[msg.sender] + timeLock < block.timestamp, "Timelocked.");
        _;
    }

    modifier requireSynced() {
        uint256 count = activeTokenListByUserCount[msg.sender];
        if (count > 0) {
            uint256 cachedEraLength = eralength;
            uint256 maxBatch = MAX_ERA;
            uint256 currentTimestamp = block.timestamp;

            for (uint256 i = 0; i < count; i++) {
                address pToken = activeTokenListByUser[msg.sender][i];
                Claim storage claimData = claimRewards[msg.sender][pToken];
                if (claimData.ARCADESent == 0) continue;

                TokenEconomy storage tEco = tokenEconomics[pToken];
                if (tEco.isAdded && currentTimestamp >= tEco.startTime) {
                    uint256 liveCurrentEra = (currentTimestamp - tEco.startTime) / cachedEraLength;
                    if (liveCurrentEra > claimData.eraAtBlock) {
                        require(liveCurrentEra - claimData.eraAtBlock <= maxBatch, "Excessive era lag: Call syncMyClaim first");
                    }
                }
            }
        }
        _;
    }

    // ==========================================
    // CONSTRUCTOR
    // ==========================================

    constructor(address _ARCADEToken, address _developAddress, address _newGuard) Ownable(msg.sender) {
        ARCADEToken = IERC20(_ARCADEToken);
        developAddress = _developAddress;
        arcadeDAO = _newGuard;
        startTime = block.timestamp;
    }

    // ==========================================
    // RECEIVE
    // ==========================================

    receive() external payable {
        _initializeToken(address(0));
        emit NativeCoinDrop(msg.sender, msg.value);
    }

    // ==========================================
    // INITIALIZATION
    // ==========================================

    function _initializeToken(address _payToken) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        if (!tEco.isAdded) {
            tEco.isAdded = true;
            tEco.startTime = block.timestamp;
            tEco.currentERA = 0;
        }
    }

    // ==========================================
    // PROOF OF ACCESS
    // ==========================================

    function setProofOfAccessContract(address _proofOfAccessAddress) external onlyGuard {
        proofOfAccess = IProofOfAccess(_proofOfAccessAddress);
    }

    function getMaxSubscriptions(address _user, uint256 _nft) internal view returns (uint256) {
        if (address(proofOfAccess) == address(0)) return MAX_BATCH_SIZE;
        return proofOfAccess.getPlayer(_user, _nft);
    }

    // ==========================================
    // SUBSCRIPTION MANAGEMENT
    // ==========================================

    function subscribeToToken(address[] calldata _newTokens, uint256 _nft) external nonReentrant {
        require(!paused, "Contract is paused.");
        require(!blacklist[msg.sender], "Address is blacklisted.");

        uint256 maxAllowed = getMaxSubscriptions(msg.sender, _nft);
        require(_newTokens.length <= maxAllowed, "Exceeds Proof_of_Access tier limit");
        require(_newTokens.length <= MAX_BATCH_SIZE, "Exceeds absolute batch limit");

        uint256 currentCount = activeTokenListByUserCount[msg.sender];
        uint256 userStake = balances[msg.sender];

        // Clear old subscriptions
        for (uint256 i = 0; i < currentCount; i++) {
            address oldToken = activeTokenListByUser[msg.sender][i];
            _processSingleTokenClaim(msg.sender, oldToken);

            if (userStake > 0) {
                tokenTotalStaked[oldToken] -= claimRewards[msg.sender][oldToken].ARCADESent;
            }
            claimRewards[msg.sender][oldToken].ARCADESent = 0;
            isSubscribed[msg.sender][oldToken] = false;
            _setRewards(oldToken, 1);
        }

        // Install new subscriptions
        for (uint256 i = 0; i < _newTokens.length; i++) {
            address newToken = _newTokens[i];
            require(newToken.code.length > 0 || newToken == address(0), "Invalid token");
            require(!isSubscribed[msg.sender][newToken], "Duplicate token");

            _initializeToken(newToken);
            setTokenEra(newToken);

            activeTokenListByUser[msg.sender][i] = newToken;
            isSubscribed[msg.sender][newToken] = true;
            claimRewards[msg.sender][newToken].eraAtBlock = tokenEconomics[newToken].currentERA;

            if (userStake > 0) {
                tokenTotalStaked[newToken] += userStake;
                claimRewards[msg.sender][newToken].ARCADESent = userStake;
            }
            _setRewards(newToken, 1);
        }

        activeTokenListByUserCount[msg.sender] = _newTokens.length;
        emit TokenSubscribed(msg.sender, _newTokens.length, maxAllowed);
    }

    function getUserSubscriptions(address _user) external view returns (address[] memory) {
        uint256 count = activeTokenListByUserCount[_user];
        address[] memory subs = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            subs[i] = activeTokenListByUser[_user][i];
        }
        return subs;
    }

    // ==========================================
    // ERA PROGRESSION + FULL LIABILITY BOOKING
    // ==========================================

    /**
    * @dev CHUNKED ERA PROGRESSION:
    * Advances closed eras incrementally up to MAX_ERA steps per transaction 
    * to prevent out-of-gas errors over massive time gaps.
    */
    function setTokenEra(address _payToken) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        if (!tEco.isAdded) return;

        uint256 timeElapsed = block.timestamp - tEco.startTime;
        uint256 totalErasElapsed = timeElapsed / eralength;

        if (totalErasElapsed <= tEco.currentERA) return;

        uint256 diff = totalErasElapsed - tEco.currentERA;
        // BOUND BY MAX_ERA: Process in safe chunks (max 50 eras per tx)
        uint256 lag = diff > MAX_ERA ? MAX_ERA : diff;
        uint256 staked = tokenTotalStaked[_payToken];

        // Calculate rate with effectiveDuration using this batch lag
        _setRewards(_payToken, lag);

        // Stamp the rate across this batch of eras
        for (uint256 i = 0; i < lag; i++) {
            eraRewards[_payToken][tEco.currentERA] = tEco.rewardPerStamp;
            tEco.currentERA++;
        }

        if (staked > 0 && tEco.rewardPerStamp > 0) {
            uint256 fullLiability = (tEco.rewardPerStamp * lag * staked) / divisor;
            tEco.allRewardsOwed += fullLiability;
            emit FullLiabilityBooked(_payToken, fullLiability, lag);
        }
    }

    /**
     * @dev Core rate calculation with effectiveDuration.
     *      Does NOT book liabilities (that is done in setTokenEra).
     */
    function _setRewards(address _payToken, uint256 lag) internal {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        uint256 staked = tokenTotalStaked[_payToken];

        if (staked == 0) {
            tEco.totalRewards = 0;
            tEco.rewardPerStamp = 0;
            return;
        }

        uint256 contractBalance = _realBalance(_payToken);
        uint256 available = contractBalance > tEco.allRewardsOwed ? contractBalance - tEco.allRewardsOwed : 0;
        tEco.totalRewards = available;

        // effectiveDuration logic
        uint256 timeFactor = lag > 0 ? lag * eralength : eralength;
        uint256 effectiveDuration = timeFactor > Duration ? timeFactor : Duration;

        tEco.rewardPerStamp = (available * divisor * eralength) / (staked * effectiveDuration);

        // Keep open era updated
        eraRewards[_payToken][tEco.currentERA] = tEco.rewardPerStamp;

        emit RewardsUpdated(_payToken, available);
    }

    function _setRewards(address _payToken) internal {
        _setRewards(_payToken, 1);
    }

    function _realBalance(address _payToken) internal view returns (uint256) {
        if (_payToken == address(0)) {
            return address(this).balance;
        }
        uint256 bal = IERC20(_payToken).balanceOf(address(this));
        if (_payToken == address(ARCADEToken)) {
            return bal > TotalARCADESent ? bal - TotalARCADESent : 0;
        }
        return bal;
    }

    // ==========================================
    // USER SHARE CALCULATION (no longer increases allRewardsOwed)
    // ==========================================

    /**
     * @dev Calculates the user's personal share of already-booked eras.
     *      Does NOT increase allRewardsOwed — the full liability was already
     *      reserved when the eras were closed.
     */
    function _processSingleTokenClaim(address user, address pToken) internal {
        setTokenEra(pToken); // may book new full liabilities if eras closed

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
                rewardsAccrued += eraRewards[pToken][e] * claimData.ARCADESent;
            }

            // Only credit the user's personal share
            claimData.rewardsOwed += rewardsAccrued;
            claimData.eraAtBlock = endPeriod;

            // NOTE: allRewardsOwed is NOT increased here.
            // The full pool liability was already booked in setTokenEra.
        }
    }

    // ==========================================
    // DEPOSIT / WITHDRAW
    // ==========================================

    function deposit(uint256 _amount) public nonReentrant requireSynced {
        require(!paused, "Paused.");
        require(_amount > 0, "Amount > 0.");
        require(!blacklist[msg.sender], "Blacklisted.");

        uint256 received = transferTokens(_amount);
        uint256 toll = (_amount * tax) / 100;
        uint256 amount = received - toll;
        TaxTotal += toll;

        if (balances[msg.sender] == 0) numberOfParticipants++;

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
            _setRewards(pToken, 1);
        }

        emit Deposit(msg.sender, _amount);
    }

    function withdraw() public nonReentrant onlyAfterTimelock requireSynced {
        require(!paused, "Paused.");
        require(balances[msg.sender] > 0, "No ARCADE.");

        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        TotalARCADESent -= amount;

        ARCADEToken.safeTransfer(msg.sender, amount);

        if (numberOfParticipants > 0) {
            numberOfParticipants--;
            entryMap[msg.sender] = 0;
        }

        uint256 totalTokens = activeTokenListByUserCount[msg.sender];
        for (uint256 i = 0; i < totalTokens; i++) {
            address pToken = activeTokenListByUser[msg.sender][i];
            _processSingleTokenClaim(msg.sender, pToken);

            tokenTotalStaked[pToken] -= claimRewards[msg.sender][pToken].ARCADESent;
            claimRewards[msg.sender][pToken].ARCADESent = 0;
            claimRewards[msg.sender][pToken].eraAtBlock = tokenEconomics[pToken].currentERA;
            _setRewards(pToken, 1);
        }

        emit Withdraw(msg.sender, amount);
    }

    // ==========================================
    // REWARD INJECTION
    // ==========================================

    function addRewards(address _payToken, uint256 _amount) external payable onlyOwner {
        if (_payToken == address(0)) {
            require(msg.value > 0, "Must send ETH");
        } else {
            require(_amount > 0, "Amount > 0");
            IERC20(_payToken).safeTransferFrom(msg.sender, address(this), _amount);
        }
        _initializeToken(_payToken);
        _setRewards(_payToken, 1);
    }

    // ==========================================
    // CLAIMING
    // ==========================================

    function claim(address[] calldata _payTokens) public nonReentrant requireSynced {
        require(!paused, "Contract is paused.");
        require(!blacklist[msg.sender], "Address is blacklisted.");
        require(_payTokens.length <= MAX_BATCH_SIZE, "Batch too large");

        for (uint256 i = 0; i < _payTokens.length; i++) {
            address pToken = _payTokens[i];
            if (UserTokenClaims[msg.sender][pToken] + timeLock >= block.timestamp) continue;

            _processSingleTokenClaim(msg.sender, pToken);

            Claim storage claimData = claimRewards[msg.sender][pToken];
            uint256 userRewards = claimData.rewardsOwed;
            if (userRewards == 0) continue;

            uint256 developed = (userRewards / 100) * developTax;
            uint256 estimated = userRewards - developed;

            uint256 rewards = estimated / divisor;
            uint256 develop = developed / divisor;

            // Clear user share
            claimData.rewardsOwed = 0;

            // Reduce the already-booked pool liability
            uint256 spent = rewards + develop;
            if (spent > tokenEconomics[pToken].allRewardsOwed) {
                spent = tokenEconomics[pToken].allRewardsOwed; // safety
            }
            tokenEconomics[pToken].allRewardsOwed -= spent;

            Claimants[msg.sender][pToken] += rewards;

            // Transfer
            if (pToken == address(0)) {
                (bool ok,) = payable(msg.sender).call{value: rewards}("");
                require(ok, "ETH transfer failed");
                if (develop > 0) {
                    (bool ok2,) = payable(developAddress).call{value: develop}("");
                    require(ok2, "Dev ETH transfer failed");
                }
            } else {
                IERC20(pToken).safeTransfer(msg.sender, rewards);
                if (develop > 0) {
                    IERC20(pToken).safeTransfer(developAddress, develop);
                }
            }

            _setRewards(pToken, 1);
            UserTokenClaims[msg.sender][pToken] = block.timestamp;

            uint256 idx = userTotalClaimHistory[msg.sender];
            userClaimHistory[msg.sender][idx] = ClaimRecord(block.timestamp, pToken, rewards);
            userTotalClaimHistory[msg.sender]++;

            emit RewardClaimedByUser(msg.sender, pToken, rewards);
        }
    }

    function getUserClaims(address _user, uint256 _start, uint256 _finish) external view returns (ClaimRecord[] memory) {
        uint256 end = userTotalClaimHistory[_user];
        require(_start + _finish <= end, "Invalid request");
        require(_finish <= 200, "Max 200");

        ClaimRecord[] memory list = new ClaimRecord[](_finish);
        for (uint256 i = 0; i < _finish; i++) {
            list[i] = userClaimHistory[_user][_start + i];
        }
        return list;
    }

    /**
     * @notice Gas-limited sync. Only calculates the user's personal share.
     *         Full pool liability was already booked when the eras closed.
     */
    function syncMyClaim(address _payToken, uint256 _maxEras) external nonReentrant {
        require(!paused, "Contract paused.");

        setTokenEra(_payToken); // books any new full liabilities

        TokenEconomy storage tEco = tokenEconomics[_payToken];
        Claim storage claimData = claimRewards[msg.sender][_payToken];

        uint256 startPeriod = claimData.eraAtBlock;
        uint256 endPeriod = tEco.currentERA;

        if (startPeriod >= endPeriod) return;

        uint256 diff = endPeriod - startPeriod;
        uint256 steps = diff > _maxEras ? _maxEras : diff;
        uint256 limitEra = startPeriod + steps;

        uint256 rewardsAccrued = 0;
        for (uint256 e = startPeriod; e < limitEra; e++) {
            rewardsAccrued += eraRewards[_payToken][e] * claimData.ARCADESent;
        }

        // Only credit personal share — do NOT touch allRewardsOwed
        claimData.rewardsOwed += rewardsAccrued;
        claimData.eraAtBlock = limitEra;

        emit SyncProgress(msg.sender, claimData.eraAtBlock >= endPeriod, endPeriod - claimData.eraAtBlock);
    }

    // ==========================================
    // ADMIN
    // ==========================================

    function setValues(uint256[] calldata _values) external onlyOwner {
        require(_values.length >= 7, "Invalid length");
        tax = _values[0];
        developTax = _values[1];
        MAX_BATCH_SIZE = _values[2];
        MAX_ERA = _values[3];
        eralength = _values[4];
        Duration = _values[5];
        timeLock = _values[6];
    }

    function transferTokens(uint256 _cost) internal returns (uint256) {
        uint256 before = ARCADEToken.balanceOf(address(this));
        ARCADEToken.safeTransferFrom(msg.sender, address(this), _cost);
        return ARCADEToken.balanceOf(address(this)) - before;
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
            require(!paused, "Already paused");
            paused = true;
        } else {
            require(paused, "Not paused");
            paused = false;
        }
    }

    // ==========================================
    // VIEWS
    // ==========================================

    function availableRewards(address _payToken) external view returns (uint256) {
        uint256 bal = _realBalance(_payToken);
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        return bal > tEco.allRewardsOwed ? bal - tEco.allRewardsOwed : 0;
    }

    function pendingEras(address _user, address _payToken) external view returns (uint256) {
        TokenEconomy storage tEco = tokenEconomics[_payToken];
        if (!tEco.isAdded) return 0;
        uint256 liveEra = (block.timestamp - tEco.startTime) / eralength;
        uint256 userEra = claimRewards[_user][_payToken].eraAtBlock;
        return liveEra > userEra ? liveEra - userEra : 0;
    }
}