/**
 * React hook for loading and decrypting encrypted posts.
 *
 * Decryption pipeline per post (SEAL v1.x):
 *   1. Check if caller is author or follower (on-chain follower list)
 *   2. Download SEAL-encrypted blob from Walrus
 *   3. Use SEAL to decrypt content directly (key recovery + AES-GCM handled internally)
 */

import { useState, useCallback, useRef } from 'react';
import type { SessionKey } from '@mysten/seal';
import { useSuiWallet } from './useSuiWallet';
import { getPostsByAuthor, getFollowerListByOwner } from '../lib/sui';
import { downloadEncryptedBlob } from '../lib/walrus';
import {
  createSealSessionKey,
  decryptAsAuthor,
  decryptAsFollower,
  checkDecryptionPermission,
} from '../lib/seal';
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
      const key = await createSealSessionKey(address, signPersonalMessage);
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
      // Download SEAL-encrypted blob from Walrus
      const encryptedData = await downloadEncryptedBlob(post.walrusBlobId);

      // Decrypt using SEAL
      let decryptedBytes: Uint8Array;
      if (permission === 'author') {
        decryptedBytes = await decryptAsAuthor(
          encryptedData,
          post.id,
          address,
          sessionKey,
        );
      } else {
        if (!followerListId) return locked;
        decryptedBytes = await decryptAsFollower(
          encryptedData,
          post.id,
          followerListId,
          address,
          sessionKey,
        );
      }

      // Parse decrypted content
      let content: PostContent = {};
      if (post.contentType === 'text') {
        content.text = new TextDecoder().decode(decryptedBytes);
      } else if (post.contentType === 'image') {
        content.image = new Blob([decryptedBytes.slice()]);
      } else if (post.contentType === 'video') {
        content.video = new Blob([decryptedBytes.slice()]);
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
