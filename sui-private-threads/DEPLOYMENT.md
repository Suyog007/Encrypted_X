# Deployment Guide

This guide walks you through deploying Sui Private Threads to testnet or mainnet.

## Prerequisites

1. Install Sui CLI: https://docs.sui.io/build/install
2. Set up a Sui wallet with testnet tokens (for testnet) or mainnet tokens (for mainnet)
3. Node.js 18+ installed

## Step 1: Deploy Smart Contracts

### Build Contracts

```bash
cd contracts
sui move build
```

### Deploy to Testnet

```bash
# Make sure you're on testnet
sui client switch --env testnet

# Publish the package
sui client publish --gas-budget 100000000

# Save the package ID from the output
# Example: Published Objects: PackageID: 0x1234...
```

### Deploy to Mainnet (Production)

```bash
# Switch to mainnet (be careful!)
sui client switch --env mainnet

# Publish the package
sui client publish --gas-budget 100000000

# Save the package ID
```

## Step 2: Configure Frontend

1. Copy the environment example file:

```bash
cd frontend
cp .env.example .env
```

2. Update `.env` with your deployed package ID:

```env
VITE_PACKAGE_ID=0xYOUR_PACKAGE_ID_HERE
VITE_SUI_NETWORK=testnet  # or mainnet
```

3. Install dependencies:

```bash
npm install
```

## Step 3: Configure Walrus and SEAL

Update the endpoints in `.env` if you have custom Walrus or SEAL endpoints:

```env
VITE_WALRUS_ENDPOINT=https://walrus.sui.io
VITE_SEAL_ENDPOINT=https://seal.sui.io
```

## Step 4: Build and Deploy Frontend

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

The `dist/` folder contains the production build. Deploy this to:
- Vercel
- Netlify
- GitHub Pages
- Any static hosting service

### Example: Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel
```

## Step 5: Verify Deployment

1. Connect your wallet to the deployed frontend
2. Create a test profile
3. Create a test post
4. Verify encryption/decryption works

## Troubleshooting

### Contract Deployment Issues

- **Insufficient gas**: Increase `--gas-budget`
- **Network mismatch**: Ensure you're on the correct network (`sui client active-env`)
- **Package ID not found**: Double-check the package ID in `.env`

### Frontend Issues

- **Wallet not connecting**: Ensure wallet extension is installed and unlocked
- **Transactions failing**: Check browser console for errors
- **SEAL/Walrus errors**: Verify endpoints are correct and services are available

## Network Configuration

### Testnet
- RPC: https://fullnode.testnet.sui.io:443
- Faucet: https://discord.com/channels/916379725201563759/971488439931392130

### Mainnet
- RPC: https://fullnode.mainnet.sui.io:443
- No faucet - use real SUI

## Next Steps

1. Set up event indexing for feed queries
2. Integrate with actual SEAL service
3. Integrate with actual Walrus SDK
4. Add token gating logic
5. Implement notification system

