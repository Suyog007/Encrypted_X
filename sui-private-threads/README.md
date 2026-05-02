# Encrypted_X — Private Threads on Sui

An end-to-end encrypted social feed built on the Sui blockchain. Users post text, images, and videos that are encrypted client-side before storage — only the author and approved followers can decrypt them.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         CREATE POST                             │
│                                                                 │
│  Content ──► AES-256-GCM ──► Walrus (blobId)                  │
│               ▲                                                 │
│            Sym Key ──► SEAL IBE encrypt ──► Sui chain          │
│                         (seal_encrypted_key + seal_id)          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          VIEW POST                              │
│                                                                 │
│  Sui chain ──► seal_encrypted_key                              │
│  SEAL key servers ──► decrypt ──► Sym Key                      │
│  Walrus ──► ciphertext ──► AES-256-GCM decrypt ──► Content     │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Sui (Move smart contracts) |
| Content encryption | AES-256-GCM (Web Crypto API) |
| Key encryption | SEAL — threshold IBE with BLS12-381 (`@mysten/seal`) |
| Decentralized storage | Walrus testnet (`publisher` + `aggregator` REST API) |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Wallet | `@mysten/dapp-kit` v0.14 |

---

## Project Structure

```
Encrypted_X/
├── contracts/                   # Sui Move smart contracts
│   ├── Move.toml
│   └── sources/
│       └── private_threads.move
└── frontend/                    # React + TypeScript app
    ├── src/
    │   ├── App.tsx              # Providers + hash-based routing
    │   ├── components/
    │   │   ├── PostComposer.tsx       # Full encrypt-upload-publish pipeline
    │   │   ├── PostCard.tsx           # Renders decrypted post content
    │   │   ├── FollowButton.tsx       # Follow / unfollow action
    │   │   └── EncryptedMediaViewer.tsx
    │   ├── hooks/
    │   │   ├── useSuiWallet.ts        # dapp-kit wallet wrapper
    │   │   └── usePosts.ts            # Load + decrypt posts
    │   ├── lib/
    │   │   ├── encryption.ts          # AES-256-GCM helpers
    │   │   ├── seal.ts                # SEAL session key + encrypt/decrypt
    │   │   ├── walrus.ts              # Walrus upload / download
    │   │   └── sui.ts                 # On-chain read/write helpers
    │   ├── pages/
    │   │   ├── Home.tsx
    │   │   ├── Login.tsx
    │   │   └── Profile.tsx
    │   └── types/index.ts
    ├── package.json
    └── vite.config.ts
```

---

## Smart Contract (`private_threads.move`)

### Objects

| Object | Storage | Description |
|--------|---------|-------------|
| `UserProfile` | Shared | Username, bio, counters |
| `EncryptedPost` | Shared | Walrus blobId + SEAL-encrypted key + seal_id |
| `FollowerList` | Owned | Owner-held list of follower addresses |
| `AccessKey` | Owned | Per-user SEAL key reference |

### Entry Functions

| Function | Description |
|----------|-------------|
| `create_profile(username, bio)` | Create a shared user profile |
| `create_post(walrus_blob_id, seal_id, seal_encrypted_key, content_type, is_token_gated, token_type)` | Publish an encrypted post |
| `init_follower_list()` | Create your owned follower list |
| `follow(follower_list)` | Add yourself to someone's follower list |
| `unfollow(follower_list)` | Remove yourself from a follower list |
| `seal_approve(id, post)` | SEAL gate: author can decrypt |
| `seal_approve_follower(id, post, follower_list)` | SEAL gate: follower can decrypt |

### SEAL Access Control

SEAL key servers call `seal_approve` or `seal_approve_follower` as a dry-run to verify the requester is authorised before releasing key shares. The Move functions assert:

- **Author path**: `post.seal_id == id && post.author == tx_sender`
- **Follower path**: `post.seal_id == id && follower_list.owner == post.author && is_following(follower_list, tx_sender)`

---

## Getting Started

### Prerequisites

- Node.js 18+
- Sui CLI — [install guide](https://docs.sui.io/build/install)
- A Sui wallet browser extension (Sui Wallet, Suiet, etc.)
- Sui testnet tokens — get from [faucet](https://faucet.sui.io)

### 1. Deploy the Smart Contract

```bash
cd contracts

# Build (optional check)
sui move build

# Publish to testnet
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

Copy the **Package ID** printed after `Published Objects`.

### 2. Configure Environment

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_PACKAGE_ID=0x<your-deployed-package-id>
VITE_SUI_NETWORK=testnet
```

Optional overrides (defaults point to public Walrus testnet):

```env
VITE_WALRUS_PUBLISHER=https://publisher.walrus-testnet.walrus.space
VITE_WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
```

### 3. Install & Run

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Encryption Pipeline

### Posting

1. **Generate key** — `crypto.subtle.generateKey` → AES-256-GCM `CryptoKey`
2. **Encrypt content** — `crypto.subtle.encrypt` → 12-byte IV + ciphertext
3. **Upload to Walrus** — `PUT /v1/blobs?epochs=5` with `[IV | ciphertext]`; receive `blobId`
4. **Generate seal_id** — 32 random bytes as IBE namespace
5. **Encrypt key with SEAL** — `encrypt({ keyServers, threshold: 1, packageId, id: sealId, encryptionInput: new AesGcm256(keyBytes, aad) })`
6. **Publish on-chain** — `create_post(blobId, sealId, sealEncryptedKey, ...)`

### Decrypting

1. **Session key** — `new SessionKey(packageIdBytes, 30)` + wallet signs personal message
2. **Permission check** — `author` → `seal_approve` tx; `follower` → `seal_approve_follower` tx
3. **Fetch key shares** — `keyStore.fetchKeys({ keyServers, txBytes, sessionKey })`
4. **Recover sym key** — `keyStore.decrypt(EncryptedObject.parse(encryptedKeyBytes))`
5. **Download from Walrus** — `GET /v1/blobs/<blobId>` → split first 12 bytes as IV
6. **Decrypt content** — `crypto.subtle.decrypt` with recovered key + IV

---

## Frontend API Reference

### `lib/encryption.ts`

| Function | Description |
|----------|-------------|
| `generateSymmetricKey()` | Generate AES-256-GCM CryptoKey |
| `encryptText(text, key)` | Encrypt UTF-8 string |
| `decryptText(encrypted, iv, key)` | Decrypt to string |
| `encryptFile(file, key)` | Encrypt File/Blob |
| `decryptFile(encrypted, iv, key)` | Decrypt to Blob |
| `exportKey(key)` | CryptoKey → raw bytes |
| `importKey(bytes)` | Raw bytes → CryptoKey |

### `lib/walrus.ts`

| Function | Description |
|----------|-------------|
| `uploadToWalrus(data, config?)` | PUT raw bytes; returns `blobId` |
| `downloadFromWalrus(blobId, config?)` | GET raw bytes |
| `uploadEncryptedContent(encrypted, iv, contentType)` | Prepend IV and upload |
| `downloadEncryptedContent(blobId, _ivHex)` | Download and split IV from prefix |

### `lib/seal.ts`

| Function | Description |
|----------|-------------|
| `createSealSessionKey(address, signFn)` | Create + sign SEAL session key |
| `encryptKeyWithSeal(symmetricKey, sealId)` | IBE-encrypt sym key for SEAL |
| `decryptKeyAsAuthor(encKey, sealId, postId, address, sessionKey)` | Decrypt via author path |
| `decryptKeyAsFollower(encKey, sealId, postId, followerListId, address, sessionKey)` | Decrypt via follower path |
| `checkDecryptionPermission(author, user, followers)` | Returns `'author' \| 'follower' \| 'none'` |

### `lib/sui.ts`

| Function | Description |
|----------|-------------|
| `createProfile(signFn, username, bio)` | Submit `create_profile` tx |
| `createPost(signFn, blobId, sealId, sealKey, contentType, ...)` | Submit `create_post` tx |
| `initFollowerList(signFn)` | Submit `init_follower_list` tx |
| `followUser(signFn, followerListId)` | Submit `follow` tx |
| `unfollowUser(signFn, followerListId)` | Submit `unfollow` tx |
| `getPostsByAuthor(client, address)` | Query `PostCreated` events + fetch objects |
| `getProfileByOwner(client, address)` | Query `ProfileCreated` events + fetch object |
| `getFollowerListByOwner(client, address)` | Query owned objects for `FollowerList` |

---

## Security Notes

- Content never leaves the browser unencrypted
- The AES-256-GCM symmetric key is only accessible to SEAL key servers after a valid on-chain permission proof
- SEAL uses a 1-of-2 threshold on Sui testnet key servers — either server can serve a key share
- `seal_id` is a random 32-byte nonce ensuring each post has a unique IBE ciphertext namespace
- Session keys expire after 30 minutes

---

## Development

```bash
# Frontend
cd frontend
npm run dev        # dev server at :5173
npm run build      # production build (tsc + vite)
npm run preview    # preview production build

# Contracts
cd contracts
sui move build     # type-check
sui move test      # run unit tests
```

---

## License

MIT
