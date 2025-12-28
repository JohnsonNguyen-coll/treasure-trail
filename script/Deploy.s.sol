// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/TreasureMap.sol";
import "../src/IERC20.sol";

contract DeployScript is Script {
    // Configuration - adjust these values as needed
    uint256 public constant ENTRY_FEE = 5 * 1e6;        // 5 USDC (6 decimals)
    uint256 public constant BASE_REWARD = 5 * 1e5;      // 0.5 USDC (6 decimals)
    uint256 public constant TREASURE_BONUS = 10 * 1e6;  // 10 USDC (6 decimals)
    
    // USDC address on Arc Testnet
    // https://docs.arc.network/arc/references/contract-addresses
    address public constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Use real USDC on Arc Testnet
        address usdcAddress = USDC_ADDRESS;
        IERC20 usdc = IERC20(usdcAddress);
        
        console.log("Using USDC on Arc Testnet at:", usdcAddress);
        
        // Check deployer's USDC balance
        uint256 deployerBalance = usdc.balanceOf(deployer);
        console.log("Deployer USDC balance:", deployerBalance / 1e6, "USDC");
        
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
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("USDC Address:", usdcAddress);
        console.log("TreasureMap Address:", address(treasureMap));
        console.log("");
        console.log("Add to your .env file:");
        console.log("TREASURE_MAP_ADDRESS=", address(treasureMap));
        console.log("USDC_ADDRESS=", usdcAddress);
    }
}
