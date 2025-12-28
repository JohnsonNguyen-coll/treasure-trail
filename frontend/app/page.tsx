'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { useState, useEffect } from 'react'
import { TREASURE_MAP_ABI } from '@/lib/abi'
import { USDC_ABI } from '@/lib/abi'

const TREASURE_MAP_ADDRESS = process.env.NEXT_PUBLIC_TREASURE_MAP_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

export default function Home() {
  const { address, isConnected } = useAccount()
  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  // Game state
  const [gameState, setGameState] = useState<{
    seed: bigint
    position: number
    pendingReward: bigint
    active: boolean
    locked: boolean
  } | null>(null)

  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [riskLevel, setRiskLevel] = useState<number>(0)
  const [entryFee, setEntryFee] = useState<bigint>(0n)

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

  // Read entry fee
  const { data: fee } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'entryFee',
  })

  // Read risk level
  const { data: risk } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'getRiskLevel',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Read can move
  const { data: canMove } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'canMove',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  useEffect(() => {
    if (gameData) {
      setGameState({
        seed: gameData[0],
        position: Number(gameData[1]),
        pendingReward: gameData[2],
        active: gameData[3],
        locked: gameData[4],
      })
    }
  }, [gameData])

  useEffect(() => {
    if (balance !== undefined) {
      setUsdcBalance(balance as bigint)
    }
  }, [balance])

  useEffect(() => {
    if (risk !== undefined) {
      setRiskLevel(Number(risk))
    }
  }, [risk])

  useEffect(() => {
    if (fee !== undefined) {
      setEntryFee(fee as bigint)
    }
  }, [fee])

  useEffect(() => {
    if (isSuccess) {
      refetchGame()
      refetchBalance()
    }
  }, [isSuccess, refetchGame, refetchBalance])

  const handleStartGame = async () => {
    if (!address || !entryFee) return

    try {
      // First approve USDC
      await writeContract({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [TREASURE_MAP_ADDRESS, entryFee],
      })

      // Then start game
      await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'startGame',
      })
    } catch (error) {
      console.error('Error starting game:', error)
    }
  }

  const handleMove = async () => {
    if (!address) return

    try {
      await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'move',
      })
    } catch (error) {
      console.error('Error moving:', error)
    }
  }

  const handleStopAndClaim = async () => {
    if (!address) return

    try {
      await writeContract({
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'stopAndClaim',
      })
    } catch (error) {
      console.error('Error claiming:', error)
    }
  }

  const renderRiskIndicator = () => {
    const fires = '🔥'.repeat(riskLevel)
    return <span className="text-2xl">{fires || '⚪'}</span>
  }

  const renderMap = () => {
    if (!gameState) return null

    const maxTiles = 30
    const tiles = Array.from({ length: maxTiles }, (_, i) => i)

    return (
      <div className="flex flex-wrap gap-2 justify-center p-4 bg-gray-900 rounded-lg">
        {tiles.map((tile) => {
          const isCurrent = tile === gameState.position
          const isPast = tile < gameState.position
          const isFuture = tile > gameState.position

          let bgColor = 'bg-gray-700' // Future (fog)
          if (isCurrent) bgColor = 'bg-yellow-500 animate-pulse' // Current
          if (isPast) bgColor = 'bg-green-600' // Past

          return (
            <div
              key={tile}
              className={`w-8 h-8 ${bgColor} rounded border-2 border-gray-600 flex items-center justify-center text-xs font-bold`}
            >
              {isCurrent ? '📍' : isPast ? '✓' : '?'}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🗺️ Treasure Trail</h1>
            <p className="text-gray-300">Risk vs Reward DeFi Adventure</p>
          </div>
          <ConnectButton />
        </div>

        {!isConnected ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
            <p className="text-white text-xl mb-4">Connect your wallet to start playing!</p>
            <p className="text-gray-300">Pay entry fee, explore deeper, claim rewards anytime.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Panel */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">📊 Game Info</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-400 text-sm">Position</p>
                  <p className="text-white text-2xl font-bold">
                    {gameState?.position ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Pending Reward</p>
                  <p className="text-green-400 text-2xl font-bold">
                    {gameState?.pendingReward
                      ? formatUnits(gameState.pendingReward, 6)
                      : '0'}{' '}
                    USDC
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">Risk Level</p>
                  <p className="text-white text-2xl font-bold">{renderRiskIndicator()}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm">USDC Balance</p>
                  <p className="text-white text-2xl font-bold">
                    {formatUnits(usdcBalance, 6)} USDC
                  </p>
                </div>
              </div>
              {gameState?.locked && (
                <div className="mt-4 p-4 bg-red-500/20 rounded-lg border border-red-500">
                  <p className="text-red-300 font-bold">⚠️ Game Locked! Claim your rewards now.</p>
                </div>
              )}
            </div>

            {/* Map Visualization */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🗺️ Your Trail</h2>
              {renderMap()}
              <div className="mt-4 flex gap-2 justify-center text-sm text-gray-300">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-600 rounded"></div>
                  <span>Past</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span>Current</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-700 rounded"></div>
                  <span>Future (Fog)</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🎮 Actions</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                {!gameState?.active ? (
                  <button
                    onClick={handleStartGame}
                    disabled={isPending || isConfirming || !entryFee || usdcBalance < entryFee}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                  >
                    {isPending || isConfirming
                      ? 'Processing...'
                      : `Start Game (${entryFee ? formatUnits(entryFee, 6) : '...'} USDC)`}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleMove}
                      disabled={isPending || isConfirming || !canMove}
                      className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                    >
                      {isPending || isConfirming ? 'Processing...' : '🚶 Move Forward'}
                    </button>
                    <button
                      onClick={handleStopAndClaim}
                      disabled={
                        isPending ||
                        isConfirming ||
                        !gameState?.pendingReward ||
                        gameState.pendingReward === 0n
                      }
                      className="flex-1 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-xl transition-all transform hover:scale-105"
                    >
                      {isPending || isConfirming ? 'Processing...' : '💰 Stop & Claim'}
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
                <p>2. Each move has random outcomes:</p>
                <ul className="list-disc list-inside ml-4 space-y-1">
                  <li><span className="text-gray-400">Empty (40%)</span> - Nothing happens</li>
                  <li><span className="text-green-400">Reward (35%)</span> - Gain USDC (deeper = more)</li>
                  <li><span className="text-red-400">Trap (20%)</span> - Lose reward or get locked</li>
                  <li><span className="text-yellow-400">Treasure (5%)</span> - Big reward + end game</li>
                </ul>
                <p>3. You can <strong className="text-white">Stop & Claim</strong> anytime to secure your rewards</p>
                <p>4. <strong className="text-white">Deeper = Higher Risk & Reward</strong> 🔥🔥🔥</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}


