export const TREASURE_MAP_ABI = [
  {
    inputs: [],
    name: 'startGame',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint8', name: 'direction', type: 'uint8' }],
    name: 'move',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'buyShield',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stopAndClaim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getGame',
    outputs: [
      { internalType: 'bytes32', name: 'seedCommit', type: 'bytes32' },
      {
        components: [
          { internalType: 'uint8', name: 'x', type: 'uint8' },
          { internalType: 'uint8', name: 'y', type: 'uint8' },
        ],
        internalType: 'struct TreasureMap.Position',
        name: 'currentPos',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint8', name: 'x', type: 'uint8' },
          { internalType: 'uint8', name: 'y', type: 'uint8' },
        ],
        internalType: 'struct TreasureMap.Position',
        name: 'startPos',
        type: 'tuple',
      },
      {
        components: [
          { internalType: 'uint8', name: 'x', type: 'uint8' },
          { internalType: 'uint8', name: 'y', type: 'uint8' },
        ],
        internalType: 'struct TreasureMap.Position',
        name: 'endPos',
        type: 'tuple',
      },
      { internalType: 'uint256', name: 'pendingReward', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
      { internalType: 'bool', name: 'hasShield', type: 'bool' },
      { internalType: 'bool', name: 'shieldPurchased', type: 'bool' },
      { internalType: 'uint8', name: 'moveCount', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'player', type: 'address' },
      { internalType: 'uint8', name: 'x', type: 'uint8' },
      { internalType: 'uint8', name: 'y', type: 'uint8' },
    ],
    name: 'hasBomb',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'canMove',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getNextMoveFee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'player', type: 'address' }],
    name: 'getShieldPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'entryFee',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mapSize',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'treasureBonus',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const USDC_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// Direction enum values
export const Direction = {
  Up: 0,
  Down: 1,
  Left: 2,
  Right: 3,
} as const
