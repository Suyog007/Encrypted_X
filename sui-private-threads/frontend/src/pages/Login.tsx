/**
 * Login page – wallet connection entry point.
 */


import { ConnectButton } from '@mysten/dapp-kit';
import { useSuiWallet } from '../hooks/useSuiWallet';
import { Lock } from 'lucide-react';

export function Login() {
  const { isConnected } = useSuiWallet();

  if (isConnected) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {/* Logo */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Sui Private Threads
          </h1>
          <p className="text-gray-600">
            Encrypted social feed on Sui blockchain
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 gap-3 mb-8 text-left">
          {[
            { icon: '🔐', label: 'End-to-end encrypted posts (AES-256-GCM)' },
            { icon: '🌐', label: 'Decentralised storage via Walrus' },
            { icon: '🔑', label: 'Access control via Sui SEAL' },
            { icon: '⛓️', label: 'Follower relationships on-chain' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <span className="text-xl">{icon}</span>
              <span className="text-sm text-gray-700">{label}</span>
            </div>
          ))}
        </div>

        {/* dapp-kit ConnectButton handles wallet selection modal */}
        <ConnectButton
          connectText="Connect Wallet"
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
        />

        <p className="text-xs text-gray-500 mt-6">
          All content is encrypted client-side before it leaves your browser.
        </p>
      </div>
    </div>
  );
}
