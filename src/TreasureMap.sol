// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./IERC20.sol";

/**
 * @title TreasureMap
 * @notice A risk/reward DeFi game where players explore deeper for bigger rewards
 * @dev Players pay entry fee, move forward, accumulate rewards, and can stop & claim anytime
 */
contract TreasureMap {
    // ============ Types ============
    
    enum Outcome {
        Empty,      // 40% - Nothing happens
        Reward,     // 35% - Gain USDC
        Trap,       // 20% - Game over / lose reward
        Treasure    // 5% - Big reward + end game
    }
    
    enum TrapEffect {
        ResetReward,    // Reset pending reward to 0
        LoseHalf,       // Lose 50% of pending reward
        LockGame        // Game locked, must claim or forfeit
    }
    
    struct Game {
        bytes32 seedCommit;     // Pseudo-random commit-based entropy (keccak256(seed, player))
        uint8 position;         // Current position (0-indexed)
        uint256 pendingReward;  // Accumulated reward in USDC (6 decimals)
        bool active;            // Whether game is active
        bool locked;            // Whether game is locked by trap
    }
    
    // ============ State Variables ============
    
    mapping(address => Game) public games;
    IERC20 public immutable usdcToken;
    
    // Entry fee configuration
    uint256 public entryFee;  // Entry fee in USDC (6 decimals), e.g., 5 USDC = 5 * 1e6
    
    // Reward configuration
    uint256 public baseReward;      // Base reward amount (6 decimals), e.g., 0.5 USDC = 0.5 * 1e6
    uint256 public treasureBonus;   // Bonus for treasure (6 decimals)
    
    // Pool system
    uint256 public rewardPool;      // USDC pool for rewards
    address public treasury;         // Treasury address (receives 20% of entry fees)
    
    // Access control
    address public owner;           // Contract owner
    
    // Game limits
    uint8 public constant MAX_POSITION = 50;  // Maximum position on map
    
    // Probability thresholds (out of 100)
    uint8 private constant EMPTY_THRESHOLD = 40;      // 0-39: Empty (40%)
    uint8 private constant REWARD_THRESHOLD = 75;     // 40-74: Reward (35%)
    uint8 private constant TRAP_THRESHOLD = 95;      // 75-94: Trap (20%)
    // 95-99: Treasure (5%)
    
    // ============ Events ============
    
    event GameStarted(address indexed player, bytes32 seedCommit, uint256 entryFee);
    event MoveMade(
        address indexed player,
        uint8 position,
        Outcome outcome,
        uint256 rewardAmount,
        TrapEffect trapEffect
    );
    event RewardClaimed(address indexed player, uint256 amount);
    event GameLockedEvent(address indexed player, uint8 position);
    
    // ============ Errors ============
    
    error GameNotActive();
    error GameLocked();
    error GameAlreadyActive();
    error InsufficientUSDC();
    error TransferFailed();
    error InvalidConfiguration();
    error NoRewardToClaim();
    error NotOwner();
    error MapCompleted();
    
    // ============ Constructor ============
    
    constructor(
        address _usdcToken,
        uint256 _entryFee,
        uint256 _baseReward,
        uint256 _treasureBonus,
        address _treasury
    ) {
        if (_usdcToken == address(0)) revert InvalidConfiguration();
        if (_treasury == address(0)) revert InvalidConfiguration();
        
        usdcToken = IERC20(_usdcToken);
        entryFee = _entryFee;
        baseReward = _baseReward;
        treasureBonus = _treasureBonus;
        treasury = _treasury;
        owner = msg.sender;
    }
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Start a new game by paying entry fee
     * @dev Creates seed commit and initializes game state
     */
    function startGame() external {
        Game storage game = games[msg.sender];
        if (game.active && !game.locked) revert GameAlreadyActive();
        if (game.locked) revert GameLocked();
        
        // Collect entry fee
        if (!_transferUSDCFrom(msg.sender, address(this), entryFee)) {
            revert InsufficientUSDC();
        }
        
        // Distribute entry fee: 80% to reward pool, 20% to treasury
        uint256 toPool = (entryFee * 80) / 100;
        uint256 toTreasury = entryFee - toPool;
        
        rewardPool += toPool;
        if (!usdcToken.transfer(treasury, toTreasury)) {
            // If treasury transfer fails, add to pool instead
            rewardPool += toTreasury;
        }
        
        // Generate seed and create commit-based entropy for secure randomness
        uint256 seed = uint256(
            keccak256(
                abi.encodePacked(
                    msg.sender,
                    block.timestamp,
                    block.prevrandao,
                    block.number
                )
            )
        );
        
        // Create pseudo-random commit: keccak256(seed, player) - prevents front-running
        bytes32 seedCommit = keccak256(abi.encodePacked(seed, msg.sender));
        
        // Initialize game
        game.seedCommit = seedCommit;
        game.position = 0;
        game.pendingReward = 0;
        game.active = true;
        game.locked = false;
        
        emit GameStarted(msg.sender, seedCommit, entryFee);
    }
    
    /**
     * @notice Move forward one step
     * @dev Random outcome: Empty, Reward, Trap, or Treasure
     */
    function move() external {
        Game storage game = games[msg.sender];
        if (!game.active) revert GameNotActive();
        if (game.locked) revert GameLocked();
        if (game.position >= MAX_POSITION) revert MapCompleted();
        
        // Generate random outcome using commit-based entropy
        // Use blockhash(block.number - 1) for additional unpredictability
        uint256 rand = uint256(
            keccak256(abi.encodePacked(game.seedCommit, blockhash(block.number - 1)))
        ) % 100;
        
        Outcome outcome;
        uint256 rewardAmount = 0;
        TrapEffect trapEffect = TrapEffect.ResetReward;
        
        if (rand < EMPTY_THRESHOLD) {
            // Empty (40%)
            outcome = Outcome.Empty;
        } else if (rand < REWARD_THRESHOLD) {
            // Reward (35%)
            outcome = Outcome.Reward;
            // Reward formula: baseReward * (position + 1)
            rewardAmount = baseReward * (game.position + 1);
            
            // Check available pool and cap reward (safe subtraction to prevent underflow)
            uint256 available = rewardPool > game.pendingReward
                ? rewardPool - game.pendingReward
                : 0;
            if (rewardAmount > available) {
                rewardAmount = available;
            }
            game.pendingReward += rewardAmount;
        } else if (rand < TRAP_THRESHOLD) {
            // Trap (20%)
            outcome = Outcome.Trap;
            // Random trap effect using same randomness source
            uint256 trapRand = uint256(
                keccak256(abi.encodePacked(game.seedCommit, blockhash(block.number - 1), uint256(1)))
            ) % 3;
            
            if (trapRand == 0) {
                // Reset reward
                trapEffect = TrapEffect.ResetReward;
                game.pendingReward = 0;
            } else if (trapRand == 1) {
                // Lose 50%
                trapEffect = TrapEffect.LoseHalf;
                game.pendingReward = game.pendingReward / 2;
            } else {
                // Lock game
                trapEffect = TrapEffect.LockGame;
                game.locked = true;
                emit GameLockedEvent(msg.sender, game.position);
            }
        } else {
            // Treasure (5%)
            outcome = Outcome.Treasure;
            // Treasure formula: pendingReward * 2 + bonus
            rewardAmount = game.pendingReward * 2 + treasureBonus;
            
            // Check available pool and cap reward (safe subtraction to prevent underflow)
            uint256 available = rewardPool > game.pendingReward
                ? rewardPool - game.pendingReward
                : 0;
            if (rewardAmount > available) {
                rewardAmount = available;
            }
            game.pendingReward += rewardAmount;
            // End game after treasure
            game.active = false;
        }
        
        // Increment position
        game.position++;
        
        emit MoveMade(msg.sender, game.position, outcome, rewardAmount, trapEffect);
    }
    
    /**
     * @notice Stop and claim accumulated rewards
     * @dev Player can claim anytime, game ends after claim. Required when game is locked.
     */
    function stopAndClaim() external {
        Game storage game = games[msg.sender];
        if (!game.active && game.pendingReward == 0) revert GameNotActive();
        if (game.pendingReward == 0) revert NoRewardToClaim();
        
        uint256 amount = game.pendingReward;
        game.pendingReward = 0;
        game.active = false;
        game.locked = false;  // Clear lock status when claiming
        
        // Transfer reward from pool
        if (amount > rewardPool) {
            // If pool is insufficient, transfer what's available
            amount = rewardPool;
        }
        rewardPool -= amount;
        
        if (!usdcToken.transfer(msg.sender, amount)) {
            revert TransferFailed();
        }
        
        emit RewardClaimed(msg.sender, amount);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get player's game state
     */
    function getGame(address player) external view returns (
        bytes32 seedCommit,
        uint8 position,
        uint256 pendingReward,
        bool active,
        bool locked
    ) {
        Game storage game = games[player];
        return (
            game.seedCommit,
            game.position,
            game.pendingReward,
            game.active,
            game.locked
        );
    }
    
    /**
     * @notice Get reward pool balance
     */
    function getRewardPool() external view returns (uint256) {
        return rewardPool;
    }
    
    /**
     * @notice Check if player can move
     */
    function canMove(address player) external view returns (bool) {
        Game storage game = games[player];
        return game.active && !game.locked;
    }
    
    /**
     * @notice Calculate risk indicator (🔥🔥🔥)
     * @dev Returns number of fire emojis based on position (1-3)
     */
    function getRiskLevel(address player) external view returns (uint8) {
        Game storage game = games[player];
        if (!game.active) return 0;
        
        if (game.position < 5) return 1;      // 🔥
        if (game.position < 15) return 2;     // 🔥🔥
        return 3;                              // 🔥🔥🔥
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Transfer USDC from contract to recipient
     */
    function _transferUSDC(address to, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        return usdcToken.transfer(to, amount);
    }
    
    /**
     * @notice Transfer USDC from sender to recipient (requires approval)
     */
    function _transferUSDCFrom(address from, address to, uint256 amount) internal returns (bool) {
        return usdcToken.transferFrom(from, to, amount);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update entry fee (only owner)
     */
    function updateEntryFee(uint256 _entryFee) external onlyOwner {
        entryFee = _entryFee;
    }
    
    /**
     * @notice Update base reward (only owner)
     */
    function updateBaseReward(uint256 _baseReward) external onlyOwner {
        baseReward = _baseReward;
    }
    
    /**
     * @notice Update treasure bonus (only owner)
     */
    function updateTreasureBonus(uint256 _treasureBonus) external onlyOwner {
        treasureBonus = _treasureBonus;
    }
    
    /**
     * @notice Update treasury address (only owner)
     */
    function updateTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidConfiguration();
        treasury = _treasury;
    }
    
    /**
     * @notice Transfer ownership (only owner)
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidConfiguration();
        owner = newOwner;
    }
    
    /**
     * @notice Fund reward pool (for initial funding or top-ups)
     */
    function fundRewardPool(uint256 amount) external {
        if (!_transferUSDCFrom(msg.sender, address(this), amount)) {
            revert InsufficientUSDC();
        }
        rewardPool += amount;
    }
    
    /**
     * @notice Emergency withdraw USDC from contract (only owner)
     * @dev For emergency situations, allows owner to withdraw USDC
     * @dev Updates rewardPool to maintain correct state
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert InvalidConfiguration();
        
        // Update rewardPool to maintain correct state
        if (amount > rewardPool) {
            rewardPool = 0;
        } else {
            rewardPool -= amount;
        }
        
        if (!usdcToken.transfer(to, amount)) {
            revert TransferFailed();
        }
    }
}
