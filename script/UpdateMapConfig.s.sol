// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Script.sol";
import "../src/TreasureMap.sol";

/**
 * @title UpdateMapConfigScript
 * @notice Script to update map configuration without redeploying
 * @dev Run with: forge script script/UpdateMapConfig.s.sol:UpdateMapConfigScript --rpc-url $ARC_TESTNET_RPC_URL --broadcast
 */
contract UpdateMapConfigScript is Script {
    // Contract address (update this with your deployed contract address)
    address public constant TREASURE_MAP_ADDRESS = 0x2FE0804f00a800c7a40d97620BF9bE8A1e24c6C3; // TODO: Update with your contract address
    
    // New configuration values
    uint8 public constant NEW_MAP_SIZE = 10;              // 10x10 grid
    uint8 public constant NEW_NUM_BOMBS = 10;             // 10 bombs per map (adjust based on map size)
    uint8 public constant NEW_BOMB_DENSITY_NEAR_END = 30; // 30% additional density near end
    
    function run() external {
        require(TREASURE_MAP_ADDRESS != address(0), "Please set TREASURE_MAP_ADDRESS");
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Updating map configuration...");
        console.log("Contract address:", TREASURE_MAP_ADDRESS);
        console.log("Deployer (owner):", deployer);
        console.log("");
        
        TreasureMap treasureMap = TreasureMap(payable(TREASURE_MAP_ADDRESS));
        
        // Verify deployer is owner
        address owner = treasureMap.owner();
        require(owner == deployer, "Deployer is not the contract owner");
        console.log("Owner verified:", owner);
        console.log("");
        
        // Read current configuration
        uint8 currentMapSize = treasureMap.mapSize();
        console.log("Current map size:", currentMapSize);
        console.log("");
        
        // Update configuration
        console.log("Updating to:");
        console.log("  Map Size:", NEW_MAP_SIZE, "x", NEW_MAP_SIZE);
        console.log("  Number of Bombs:", NEW_NUM_BOMBS);
        console.log("  Bomb Density Near End:", NEW_BOMB_DENSITY_NEAR_END, "%");
        console.log("");
        
        vm.startBroadcast(deployerPrivateKey);
        
        treasureMap.updateMapConfig(
            NEW_MAP_SIZE,
            NEW_NUM_BOMBS,
            NEW_BOMB_DENSITY_NEAR_END
        );
        
        vm.stopBroadcast();
        
        // Verify update
        uint8 updatedMapSize = treasureMap.mapSize();
        console.log("");
        console.log("=== Update Complete ===");
        console.log("New map size:", updatedMapSize);
        require(updatedMapSize == NEW_MAP_SIZE, "Update failed");
        console.log("Map configuration updated successfully");
    }
}

