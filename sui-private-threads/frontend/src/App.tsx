/**
 * Application root – sets up dapp-kit providers and top-level routing.
 */


import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

import { useSuiWallet } from './hooks/useSuiWallet';
import { Home }    from './pages/Home';
import { Login }   from './pages/Login';
import { Profile } from './pages/Profile';
import { User, LogOut } from 'lucide-react';

// ── Network config ────────────────────────────────────────────────────────────

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl('testnet') },
  mainnet: { url: getFullnodeUrl('mainnet') },
  devnet:  { url: getFullnodeUrl('devnet')  },
});

const queryClient = new QueryClient();

// ── Inner app (inside providers) ─────────────────────────────────────────────

function AppContent() {
  const { address, isConnected, disconnect } = useSuiWallet();

  // Simple hash-based routing
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const isProfilePage = hash.startsWith('#/profile/');
  const profileAddress = isProfilePage ? hash.replace('#/profile/', '') : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      {isConnected && (
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-8">
                <a
                  href="#/"
                  className="text-xl font-bold text-gray-900"
                >
                  Sui Private Threads
                </a>
                <a
                  href="#/"
                  className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Home
                </a>
                {address && (
                  <a
                    href={`#/profile/${address}`}
                    className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    Profile
                  </a>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {address && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <User className="w-4 h-4" />
                    <span>{address.slice(0, 8)}…{address.slice(-6)}</span>
                  </div>
                )}
                <button
                  onClick={() => disconnect()}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-md"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      {!isConnected ? (
        <Login />
      ) : isProfilePage ? (
        <Profile address={profileAddress} />
      ) : (
        <Home />
      )}
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <AppContent />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
