/**
 * SEAL (Sui Encrypted Asset Layer) integration – @mysten/seal v1.x API.
 *
 * Uses SealClient for encryption/decryption with a decentralized key server.
 *
 * ── Encryption flow ──────────────────────────────────────────────────────────
 * 1. Create SealClient with key server config
 * 2. Call sealClient.encrypt({ threshold, packageId, id, data })
 *    → returns { encryptedObject: Uint8Array, key: Uint8Array }
 * 3. Upload encryptedObject to Walrus, store blobId on-chain
 *
 * ── Decryption flow ──────────────────────────────────────────────────────────
 * 1. SessionKey.create({ address, packageId, ttlMin, suiClient })
 * 2. signPersonalMessage(sessionKey.getPersonalMessage()) via wallet
 * 3. sessionKey.setPersonalMessageSignature(signature)
 * 4. Build seal_approve (or seal_approve_follower) Move transaction
 * 5. sealClient.decrypt({ data, sessionKey, txBytes })
 */

import { SealClient, SessionKey, EncryptedObject } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

// ── Configuration ─────────────────────────────────────────────────────────────

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID as string | undefined;
const SEAL_THRESHOLD = 1;
const SESSION_TTL_MIN = 30;

// Decentralized key server for testnet
// See: https://seal-docs.wal.app/UsingSeal#choosing-key-servers
const DECENTRALIZED_KEY_SERVER_OBJ_ID =
  '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSuiClient(): SuiJsonRpcClient {
  const net = (import.meta.env.VITE_SUI_NETWORK as string) || 'testnet';
  const network = net as 'testnet' | 'mainnet' | 'devnet';
  return new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network), network });
}

let _sealClient: SealClient | null = null;

function getSealClient(): SealClient {
  if (_sealClient) return _sealClient;
  const suiClient = makeSuiClient();
  _sealClient = new SealClient({
    suiClient,
    serverConfigs: [
      {
        objectId: DECENTRALIZED_KEY_SERVER_OBJ_ID,
        weight: 1,
        aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
      },
    ],
    verifyKeyServers: false,
  });
  return _sealClient;
}

// ── Session key ───────────────────────────────────────────────────────────────

/**
 * Create a SEAL SessionKey and have the user sign its personal message.
 */
export async function createSealSessionKey(
  address: string | undefined,
  signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>,
): Promise<SessionKey> {
  if (!PACKAGE_ID || PACKAGE_ID === '0x0') {
    throw new Error('VITE_PACKAGE_ID is not configured – deploy the contract first.');
  }
  if (!address) {
    throw new Error('Wallet not connected.');
  }

  const suiClient = makeSuiClient();
  const sessionKey = await SessionKey.create({
    address,
    packageId: PACKAGE_ID,
    ttlMin: SESSION_TTL_MIN,
    suiClient,
  });

  const message = sessionKey.getPersonalMessage();
  const { signature } = await signPersonalMessage({ message });
  await sessionKey.setPersonalMessageSignature(signature);

  return sessionKey;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt data with SEAL. Returns the encrypted object bytes to upload to Walrus.
 *
 * @param data     Raw content bytes (text, image, video)
 * @param sealId   Hex string identity for SEAL (e.g. toHex(policyObjectBytes + nonce))
 */
export async function encryptWithSeal(
  data: Uint8Array,
  sealId: string,
): Promise<Uint8Array> {
  if (!PACKAGE_ID || PACKAGE_ID === '0x0') {
    throw new Error('VITE_PACKAGE_ID is not configured – deploy the contract first.');
  }

  const client = getSealClient();
  const { encryptedObject } = await client.encrypt({
    threshold: SEAL_THRESHOLD,
    packageId: PACKAGE_ID,
    id: sealId,
    data,
  });

  return encryptedObject;
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * Decrypt SEAL-encrypted data using a seal_approve transaction.
 */
export async function decryptWithSeal(
  encryptedData: Uint8Array,
  txBuilder: (tx: Transaction, id: string) => void,
  _userAddress: string,
  sessionKey: SessionKey,
): Promise<Uint8Array> {
  const client = getSealClient();
  const suiClient = makeSuiClient();

  // Parse the encrypted object to get its ID
  const parsed = EncryptedObject.parse(encryptedData);
  const id = parsed.id;

  // Build the seal_approve transaction
  const tx = new Transaction();
  txBuilder(tx, id);
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  // Fetch keys then decrypt
  await client.fetchKeys({
    ids: [id],
    txBytes,
    sessionKey,
    threshold: SEAL_THRESHOLD,
  });

  return client.decrypt({
    data: encryptedData,
    sessionKey,
    txBytes,
  });
}

// ── Decryption (post author) ──────────────────────────────────────────────────

export async function decryptAsAuthor(
  encryptedData: Uint8Array,
  postId: string,
  userAddress: string,
  sessionKey: SessionKey,
): Promise<Uint8Array> {
  return decryptWithSeal(
    encryptedData,
    (tx, id) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::private_threads::seal_approve`,
        arguments: [tx.pure.vector('u8', Array.from(hexToBytes(id))), tx.object(postId)],
      });
    },
    userAddress,
    sessionKey,
  );
}

// ── Decryption (follower) ─────────────────────────────────────────────────────

export async function decryptAsFollower(
  encryptedData: Uint8Array,
  postId: string,
  followerListId: string,
  userAddress: string,
  sessionKey: SessionKey,
): Promise<Uint8Array> {
  return decryptWithSeal(
    encryptedData,
    (tx, id) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::private_threads::seal_approve_follower`,
        arguments: [
          tx.pure.vector('u8', Array.from(hexToBytes(id))),
          tx.object(postId),
          tx.object(followerListId),
        ],
      });
    },
    userAddress,
    sessionKey,
  );
}

// ── Permission check ──────────────────────────────────────────────────────────

export function checkDecryptionPermission(
  postAuthor: string,
  userAddress: string,
  followerList: string[],
): 'author' | 'follower' | 'none' {
  if (postAuthor.toLowerCase() === userAddress.toLowerCase()) return 'author';
  if (followerList.some((f) => f.toLowerCase() === userAddress.toLowerCase())) return 'follower';
  return 'none';
}

// ── Utility ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(raw.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
