/**
 * Walrus decentralised storage integration.
 *
 * Publisher  – https://publisher.walrus-testnet.walrus.space
 * Aggregator – https://aggregator.walrus-testnet.walrus.space
 *
 * Upload API:   PUT  /v1/blobs?epochs=<n>   (raw binary body)
 * Download API: GET  /v1/blobs/<blobId>      (raw binary response)
 */

const DEFAULT_PUBLISHER  = 'https://publisher.walrus-testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';
const STORAGE_EPOCHS     = 5; // number of Walrus epochs to store data

export interface WalrusConfig {
  publisherUrl?:  string;
  aggregatorUrl?: string;
}

export interface UploadResult {
  blobId: string;
  size:   number;
}

// ── Low-level helpers ────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Core upload / download ───────────────────────────────────────────────────

/**
 * Upload raw bytes to Walrus.  Returns the Walrus blobId.
 */
export async function uploadToWalrus(
  data:    Uint8Array,
  config?: WalrusConfig,
): Promise<UploadResult> {
  const publisherUrl = config?.publisherUrl ?? DEFAULT_PUBLISHER;

  // Slice to get a plain ArrayBuffer (avoids SharedArrayBuffer type issues)
  const body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

  const response = await fetch(
    `${publisherUrl}/v1/blobs?epochs=${STORAGE_EPOCHS}`,
    {
      method:  'PUT',
      body,
      headers: { 'Content-Type': 'application/octet-stream' },
    },
  );

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Walrus upload failed (${response.status}): ${msg}`);
  }

  const json = await response.json();

  // Walrus returns either newlyCreated or alreadyCertified
  const blobId: string | undefined =
    json?.newlyCreated?.blobObject?.blobId ??
    json?.alreadyCertified?.blobObject?.blobId ??
    json?.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error(`Walrus upload: could not parse blobId from response: ${JSON.stringify(json)}`);
  }

  return { blobId, size: data.length };
}

/**
 * Download raw bytes from Walrus by blobId.
 */
export async function downloadFromWalrus(
  blobId:  string,
  config?: WalrusConfig,
): Promise<Uint8Array> {
  const aggregatorUrl = config?.aggregatorUrl ?? DEFAULT_AGGREGATOR;

  const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Walrus download failed (${response.status}): ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

// ── SEAL blob helpers ───────────────────────────────────────────────────────

/**
 * Upload a SEAL-encrypted blob to Walrus. Returns the blobId.
 */
export async function uploadEncryptedBlob(
  encryptedBytes: Uint8Array,
  config?: WalrusConfig,
): Promise<string> {
  const { blobId } = await uploadToWalrus(encryptedBytes, config);
  return blobId;
}

/**
 * Download a SEAL-encrypted blob from Walrus.
 */
export async function downloadEncryptedBlob(
  blobId: string,
  config?: WalrusConfig,
): Promise<Uint8Array> {
  return downloadFromWalrus(blobId, config);
}

// ── Legacy encrypted-content helpers ────────────────────────────────────────

/**
 * Combine IV + ciphertext and upload to Walrus.
 * The first 12 bytes of the stored blob are the AES-GCM IV.
 */
export async function uploadEncryptedContent(
  encryptedContent: Uint8Array,
  iv:               Uint8Array,
  _contentType:     string,     // kept for API compatibility
  config?:          WalrusConfig,
): Promise<{ blobId: string; metadata: { iv: string; contentType: string } }> {
  // Prepend IV so we can recover it on download without extra storage
  const combined = new Uint8Array(iv.length + encryptedContent.length);
  combined.set(iv, 0);
  combined.set(encryptedContent, iv.length);

  const { blobId } = await uploadToWalrus(combined, config);

  return {
    blobId,
    metadata: {
      iv:          toHex(iv),
      contentType: _contentType,
    },
  };
}

/**
 * Download a blob and split the leading 12-byte IV from the ciphertext.
 * The ivHex parameter is accepted for API compatibility but the IV is
 * always read from the blob prefix.
 */
export async function downloadEncryptedContent(
  blobId:  string,
  _ivHex:  string,   // kept for API compatibility
  config?: WalrusConfig,
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const combined = await downloadFromWalrus(blobId, config);

  const IV_LEN  = 12; // AES-GCM IV is always 12 bytes
  const iv        = combined.slice(0, IV_LEN);
  const encrypted = combined.slice(IV_LEN);

  return { encrypted, iv };
}
