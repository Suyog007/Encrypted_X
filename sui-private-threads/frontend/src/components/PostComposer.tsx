/**
 * PostComposer – create new encrypted posts.
 *
 * Full pipeline:
 *   1. Generate AES-256-GCM symmetric key
 *   2. Encrypt content (text / image / video)
 *   3. Upload IV-prepended ciphertext to Walrus
 *   4. Generate random 32-byte sealId
 *   5. Encrypt symmetric key with SEAL (threshold encryption)
 *   6. Persist (walrus_blob_id, seal_id, seal_encrypted_key) on Sui chain
 */

import React, { useState } from 'react';
import { Image, Video, X, Loader2, Lock } from 'lucide-react';
import { useSuiWallet } from '../hooks/useSuiWallet';
import {
  generateSymmetricKey,
  encryptText,
  encryptFile,
} from '../lib/encryption';
import { uploadEncryptedContent } from '../lib/walrus';
import { encryptKeyWithSeal, createSealSessionKey } from '../lib/seal';
import { createPost } from '../lib/sui';

interface PostComposerProps {
  onPostCreated?: () => void;
}

export function PostComposer({ onPostCreated }: PostComposerProps) {
  const { address, signAndExecuteTransaction, signPersonalMessage } = useSuiWallet();

  const [text,         setText]         = useState('');
  const [file,         setFile]         = useState<File | null>(null);
  const [contentType,  setContentType]  = useState<'text' | 'image' | 'video'>('text');
  const [isTokenGated, setIsTokenGated] = useState(false);
  const [tokenType,    setTokenType]    = useState('');
  const [uploading,    setUploading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [statusMsg,    setStatusMsg]    = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setContentType(f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'text');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address || !signAndExecuteTransaction || !signPersonalMessage) {
      setError('Please connect your wallet');
      return;
    }
    if (!text && !file) {
      setError('Please enter text or upload a file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // 1. Generate AES-256-GCM key
      setStatusMsg('Generating encryption key…');
      const symmetricKey = await generateSymmetricKey();

      // 2. Encrypt content
      setStatusMsg('Encrypting content…');
      let encrypted: Uint8Array;
      let iv: Uint8Array;

      if (contentType === 'text') {
        ({ encrypted, iv } = await encryptText(text, symmetricKey));
      } else if (file) {
        ({ encrypted, iv } = await encryptFile(file, symmetricKey));
      } else {
        throw new Error('No content to encrypt');
      }

      // 3. Upload to Walrus
      setStatusMsg('Uploading to Walrus…');
      const { blobId } = await uploadEncryptedContent(encrypted, iv, contentType);

      // 4. Generate SEAL namespace id (32 random bytes)
      const sealId = crypto.getRandomValues(new Uint8Array(32));

      // 5. Encrypt symmetric key with SEAL
      // The session key is only needed for decryption; encryption uses IBE public keys from key servers.
      setStatusMsg('Encrypting key with SEAL…');
      await createSealSessionKey(address, signPersonalMessage); // validates SEAL config is ready
      const sealEncryptedKey = await encryptKeyWithSeal(symmetricKey, sealId);

      // 6. Create on-chain post
      setStatusMsg('Publishing on Sui…');
      await createPost(
        signAndExecuteTransaction,
        blobId,
        sealId,
        sealEncryptedKey,
        contentType,
        isTokenGated,
        tokenType || undefined,
      );

      // Reset form
      setText('');
      setFile(null);
      setContentType('text');
      setIsTokenGated(false);
      setTokenType('');
      setStatusMsg('');
      onPostCreated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to create post');
      console.error('Post creation error:', err);
      setStatusMsg('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center space-x-2 mb-4">
        <Lock className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-semibold">Create Encrypted Post</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind? (encrypted before upload)"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
          disabled={uploading}
        />

        {/* File pickers */}
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer text-gray-600 hover:text-blue-600">
            <Image className="w-5 h-5" />
            <span className="text-sm">Image</span>
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" disabled={uploading} />
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-gray-600 hover:text-blue-600">
            <Video className="w-5 h-5" />
            <span className="text-sm">Video</span>
            <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" disabled={uploading} />
          </label>
        </div>

        {/* Selected file */}
        {file && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-700 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Token gating */}
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTokenGated}
            onChange={(e) => setIsTokenGated(e.target.checked)}
            className="rounded border-gray-300"
            disabled={uploading}
          />
          <span className="text-sm text-gray-700">Token Gated</span>
        </label>

        {isTokenGated && (
          <input
            type="text"
            value={tokenType}
            onChange={(e) => setTokenType(e.target.value)}
            placeholder="Token / NFT collection type"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={uploading}
          />
        )}

        {/* Status / error */}
        {statusMsg && (
          <p className="text-sm text-blue-600 flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{statusMsg}</span>
          </p>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={uploading || (!text && !file)}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Publishing…</span>
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Encrypt &amp; Publish</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
