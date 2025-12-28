// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/TreasureMap.sol";
import "../src/MockUSDC.sol";

contract DeployScript is Script {
    // Configuration - adjust these values as needed
    uint256 public constant ENTRY_FEE = 5 * 1e6;        // 5 USDC (6 decimals)
    uint256 public constant BASE_REWARD = 5 * 1e5;      // 0.5 USDC (6 decimals)
    uint256 public constant TREASURE_BONUS = 10 * 1e6;  // 10 USDC (6 decimals)
    
    // USDC address on Arc Testnet
    // Note: Replace with actual USDC address on Arc Testnet when available
    // For now, this will deploy a mock USDC for testing
    address public constant USDC_ADDRESS = address(0); // Set to actual USDC address
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy MockUSDC if USDC_ADDRESS is not set
        address usdcAddress = USDC_ADDRESS;
        if (usdcAddress == address(0)) {
            console.log("Deploying MockUSDC...");
            MockUSDC mockUSDC = new MockUSDC(1000000 * 1e6); // 1M USDC
            usdcAddress = address(mockUSDC);
            console.log("MockUSDC deployed at:", usdcAddress);
            
            // Transfer some USDC to the deployer for testing
            mockUSDC.transfer(deployer, 10000 * 1e6);
            console.log("Transferred 10,000 USDC to deployer");
        } else {
            console.log("Using existing USDC at:", usdcAddress);
        }
        
        // Deploy TreasureMap
        console.log("Deploying TreasureMap...");
        TreasureMap treasureMap = new TreasureMap(
            usdcAddress,
            ENTRY_FEE,
            BASE_REWARD,
            TREASURE_BONUS,
            deployer // Treasury address (using deployer for now)
        );
        
        console.log("TreasureMap deployed at:", address(treasureMap));
        console.log("Configuration:");
        console.log("  Entry Fee:", ENTRY_FEE / 1e6, "USDC");
        console.log("  Base Reward:", BASE_REWARD / 1e6, "USDC");
        console.log("  Treasure Bonus:", TREASURE_BONUS / 1e6, "USDC");
        console.log("  Treasury:", deployer);
        
        // If using MockUSDC, fund the contract with USDC for reward pool
        if (USDC_ADDRESS == address(0)) {
            MockUSDC(usdcAddress).transfer(address(treasureMap), 50000 * 1e6);
            treasureMap.fundRewardPool(50000 * 1e6);
            console.log("Funded TreasureMap with 50,000 USDC for reward pool");
        }
        
        vm.stopBroadcast();
        
        console.log("\n=== Deployment Summary ===");
        console.log("USDC Address:", usdcAddress);
        console.log("TreasureMap Address:", address(treasureMap));
        console.log("\nAdd to your .env file:");
        console.log("TREASURE_MAP_ADDRESS=", address(treasureMap));
        console.log("USDC_ADDRESS=", usdcAddress);
    }
}
