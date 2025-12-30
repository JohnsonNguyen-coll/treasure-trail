'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { useState, useEffect, useMemo } from 'react'
import { TREASURE_MAP_ABI, USDC_ABI, Direction } from '@/lib/abi'
import { Logo } from './components/Logo'

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
  const [bombNotification, setBombNotification] = useState<{ show: boolean; shielded: boolean }>({ show: false, shielded: false })
  const [previousGameState, setPreviousGameState] = useState<{ active: boolean; pendingReward: bigint; hasShield: boolean; moveCount: number } | null>(null)

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
      // Parse positions safely - handle both object and array formats
      let currentPosX = 0
      let currentPosY = 0
      if (gameData[1]) {
        if (typeof gameData[1] === 'object') {
          // Could be {x: number, y: number} or [x, y]
          if ('x' in gameData[1] && 'y' in gameData[1]) {
            currentPosX = Number(gameData[1].x)
            currentPosY = Number(gameData[1].y)
          } else if (Array.isArray(gameData[1])) {
            currentPosX = Number(gameData[1][0])
            currentPosY = Number(gameData[1][1])
          }
        }
      }

      let startPosX = 0
      let startPosY = 0
      if (gameData[2]) {
        if (typeof gameData[2] === 'object') {
          // Could be {x: number, y: number} or [x, y]
          if ('x' in gameData[2] && 'y' in gameData[2]) {
            startPosX = Number(gameData[2].x)
            startPosY = Number(gameData[2].y)
          } else if (Array.isArray(gameData[2])) {
            startPosX = Number(gameData[2][0])
            startPosY = Number(gameData[2][1])
          }
        }
      }

      let endPosX = 0
      let endPosY = 0
      if (gameData[3]) {
        if (typeof gameData[3] === 'object') {
          // Could be {x: number, y: number} or [x, y]
          if ('x' in gameData[3] && 'y' in gameData[3]) {
            endPosX = Number(gameData[3].x)
            endPosY = Number(gameData[3].y)
          } else if (Array.isArray(gameData[3])) {
            endPosX = Number(gameData[3][0])
            endPosY = Number(gameData[3][1])
          }
        }
      }
      
      const newGameState = {
        seed: BigInt(gameData[0] as string | number | bigint),
        currentPos: { x: currentPosX, y: currentPosY },
        startPos: { x: startPosX, y: startPosY },
        endPos: { x: endPosX, y: endPosY },
        pendingReward: BigInt(gameData[4] as string | number | bigint),
        active: gameData[5] as boolean,
        hasShield: gameData[6] as boolean,
        shieldPurchased: gameData[7] as boolean,
        moveCount: Number(gameData[8]),
      }
      
      // Check for bomb hit: game was active before, now inactive, and pendingReward is 0
      // Also check if moveCount increased (indicating a move was made)
      const moveCountIncreased = previousGameState ? newGameState.moveCount > previousGameState.moveCount : false
      const hadRewardBefore = previousGameState ? previousGameState.pendingReward > 0n : false
      
      // Detect unshielded bomb: game ended, reward lost, and a move was made
      // Conditions: game was active, now inactive, reward is 0, had reward before OR made a move, and moveCount increased
      if (previousGameState?.active && !newGameState.active && newGameState.pendingReward === 0n && (hadRewardBefore || newGameState.moveCount > 0) && moveCountIncreased) {
        // This indicates a bomb was hit (game ended, reward lost)
        setBombNotification({ show: true, shielded: false })
        // Auto-hide notification after 5 seconds
        setTimeout(() => {
          setBombNotification({ show: false, shielded: false })
        }, 5000)
      }
      
      // Check for shielded bomb hit: game was active, still active, but shield was used
      // Shield was used if: had shield before, don't have shield now, shield was purchased, and moveCount increased
      const hadShieldBefore = previousGameState?.hasShield ?? false
      if (previousGameState?.active && newGameState.active && hadShieldBefore && !newGameState.hasShield && newGameState.shieldPurchased && moveCountIncreased) {
        // Shield was used to protect from bomb
        setBombNotification({ show: true, shielded: true })
        setTimeout(() => {
          setBombNotification({ show: false, shielded: false })
        }, 5000)
      }
      
      setGameState(newGameState)
      // Update previous state for next comparison (include all needed fields)
      setPreviousGameState({
        active: newGameState.active,
        pendingReward: newGameState.pendingReward,
        hasShield: newGameState.hasShield,
        moveCount: newGameState.moveCount
      })
    } else {
      // Reset game state when no game data (game ended or not started)
      setGameState(null)
      setPreviousGameState(null)
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
        refetchNextMoveFee()
        refetchShieldPrice()
        setApproveHash(undefined)
      }, 500)
      
      // Additional refetch to ensure UI is fully updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
      }, 1500)
    }
  }, [isApproveSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  // Refetch after startGame succeeds
  useEffect(() => {
    if (isStartGameSuccess) {
      // Reset bomb map when starting new game
      setBombMap(new Set())
      // Reset previous game state to avoid false bomb detection
      setPreviousGameState(null)
      
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
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
      }, 1500)
      
      // Final refetch to ensure game is fully ready to play
      setTimeout(() => {
        refetchGame()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
      }, 2500)
    }
  }, [isStartGameSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  // Refetch after move succeeds
  useEffect(() => {
    if (isMoveSuccess) {
      // Store current state before refetch to detect bomb hits
      if (gameState) {
        setPreviousGameState({
          active: gameState.active,
          pendingReward: gameState.pendingReward,
          hasShield: gameState.hasShield,
          moveCount: gameState.moveCount
        })
      }
      
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
      
      // Additional refetch to ensure bomb detection works
      setTimeout(() => {
        refetchGame()
      }, 1500)
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
      
      // Additional refetch to ensure UI is fully updated
      setTimeout(() => {
        refetchGame()
        refetchBalance()
        refetchAllowance()
        refetchCanMove()
        refetchNextMoveFee()
        refetchShieldPrice()
      }, 1500)
    }
  }, [isClaimSuccess, refetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice])

  const handleApprove = () => {
    if (!address || !entryFee) return

    // Approve a large amount upfront to avoid repeated approvals
    // Approve 1000 USDC (1000 * 1e6) which should be enough for many games
    const approveAmount = parseUnits('1000', 6)
    writeContract(
      {
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [TREASURE_MAP_ADDRESS, approveAmount],
      },
      {
        onSuccess: (hash) => {
          setApproveHash(hash)
        },
        onError: (error) => {
          console.error('Error approving:', error)
        },
      }
    )
  }

  const handleStartGame = () => {
    if (!address) return

    writeContract(
      {
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'startGame',
      },
      {
        onSuccess: (hash) => {
          setStartGameHash(hash)
          setApproveHash(undefined)
        },
        onError: (error) => {
          console.error('Error starting game:', error)
        },
      }
    )
  }

  const handleMove = (direction: number) => {
    if (!address || !nextMoveFee) return

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    const moveFee = nextMoveFee as bigint
    
    if (currentAllowance < moveFee) {
      // Approve move fee + some buffer for future moves
      const approveAmount = moveFee * 10n // Approve 10x to avoid repeated approvals
      writeContract(
        {
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [TREASURE_MAP_ADDRESS, approveAmount],
        },
        {
          onSuccess: (hash) => {
            setApproveHash(hash)
            // Wait for approval to be confirmed
            setTimeout(() => {
              refetchAllowance()
              // Then move after approval
              writeContract(
                {
                  address: TREASURE_MAP_ADDRESS,
                  abi: TREASURE_MAP_ABI,
                  functionName: 'move',
                  args: [direction],
                },
                {
                  onSuccess: (moveHash) => {
                    setMoveHash(moveHash)
                  },
                  onError: (error) => {
                    console.error('Error moving:', error)
                  },
                }
              )
            }, 3000)
          },
          onError: (error) => {
            console.error('Error approving move fee:', error)
          },
        }
      )
      return
    }

    // Move
    writeContract(
      {
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'move',
        args: [direction],
      },
      {
        onSuccess: (hash) => {
          setMoveHash(hash)
        },
        onError: (error) => {
          console.error('Error moving:', error)
        },
      }
    )
  }

  const handleBuyShield = () => {
    if (!address || !shieldPrice) return

    // Check if we need to approve first
    const currentAllowance = allowance as bigint || 0n
    const shieldPriceAmount = shieldPrice as bigint
    
    if (currentAllowance < shieldPriceAmount) {
      // Approve shield price + some buffer
      const approveAmount = shieldPriceAmount * 10n // Approve 10x to avoid repeated approvals
      writeContract(
        {
          address: USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [TREASURE_MAP_ADDRESS, approveAmount],
        },
        {
          onSuccess: (hash) => {
            setApproveHash(hash)
            // Wait for approval to be confirmed
            setTimeout(() => {
              refetchAllowance()
              // Then buy shield after approval
              writeContract(
                {
                  address: TREASURE_MAP_ADDRESS,
                  abi: TREASURE_MAP_ABI,
                  functionName: 'buyShield',
                },
                {
                  onSuccess: (shieldHash) => {
                    setBuyShieldHash(shieldHash)
                  },
                  onError: (error) => {
                    console.error('Error buying shield:', error)
                  },
                }
              )
            }, 3000)
          },
          onError: (error) => {
            console.error('Error approving shield:', error)
          },
        }
      )
      return
    }

    // Buy shield
    writeContract(
      {
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'buyShield',
      },
      {
        onSuccess: (hash) => {
          setBuyShieldHash(hash)
        },
        onError: (error) => {
          console.error('Error buying shield:', error)
        },
      }
    )
  }

  const handleStopAndClaim = () => {
    if (!address) return

    writeContract(
      {
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'stopAndClaim',
      },
      {
        onSuccess: (hash) => {
          setStopAndClaimHash(hash)
        },
        onError: (error) => {
          console.error('Error claiming:', error)
        },
      }
    )
  }

  // Calculate cell size dynamically to fit the map without scrolling
  const cellSize = useMemo(() => {
    if (!mapSize) return 32
    // Assuming max available width ~1200px, padding 48px (p-6 * 2), gap between cells 6px (gap-1.5)
    const maxWidth = 1200
    const padding = 48
    const gapSize = 6
    const availableWidth = maxWidth - padding - (gapSize * (mapSize - 1))
    // Minimum 20px, maximum 40px for better visibility
    return Math.max(20, Math.min(40, Math.floor(availableWidth / mapSize)))
  }, [mapSize])

  const renderMap = () => {
    if (!gameState || !mapSize) return null

    // Ensure endPos is valid (check if it exists and has valid coordinates)
    // Note: x and y can be 0, so we check for null/undefined differently
    const endPosValid = gameState.endPos != null && 
        typeof gameState.endPos.x === 'number' && 
        typeof gameState.endPos.y === 'number' &&
        !isNaN(gameState.endPos.x) &&
        !isNaN(gameState.endPos.y) &&
        gameState.endPos.x >= 0 && 
        gameState.endPos.y >= 0 &&
        gameState.endPos.x < mapSize && 
        gameState.endPos.y < mapSize

    const grid = []
    for (let y = mapSize - 1; y >= 0; y--) {
      const row = []
      for (let x = 0; x < mapSize; x++) {
        const isCurrent = x === gameState.currentPos.x && y === gameState.currentPos.y
        const isStart = x === gameState.startPos.x && y === gameState.startPos.y
        // Check isEnd - always try to show treasure if endPos exists and has numeric values
        const isEnd = gameState.endPos != null && 
          typeof gameState.endPos.x === 'number' && 
          typeof gameState.endPos.y === 'number' &&
          !isNaN(gameState.endPos.x) &&
          !isNaN(gameState.endPos.y) &&
          x === gameState.endPos.x && 
          y === gameState.endPos.y
        const isVisited = false // Could track visited positions
        const hasBomb = bombMap.has(`${x},${y}`)

        let bgColor = 'bg-slate-800/50 hover:bg-slate-700/50'
        let content = ''
        let borderColor = 'border-slate-600/30'
        
        // Priority: Current > End > Start > Bomb > Visited
        // This ensures treasure is always visible even if it overlaps with start
        if (isCurrent && isEnd) {
          // Current position is also end position (treasure reached)
          bgColor = 'bg-gradient-to-br from-purple-500 to-pink-500 animate-pulse shadow-lg shadow-purple-500/50'
          content = '🏆📍'
          borderColor = 'border-purple-400'
        } else if (isCurrent && isStart) {
          // Current position is also start position (just started)
          bgColor = 'bg-gradient-to-br from-emerald-500 to-green-500 animate-pulse shadow-lg shadow-emerald-500/50'
          content = '🚩📍'
          borderColor = 'border-emerald-400'
        } else if (isCurrent) {
          bgColor = 'bg-gradient-to-br from-yellow-400 to-amber-500 animate-pulse shadow-lg shadow-yellow-500/50'
          content = '📍'
          borderColor = 'border-yellow-400'
        } else if (isEnd) {
          // Always show treasure, even if it's at start position (shouldn't happen but just in case)
          bgColor = 'bg-gradient-to-br from-purple-600 to-pink-600 shadow-md shadow-purple-500/30'
          content = '🏆'
          borderColor = 'border-purple-400'
        } else if (isStart) {
          bgColor = 'bg-gradient-to-br from-emerald-600 to-green-600 shadow-md shadow-emerald-500/30'
          content = '🚩'
          borderColor = 'border-emerald-400'
        } else if (hasBomb) {
          bgColor = 'bg-gradient-to-br from-red-600 to-rose-700 shadow-md shadow-red-500/30'
          content = '💣'
          borderColor = 'border-red-400'
        } else if (isVisited) {
          bgColor = 'bg-slate-700/50'
          content = '✓'
          borderColor = 'border-slate-500/30'
        }

        row.push(
          <div
            key={`${x}-${y}`}
            className={`${bgColor} rounded-lg border-2 ${borderColor} flex items-center justify-center text-xs font-bold transition-all duration-200 cursor-pointer transform hover:scale-110`}
            style={{ 
              width: `${cellSize}px`, 
              height: `${cellSize}px`,
              minWidth: `${cellSize}px`,
              minHeight: `${cellSize}px`
            }}
            title={`${x}, ${y}${isEnd ? ' (Treasure)' : ''}${isStart ? ' (Start)' : ''}${isCurrent ? ' (Current)' : ''}`}
          >
            {content}
          </div>
        )
      }
      grid.push(
        <div key={y} className="flex gap-1.5">
          {row}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-1.5 p-6 bg-slate-900/80 backdrop-blur-xl rounded-2xl border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20 w-full flex-wrap justify-center">
        {grid}
      </div>
    )
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptLTEyIDEyYzMuMzE0IDAgNiAyLjY4NiA2IDZzLTIuNjg2IDYtNiA2LTYtMi42ODYtNi02IDIuNjg2LTYgNi02eiIgc3Ryb2tlPSJyZ2JhKDEzOSwgOTIsIDI0NiwgMC4xKSIvPjwvZz48L3N2Zz4=')] opacity-20"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex justify-between items-center mb-12">
            <div className="space-y-2">
              <Logo size="xl" showText={true} />
              <p className="text-xl text-cyan-300 font-semibold tracking-wide">Epic 2D Grid Adventure • Bombs • Shields • Glory</p>
            </div>
            <ConnectButton />
          </div>
          <div className="bg-gradient-to-br from-slate-800/90 to-purple-900/90 backdrop-blur-2xl rounded-3xl p-12 text-center border-2 border-purple-500/30 shadow-2xl shadow-purple-500/50">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-cyan-400 mx-auto mb-6"></div>
            <p className="text-white text-2xl font-bold">Loading Adventure...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnptLTEyIDEyYzMuMzE0IDAgNiAyLjY4NiA2IDZzLTIuNjg2IDYtNiA2LTYtMi42ODYtNi02IDIuNjg2LTYgNi02eiIgc3Ryb2tlPSJyZ2JhKDEzOSwgOTIsIDI0NiwgMC4xKSIvPjwvZz48L3N2Zz4=')] opacity-20"></div>
      
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div className="space-y-2">
            <Logo size="xl" showText={true} className="animate-pulse" />
            <p className="text-xl text-cyan-300 font-semibold tracking-wide">Epic 2D Grid Adventure • Bombs • Shields • Glory</p>
          </div>
          <ConnectButton />
        </div>

        {/* Bomb Hit Notification */}
        {bombNotification.show && (
          <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce ${bombNotification.shielded ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-gradient-to-r from-red-600 to-rose-600'} text-white font-black py-6 px-8 rounded-2xl shadow-2xl border-4 ${bombNotification.shielded ? 'border-indigo-400' : 'border-red-400'} max-w-md`}>
            <div className="flex items-center gap-4">
              <span className="text-4xl">{bombNotification.shielded ? '🛡️' : '💣'}</span>
              <div>
                <p className="text-2xl mb-1">{bombNotification.shielded ? 'SHIELD ACTIVATED!' : '💥 BOMB HIT! 💥'}</p>
                <p className="text-lg">{bombNotification.shielded ? 'Your shield protected you from the bomb!' : 'Game Over! All rewards lost!'}</p>
              </div>
            </div>
          </div>
        )}

        {!isConnected ? (
          <div className="bg-gradient-to-br from-slate-800/90 to-purple-900/90 backdrop-blur-2xl rounded-3xl p-12 text-center border-2 border-purple-500/30 shadow-2xl shadow-purple-500/50">
            <div className="text-8xl mb-6 animate-bounce">🎮</div>
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Begin Your Adventure?</h2>
            <p className="text-xl text-cyan-300 mb-6">Connect your wallet to start the ultimate treasure hunt!</p>
            <p className="text-lg text-purple-300 max-w-2xl mx-auto">Navigate a mysterious grid, dodge deadly bombs, collect massive rewards, and claim the legendary treasure!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Panel */}
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20">
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-6">📊 GAME STATS</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-purple-500/30 hover:border-purple-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Position</p>
                  <p className="text-white text-3xl font-black">
                    ({gameState?.currentPos.x ?? 0}, {gameState?.currentPos.y ?? 0})
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-green-500/30 hover:border-green-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Pending Reward</p>
                  <p className="text-green-400 text-3xl font-black">
                    {gameState?.pendingReward
                      ? formatUnits(gameState.pendingReward, 6)
                      : '0'}{' '}
                    <span className="text-lg">USDC</span>
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-amber-500/30 hover:border-amber-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Total Moves</p>
                  <p className="text-amber-400 text-3xl font-black">{gameState?.moveCount ?? 0}</p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-blue-500/30 hover:border-blue-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Your Balance</p>
                  <p className="text-blue-400 text-3xl font-black">
                    {formatUnits(usdcBalance, 6)} <span className="text-lg">USDC</span>
                  </p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-6">
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-indigo-500/30 hover:border-indigo-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Shield Status</p>
                  <p className="text-white text-2xl font-black">
                    {gameState?.hasShield ? '🛡️ ACTIVE' : gameState?.shieldPurchased ? '🛡️ USED' : '❌ NONE'}
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border-2 border-rose-500/30 hover:border-rose-400/50 transition-all">
                  <p className="text-cyan-400 text-sm font-bold uppercase tracking-wider mb-2">Next Move Fee</p>
<p className="text-rose-400 text-2xl font-black">
{nextMoveFee ? formatUnits(nextMoveFee as bigint, 6) : '0'} <span className="text-lg">USDC</span>
</p>
</div>
</div>
</div>
        {/* Map Visualization */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border-2 border-purple-500/30 shadow-2xl shadow-purple-500/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              🗺️ ADVENTURE MAP ({mapSize}x{mapSize})
            </h2>
            {gameState?.endPos && (
              <div className="text-sm text-purple-300">
                Treasure at: ({gameState.endPos.x}, {gameState.endPos.y})
              </div>
            )}
          </div>
          {renderMap() || (
            <div className="text-center text-gray-400 py-12">
              {!gameState ? 'Start a game to see the map!' : 'Loading map...'}
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-6 justify-center">
            <div className="flex items-center gap-3 bg-slate-900/70 px-4 py-2 rounded-xl border border-emerald-500/30">
              <div className="w-6 h-6 bg-gradient-to-br from-emerald-600 to-green-600 rounded-lg shadow-lg"></div>
              <span className="text-emerald-300 font-bold">START</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-900/70 px-4 py-2 rounded-xl border border-yellow-500/30">
              <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-lg shadow-lg"></div>
              <span className="text-yellow-300 font-bold">CURRENT</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-900/70 px-4 py-2 rounded-xl border border-purple-500/30">
              <div className="w-6 h-6 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg shadow-lg"></div>
              <span className="text-purple-300 font-bold">TREASURE</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-900/70 px-4 py-2 rounded-xl border border-red-500/30">
              <div className="w-6 h-6 bg-gradient-to-br from-red-600 to-rose-700 rounded-lg shadow-lg"></div>
              <span className="text-red-300 font-bold">BOMB</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-900/70 px-4 py-2 rounded-xl border border-slate-500/30">
              <div className="w-6 h-6 bg-slate-800/50 rounded-lg"></div>
              <span className="text-slate-300 font-bold">UNEXPLORED</span>
            </div>
          </div>
        </div>

        {/* Movement Controls */}
        {gameState?.active && (
          <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border-2 border-cyan-500/30 shadow-2xl shadow-cyan-500/20">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-6 text-center">
              🎮 MOVEMENT CONTROLS
            </h2>
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={() => handleMove(Direction.Up)}
                disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y >= mapSize - 1}
                className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-cyan-500/50 border-2 border-cyan-400/50"
              >
                {isMoving || isApproving ? '⏳' : '↑ UP'}
              </button>
              <div className="flex gap-4">
                <button
                  onClick={() => handleMove(Direction.Left)}
                  disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x === 0}
                  className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-cyan-500/50 border-2 border-cyan-400/50"
                >
                  {isMoving || isApproving ? '⏳' : '← LEFT'}
                </button>
                <button
                  onClick={() => handleMove(Direction.Right)}
                  disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x >= mapSize - 1}
                  className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-cyan-500/50 border-2 border-cyan-400/50"
                >
                  {isMoving || isApproving ? '⏳' : 'RIGHT →'}
                </button>
              </div>
              <button
                onClick={() => handleMove(Direction.Down)}
                disabled={isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y === 0}
                className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all transform hover:scale-110 active:scale-95 shadow-2xl shadow-cyan-500/50 border-2 border-cyan-400/50"
              >
                {isMoving || isApproving ? '⏳' : '↓ DOWN'}
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-2xl rounded-3xl p-8 border-2 border-pink-500/30 shadow-2xl shadow-pink-500/20">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-rose-400 mb-6 text-center">
            ⚡ QUICK ACTIONS
          </h2>
          <div className="flex flex-col sm:flex-row gap-4">
            {!gameState?.active ? (
              <>
                {/* Check if approval is needed */}
                {(!allowance || (allowance as bigint) < entryFee) ? (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving || isPending || isConfirming || !entryFee || usdcBalance < entryFee}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-2xl shadow-blue-500/50 border-2 border-blue-400/50 text-lg"
                  >
                    {isApproving ? '⏳ APPROVING...' : `💳 APPROVE USDC (${entryFee ? formatUnits(entryFee, 6) : '...'} USDC)`}
                  </button>
                ) : (
                  <button
                    onClick={handleStartGame}
                    disabled={isStartingGame || isPending || isConfirming || !entryFee}
                    className="flex-1 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:via-pink-500 hover:to-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-2xl shadow-purple-500/50 border-2 border-purple-400/50 text-lg"
                  >
                    {isStartingGame ? '⏳ STARTING...' : `🚀 START ADVENTURE (${entryFee ? formatUnits(entryFee, 6) : '...'} USDC)`}
                  </button>
                )}
              </>
            ) : (
              <>
                {!gameState.shieldPurchased && (
                  <button
                    onClick={handleBuyShield}
                    disabled={isPending || isConfirming || isBuyingShield || isApproving || !shieldPrice || usdcBalance < (shieldPrice as bigint)}
                    className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-500/50 border-2 border-indigo-400/50 text-lg"
                  >
                    {isPending || isConfirming || isBuyingShield || isApproving ? '⏳ PROCESSING...' : `🛡️ BUY SHIELD (${shieldPrice ? formatUnits(shieldPrice as bigint, 6) : '...'} USDC)`}
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
                  className="flex-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 hover:from-yellow-400 hover:via-orange-400 hover:to-red-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-6 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-2xl shadow-orange-500/50 border-2 border-yellow-400/50 text-lg"
                >
                  {isPending || isConfirming || isClaiming ? '⏳ CLAIMING...' : '💰 STOP & CLAIM REWARDS'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Game Rules */}
        <div className="bg-gradient-to-br from-slate-800/90 to-purple-900/90 backdrop-blur-2xl rounded-3xl p-8 border-2 border-purple-500/30 shadow-2xl shadow-purple-500/20">
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-6">📖 HOW TO PLAY</h2>
          <div className="space-y-4 text-gray-200 text-lg">
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-purple-500/20">
              <span className="text-2xl">💵</span>
              <p>Pay <strong className="text-cyan-400 font-bold">5 USDC</strong> entry fee to begin your adventure</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-purple-500/20">
              <span className="text-2xl">🎮</span>
              <p>Navigate the 2D grid using directional buttons (Up, Down, Left, Right)</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-purple-500/20">
              <span className="text-2xl">🎲</span>
              <p>Each move has random outcomes with chances for rewards or empty spaces</p>
            </div>
            <div className="bg-slate-900/50 p-5 rounded-xl border border-purple-500/20">
              <p className="font-bold text-cyan-400 mb-3 text-xl">Move Outcomes:</p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-center gap-2">
                  <span className="text-gray-400 font-bold">→</span>
                  <span className="text-gray-300">Empty Space - Safe passage, continue exploring</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-400 font-bold">→</span>
                  <span className="text-green-300">Reward - Earn USDC! More moves = bigger rewards</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-400 font-bold">→</span>
                  <span className="text-yellow-300">Treasure - Massive reward + instant game victory!</span>
                </li>
              </ul>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-red-500/30">
              <span className="text-2xl">💣</span>
              <p><span className="text-red-400 font-bold">DANGER!</span> Hit a bomb = instant game over + lose all rewards (unless protected by shield)</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-indigo-500/30">
              <span className="text-2xl">🛡️</span>
              <p><span className="text-indigo-400 font-bold">Shield Protection:</span> Buy a shield to survive one bomb hit (limited to 1 per game)</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-purple-500/30">
              <span className="text-2xl">🏆</span>
              <p>Find the <span className="text-purple-400 font-bold">legendary treasure</span> at the end position for maximum rewards!</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-yellow-500/30">
              <span className="text-2xl">💰</span>
              <p>You can <strong className="text-yellow-400 font-bold">Stop & Claim</strong> rewards at any time to secure your earnings</p>
            </div>
            <div className="flex items-start gap-3 bg-slate-900/50 p-4 rounded-xl border border-orange-500/30">
              <span className="text-2xl">📈</span>
              <p><strong className="text-orange-400 font-bold">Move fees increase</strong> progressively (1.25-1.5x multiplier each move)</p>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
</main>
)
}