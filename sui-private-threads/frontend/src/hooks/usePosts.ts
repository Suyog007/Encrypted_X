/**
 * React hook for loading and decrypting encrypted posts.
 *
 * Decryption pipeline per post
 *   1. Check if caller is author or follower (on-chain follower list)
 *   2. Download IV-prefixed ciphertext from Walrus
 *   3. Use SEAL to recover the AES-GCM symmetric key
 *   4. Decrypt content with the symmetric key
 */

import { useState, useCallback, useRef } from 'react';
import type { SessionKey } from '@mysten/seal';
import { useSuiWallet } from './useSuiWallet';
import { getPostsByAuthor, getFollowerListByOwner } from '../lib/sui';
import { downloadEncryptedContent } from '../lib/walrus';
import {
  createSealSessionKey,
  decryptKeyAsAuthor,
  decryptKeyAsFollower,
  checkDecryptionPermission,
} from '../lib/seal';
import { decryptText, decryptFile } from '../lib/encryption';
import { EncryptedPost, DecryptedPost, PostContent } from '../types';

export function usePosts() {
  const { client, address, signPersonalMessage } = useSuiWallet();

  const [posts,   setPosts]   = useState<DecryptedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Cache the SEAL session key for the lifetime of this hook instance
  const sessionKeyRef = useRef<SessionKey | null>(null);

  // ── Session key ────────────────────────────────────────────────────────────

  const getSessionKey = useCallback(async (): Promise<SessionKey | null> => {
    if (sessionKeyRef.current) return sessionKeyRef.current;
    if (!address || !signPersonalMessage) return null;

    try {
      const key = await createSealSessionKey(address ?? undefined, signPersonalMessage);
      sessionKeyRef.current = key;
      return key;
    } catch (err) {
      console.warn('Could not create SEAL session key:', err);
      return null;
    }
  }, [address, signPersonalMessage]);

  // ── Per-post decryption ────────────────────────────────────────────────────

  const decryptPost = useCallback(async (
    post: EncryptedPost,
    followerList: string[],
    followerListId: string | null,
  ): Promise<DecryptedPost> => {
    const locked: DecryptedPost = { ...post, content: {}, decrypted: false };

    if (!address) return locked;

    const permission = checkDecryptionPermission(post.author, address, followerList);
    if (permission === 'none') return locked;

    const sessionKey = await getSessionKey();
    if (!sessionKey) return locked;

    try {
      // Download ciphertext + IV from Walrus
      const { encrypted, iv } = await downloadEncryptedContent(
        post.walrusBlobId,
        '', // IV is embedded in the blob (first 12 bytes)
      );

      // Recover symmetric key via SEAL
      let symmetricKey;
      if (permission === 'author') {
        symmetricKey = await decryptKeyAsAuthor(
          post.sealEncryptedKey,
          post.sealId,
          post.id,
          address,
          sessionKey,
        );
      } else {
        if (!followerListId) return locked;
        symmetricKey = await decryptKeyAsFollower(
          post.sealEncryptedKey,
          post.sealId,
          post.id,
          followerListId,
          address,
          sessionKey,
        );
      }

      // Decrypt content
      let content: PostContent = {};
      if (post.contentType === 'text') {
        content.text = await decryptText(encrypted, iv, symmetricKey);
      } else if (post.contentType === 'image') {
        content.image = await decryptFile(encrypted, iv, symmetricKey);
      } else if (post.contentType === 'video') {
        content.video = await decryptFile(encrypted, iv, symmetricKey);
      }

      return { ...post, content, decrypted: true };
    } catch (err) {
      console.error('Failed to decrypt post', post.id, err);
      return locked;
    }
  }, [address, getSessionKey]);

  // ── Load posts ─────────────────────────────────────────────────────────────

  const loadPosts = useCallback(async (authorAddress?: string) => {
    if (!client || !address) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch raw post data from chain via PostCreated events
      const rawPosts = await getPostsByAuthor(client, authorAddress ?? '');

      // Fetch follower lists for permission checks.
      // When viewing a specific author, fetch their follower list.
      // For the global feed, we need to check per-post, so we build a cache.
      let followerList:   string[] = [];
      let followerListId: string | null = null;
      const followerListCache = new Map<string, { followers: string[]; id: string } | null>();

      if (authorAddress) {
        const fl = await getFollowerListByOwner(client, authorAddress);
        if (fl) {
          followerList   = fl.followers;
          followerListId = fl.id;
        }
      }

      // Map raw data to EncryptedPost type
      const encryptedPosts: EncryptedPost[] = rawPosts.map((p) => ({
        id:               p.id,
        author:           p.author,
        walrusBlobId:     p.walrusBlobId,
        sealId:           p.sealId,
        sealEncryptedKey: p.sealEncryptedKey,
        contentType:      p.contentType,
        createdAt:        p.createdAt,
        isTokenGated:     p.isTokenGated,
        tokenType:        p.tokenType,
      }));

      // Decrypt posts the user has access to
      const decryptedPosts = await Promise.all(
        encryptedPosts.map(async (post) => {
          // For global feed (no authorAddress), resolve follower list per post author
          let fl = followerList;
          let flId = followerListId;
          if (!authorAddress && post.author !== address) {
            if (!followerListCache.has(post.author)) {
              followerListCache.set(post.author, await getFollowerListByOwner(client, post.author));
            }
            const cached = followerListCache.get(post.author);
            if (cached) {
              fl = cached.followers;
              flId = cached.id;
            }
          }
          return decryptPost(post, fl, flId);
        }),
      );

      setPosts(decryptedPosts);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, [client, address, decryptPost]);

  return { posts, loading, error, loadPosts, decryptPost };
}
