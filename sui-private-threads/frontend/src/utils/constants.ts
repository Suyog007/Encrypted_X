/**
 * Application-wide constants
 */

export const CONTENT_TYPES = {
  TEXT:  'text',
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export const NETWORKS = {
  MAINNET:  'mainnet',
  TESTNET:  'testnet',
  DEVNET:   'devnet',
  LOCALNET: 'localnet',
} as const;

export const DEFAULT_NETWORK = NETWORKS.TESTNET;

// Walrus testnet endpoints
export const WALRUS_PUBLISHER  =
  import.meta.env.VITE_WALRUS_PUBLISHER  || 'https://publisher.walrus-testnet.walrus.space';
export const WALRUS_AGGREGATOR =
  import.meta.env.VITE_WALRUS_AGGREGATOR || 'https://aggregator.walrus-testnet.walrus.space';

// Deployed Sui package ID (set in .env)
export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x0';

// Active Sui network
export const SUI_NETWORK =
  (import.meta.env.VITE_SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

// SEAL key-server object IDs (Sui testnet)
export const SEAL_SERVER_OBJECT_IDS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
] as const;
