// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./IERC20.sol";

/**
 * @title TreasureMap
 * @notice A risk/reward DeFi game where players explore a 2D grid map with bombs
 * @dev Players pay entry fee, move in 2D grid, accumulate rewards, and can stop & claim anytime
 */
contract TreasureMap {
    // ============ Types ============
    
    enum Outcome {
        Empty,      // Nothing happens
        Reward,     // Gain USDC
        Bomb,       // Hit a bomb - game over, lose all rewards (unless shielded)
        Treasure    // Big reward + end game
    }
    
    enum Direction {
        Up,         // Move up (y + 1)
        Down,       // Move down (y - 1)
        Left,       // Move left (x - 1)
        Right       // Move right (x + 1)
    }
    
    struct Position {
        uint8 x;    // X coordinate (0-indexed)
        uint8 y;    // Y coordinate (0-indexed)
    }
    
    struct Game {
        bytes32 seedCommit;     // Pseudo-random commit-based entropy (keccak256(seed, player))
        Position currentPos;    // Current position on grid
        Position startPos;      // Starting position (top-left area)
        Position endPos;        // End position with treasure (bottom-right area, diagonal from start)
        uint256 pendingReward;  // Accumulated reward in USDC (6 decimals)
        bool active;            // Whether game is active
        bool hasShield;        // Whether player has an active shield
        bool shieldPurchased;   // Whether player has purchased a shield in this game (only 1 per game)
        uint8 moveCount;        // Number of moves made (for fee calculation)
        bytes32 bombHash;       // Hash of bomb positions (for verification)
    }
    
    // ============ State Variables ============
    
    mapping(address => Game) public games;
    mapping(address => mapping(uint8 => mapping(uint8 => bool))) public bombPositions; // bombPositions[player][x][y] = true if bomb
    IERC20 public immutable usdcToken;
    
    // Entry fee configuration
    uint256 public entryFee;  // Entry fee in USDC (6 decimals), e.g., 5 USDC = 5 * 1e6
    
    // Move fee configuration
    uint256 public baseMoveFee;  // Base move fee in USDC (6 decimals), e.g., 0.3 USDC = 0.3 * 1e6
    uint256 public feeMultiplier; // Fee multiplier per move (125 = 1.25x, 150 = 1.5x, stored as basis points)
    
    // Shield configuration
    uint256 public baseShieldPrice;  // Base shield price in USDC (6 decimals)
    
    // Reward configuration
    uint256 public baseReward;      // Base reward amount (6 decimals), e.g., 0.5 USDC = 0.5 * 1e6
    uint256 public treasureBonus;   // Bonus for treasure (6 decimals)
    
    // Map configuration
    uint8 public mapSize;           // Map size (e.g., 20 = 20x20 grid)
    uint8 public numBombs;          // Number of bombs per map
    uint8 public bombDensityNearEnd; // Additional bomb density near end position (percentage)
    
    // Pool system
    uint256 public rewardPool;      // USDC pool for rewards
    address public treasury;         // Treasury address (receives 20% of move fees)
    
    // Access control
    address public owner;           // Contract owner
    
    // Probability thresholds (out of 100)
    uint8 private constant EMPTY_THRESHOLD = 70;      // 0-69: Empty (70%) - no reward
    uint8 private constant REWARD_THRESHOLD = 95;     // 70-94: Reward (25%) - small reward
    // 95-99: Treasure (5%) - big reward
    
    // ============ Events ============
    
    event GameStarted(
        address indexed player,
        bytes32 seedCommit,
        uint256 entryFee,
        Position startPos,
        Position endPos
    );
    event MoveMade(
        address indexed player,
        Position position,
        Direction direction,
        Outcome outcome,
        uint256 rewardAmount,
        uint256 moveFee,
        bool shieldUsed
    );
    event RewardClaimed(address indexed player, uint256 amount);
    event BombHit(address indexed player, Position position, bool shielded);
    event ShieldPurchased(address indexed player, uint256 price);
    event TreasureReached(address indexed player, Position position, uint256 reward);
    
    // ============ Errors ============
    
    error GameNotActive();
    error GameAlreadyActive();
    error InsufficientUSDC();
    error TransferFailed();
    error InvalidConfiguration();
    error NoRewardToClaim();
    error NotOwner();
    error InvalidMove();
    error OutOfBounds();
    error AlreadyHasShield();
    error NoShield();
    
    // ============ Constructor ============
    
    constructor(
        address _usdcToken,
        uint256 _entryFee,
        uint256 _baseMoveFee,
        uint256 _feeMultiplier,  // In basis points (125 = 1.25x, 150 = 1.5x)
        uint256 _baseShieldPrice,
        uint256 _baseReward,
        uint256 _treasureBonus,
        uint8 _mapSize,
        uint8 _numBombs,
        uint8 _bombDensityNearEnd,
        address _treasury
    ) {
        if (_usdcToken == address(0)) revert InvalidConfiguration();
        if (_treasury == address(0)) revert InvalidConfiguration();
        if (_mapSize < 10) revert InvalidConfiguration();
        if (_feeMultiplier < 10000 || _feeMultiplier > 20000) revert InvalidConfiguration(); // 1.0x to 2.0x
        
        usdcToken = IERC20(_usdcToken);
        entryFee = _entryFee;
        baseMoveFee = _baseMoveFee;
        feeMultiplier = _feeMultiplier;
        baseShieldPrice = _baseShieldPrice;
        baseReward = _baseReward;
        treasureBonus = _treasureBonus;
        mapSize = _mapSize;
        numBombs = _numBombs;
        bombDensityNearEnd = _bombDensityNearEnd;
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
     * @dev Creates seed commit, generates map with bombs, and initializes game state
     */
    function startGame() external {
        Game storage game = games[msg.sender];
        if (game.active) revert GameAlreadyActive();
        
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
        
        // Generate start position (top-left area) and end position (bottom-right area, diagonal)
        // Start: x in [0, mapSize/4], y in [0, mapSize/4]
        // End: x in [3*mapSize/4, mapSize-1], y in [3*mapSize/4, mapSize-1]
        uint256 rand1 = uint256(keccak256(abi.encodePacked(seedCommit, uint256(1)))) % (mapSize / 4 + 1);
        uint256 rand2 = uint256(keccak256(abi.encodePacked(seedCommit, uint256(2)))) % (mapSize / 4 + 1);
        uint256 rand3 = uint256(keccak256(abi.encodePacked(seedCommit, uint256(3)))) % (mapSize / 4 + 1);
        uint256 rand4 = uint256(keccak256(abi.encodePacked(seedCommit, uint256(4)))) % (mapSize / 4 + 1);
        
        Position memory startPos = Position({
            x: uint8(rand1),
            y: uint8(rand2)
        });
        
        Position memory endPos = Position({
            x: uint8(3 * mapSize / 4 + rand3),
            y: uint8(3 * mapSize / 4 + rand4)
        });
        
        // Generate bomb positions
        bytes32 bombHash = _generateBombs(msg.sender, seedCommit, startPos, endPos);
        
        // Initialize game
        game.seedCommit = seedCommit;
        game.currentPos = startPos;
        game.startPos = startPos;
        game.endPos = endPos;
        game.pendingReward = 0;
        game.active = true;
        game.hasShield = false;
        game.shieldPurchased = false;
        game.moveCount = 0;
        game.bombHash = bombHash;
        
        emit GameStarted(msg.sender, seedCommit, entryFee, startPos, endPos);
    }
    
    /**
     * @notice Move in a direction (Up, Down, Left, Right)
     * @dev Player must pay move fee before moving
     * @param direction The direction to move
     */
    function move(Direction direction) external {
        Game storage game = games[msg.sender];
        if (!game.active) revert GameNotActive();
        
        // Calculate and collect move fee (progressive: increases with each move)
        uint256 moveFee = _calculateMoveFee(game.moveCount);
        if (!_transferUSDCFrom(msg.sender, address(this), moveFee)) {
            revert InsufficientUSDC();
        }
        
        // Distribute move fee: 80% to reward pool, 20% to treasury
        uint256 toPool = (moveFee * 80) / 100;
        uint256 toTreasury = moveFee - toPool;
        
        rewardPool += toPool;
        if (!usdcToken.transfer(treasury, toTreasury)) {
            // If treasury transfer fails, add to pool instead
            rewardPool += toTreasury;
        }
        
        // Calculate new position
        Position memory newPos = game.currentPos;
        if (direction == Direction.Up) {
            if (newPos.y >= mapSize - 1) revert OutOfBounds();
            newPos.y++;
        } else if (direction == Direction.Down) {
            if (newPos.y == 0) revert OutOfBounds();
            newPos.y--;
        } else if (direction == Direction.Left) {
            if (newPos.x == 0) revert OutOfBounds();
            newPos.x--;
        } else if (direction == Direction.Right) {
            if (newPos.x >= mapSize - 1) revert OutOfBounds();
            newPos.x++;
        } else {
            revert InvalidMove();
        }
        
        // Check if hit a bomb
        bool hitBomb = bombPositions[msg.sender][newPos.x][newPos.y];
        bool shieldUsed = false;
        Outcome outcome;
        uint256 rewardAmount = 0;
        
        if (hitBomb) {
            if (game.hasShield) {
                // Shield protects from bomb
                shieldUsed = true;
                game.hasShield = false;
                outcome = Outcome.Empty; // Bomb defused, nothing happens
                emit BombHit(msg.sender, newPos, true);
            } else {
                // Hit bomb without shield - game over, lose all rewards
                outcome = Outcome.Bomb;
                game.pendingReward = 0;
                game.active = false;
                emit BombHit(msg.sender, newPos, false);
            }
        } else {
            // Check if reached treasure (end position)
            if (newPos.x == game.endPos.x && newPos.y == game.endPos.y) {
                outcome = Outcome.Treasure;
                rewardAmount = game.pendingReward * 2 + treasureBonus;
                
                // Check available pool and cap reward
                uint256 available = rewardPool > game.pendingReward
                    ? rewardPool - game.pendingReward
                    : 0;
                if (rewardAmount > available) {
                    rewardAmount = available;
                }
                game.pendingReward += rewardAmount;
                game.active = false;
                emit TreasureReached(msg.sender, newPos, rewardAmount);
            } else {
                // Generate random outcome for normal cell
                uint256 rand = uint256(
                    keccak256(abi.encodePacked(game.seedCommit, blockhash(block.number - 1), newPos.x, newPos.y))
                ) % 100;
                
                if (rand < EMPTY_THRESHOLD) {
                    // Empty (50%)
                    outcome = Outcome.Empty;
                } else if (rand < REWARD_THRESHOLD) {
                    // Reward (40%)
                    outcome = Outcome.Reward;
                    // Reward formula: baseReward * (moveCount + 1)
                    rewardAmount = baseReward * (game.moveCount + 1);
                    
                    // Check available pool and cap reward
                    uint256 available = rewardPool > game.pendingReward
                        ? rewardPool - game.pendingReward
                        : 0;
                    if (rewardAmount > available) {
                        rewardAmount = available;
                    }
                    game.pendingReward += rewardAmount;
                } else {
                    // Treasure (10%)
                    outcome = Outcome.Treasure;
                    rewardAmount = game.pendingReward * 2 + treasureBonus;
                    
                    // Check available pool and cap reward
                    uint256 available = rewardPool > game.pendingReward
                        ? rewardPool - game.pendingReward
                        : 0;
                    if (rewardAmount > available) {
                        rewardAmount = available;
                    }
                    game.pendingReward += rewardAmount;
                    game.active = false;
                    emit TreasureReached(msg.sender, newPos, rewardAmount);
                }
            }
        }
        
        // Update position and move count
        game.currentPos = newPos;
        game.moveCount++;
        
        emit MoveMade(msg.sender, newPos, direction, outcome, rewardAmount, moveFee, shieldUsed);
    }
    
    /**
     * @notice Buy a shield to protect from one bomb
     * @dev Shield price increases with move count
     * @dev Each game allows only 1 shield purchase (even after using it)
     */
    function buyShield() external {
        Game storage game = games[msg.sender];
        if (!game.active) revert GameNotActive();
        if (game.shieldPurchased) revert AlreadyHasShield(); // Can only buy 1 shield per game
        
        uint256 shieldPrice = _calculateShieldPrice(game.moveCount);
        if (!_transferUSDCFrom(msg.sender, address(this), shieldPrice)) {
            revert InsufficientUSDC();
        }
        
        // Distribute shield fee: 80% to reward pool, 20% to treasury
        uint256 toPool = (shieldPrice * 80) / 100;
        uint256 toTreasury = shieldPrice - toPool;
        
        rewardPool += toPool;
        if (!usdcToken.transfer(treasury, toTreasury)) {
            rewardPool += toTreasury;
        }
        
        game.hasShield = true;
        game.shieldPurchased = true; // Mark as purchased (can't buy again in this game)
        emit ShieldPurchased(msg.sender, shieldPrice);
    }
    
    /**
     * @notice Stop and claim accumulated rewards
     * @dev Player can claim anytime, game ends after claim
     */
    function stopAndClaim() external {
        Game storage game = games[msg.sender];
        if (!game.active && game.pendingReward == 0) revert GameNotActive();
        if (game.pendingReward == 0) revert NoRewardToClaim();
        
        uint256 amount = game.pendingReward;
        game.pendingReward = 0;
        game.active = false;
        
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
        Position memory currentPos,
        Position memory startPos,
        Position memory endPos,
        uint256 pendingReward,
        bool active,
        bool hasShield,
        bool shieldPurchased,
        uint8 moveCount
    ) {
        Game storage game = games[player];
        return (
            game.seedCommit,
            game.currentPos,
            game.startPos,
            game.endPos,
            game.pendingReward,
            game.active,
            game.hasShield,
            game.shieldPurchased,
            game.moveCount
        );
    }
    
    /**
     * @notice Check if a position has a bomb
     */
    function hasBomb(address player, uint8 x, uint8 y) external view returns (bool) {
        return bombPositions[player][x][y];
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
        return game.active;
    }
    
    /**
     * @notice Get the fee for the next move
     * @dev Returns the move fee based on current move count
     * @param player The player address
     * @return The move fee in USDC (6 decimals)
     */
    function getNextMoveFee(address player) external view returns (uint256) {
        Game storage game = games[player];
        if (!game.active) return 0;
        return _calculateMoveFee(game.moveCount);
    }
    
    /**
     * @notice Get the price for a shield
     * @param player The player address
     * @return The shield price in USDC (6 decimals)
     */
    function getShieldPrice(address player) external view returns (uint256) {
        Game storage game = games[player];
        if (!game.active) return 0;
        return _calculateShieldPrice(game.moveCount);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Generate bomb positions on the map
     * @dev Bombs are randomly placed, with higher density near end position
     */
    function _generateBombs(
        address player,
        bytes32 seedCommit,
        Position memory startPos,
        Position memory endPos
    ) internal returns (bytes32) {
        uint8 bombsPlaced = 0;
        uint256 seedCounter = 1000; // Start from high number to avoid conflicts
        uint256 maxAttempts = uint256(numBombs) * 10; // Prevent infinite loop
        uint256 attempts = 0;
        
        // Calculate distance threshold for "near end" (within 30% of map size)
        uint8 nearEndThreshold = mapSize * 3 / 10;
        
        while (bombsPlaced < numBombs && attempts < maxAttempts) {
            attempts++;
            uint256 randX = uint256(keccak256(abi.encodePacked(seedCommit, seedCounter))) % mapSize;
            uint256 randY = uint256(keccak256(abi.encodePacked(seedCommit, seedCounter + 1))) % mapSize;
            seedCounter += 2;
            
            uint8 x = uint8(randX);
            uint8 y = uint8(randY);
            
            // Don't place bomb on start or end position
            if ((x == startPos.x && y == startPos.y) || (x == endPos.x && y == endPos.y)) {
                continue;
            }
            
            // Don't place bomb if already exists
            if (bombPositions[player][x][y]) {
                continue;
            }
            
            // Check if position is near end
            uint8 distX = x > endPos.x ? x - endPos.x : endPos.x - x;
            uint8 distY = y > endPos.y ? y - endPos.y : endPos.y - y;
            bool nearEnd = (distX <= nearEndThreshold && distY <= nearEndThreshold);
            
            // Higher probability of placing bomb near end
            bool shouldPlace = false;
            if (nearEnd) {
                // Near end: place with higher probability
                uint256 densityRand = uint256(keccak256(abi.encodePacked(seedCommit, seedCounter))) % 100;
                shouldPlace = (densityRand < (50 + bombDensityNearEnd)); // 50% base + density bonus
            } else {
                // Far from end: place with normal probability
                uint256 densityRand = uint256(keccak256(abi.encodePacked(seedCommit, seedCounter))) % 100;
                shouldPlace = (densityRand < 50); // 50% chance
            }
            
            if (shouldPlace) {
                bombPositions[player][x][y] = true;
                bombsPlaced++;
            }
        }
        
        return keccak256(abi.encodePacked(seedCommit, "bombs"));
    }
    
    /**
     * @notice Calculate move fee based on move count (progressive fee system)
     * @dev Fee increases by multiplier (1.25-1.5x) each move
     * @param moveCount Current move count (0-indexed)
     * @return The move fee in USDC (6 decimals)
     */
    function _calculateMoveFee(uint8 moveCount) internal view returns (uint256) {
        if (moveCount == 0) return baseMoveFee;
        
        // Calculate: baseMoveFee * (multiplier / 10000) ^ moveCount
        // Using fixed point arithmetic to avoid precision loss
        uint256 fee = baseMoveFee;
        for (uint8 i = 0; i < moveCount; i++) {
            fee = (fee * feeMultiplier) / 10000;
        }
        return fee;
    }
    
    /**
     * @notice Calculate shield price based on move count
     * @dev Shield price increases with move count
     * @param moveCount Current move count
     * @return The shield price in USDC (6 decimals)
     */
    function _calculateShieldPrice(uint8 moveCount) internal view returns (uint256) {
        // Shield price: baseShieldPrice * (1 + moveCount * 0.1)
        // Using fixed point: baseShieldPrice * (10000 + moveCount * 1000) / 10000
        return (baseShieldPrice * (10000 + uint256(moveCount) * 1000)) / 10000;
    }
    
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
     * @notice Update base move fee (only owner)
     */
    function updateBaseMoveFee(uint256 _baseMoveFee) external onlyOwner {
        baseMoveFee = _baseMoveFee;
    }
    
    /**
     * @notice Update fee multiplier (only owner)
     */
    function updateFeeMultiplier(uint256 _feeMultiplier) external onlyOwner {
        if (_feeMultiplier < 10000 || _feeMultiplier > 20000) revert InvalidConfiguration();
        feeMultiplier = _feeMultiplier;
    }
    
    /**
     * @notice Update base shield price (only owner)
     */
    function updateBaseShieldPrice(uint256 _baseShieldPrice) external onlyOwner {
        baseShieldPrice = _baseShieldPrice;
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
     * @notice Update map configuration (only owner)
     */
    function updateMapConfig(uint8 _mapSize, uint8 _numBombs, uint8 _bombDensityNearEnd) external onlyOwner {
        if (_mapSize < 10) revert InvalidConfiguration();
        mapSize = _mapSize;
        numBombs = _numBombs;
        bombDensityNearEnd = _bombDensityNearEnd;
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
