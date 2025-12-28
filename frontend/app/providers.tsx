'use client'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, getDefaultWallets } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { defineChain } from 'viem'

// Define Arc Testnet chain
const arcTestnet = defineChain({
  id: 5042002, // Arc Testnet chain ID
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.arc.network' },
  },
})

const { connectors } = getDefaultWallets({
  appName: 'Treasure Trail',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_ID || 'YOUR_PROJECT_ID',
})

const config = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: {
    [arcTestnet.id]: http(),
  },
})

const queryClient = new QueryClient()

interface ProvidersProps {
  readonly children: React.ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

