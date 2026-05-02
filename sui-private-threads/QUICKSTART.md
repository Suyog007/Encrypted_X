# Quick Start Guide

Get Sui Private Threads running in 5 minutes!

## Prerequisites

- Node.js 18+
- Sui CLI installed
- A Sui wallet (Sui Wallet extension recommended)

## Quick Start

### 1. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and add your package ID after deploying contracts (see step 3).

### 3. Deploy Contracts (One-time)

```bash
cd ../contracts
sui move build
sui client publish --gas-budget 100000000
```

Copy the package ID from the output and update `frontend/.env`:

```env
VITE_PACKAGE_ID=0xYOUR_PACKAGE_ID
```

### 4. Run Frontend

```bash
cd ../frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### 5. Connect Wallet

1. Click "Connect Wallet"
2. Select your Sui wallet
3. Approve the connection

### 6. Create Your First Post

1. Enter some text or upload an image/video
2. Click "Create Encrypted Post"
3. Approve the transaction in your wallet
4. Your encrypted post will appear in the feed!

## What's Next?

- Follow other users to see their encrypted posts
- Create your profile
- Explore the encrypted feed

## Troubleshooting

**Wallet won't connect?**
- Make sure the Sui Wallet extension is installed
- Refresh the page
- Check browser console for errors

**Transactions failing?**
- Ensure you have enough SUI for gas
- Check that you're on the correct network (testnet/mainnet)
- Verify package ID is correct in `.env`

**Can't see posts?**
- Posts are encrypted - you can only decrypt posts you created or posts from users you follow
- Make sure you've initialized your follower list

## Need Help?

Check the main [README.md](./README.md) for detailed documentation.

