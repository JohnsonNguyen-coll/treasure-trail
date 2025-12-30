'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { useState, useEffect, useRef, useCallback } from 'react'
import { TREASURE_MAP_ABI, USDC_ABI, Direction } from '@/lib/abi'

const TREASURE_MAP_ADDRESS = process.env.NEXT_PUBLIC_TREASURE_MAP_ADDRESS as `0x${string}`
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`

interface Position {
  x: number
  y: number
}

export default function Home() {
  const [mounted, setMounted] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
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
  const [mapSize, setMapSize] = useState<number>(10) // Default to 10, will be updated from contract
  const [bombMap, setBombMap] = useState<Set<string>>(new Set())
  const [bombNotification, setBombNotification] = useState<{ show: boolean; shielded: boolean }>({ show: false, shielded: false })
  const previousGameStateRef = useRef<{ active: boolean; pendingReward: bigint; hasShield: boolean } | null>(null)
  const [isClaimingReward, setIsClaimingReward] = useState(false)
  const gameStateRef = useRef<typeof gameState>(null)
  // Track claim transaction to prevent false bomb notifications
  const claimTxHashRef = useRef<`0x${string}` | null>(null)
  // Track move transaction to detect shield usage
  const moveTxHashRef = useRef<`0x${string}` | null>(null)
  // Lock to prevent parallel refetches
  const isRefetchingRef = useRef<boolean>(false)

  // Read game state
  const { data: gameData, refetch: refetchGame, isLoading: isLoadingGame, isError: isGameError } = useReadContract({
    address: TREASURE_MAP_ADDRESS,
    abi: TREASURE_MAP_ABI,
    functionName: 'getGame',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: false }, // Disable auto refetch, we'll handle it manually
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

  // Read map size - but force to 10
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

  useEffect(() => {
    // Don't update state if we're loading - keep current state to prevent flickering
    if (isLoadingGame) {
      return
    }

    // Don't reset game state if there's an RPC error - keep current state
    if (isGameError) {
      console.warn('RPC error when fetching game state, keeping current state')
      return
    }

    if (gameData) {
      const newGameState = {
        seed: BigInt(gameData[0] as string | number | bigint),
        currentPos: { x: Number(gameData[1].x), y: Number(gameData[1].y) },
        startPos: { x: Number(gameData[2].x), y: Number(gameData[2].y) },
        endPos: { x: Number(gameData[3].x), y: Number(gameData[3].y) },
        pendingReward: BigInt(gameData[4] as string | number | bigint),
        active: gameData[5] as boolean,
        hasShield: gameData[6] as boolean,
        shieldPurchased: gameData[7] as boolean,
        moveCount: Number(gameData[8]),
      }
      
      const prevState = previousGameStateRef.current
      
      // ✅ FIX ERROR 1: Only show bomb notification if game ended due to bomb (not due to stopAndClaim)
      // Use transaction hash tracking instead of isClaimingReward flag to avoid race conditions
      // If we have a claim tx hash, it means the state change is from stopAndClaim, not a bomb
      const isFromClaim = claimTxHashRef.current !== null
      
      // Only trigger bomb notification if:
      // 1. Game was active and now inactive
      // 2. Reward was lost (pendingReward went from >0 to 0)
      // 3. NOT from a claim transaction (tracked by tx hash)
      // 4. NOT currently claiming (additional safety check)
      if (
        prevState?.active && 
        !newGameState.active && 
        newGameState.pendingReward === 0n && 
        prevState.pendingReward > 0n && 
        !isFromClaim &&
        !isClaimingReward
      ) {
        setBombNotification({ show: true, shielded: false })
        setTimeout(() => {
          setBombNotification({ show: false, shielded: false })
        }, 5000)
      }
      
      // ✅ FIX ERROR 1: Clear claimTxHashRef immediately after checking, not after 2 seconds
      // This prevents false bomb notifications if state updates arrive before the timeout
      if (isFromClaim && !newGameState.active) {
        // Game ended from claim, clear the ref immediately after we've checked it
        claimTxHashRef.current = null
      }
      
      // Check for shield activation (shield was used to protect from bomb)
      // Shield is used when: had shield before, don't have shield now, but shield was purchased
      // This means shield protected from a bomb and was consumed
      const hadShieldBefore = prevState?.hasShield ?? false
      const shieldWasUsed = hadShieldBefore && !newGameState.hasShield && newGameState.shieldPurchased
      
      // Show shield notification if shield was used
      // When shield is used, game continues (active = true), so we check if game is still active
      // OR if we just had a move transaction (to catch edge cases)
      if (shieldWasUsed && (newGameState.active || moveTxHashRef.current !== null)) {
        setBombNotification({ show: true, shielded: true })
        setTimeout(() => {
          setBombNotification({ show: false, shielded: false })
        }, 5000)
        // Clear move tx hash after showing notification
        if (moveTxHashRef.current !== null) {
          moveTxHashRef.current = null
        }
      }
      
      setGameState(newGameState)
      gameStateRef.current = newGameState
      previousGameStateRef.current = {
        active: newGameState.active,
        pendingReward: newGameState.pendingReward,
        hasShield: newGameState.hasShield
      }
    } else if (!isLoadingGame && !isGameError) {
      // Only reset to null if we're not loading, no error, and there's no data
      // BUT: Don't reset if we have an active gameState - this prevents reset during refetch
      // Only reset if gameState is already null (meaning no game was started)
      // Use ref to check current state without causing re-renders
      if (gameStateRef.current === null) {
        // Only reset if gameState was already null (no game exists)
        setGameState(null)
        previousGameStateRef.current = null
        setIsClaimingReward(false)
      }
      // If gameStateRef.current is not null, keep the existing state (don't reset during refetch)
    }
  }, [gameData, isClaimingReward, stopAndClaimHash, isLoadingGame, isGameError])

  // ✅ FIX ERROR 2: Create a safe refetch function with lock
  const safeRefetchGame = useCallback(async () => {
    if (isRefetchingRef.current) {
      return // Skip if already refetching
    }
    try {
      isRefetchingRef.current = true
      await refetchGame()
    } catch (err) {
      console.warn('Failed to refetch game state:', err)
    } finally {
      // Release lock after a short delay to ensure state updates are processed
      setTimeout(() => {
        isRefetchingRef.current = false
      }, 500)
    }
  }, [refetchGame])

  useEffect(() => {
    if (gameState?.active) {
      const timeoutId = setTimeout(() => {
        refetchNextMoveFee()
        refetchShieldPrice()
        refetchCanMove()
      }, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [gameState?.active])

  // Poll game state when game is active to prevent desync
  // Use much longer interval to avoid RPC rate limiting (429 errors)
  // ✅ FIX ERROR 2: Stop polling when there are pending transactions
  useEffect(() => {
    if (!gameState?.active || !address) return

    const intervalId = setInterval(() => {
      // ✅ FIX ERROR 2: Check for pending transactions inside the interval callback
      // Don't poll if there are pending transactions
      const hasPendingTx = isPending || isConfirming || isMoving || isClaiming || isBuyingShield || isApproving || isStartingGame
      
      // Only refetch if not currently loading, no recent errors, and no pending transactions
      if (!isLoadingGame && !isGameError && !hasPendingTx) {
        safeRefetchGame()
        refetchCanMove().catch(() => {})
        refetchNextMoveFee().catch(() => {})
        refetchShieldPrice().catch(() => {})
      }
    }, 15000) // Poll every 15 seconds to avoid RPC rate limiting (429 errors)

    return () => clearInterval(intervalId)
  }, [gameState?.active, address, safeRefetchGame, refetchCanMove, refetchNextMoveFee, refetchShieldPrice, isLoadingGame, isGameError, isPending, isConfirming, isMoving, isClaiming, isBuyingShield, isApproving, isStartingGame])

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

  // Read map size from contract
  useEffect(() => {
    if (size !== undefined) {
      setMapSize(Number(size))
    }
  }, [size])

  useEffect(() => {
    setMounted(true)
    // Check for dark mode preference
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark') || 
                     window.matchMedia('(prefers-color-scheme: dark)').matches
      setDarkMode(isDark)
      if (isDark) {
        document.documentElement.classList.add('dark')
      }
    }
  }, [])

  // Update gameStateRef whenever gameState changes
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  // Auto-refetch data when wallet is connected
  useEffect(() => {
    if (isConnected && address) {
      // Small delay to ensure wallet is fully connected
      const timeoutId = setTimeout(() => {
        safeRefetchGame()
        refetchBalance()
        refetchAllowance()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [isConnected, address, safeRefetchGame, refetchBalance, refetchAllowance])

  useEffect(() => {
    if (isSuccess) {
      safeRefetchGame()
      refetchBalance()
    }
  }, [isSuccess, safeRefetchGame, refetchBalance])

  useEffect(() => {
    if (isApproveSuccess) {
      // Only refetch once to avoid RPC rate limiting
      const timeoutId1 = setTimeout(() => {
        if (!isLoadingGame && !isGameError) {
          refetchBalance().catch(() => {})
          refetchAllowance().catch(() => {})
        }
        setApproveHash(undefined)
      }, 1000)
      return () => {
        clearTimeout(timeoutId1)
      }
    }
  }, [isApproveSuccess, refetchBalance, refetchAllowance, isLoadingGame, isGameError])

  useEffect(() => {
    if (isStartGameSuccess) {
      setBombMap(new Set())
      // Only refetch once to avoid RPC rate limiting
      const timeoutId1 = setTimeout(() => {
        if (!isLoadingGame && !isGameError) {
          safeRefetchGame()
          refetchBalance().catch(() => {})
          refetchAllowance().catch(() => {})
          // ✅ FIX ERROR 3: Refetch canMove after start game transaction to prevent stale data
          refetchCanMove().catch(() => {})
          refetchNextMoveFee().catch(() => {})
          refetchShieldPrice().catch(() => {})
        }
        setStartGameHash(undefined)
      }, 2000) // Wait 2 seconds for transaction to be fully confirmed
      return () => {
        clearTimeout(timeoutId1)
      }
    }
  }, [isStartGameSuccess, safeRefetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice, isLoadingGame, isGameError])

  useEffect(() => {
    if (isMoveSuccess) {
      // Save current shield state before refetch to detect shield usage
      if (gameState) {
        previousGameStateRef.current = {
          active: gameState.active,
          pendingReward: gameState.pendingReward,
          hasShield: gameState.hasShield
        }
      }
      
      // Wait a bit for transaction to be fully confirmed on chain before refetching
      // Only refetch once to avoid RPC rate limiting
      const timeoutId1 = setTimeout(() => {
        if (!isLoadingGame && !isGameError) {
          // Refetch game state - this will update gameData which will trigger the gameState update
          safeRefetchGame()
          refetchBalance().catch(() => {})
          refetchAllowance().catch(() => {})
          // ✅ FIX ERROR 3: Refetch canMove after move transaction to prevent stale data
          refetchCanMove().catch(() => {})
          refetchNextMoveFee().catch(() => {})
          refetchShieldPrice().catch(() => {})
        }
        setMoveHash(undefined)
        // Clear move tx hash after refetch completes (notification will be shown if shield was used)
        // Note: We don't clear it immediately here because the gameState update effect needs it
      }, 2000) // Wait 2 seconds for transaction to be fully confirmed
      
      return () => {
        clearTimeout(timeoutId1)
      }
    }
  }, [isMoveSuccess, gameState, safeRefetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice, isLoadingGame, isGameError])

  useEffect(() => {
    if (isBuyShieldSuccess) {
      // Only refetch once to avoid RPC rate limiting
      const timeoutId = setTimeout(() => {
        if (!isLoadingGame && !isGameError) {
          safeRefetchGame()
          refetchBalance().catch(() => {})
          refetchAllowance().catch(() => {})
          // ✅ FIX ERROR 3: Refetch canMove after buy shield transaction to prevent stale data
          refetchCanMove().catch(() => {})
          refetchNextMoveFee().catch(() => {})
          refetchShieldPrice().catch(() => {})
        }
        setBuyShieldHash(undefined)
      }, 2000)
      return () => clearTimeout(timeoutId)
    }
  }, [isBuyShieldSuccess, safeRefetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice, isLoadingGame, isGameError])

  useEffect(() => {
    if (isClaimSuccess) {
      // Only refetch once to avoid RPC rate limiting
      const timeoutId1 = setTimeout(() => {
        if (!isLoadingGame && !isGameError) {
          safeRefetchGame()
          refetchBalance().catch(() => {})
          refetchAllowance().catch(() => {})
          // ✅ FIX ERROR 3: Refetch canMove after claim transaction to prevent stale data
          refetchCanMove().catch(() => {})
          refetchNextMoveFee().catch(() => {})
          refetchShieldPrice().catch(() => {})
        }
        setStopAndClaimHash(undefined)
        setIsClaimingReward(false)
        // ✅ FIX ERROR 1: Clear claim tx hash after claim is confirmed
        // Note: This is a backup clear. The main clear happens in the gameState update effect
        // when the game becomes inactive, but we also clear here for safety
        claimTxHashRef.current = null
      }, 2000)
      return () => {
        clearTimeout(timeoutId1)
      }
    }
  }, [isClaimSuccess, safeRefetchGame, refetchBalance, refetchAllowance, refetchCanMove, refetchNextMoveFee, refetchShieldPrice, isLoadingGame, isGameError])

  const handleApprove = () => {
    if (!address || !entryFee) return
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
    const currentAllowance = allowance as bigint || 0n
    const moveFee = nextMoveFee as bigint
    
    if (currentAllowance < moveFee) {
      const approveAmount = moveFee * 10n
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
            setTimeout(() => {
              refetchAllowance()
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
                    // Track move transaction to detect shield usage
                    moveTxHashRef.current = moveHash
                  },
                  onError: (error) => {
                    console.error('Error moving:', error)
                    moveTxHashRef.current = null
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
          // Track move transaction to detect shield usage
          moveTxHashRef.current = hash
        },
        onError: (error) => {
          console.error('Error moving:', error)
          moveTxHashRef.current = null
        },
      }
    )
  }

  const handleBuyShield = () => {
    if (!address || !shieldPrice) return
    const currentAllowance = allowance as bigint || 0n
    const shieldPriceAmount = shieldPrice as bigint
    
    if (currentAllowance < shieldPriceAmount) {
      const approveAmount = shieldPriceAmount * 10n
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
            setTimeout(() => {
              refetchAllowance()
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
    setIsClaimingReward(true)
    writeContract(
      {
        address: TREASURE_MAP_ADDRESS,
        abi: TREASURE_MAP_ABI,
        functionName: 'stopAndClaim',
      },
      {
        onSuccess: (hash) => {
          setStopAndClaimHash(hash)
          // ✅ FIX ERROR 1: Track claim tx hash to prevent false bomb notifications
          claimTxHashRef.current = hash
        },
        onError: (error) => {
          console.error('Error claiming:', error)
          setIsClaimingReward(false)
          claimTxHashRef.current = null
        },
      }
    )
  }

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark')
    }
  }

  const renderMap = () => {
    if (!gameState || !mapSize) return null

    if (gameState.endPos.x === undefined || gameState.endPos.y === undefined) {
      return null
    }

    const cells = []
    for (let y = mapSize - 1; y >= 0; y--) {
      for (let x = 0; x < mapSize; x++) {
        const isCurrent = x === gameState.currentPos.x && y === gameState.currentPos.y
        const isStart = x === gameState.startPos.x && y === gameState.startPos.y
        const isEnd = x === gameState.endPos.x && y === gameState.endPos.y
        const hasBomb = bombMap.has(`${x},${y}`)

        let bgColor = 'bg-gray-200 dark:bg-white/5'
        let borderColor = 'border-transparent hover:border-white/20'
        let content = null
        
        if (isCurrent && isEnd) {
          bgColor = 'bg-accent-yellow/20 border-accent-yellow'
          borderColor = 'border-accent-yellow'
          content = (
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-accent-yellow animate-ping absolute"></div>
          )
        } else if (isCurrent && isStart) {
          bgColor = 'bg-green-500/20 border-green-500'
          borderColor = 'border-green-500'
          content = <span className="material-icons-round text-green-500 text-xs sm:text-base">flag</span>
        } else if (isCurrent) {
          bgColor = 'bg-accent-yellow/20 border-accent-yellow'
          borderColor = 'border-accent-yellow'
          content = (
            <>
              <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-accent-yellow animate-ping absolute"></div>
              <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-accent-yellow relative z-10"></div>
            </>
          )
        } else if (isEnd) {
          bgColor = 'bg-accent-pink/20 border-accent-pink'
          borderColor = 'border-accent-pink'
          content = <span className="material-icons-round text-accent-pink text-xs sm:text-base">emoji_events</span>
        } else if (isStart) {
          bgColor = 'bg-green-500/20 border-green-500'
          borderColor = 'border-green-500'
          content = <span className="material-icons-round text-green-500 text-xs sm:text-base">flag</span>
        } else if (hasBomb) {
          bgColor = 'bg-accent-red/20 border-accent-red'
          borderColor = 'border-accent-red'
          content = <span className="material-icons-round text-accent-red text-xs sm:text-base">dangerous</span>
        }

        cells.push(
          <div
            key={`${x}-${y}`}
            className={`grid-cell ${bgColor} rounded-sm sm:rounded-md border ${borderColor} flex items-center justify-center relative aspect-square`}
            title={`${x}, ${y}${isEnd ? ' (Treasure)' : ''}${isStart ? ' (Start)' : ''}${isCurrent ? ' (Current)' : ''}`}
          >
            {content}
          </div>
        )
      }
    }

    return (
      <div className="grid grid-cols-10 gap-1 sm:gap-2 w-full" style={{ 
        gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
        aspectRatio: '1 / 1'
      }}>
        {cells}
      </div>
    )
  }

  if (!mounted) {
    return null
  }

  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : ''

  return (
    <div className="bg-background-light dark:bg-background-dark text-slate-800 dark:text-gray-100 font-sans min-h-screen transition-colors duration-300 antialiased selection:bg-primary selection:text-white">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-background-dark/80 border-b border-gray-200 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent-cyan flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-0 transition-transform">
              <span className="material-icons-round text-white text-3xl">grid_on</span>
            </div>
            <div>
              <h1 className="font-display font-black text-2xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent-cyan uppercase">
                Treasure Trail
              </h1>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wide hidden sm:block">
                Epic 2D Grid Adventure • Bombs • Shields • Glory
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-right mr-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">Network: Arc</span>
              <span className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Connected
              </span>
            </div>
            {isConnected ? (
              <div className="bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-white/10 hover:border-primary dark:hover:border-primary rounded-full px-4 py-2 flex items-center gap-2 transition-all shadow-sm hover:shadow-md group">
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center group-hover:bg-primary/20">
                  <span className="material-icons-round text-sm text-gray-600 dark:text-gray-300">account_balance_wallet</span>
                </div>
                <span className="text-sm font-bold font-mono">{formatUnits(usdcBalance, 6)} USDC</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono pl-2 border-l border-gray-200 dark:border-white/10">{shortAddress}</span>
              </div>
            ) : (
              <ConnectButton />
            )}
            <button 
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors" 
              onClick={toggleDarkMode}
            >
              <span className="material-icons-round dark:hidden">dark_mode</span>
              <span className="material-icons-round hidden dark:block">light_mode</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Bomb Notification */}
        {bombNotification.show && (
          <div className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-bounce ${bombNotification.shielded ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-gradient-to-r from-red-600 to-rose-600'} text-white font-black py-6 px-8 rounded-2xl shadow-2xl border-4 ${bombNotification.shielded ? 'border-indigo-400' : 'border-red-400'} max-w-md`}>
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
          <div className="bg-surface-light dark:bg-surface-dark p-12 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg text-center">
            <div className="text-8xl mb-6 animate-bounce">🎮</div>
            <h2 className="text-4xl font-bold mb-4">Ready to Begin Your Adventure?</h2>
            <p className="text-xl mb-6">Connect your wallet to start the ultimate treasure hunt!</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <>
            {/* Game Stats */}
            <section aria-label="Game Statistics">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-icons-round text-primary">analytics</span>
                <h2 className="font-display font-bold text-lg uppercase tracking-wide">Game Stats</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:border-primary/50 transition-colors relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-icons-round text-4xl">my_location</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Position</p>
                  <p className="font-mono text-2xl font-bold text-primary">
                    ({gameState?.currentPos.x ?? 0}, {gameState?.currentPos.y ?? 0})
                  </p>
                </div>
                <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:border-green-500/50 transition-colors relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-icons-round text-green-500 text-4xl">savings</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Pending Reward</p>
                  <p className="font-mono text-2xl font-bold text-green-600 dark:text-green-400">
                    {gameState?.pendingReward ? formatUnits(gameState.pendingReward, 6) : '0'} <span className="text-xs align-top opacity-70">USDC</span>
                  </p>
                </div>
                <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:border-accent-yellow/50 transition-colors relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-icons-round text-accent-yellow text-4xl">history</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Total Moves</p>
                  <p className="font-mono text-2xl font-bold text-accent-yellow">{gameState?.moveCount ?? 0}</p>
                </div>
                <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:border-blue-500/50 transition-colors relative overflow-hidden group lg:col-span-2">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-icons-round text-blue-500 text-4xl">account_balance</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Your Balance</p>
                  <p className="font-mono text-2xl font-bold text-blue-600 dark:text-blue-400 truncate">
                    {formatUnits(usdcBalance, 6)} <span className="text-xs align-top opacity-70">USDC</span>
                  </p>
                </div>
                <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm hover:border-red-500/50 transition-colors relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="material-icons-round text-red-500 text-4xl">gpp_bad</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider mb-1">Shield Status</p>
                  <div className="flex items-center gap-1 text-red-500 font-bold">
                    {gameState?.hasShield ? (
                      <>
                        <span className="material-icons-round text-sm">shield</span>
                        <span>ACTIVE</span>
                      </>
                    ) : gameState?.shieldPurchased ? (
                      <>
                        <span className="material-icons-round text-sm">shield</span>
                        <span>USED</span>
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-sm">close</span>
                        <span>NONE</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Map Section */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-icons-round text-accent-pink">map</span>
                    <h2 className="font-display font-bold text-lg uppercase tracking-wide">Adventure Map (10x10)</h2>
                  </div>
                  {gameState?.endPos && (
                    <span className="text-xs font-mono text-gray-500">
                      Treasure at: ({gameState.endPos.x}, {gameState.endPos.y})
                    </span>
                  )}
                </div>
                <div className="bg-surface-light dark:bg-surface-dark p-2 sm:p-4 rounded-2xl border border-gray-200 dark:border-white/10 shadow-xl relative overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'radial-gradient(#7c3aed 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
                  <div className="w-full" style={{ aspectRatio: '1 / 1' }}>
                    {renderMap()}
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                    <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">Start</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-accent-yellow"></div>
                    <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">Current</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-accent-pink"></div>
                    <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">Treasure</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-red-500"></div>
                    <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">Bomb</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-slate-700"></div>
                    <span className="text-xs uppercase font-bold text-gray-500 dark:text-gray-400">Unexplored</span>
                  </div>
                </div>
              </div>

              {/* Controls and Actions */}
              <div className="lg:col-span-4 flex flex-col gap-8 lg:mt-[3.5rem]">
                {/* Next Move Price Card */}
                {gameState?.active && (
                  <div className="bg-surface-light dark:bg-surface-dark p-4 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <span className="material-icons-round text-blue-500 text-lg">payments</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-wider">Next Move Price</p>
                          <p className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400">
                            {nextMoveFee ? formatUnits(nextMoveFee as bigint, 6) : '...'} <span className="text-xs align-top opacity-70">USDC</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Controls */}
                {gameState?.active && (
                  <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg flex flex-col items-center justify-center min-h-[300px]">
                    <div className="flex items-center gap-2 mb-6 w-full">
                      <span className="material-icons-round text-accent-cyan">gamepad</span>
                      <h2 className="font-display font-bold text-lg uppercase tracking-wide">Controls</h2>
                    </div>
                    <div className="relative w-48 h-48">
                      <button
                        onClick={() => handleMove(Direction.Up)}
                        disabled={!gameState?.active || isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y >= mapSize - 1}
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-14 bg-gradient-to-t from-blue-600 to-blue-500 rounded-lg shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center group z-10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-white font-bold group-hover:scale-110 transition-transform">arrow_upward</span>
                      </button>
                      <button
                        onClick={() => handleMove(Direction.Left)}
                        disabled={!gameState?.active || isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x === 0}
                        className="absolute top-1/2 left-0 -translate-y-1/2 w-14 h-14 bg-gradient-to-t from-blue-600 to-blue-500 rounded-lg shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center group z-10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-white font-bold group-hover:scale-110 transition-transform">arrow_back</span>
                      </button>
                      <button
                        onClick={() => handleMove(Direction.Right)}
                        disabled={!gameState?.active || isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.x >= mapSize - 1}
                        className="absolute top-1/2 right-0 -translate-y-1/2 w-14 h-14 bg-gradient-to-t from-blue-600 to-blue-500 rounded-lg shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center group z-10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-white font-bold group-hover:scale-110 transition-transform">arrow_forward</span>
                      </button>
                      <button
                        onClick={() => handleMove(Direction.Down)}
                        disabled={!gameState?.active || isPending || isConfirming || isMoving || isApproving || !canMove || gameState.currentPos.y === 0}
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-14 bg-gradient-to-t from-blue-600 to-blue-500 rounded-lg shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center group z-10 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <span className="material-icons-round text-white font-bold group-hover:scale-110 transition-transform">arrow_downward</span>
                      </button>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-gray-100 dark:bg-slate-900 rounded-full shadow-inner flex items-center justify-center border border-gray-200 dark:border-white/5">
                        <div className="w-8 h-8 rounded-full bg-surface-light dark:bg-surface-dark shadow-sm"></div>
                      </div>
                    </div>
                    <p className="mt-8 text-xs text-gray-500 font-medium">Use arrow keys or click buttons</p>
                  </div>
                )}

                {/* Quick Actions */}
                <div className="bg-surface-light dark:bg-surface-dark p-6 rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg flex flex-col">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="material-icons-round text-accent-yellow">bolt</span>
                    <h2 className="font-display font-bold text-lg uppercase tracking-wide">Quick Actions</h2>
                  </div>
                  <div className="space-y-4">
                    {!gameState?.active ? (
                      <>
                        {/* Show claim button if there's a pending reward (e.g., after winning treasure) */}
                        {gameState && gameState.pendingReward > 0n ? (
                          <button
                            onClick={handleStopAndClaim}
                            disabled={isPending || isConfirming || isClaiming || !gameState?.pendingReward || gameState.pendingReward === 0n}
                            className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 p-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="relative bg-surface-light dark:bg-surface-dark hover:bg-transparent group-hover:bg-transparent transition-colors rounded-[11px] px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                                  <span className="material-icons-round text-amber-500 group-hover:text-white transition-colors">emoji_events</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-sm font-bold text-gray-800 dark:text-white group-hover:text-white">
                                    {isClaiming ? 'Claiming...' : 'Claim Reward'}
                                  </span>
                                  <span className="block text-xs text-amber-500 group-hover:text-amber-200">
                                    {gameState.pendingReward ? formatUnits(gameState.pendingReward, 6) : '0'} USDC
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <>
                            {(!allowance || (allowance as bigint) < entryFee) ? (
                              <button
                                onClick={handleApprove}
                                disabled={isApproving || isPending || isConfirming || !entryFee || usdcBalance < entryFee}
                                className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <div className="relative bg-surface-light dark:bg-surface-dark hover:bg-transparent group-hover:bg-transparent transition-colors rounded-[11px] px-4 py-3 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                                      <span className="material-icons-round text-violet-400 group-hover:text-white transition-colors">lock</span>
                                    </div>
                                    <div className="text-left">
                                      <span className="block text-sm font-bold text-gray-800 dark:text-white group-hover:text-white">
                                        {isApproving ? 'Approving...' : 'Approve USDC'}
                                      </span>
                                      <span className="block text-xs text-violet-500 group-hover:text-violet-200">
                                        {entryFee ? formatUnits(entryFee, 6) : '...'} USDC
                                      </span>
                                    </div>
                                  </div>
                                  <span className="material-icons-round text-gray-400 group-hover:text-white transform group-hover:translate-x-1 transition-transform">chevron_right</span>
                                </div>
                              </button>
                            ) : (
                              <button
                                onClick={handleStartGame}
                                disabled={isStartingGame || isPending || isConfirming || !entryFee}
                                className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <div className="relative bg-surface-light dark:bg-surface-dark hover:bg-transparent group-hover:bg-transparent transition-colors rounded-[11px] px-4 py-3 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                                      <span className="material-icons-round text-violet-400 group-hover:text-white transition-colors">play_arrow</span>
                                    </div>
                                    <div className="text-left">
                                      <span className="block text-sm font-bold text-gray-800 dark:text-white group-hover:text-white">
                                        {isStartingGame ? 'Starting...' : 'Start Game'}
                                      </span>
                                      <span className="block text-xs text-violet-500 group-hover:text-violet-200">
                                        {entryFee ? formatUnits(entryFee, 6) : '...'} USDC
                                      </span>
                                    </div>
                                  </div>
                                  <span className="material-icons-round text-gray-400 group-hover:text-white transform group-hover:translate-x-1 transition-transform">chevron_right</span>
                                </div>
                              </button>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {!gameState.shieldPurchased && (
                          <button
                            onClick={handleBuyShield}
                            disabled={isPending || isConfirming || isBuyingShield || isApproving || !shieldPrice || usdcBalance < (shieldPrice as bigint)}
                            className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="relative bg-surface-light dark:bg-surface-dark hover:bg-transparent group-hover:bg-transparent transition-colors rounded-[11px] px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                                  <span className="material-icons-round text-violet-400 group-hover:text-white transition-colors">shield</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-sm font-bold text-gray-800 dark:text-white group-hover:text-white">Buy Shield</span>
                                  <span className="block text-xs text-violet-500 group-hover:text-violet-200">
                                    {shieldPrice ? formatUnits(shieldPrice as bigint, 6) : '...'} USDC
                                  </span>
                                </div>
                              </div>
                              <span className="material-icons-round text-gray-400 group-hover:text-white transform group-hover:translate-x-1 transition-transform">chevron_right</span>
                            </div>
                          </button>
                        )}
                        <button
                          onClick={handleStopAndClaim}
                          disabled={isPending || isConfirming || isClaiming || !gameState?.active || !gameState?.pendingReward || gameState.pendingReward === 0n}
                          className="w-full relative overflow-hidden group rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 p-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="relative bg-surface-light dark:bg-surface-dark hover:bg-transparent group-hover:bg-transparent transition-colors rounded-[11px] px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <span className="material-icons-round text-amber-500 group-hover:text-white transition-colors">lock_clock</span>
                              </div>
                              <div className="text-left">
                                <span className="block text-sm font-bold text-gray-800 dark:text-white group-hover:text-white">
                                  {isClaiming ? 'Claiming...' : 'Stop & Claim'}
                                </span>
                                <span className="block text-xs text-amber-500 group-hover:text-amber-200">Safe Exit</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* How to Play */}
            <section className="bg-surface-light dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-white/10 shadow-lg p-6">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-icons-round text-gray-400">help</span>
                <h2 className="font-display font-bold text-lg uppercase tracking-wide">How to Play</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary text-sm">payments</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-1">Entry Fee</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Pay <strong>5 USDC</strong> entry fee to begin your on-chain adventure. All transactions are verifiable.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded bg-accent-cyan/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-accent-cyan text-sm">ads_click</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-1">Navigation</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Navigate the grid using the D-Pad. Each move costs gas + a small fee.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded bg-accent-pink/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-accent-pink text-sm">casino</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm mb-1">Outcomes</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      Every square has a random outcome: Empty, Reward, Treasure, or Bomb. Good luck!
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
