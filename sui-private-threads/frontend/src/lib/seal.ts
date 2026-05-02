/**
 * SEAL (Sui Encrypted Asset Layer) integration – real @mysten/seal v0.1.0 API.
 *
 * Encryption uses Identity-Based Encryption (IBE) with BLS12-381 threshold
 * encryption.  Key servers identified by their Sui object IDs hold key shares.
 *
 * ── Encryption flow ──────────────────────────────────────────────────────────
 * 1. Fetch key server details via retrieveKeyServers()
 * 2. Call encrypt({ keyServers, threshold, packageId, id: sealId,
 *                   encryptionInput: new AesGcm256(symmetricKeyBytes) })
 *    → returns { encryptedObject: Uint8Array }
 *    (AesGcm256 wraps the key in its own AES layer; decryption returns the original bytes)
 * 3. Store encryptedObject + sealId on-chain inside the EncryptedPost
 *
 * ── Decryption flow ──────────────────────────────────────────────────────────
 * 1. new SessionKey(packageIdBytes, ttlMin)
 * 2. signPersonalMessage(sessionKey.getPersonalMessage()) via wallet
 * 3. sessionKey.setPersonalMessageSignature(signature)
 * 4. Build seal_approve (or seal_approve_follower) Move transaction
 * 5. const keyStore = new KeyStore()
 * 6. keyStore.fetchKeys({ keyServers, threshold, packageId, ids: [sealId], txBytes, sessionKey })
 * 7. const decryptedKeyBytes = await keyStore.decrypt(EncryptedObject.parse(encryptedObjectBytes))
 * 8. importKey(decryptedKeyBytes) → AES-GCM CryptoKey for content decryption
 */

import {
  AesGcm256,
  EncryptedObject,
  KeyStore,
  SessionKey,
  encrypt,
  getAllowlistedKeyServers,
  retrieveKeyServers,
} from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { exportKey, importKey } from './encryption';

// ── Configuration ─────────────────────────────────────────────────────────────

const PACKAGE_ID_HEX = import.meta.env.VITE_PACKAGE_ID as string | undefined;
// getAllowlistedKeyServers only supports 'testnet' and 'mainnet'
const NETWORK = ((import.meta.env.VITE_SUI_NETWORK as string) === 'mainnet' ? 'mainnet' : 'testnet') as
  | 'testnet'
  | 'mainnet';

const SEAL_THRESHOLD = 1;   // 1-of-2 quorum
const SESSION_TTL_MIN = 30; // 30-minute session

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Decode a 0x-prefixed hex string to a padded 32-byte Uint8Array */
function hexToBytes32(hex: string): Uint8Array {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = raw.padStart(64, '0'); // 32 bytes = 64 hex chars
  return new Uint8Array(padded.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function makeSuiClient(): SuiClient {
  const net = (import.meta.env.VITE_SUI_NETWORK as string) || 'testnet';
  return new SuiClient({ url: getFullnodeUrl(net as 'testnet' | 'mainnet' | 'devnet') });
}

// ── Key servers ───────────────────────────────────────────────────────────────

type KeyServerInfo = Awaited<ReturnType<typeof retrieveKeyServers>>[number];

let _keyServerCache: KeyServerInfo[] | null = null;

async function getKeyServers(client: SuiClient): Promise<KeyServerInfo[]> {
  if (_keyServerCache) return _keyServerCache;

  // getAllowlistedKeyServers returns Uint8Array[] of the well-known object IDs
  const objectIds = getAllowlistedKeyServers(NETWORK);

  _keyServerCache = await retrieveKeyServers({ objectIds, client: client as any });
  return _keyServerCache;
}

// ── Session key ───────────────────────────────────────────────────────────────

/**
 * Create a SEAL SessionKey and have the user sign its personal message.
 * The wallet signature proves the caller owns the claimed Sui address.
 *
 * @param _address             Caller's wallet address (informational only)
 * @param signPersonalMessage  dapp-kit signing callback
 */
export async function createSealSessionKey(
  _address: string | undefined,
  signPersonalMessage: (args: { message: Uint8Array }) => Promise<{ signature: string }>,
): Promise<SessionKey> {
  if (!PACKAGE_ID_HEX || PACKAGE_ID_HEX === '0x0') {
    throw new Error('VITE_PACKAGE_ID is not configured – deploy the contract first.');
  }

  const packageIdBytes = hexToBytes32(PACKAGE_ID_HEX);
  const sessionKey     = new SessionKey(packageIdBytes, SESSION_TTL_MIN);
  const message        = sessionKey.getPersonalMessage();

  const { signature } = await signPersonalMessage({ message });
  sessionKey.setPersonalMessageSignature(signature);

  return sessionKey;
}

// ── Encryption ────────────────────────────────────────────────────────────────

/**
 * Encrypt a symmetric key with SEAL and return the opaque encryptedObject bytes
 * to be stored on-chain.
 *
 * @param symmetricKey  AES-256-GCM CryptoKey protecting post content
 * @param sealId        32-byte random SEAL namespace (stored alongside on-chain)
 */
export async function encryptKeyWithSeal(
  symmetricKey: CryptoKey,
  sealId: Uint8Array,
): Promise<Uint8Array> {
  if (!PACKAGE_ID_HEX || PACKAGE_ID_HEX === '0x0') {
    throw new Error('VITE_PACKAGE_ID is not configured – deploy the contract first.');
  }

  const packageIdBytes = hexToBytes32(PACKAGE_ID_HEX);
  const keyBytes       = await exportKey(symmetricKey);
  const client         = makeSuiClient();
  const keyServers     = await getKeyServers(client);

  const { encryptedObject } = await encrypt({
    keyServers,
    threshold:       SEAL_THRESHOLD,
    packageId:       packageIdBytes,
    id:              sealId,
    encryptionInput: new AesGcm256(keyBytes, new Uint8Array(0)), // AAD empty; SEAL wraps keyBytes
  });

  return encryptedObject;
}

// ── Decryption (shared helper) ────────────────────────────────────────────────

async function decryptSealKey(
  encryptedKeyBytes: Uint8Array,
  sealId:            Uint8Array,
  txBuilder:         (tx: Transaction) => void,
  userAddress:       string,
  sessionKey:        SessionKey,
): Promise<CryptoKey> {
  const packageIdBytes = hexToBytes32(PACKAGE_ID_HEX!);
  const client         = makeSuiClient();
  const keyServers     = await getKeyServers(client);

  // Build the seal_approve Move transaction
  const tx = new Transaction();
  txBuilder(tx);
  tx.setSender(userAddress);
  const txBytes = await tx.build({ client: client as any });

  // Fetch key shares from SEAL servers
  const keyStore = new KeyStore();
  await keyStore.fetchKeys({
    keyServers,
    threshold: SEAL_THRESHOLD,
    packageId: packageIdBytes,
    ids:       [sealId],
    txBytes,
    sessionKey,
  });

  // Decrypt → returns the original symmetricKey bytes
  const parsedObj    = EncryptedObject.parse(encryptedKeyBytes);
  const keyBytes     = await keyStore.decrypt(parsedObj as any);

  return importKey(keyBytes as Uint8Array);
}

// ── Decryption (post author) ──────────────────────────────────────────────────

/**
 * Decrypt SEAL-encrypted key using the author's approve path.
 */
export async function decryptKeyAsAuthor(
  encryptedKey: Uint8Array,
  sealId:       Uint8Array,
  postId:       string,
  userAddress:  string,
  sessionKey:   SessionKey,
): Promise<CryptoKey> {
  return decryptSealKey(
    encryptedKey,
    sealId,
    (tx) => {
      tx.moveCall({
        target:    `${PACKAGE_ID_HEX}::private_threads::seal_approve`,
        arguments: [tx.pure.vector('u8', Array.from(sealId)), tx.object(postId)],
      });
    },
    userAddress,
    sessionKey,
  );
}

// ── Decryption (follower) ─────────────────────────────────────────────────────

/**
 * Decrypt SEAL-encrypted key using the follower approve path.
 */
export async function decryptKeyAsFollower(
  encryptedKey:   Uint8Array,
  sealId:         Uint8Array,
  postId:         string,
  followerListId: string,
  userAddress:    string,
  sessionKey:     SessionKey,
): Promise<CryptoKey> {
  return decryptSealKey(
    encryptedKey,
    sealId,
    (tx) => {
      tx.moveCall({
        target:    `${PACKAGE_ID_HEX}::private_threads::seal_approve_follower`,
        arguments: [
          tx.pure.vector('u8', Array.from(sealId)),
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

/**
 * Determine whether the current user may attempt decryption.
 * Returns 'author' | 'follower' | 'none'.
 */
export function checkDecryptionPermission(
  postAuthor:   string,
  userAddress:  string,
  followerList: string[],
): 'author' | 'follower' | 'none' {
  if (postAuthor.toLowerCase() === userAddress.toLowerCase()) return 'author';
  if (followerList.some((f) => f.toLowerCase() === userAddress.toLowerCase())) return 'follower';
  return 'none';
}
