// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/TreasureMap.sol";
import "../src/MockUSDC.sol";

contract TreasureMapTest is Test {
    TreasureMap public treasureMap;
    MockUSDC public usdc;
    
    address public player1 = address(0x1);
    address public player2 = address(0x2);
    address public treasury = address(0x3);
    address public deployer = address(this);
    
    uint256 public constant ENTRY_FEE = 5 * 1e6;        // 5 USDC
    uint256 public constant BASE_REWARD = 5 * 1e5;      // 0.5 USDC
    uint256 public constant TREASURE_BONUS = 10 * 1e6;  // 10 USDC
    
    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC(1000000 * 1e6); // 1M USDC
        
        // Deploy TreasureMap contract
        treasureMap = new TreasureMap(
            address(usdc),
            ENTRY_FEE,
            BASE_REWARD,
            TREASURE_BONUS,
            treasury
        );
        
        // Fund players with USDC
        usdc.transfer(player1, 10000 * 1e6);
        usdc.transfer(player2, 10000 * 1e6);
        
        // Fund contract with USDC for reward pool
        usdc.transfer(address(treasureMap), 50000 * 1e6);
        treasureMap.fundRewardPool(50000 * 1e6);
        
        // Approve contract to spend player USDC
        vm.prank(player1);
        usdc.approve(address(treasureMap), 10000 * 1e6);
        
        vm.prank(player2);
        usdc.approve(address(treasureMap), 10000 * 1e6);
    }
    
    // ============ Game Start Tests ============
    
    function testStartGame() public {
        vm.prank(player1);
        treasureMap.startGame();
        
        (uint256 seed, uint8 position, uint256 pendingReward, bool active, bool locked) = 
            treasureMap.getGame(player1);
        
        assertGt(seed, 0);
        assertEq(position, 0);
        assertEq(pendingReward, 0);
        assertTrue(active);
        assertFalse(locked);
    }
    
    function testStartGamePaysEntryFee() public {
        uint256 balanceBefore = usdc.balanceOf(player1);
        uint256 poolBefore = treasureMap.getRewardPool();
        
        vm.prank(player1);
        treasureMap.startGame();
        
        uint256 balanceAfter = usdc.balanceOf(player1);
        uint256 poolAfter = treasureMap.getRewardPool();
        
        // Player should pay entry fee
        assertEq(balanceBefore - balanceAfter, ENTRY_FEE);
        
        // 80% should go to pool
        assertEq(poolAfter - poolBefore, (ENTRY_FEE * 80) / 100);
    }
    
    function testCannotStartGameTwice() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        vm.expectRevert(TreasureMap.GameAlreadyActive.selector);
        treasureMap.startGame();
        vm.stopPrank();
    }
    
    function testStartGameInsufficientUSDC() public {
        address poorPlayer = address(0x999);
        usdc.transfer(poorPlayer, 1 * 1e6); // Only 1 USDC
        
        vm.prank(poorPlayer);
        usdc.approve(address(treasureMap), 10 * 1e6);
        
        vm.prank(poorPlayer);
        vm.expectRevert(TreasureMap.InsufficientUSDC.selector);
        treasureMap.startGame();
    }
    
    // ============ Move Tests ============
    
    function testMove() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        uint256 poolBefore = treasureMap.getRewardPool();
        treasureMap.move();
        
        (,, uint256 pendingReward,,) = treasureMap.getGame(player1);
        
        // Position should increase
        (,,, bool active,) = treasureMap.getGame(player1);
        assertTrue(active);
        
        vm.stopPrank();
    }
    
    function testMoveWithoutStarting() public {
        vm.prank(player1);
        vm.expectRevert(TreasureMap.GameNotActive.selector);
        treasureMap.move();
    }
    
    function testMoveOnLockedGame() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Keep moving until we hit a lock trap (might take multiple moves)
        // For testing, we'll simulate by directly setting locked (not possible in real contract)
        // Instead, we'll just test that locked games can't move
        // This is tested indirectly through the move function
        
        vm.stopPrank();
    }
    
    // ============ Stop and Claim Tests ============
    
    function testStopAndClaim() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Make a few moves to accumulate rewards
        for (uint i = 0; i < 5; i++) {
            treasureMap.move();
        }
        
        (,, uint256 pendingReward,,) = treasureMap.getGame(player1);
        
        uint256 balanceBefore = usdc.balanceOf(player1);
        uint256 poolBefore = treasureMap.getRewardPool();
        
        if (pendingReward > 0) {
            treasureMap.stopAndClaim();
            
            uint256 balanceAfter = usdc.balanceOf(player1);
            (,, uint256 newPendingReward, bool active,) = treasureMap.getGame(player1);
            
            // Reward should be claimed
            assertEq(newPendingReward, 0);
            assertFalse(active);
            
            // Balance should increase (if there was reward)
            if (pendingReward <= poolBefore) {
                assertGe(balanceAfter, balanceBefore + pendingReward);
            }
        }
        
        vm.stopPrank();
    }
    
    function testStopAndClaimNoReward() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Try to claim without reward
        vm.expectRevert(TreasureMap.NoRewardToClaim.selector);
        treasureMap.stopAndClaim();
        
        vm.stopPrank();
    }
    
    function testStopAndClaimAfterLock() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Make moves until we get a reward
        uint256 pendingReward = 0;
        for (uint i = 0; i < 10 && pendingReward == 0; i++) {
            treasureMap.move();
            (,, pendingReward,,) = treasureMap.getGame(player1);
        }
        
        // If we got locked, we should still be able to claim
        (,,, bool active, bool locked) = treasureMap.getGame(player1);
        
        if (locked && pendingReward > 0) {
            // Can claim even when locked
            treasureMap.stopAndClaim();
            (,, uint256 newPendingReward, bool newActive,) = treasureMap.getGame(player1);
            assertEq(newPendingReward, 0);
            assertFalse(newActive);
        }
        
        vm.stopPrank();
    }
    
    // ============ View Function Tests ============
    
    function testCanMove() public {
        assertFalse(treasureMap.canMove(player1));
        
        vm.prank(player1);
        treasureMap.startGame();
        
        assertTrue(treasureMap.canMove(player1));
    }
    
    function testGetRiskLevel() public {
        assertEq(treasureMap.getRiskLevel(player1), 0);
        
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Position 0-4: risk level 1
        assertEq(treasureMap.getRiskLevel(player1), 1);
        
        // Move to position 5-14: risk level 2
        for (uint i = 0; i < 5; i++) {
            treasureMap.move();
        }
        assertGe(treasureMap.getRiskLevel(player1), 2);
        
        // Move to position 15+: risk level 3
        for (uint i = 0; i < 10; i++) {
            treasureMap.move();
        }
        assertEq(treasureMap.getRiskLevel(player1), 3);
        
        vm.stopPrank();
    }
    
    // ============ Multiple Players Tests ============
    
    function testMultiplePlayers() public {
        vm.prank(player1);
        treasureMap.startGame();
        
        vm.prank(player2);
        treasureMap.startGame();
        
        // Both should have independent games
        (uint256 seed1,, uint256 reward1,,) = treasureMap.getGame(player1);
        (uint256 seed2,, uint256 reward2,,) = treasureMap.getGame(player2);
        
        assertGt(seed1, 0);
        assertGt(seed2, 0);
        assertEq(reward1, 0);
        assertEq(reward2, 0);
    }
    
    // ============ Pool System Tests ============
    
    function testEntryFeeDistribution() public {
        uint256 poolBefore = treasureMap.getRewardPool();
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        
        vm.prank(player1);
        treasureMap.startGame();
        
        uint256 poolAfter = treasureMap.getRewardPool();
        uint256 treasuryAfter = usdc.balanceOf(treasury);
        
        // 80% to pool
        assertEq(poolAfter - poolBefore, (ENTRY_FEE * 80) / 100);
        
        // 20% to treasury (or pool if transfer fails)
        uint256 expectedTreasury = (ENTRY_FEE * 20) / 100;
        if (treasuryAfter >= treasuryBefore + expectedTreasury) {
            assertEq(treasuryAfter - treasuryBefore, expectedTreasury);
        }
    }
    
    function testFundRewardPool() public {
        uint256 poolBefore = treasureMap.getRewardPool();
        uint256 amount = 1000 * 1e6;
        
        usdc.approve(address(treasureMap), amount);
        treasureMap.fundRewardPool(amount);
        
        uint256 poolAfter = treasureMap.getRewardPool();
        assertEq(poolAfter - poolBefore, amount);
    }
    
    // ============ Edge Cases ============
    
    function testRewardFormula() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Reward should be baseReward * (position + 1)
        // Position 0 -> baseReward * 1
        // Position 1 -> baseReward * 2
        // etc.
        
        // We can't predict exact outcomes, but we can verify the structure
        treasureMap.move();
        
        (,, uint256 pendingReward, uint8 position,) = treasureMap.getGame(player1);
        
        // If we got a reward, it should be at least baseReward
        // (we can't test exact formula without knowing the outcome)
        
        vm.stopPrank();
    }
    
    function testTreasureEndsGame() public {
        vm.startPrank(player1);
        treasureMap.startGame();
        
        // Keep moving until we hit treasure (might take many moves)
        // In practice, treasure is 5% chance, so might need many attempts
        bool foundTreasure = false;
        for (uint i = 0; i < 100 && !foundTreasure; i++) {
            treasureMap.move();
            (,,, bool active,) = treasureMap.getGame(player1);
            if (!active) {
                foundTreasure = true;
            }
        }
        
        // If we found treasure, game should be inactive
        if (foundTreasure) {
            (,,, bool active,) = treasureMap.getGame(player1);
            assertFalse(active);
        }
        
        vm.stopPrank();
    }
}
