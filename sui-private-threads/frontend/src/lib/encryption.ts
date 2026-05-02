/**
 * Encryption utilities using AES-256-GCM for content encryption.
 * Symmetric keys are protected with SEAL for access control.
 */

/** Extract a plain ArrayBuffer from a Uint8Array, avoiding SharedArrayBuffer issues. */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

export async function generateSymmetricKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

export async function importKey(keyData: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toArrayBuffer(keyData), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptContent(
  content: Uint8Array,
  key: CryptoKey,
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const cipher  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(content),
  );
  return { encrypted: new Uint8Array(cipher), iv };
}

export async function decryptContent(
  encrypted: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encrypted),
  );
  return new Uint8Array(plain);
}

export async function encryptText(
  text: string,
  key: CryptoKey,
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  return encryptContent(new TextEncoder().encode(text), key);
}

export async function decryptText(
  encrypted: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<string> {
  const plain = await decryptContent(encrypted, iv, key);
  return new TextDecoder().decode(plain);
}

export async function encryptFile(
  file: File | Blob,
  key: CryptoKey,
): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  return encryptContent(new Uint8Array(await file.arrayBuffer()), key);
}

export async function decryptFile(
  encrypted: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<Blob> {
  const plain = await decryptContent(encrypted, iv, key);
  return new Blob([toArrayBuffer(plain)]);
}
