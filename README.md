# 🗺️ Treasure Trail - Risk/Reward DeFi Game on Arc Testnet

A decentralized risk/reward game where players explore deeper for bigger USDC rewards. **The deeper you go, the higher the risk and reward!**

## 🎮 Game Overview

### Core Mechanics

1. **Pay Entry Fee** (5 USDC) to start a game
2. **Move Forward** - Each move is a transaction with random outcomes
3. **Accumulate Rewards** - Rewards grow with each step deeper
4. **Stop & Claim Anytime** - Secure your rewards before hitting a trap!

### Game Outcomes (per move)

| Outcome | Probability | Effect |
|---------|------------|--------|
| 🟦 **Empty** | 40% | Nothing happens |
| 💰 **Reward** | 35% | Gain USDC (formula: `baseReward * (position + 1)`) |
| ☠️ **Trap** | 20% | Reset reward / Lose 50% / Lock game |
| 🏆 **Treasure** | 5% | Big reward (`pendingReward * 2 + bonus`) + end game |

### Trap Effects

- **Reset Reward**: Lose all accumulated rewards
- **Lose Half**: Lose 50% of pending reward
- **Lock Game**: Game locked, must claim immediately

### Risk/Reward System

- **Position 0-4**: 🔥 Low risk
- **Position 5-14**: 🔥🔥 Medium risk  
- **Position 15+**: 🔥🔥🔥 High risk

**Reward Formula**: `baseReward * (position + 1)`
- Position 0 → 0.5 USDC
- Position 10 → 5.5 USDC
- Position 20 → 10.5 USDC

## 🚀 Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Node.js 18+ (for frontend)
- A wallet with testnet USDC (from [Circle Faucet](https://faucet.circle.com))
- Arc Testnet RPC access

### Smart Contract Setup

1. **Install Foundry dependencies:**
   ```bash
   forge install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.network"
   PRIVATE_KEY="0x..."  # Your private key (NEVER commit this!)
   ```

3. **Compile the contracts:**
   ```bash
   forge build
   ```

4. **Run tests:**
   ```bash
   forge test
   ```

### Frontend Setup

1. **Navigate to frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Copy `.env.local.example` to `.env.local`:
   ```env
   NEXT_PUBLIC_TREASURE_MAP_ADDRESS=0x...
   NEXT_PUBLIC_USDC_ADDRESS=0x...
   NEXT_PUBLIC_RPC_URL=https://rpc.testnet.arc.network
   NEXT_PUBLIC_WALLET_CONNECT_ID=your_project_id
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)**

## 📝 Contract Details

### TreasureMap.sol

Main game contract with the following features:

- **Entry Fee System**: Pay 5 USDC to start (80% to reward pool, 20% to treasury)
- **Random Outcomes**: Each move has random outcome based on seed + position
- **Pending Rewards**: Rewards accumulate as you go deeper
- **Stop & Claim**: Claim rewards anytime to secure them
- **Pool System**: Self-sustaining reward pool from entry fees

### Configuration

Default game parameters (in `script/Deploy.s.sol`):
- **Entry Fee**: 5 USDC
- **Base Reward**: 0.5 USDC
- **Treasure Bonus**: 10 USDC
- **Outcome Probabilities**:
  - Empty: 40%
  - Reward: 35%
  - Trap: 20%
  - Treasure: 5%

## 🧪 Testing

Run the test suite:

```bash
forge test
```

Run with verbose output:

```bash
forge test -vvv
```

## 🚢 Deployment to Arc Testnet

### 1. Fund Your Wallet

Visit [Circle Faucet](https://faucet.circle.com) and:
- Select **Arc Testnet**
- Paste your wallet address
- Request testnet USDC

### 2. Deploy the Contract

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --broadcast \
  --verify
```

Or use the environment variable:

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

### 3. Store Contract Addresses

After deployment, add to your `.env` files:

**Root `.env`:**
```env
TREASURE_MAP_ADDRESS="0x..."
USDC_ADDRESS="0x..."
```

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_TREASURE_MAP_ADDRESS="0x..."
NEXT_PUBLIC_USDC_ADDRESS="0x..."
```

## 🎯 Interacting with the Contract

### Start a Game

```bash
cast send $TREASURE_MAP_ADDRESS \
  "startGame()" \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

**Note**: You need to approve USDC first:
```bash
cast send $USDC_ADDRESS \
  "approve(address,uint256)" \
  $TREASURE_MAP_ADDRESS \
  5000000 \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Move Forward

```bash
cast send $TREASURE_MAP_ADDRESS \
  "move()" \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Stop & Claim

```bash
cast send $TREASURE_MAP_ADDRESS \
  "stopAndClaim()" \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Check Game State

```bash
cast call $TREASURE_MAP_ADDRESS \
  "getGame(address)(uint256,uint8,uint256,bool,bool)" \
  YOUR_ADDRESS \
  --rpc-url $ARC_TESTNET_RPC_URL
```

### Check Risk Level

```bash
cast call $TREASURE_MAP_ADDRESS \
  "getRiskLevel(address)(uint8)" \
  YOUR_ADDRESS \
  --rpc-url $ARC_TESTNET_RPC_URL
```

## 📊 Contract Functions

### Public Functions

- `startGame()`: Pay entry fee and start a new game
- `move()`: Move forward one step (random outcome)
- `stopAndClaim()`: Claim accumulated rewards and end game
- `getGame(address player)`: Get player's game state
- `canMove(address player)`: Check if player can move
- `getRiskLevel(address player)`: Get risk level (1-3)
- `getRewardPool()`: Get current reward pool balance

### Events

- `GameStarted`: Emitted when a player starts a game
- `MoveMade`: Emitted when a player moves (includes outcome)
- `RewardClaimed`: Emitted when a player claims rewards
- `GameLocked`: Emitted when a trap locks the game

## 🎨 Frontend Features

- 🗺️ **Interactive Map Visualization**: See your progress in real-time
- 📊 **Game Info Panel**: Position, pending reward, risk level, USDC balance
- 🚶 **Move Forward Button**: Make your next move
- 💰 **Stop & Claim Button**: Secure your rewards
- 🔥 **Risk Indicator**: Visual risk level (🔥🔥🔥)
- 🔌 **Wallet Connection**: RainbowKit integration

## 🔒 Security Notes

- **Never commit your `.env` file** to version control
- **Never share your private key**
- This is a testnet deployment - use testnet tokens only
- The contract uses `block.prevrandao` for randomness (ARC testnet friendly)
- Entry fees are split: 80% to reward pool, 20% to treasury

## 🛠️ Project Structure

```
TreasureTrail/
├── src/
│   ├── TreasureMap.sol      # Main game contract
│   ├── MockUSDC.sol         # Mock USDC for testing
│   └── IERC20.sol           # ERC20 interface
├── test/
│   └── TreasureMap.t.sol    # Test suite
├── script/
│   └── Deploy.s.sol         # Deployment script
├── frontend/
│   ├── app/                 # Next.js app directory
│   ├── lib/                 # Utilities and ABIs
│   └── package.json         # Frontend dependencies
├── foundry.toml             # Foundry configuration
└── README.md                # This file
```

## 📚 Resources

- [Arc Network Documentation](https://docs.arc.network)
- [Foundry Book](https://book.getfoundry.sh)
- [Arc Testnet Explorer](https://explorer.testnet.arc.network)
- [Circle Faucet](https://faucet.circle.com)
- [RainbowKit Documentation](https://rainbowkit.com)
- [Wagmi Documentation](https://wagmi.sh)

## 🎉 Game Strategy Tips

1. **Start Small**: Test the waters with a few moves
2. **Know When to Stop**: Don't get greedy - claim when you have a good reward
3. **Watch the Risk**: 🔥🔥🔥 means high risk - consider claiming
4. **Trap Awareness**: Traps can reset or lock your game - be careful!
5. **Treasure Hunt**: 5% chance for treasure = big reward but rare

## 📄 License

MIT
