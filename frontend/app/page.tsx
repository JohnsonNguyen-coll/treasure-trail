'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { useState, useEffect, useMemo } from 'react'
import { TREASURE_MAP_ABI, USDC_ABI, Direction } from '@/lib/abi'

const TREASURE_MAP_ADDRESS = process.env.NEXT_PUBLIC_TREASURE_MAP_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

interface Position {
  x: number
  y: number
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const { address, isConnected } = useAccount()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  
  // Separate states for approve and startGame transactions
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [startGameHash, setStartGameHash] = useState<`0x${string}` | undefined>()
  const [moveHash, setMoveHash] = useState<`0x${string}` | undefined>()
  const [buyShieldHash, setBuyShieldHash] = useState<`0x${string}` | undefined>()
  const [stopAndClaimHash, setStopAndClaimHash] = useState<`0x${string}` | undefined>()
  const { isLoading: isApproving, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: isStartingGame, isSuccess: isStartGameSuccess } = useWaitForTransactionReceipt({ hash: startGameHash })
  const { isLoading: isMoving, isSuccess: isMoveSuccess } = useWaitForTransactionReceipt({ hash: moveHash })
  const { isLoading: isBuyingShield, isSuccess: isBuyShieldSuccess } = useWaitForTransactionReceipt({ hash: buyShieldHash })
  const { isLoading: isClaiming, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: stopAndClaimHash })

  // Game state
  const [gameState, setGameState] = useState<{
    seed: bigint
    currentPos: Position
    startPos: Position
    endPos: Position
    pendingReward: bigint
    active: boolean
    hasShield: boolean
    shieldPurchased: boolean
    moveCount: number
  } | null>(null)

  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [entryFee, setEntryFee] = useState<bigint>(0n)
  const [mapSize, setMapSize] = useState<number>(20)
  const [bombMap, setBombMap] = useState<Set<string>>(new Set()) // Store bomb positions as "x,y" strings

  // Read game state
  const { data: gameData, refetch: refetchGame } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'getGame',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read USDC balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address && TREASURE_MAP_ADDRESS ? [address, TREASURE_MAP_ADDRESS] : undefined,
    query: { enabled: !!address && !!TREASURE_MAP_ADDRESS },
  })

  // Read entry fee
  const { data: fee } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'entryFee',
  })

  // Read map size
  const { data: size } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'mapSize',
  })

  // Read next move fee
  const { data: nextMoveFee, refetch: refetchNextMoveFee } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'getNextMoveFee',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!gameState?.active },
  })

  // Read shield price
  const { data: shieldPrice, refetch: refetchShieldPrice } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'getShieldPrice',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!gameState?.active },
  })

  // Read can move
  const { data: canMove, refetch: refetchCanMove } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'canMove',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Load bomb positions when game is active
  useEffect(() => {
    if (!gameState?.active || !address || !mapSize) return

    const loadBombs = async () => {
      const bombs = new Set<string>()
      // Check all positions for bombs (this is a simple approach, could be optimized)
      for (let x = 0; x < mapSize; x++) {
        for (let y = 0; y < mapSize; y++) {
          try {
            const hasBomb = await fetch(`/api/hasBomb?player=${address}&x=${x}&y=${y}`)
              .then(res => res.json())
              .catch(() => false)
            // For now, we'll use a client-side approach
            // In production, you'd want to call the contract directly or use a subgraph
          } catch (e) {
            // Ignore errors
          }
        }
      }
      setBombMap(bombs)
    }

    // For demo purposes, we'll show bombs as discovered
    // In production, you'd fetch from contract or subgraph
  }, [gameState?.active, address, mapSize])

  useEffect(() => {
    if (gameData) {
      setGameState({
        seed: gameData[0] as bigint,
        currentPos: { x: Number(gameData[1].x), y: Number(gameData[1].y) },
        startPos: { x: Number(gameData[2].x), y: Number(gameData[2].y) },
        endPos: { x: Number(gameData[3].x), y: Number(gameData[3].y) },
        pendingReward: gameData[4] as bigint,
        active: gameData[5] as boolean,
        hasShield: gameData[6] as boolean,
        shieldPurchased: gameData[7] as boolean,
        moveCount: Number(gameData[8]),
      })
    } else {
      // Reset game state when no game data (game ended or not started)
      setGameState(null)
    }
  }, [gameData])

  // Refetch move fee and shield price when game becomes active
  useEffect(() => {
    if (gameState?.active) {
      // Small delay to ensure state is updated
      setTimeout(() => {
        refetchNextMoveFee()
        refetchShieldPrice()
        refetchCanMove()
      }, 300)
    }
  }, [gameState?.active, refetchNextMoveFee, refetchShieldPrice, refetchCanMove])

  useEffect(() => {
    if (balance !== undefined) {
      setUsdcBalance(balance as bigint)
    }
  }, [balance])

  useEffect(() => {
    if (fee !== undefined) {
      setEntryFee(fee as bigint)
    }
  }, [fee])

  useEffect(() => {
    if (size !== undefined) {
      setMapSize(Number(size))
    }
  }, [size])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isSuccess) {
      refetchGame()
      refetchBalance()
    }
  }, [isSuccess, refetchGame, refetchBalance])

  // Refetch after approve succeeds
  useEffect(() => {
    if (isApproveSuccess) {
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        setApproveHash(undefined)
      }, 500)
    }
  }, [isApproveSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove])

  // Refetch after startGame succeeds
  useEffect(() => {
    if (isStartGameSuccess) {
      // Reset bomb map when starting new game
      setBombMap(new Set())
      
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
        setStartGameHash(undefined)
      }, 500)
      
      // Additional refetch after a longer delay to ensure all data is loaded
      setTimeout(() => {
        refetchGame()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
      }, 1500)
    }
  }, [isStartGameSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  // Refetch after move succeeds
  useEffect(() => {
    if (isMoveSuccess) {
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
        setMoveHash(undefined)
      }, 500)
    }
  }, [isMoveSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  // Refetch after buyShield succeeds
  useEffect(() => {
    if (isBuyShieldSuccess) {
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
        setBuyShieldHash(undefined)
      }, 500)
    }
  }, [isBuyShieldSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  // Refetch after stopAndClaim succeeds
  useEffect(() => {
    if (isClaimSuccess) {
      // Small delay to ensure blockchain state is updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
        setStopAndClaimHash(undefined)
      }, 500)
    }
  }, [isClaimSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  const handleApprove = async () => {
    if (!address || !entryFee) return

    try {
      // Approve a large amount upfront to avoid repeated approvals
      // Approve 1000 USDC (1000 * 1e6) which should be enough for many games
      const approveAmount = parseUnits('1000', 6)
      const hash = await writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [TREASURE_MAP_ADDRESS, approveAmount],
      })
      setApproveHash(hash)
    } catch (error) {
      console.error('Error approving:', error)
    }
  }

  const handleStartGame = async () => {
    if (!address) return

    try {
      const hash = await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'startGame',
      })
      setStartGameHash(hash)
      setApproveHash(undefined)
    } catch (error) {
      console.error('Error starting game:', error)
    }
  }

  const handleMove = async (direction: number) => {
    if (!address || !nextMoveFee) return

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    const moveFee = nextMoveFee as bigint
    
    if (currentAllowance < moveFee) {
      try {
        // Approve move fee + some buffer for future moves
        const approveAmount = moveFee * 10n // Approve 10x to avoid repeated approvals
        const hash = await writeContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [TREASURE_MAP_ADDRESS, approveAmount],
        })
        setApproveHash(hash)
        // Wait for approval to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000))
        refetchAllowance()
      } catch (error) {
        console.error('Error approving move fee:', error)
        return
      }
    }

    // Move
    try {
      const hash = await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'move',
        args: [direction],
      })
      setMoveHash(hash)
    } catch (error) {
      console.error('Error moving:', error)
    }
  }

  const handleBuyShield = async () => {
    if (!address || !shieldPrice) return

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    const shieldPriceAmount = shieldPrice as bigint
    
    if (currentAllowance < shieldPriceAmount) {
      try {
        // Approve shield price + some buffer
        const approveAmount = shieldPriceAmount * 10n // Approve 10x to avoid repeated approvals
        const hash = await writeContract({
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [TREASURE_MAP_ADDRESS, approveAmount],
        })
        setApproveHash(hash)
        // Wait for approval to be confirmed
        await new Promise(resolve => setTimeout(resolve, 3000))
        refetchAllowance()
      } catch (error) {
        console.error('Error approving shield:', error)
        return
      }
    }

    // Buy shield
    try {
      const hash = await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'buyShield',
      })
      setBuyShieldHash(hash)
    } catch (error) {
      console.error('Error buying shield:', error)
    }
  }

  const handleStopAndClaim = async () => {
    if (!address) return

    try {
      const hash = await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'stopAndClaim',
      })
      setStopAndClaimHash(hash)
    } catch (error) {
      console.error('Error claiming:', error)
    }
  }

  const renderMap = () => {
    if (!gameState || !mapSize) return null

    // Debug: Log endPos to ensure it's set correctly
    if (gameState.endPos) {
      console.log('Treasure position:', gameState.endPos)
    }

    const grid = []
    for (let y = mapSize - 1; y >= 0; y--) {
      const row = []
      for (let x = 0; x < mapSize; x++) {
        const isCurrent = x === gameState.currentPos.x && y === gameState.currentPos.y
        const isStart = x === gameState.startPos.x && y === gameState.startPos.y
        const isEnd = x === gameState.endPos.x && y === gameState.endPos.y
        const isVisited = false // Could track visited positions
        const hasBomb = bombMap.has(`${x},${y}`)

        let bgColor = 'bg-gray-800'
        let content = ''
        
        // Priority: Current > End > Start > Bomb > Visited
        // This ensures treasure is always visible even if it overlaps with start
        if (isCurrent && isEnd) {
          // Current position is also end position (treasure reached)
          bgColor = 'bg-purple-500 animate-pulse'
          content = '🏆📍'
        } else if (isCurrent && isStart) {
          // Current position is also start position (just started)
          bgColor = 'bg-green-500 animate-pulse'
          content = '🚩📍'
        } else if (isCurrent) {
          bgColor = 'bg-yellow-500 animate-pulse'
          content = '📍'
        } else if (isEnd) {
          // Always show treasure, even if it's at start position (shouldn't happen but just in case)
          bgColor = 'bg-purple-600'
          content = '🏆'
        } else if (isStart) {
          bgColor = 'bg-green-600'
          content = '🚩'
        } else if (hasBomb) {
          bgColor = 'bg-red-600'
          content = '💣'
        } else if (isVisited) {
          bgColor = 'bg-gray-600'
          content = '✓'
        }

        row.push(
          <div
            key={`${x}-${y}`}
            className={`w-6 h-6 ${bgColor} rounded border border-gray-700 flex items-center justify-center text-xs`}
            title={`${x}, ${y}${isEnd ? ' (Treasure)' : ''}${isStart ? ' (Start)' : ''}${isCurrent ? ' (Current)' : ''}`}
          >
            {content}
          </div>
        )
      }
      grid.push(
        <div key={y} className="flex gap-1">
          {row}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1 p-4 bg-gray-900 rounded-lg overflow-auto max-h-[600px]">
        {grid}
      </div>
    )
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">🗺️ Treasure Trail</h1>
              <p className="text-gray-300">2D Grid Adventure with Bombs & Shields</p>
            </div>
            <ConnectButton />
          </div>
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
            <p className="text-white text-xl mb-4">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🗺️ Treasure Trail</h1>
            <p className="text-gray-300">2D Grid Adventure with Bombs & Shields</p>
          </div>
          <ConnectButton />
        </div>

        {!isConnected ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
            <p className="text-white text-xl mb-4">Connect your wallet to start playing!</p>
            <p className="text-gray-300">Explore a 2D grid map, avoid bombs, and reach the treasure!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Panel */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">📊 Game Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Position</p>
                  <p className="text-white text-xl font-bold">
                    ({gameState?.currentPos.x ?? 0}, {gameState?.currentPos.y ?? 0})
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Pending Reward</p>
                  <p className="text-green-400 text-xl font-bold">
                    {gameState?.pendingReward
                      ? formatUnits(gameState.pendingReward, 6)
                      : '0'}{' '}
                    USDC
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Moves</p>
                  <p className="text-white text-xl font-bold">{gameState?.moveCount ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">USDC Balance</p>
                  <p className="text-white text-xl font-bold">
                    {formatUnits(usdcBalance, 6)} USDC
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Shield Status</p>
                  <p className="text-white text-lg font-bold">
                    {gameState?.hasShield ? '🛡️ Active' : gameState?.shieldPurchased ? '🛡️ Used' : '❌ None'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Next Move Fee</p>
                  <p className="text-white text-lg font-bold">
                    {nextMoveFee ? formatUnits(nextMoveFee as bigint, 6) : '0'} USDC
                  </p>
                </div>
              </div>
            </div>

            {/* Map Visualization */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🗺️ Map ({mapSize}x{mapSize})</h2>
              {renderMap()}
              <div className="mt-4 flex flex-wrap gap-4 justify-center text-sm text-gray-300">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-600 rounded"></div>
                  <span>Start</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>Current</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-purple-600 rounded"></div>
                  <span>Treasure</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-600 rounded"></div>
                  <span>Bomb</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-800 rounded"></div>
                  <span>Unknown</span>
                </div>
              </div>
            </div>

            {/* Movement Controls */}
            {gameState?.active && (
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                <h2 className="text-2xl font-bold text-white mb-4">🎮 Movement</h2>
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={() => handleMove(Direction.Up)}
                    disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y >= mapSize - 1}
                    className="w-20 h-20 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform hover:scale-105"
                  >
                    {isMoving || isApproving ? '...' : '↑ Up'}
                  </button>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleMove(Direction.Left)}
                      disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x === 0}
                      className="w-20 h-20 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform hover:scale-105"
                    >
                      {isMoving || isApproving ? '...' : '← Left'}
                    </button>
                    <button
                      onClick={() => handleMove(Direction.Right)}
                      disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x >= mapSize - 1}
                      className="w-20 h-20 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform hover:scale-105"
                    >
                      {isMoving || isApproving ? '...' : 'Right →'}
                    </button>
                  </div>
                  <button
                    onClick={() => handleMove(Direction.Down)}
                    disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y === 0}
                    className="w-20 h-20 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform hover:scale-105"
                  >
                    {isMoving || isApproving ? '...' : '↓ Down'}
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🎮 Actions</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                {!gameState?.active ? (
                  <>
                    {/* Check if approval is needed */}
                    {(!allowance || (allowance as bigint) < entryFee) ? (
                      <button
                        onClick={handleApprove}
                        disabled={isApproving || isPending || isConfirming || !entryFee || usdcBalance < entryFee}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                      >
                        {isApproving ? 'Approving...' : `Approve USDC (${entryFee ? formatUnits(entryFee, 6) : '...'} USDC)`}
                      </button>
                    ) : (
                      <button
                        onClick={handleStartGame}
                        disabled={isStartingGame || isPending || isConfirming || !entryFee}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                      >
                        {isStartingGame ? 'Starting Game...' : `Start Game (${entryFee ? formatUnits(entryFee, 6) : '...'} USDC)`}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {!gameState.shieldPurchased && (
                      <button
                        onClick={handleBuyShield}
                        disabled={isPending || isConfirming || isBuyingShield || isApproving || !shieldPrice || usdcBalance < (shieldPrice as bigint)}
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                      >
                        {isPending || isConfirming || isBuyingShield || isApproving ? 'Processing...' : `🛡️ Buy Shield (${shieldPrice ? formatUnits(shieldPrice as bigint, 6) : '...'} USDC)`}
                      </button>
                    )}
                    <button
                      onClick={handleStopAndClaim}
                      disabled={
                        isPending ||
                        isConfirming ||
                        isClaiming ||
                        !gameState?.active ||
                        !gameState?.pendingReward ||
                        gameState.pendingReward === 0n
                      }
                      className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                    >
                      {isPending || isConfirming || isClaiming ? 'Processing...' : '💰 Stop & Claim'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Game Rules */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">📖 How to Play</h2>
              <div className="space-y-2 text-gray-300">
                <p>1. Pay <strong className="text-white">5 USDC</strong> entry fee to start</p>
                <p>2. Navigate the 2D grid map using arrow buttons (Up, Down, Left, Right)</p>
                <p>3. Each move has random outcomes:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><span className="text-gray-400">Empty (50%)</span> - Nothing happens</li>
                  <li><span className="text-green-400">Reward (40%)</span> - Gain USDC (more moves = more reward)</li>
                  <li><span className="text-yellow-400">Treasure (10%)</span> - Big reward + end game</li>
                </ul>
                <p>4. <span className="text-red-400">💣 Bombs</span> - Step on a bomb = game over, lose all rewards (unless you have a shield)</p>
                <p>5. <span className="text-indigo-400">🛡️ Shield</span> - Buy a shield to protect from one bomb (only 1 per game)</p>
                <p>6. Reach the <span className="text-purple-400">🏆 Treasure</span> at the end position for maximum reward!</p>
                <p>7. You can <strong className="text-white">Stop & Claim</strong> anytime to secure your rewards</p>
                <p>8. <strong className="text-white">Move fees increase</strong> with each move (1.25-1.5x multiplier)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
