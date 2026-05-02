/**
 * Sui blockchain integration utilities.
 * Uses @mysten/sui (v1.x) and is compatible with @mysten/dapp-kit.
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || '0x0';
const NETWORK    = (import.meta.env.VITE_SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet') || 'testnet';

// ── Client factory ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySuiClient = any;

export function getSuiClient(network?: 'testnet' | 'mainnet' | 'devnet'): SuiClient {
  return new SuiClient({ url: getFullnodeUrl(network ?? NETWORK) });
}

// ── Type for signAndExecuteTransaction (dapp-kit) ─────────────────────────────
// Use a loose signature to avoid version-mismatch errors between the
// @mysten/sui bundled inside @mysten/dapp-kit and the one we install directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignAndExecute = (args: { transaction: any }) => Promise<{ digest: string }>;

// ── Profile ───────────────────────────────────────────────────────────────────

export async function createProfile(
  signAndExecuteTransaction: SignAndExecute,
  username: string,
  bio:      string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target:    `${PACKAGE_ID}::private_threads::create_profile`,
    arguments: [tx.pure.string(username), tx.pure.string(bio)],
  });
  const result = await signAndExecuteTransaction({ transaction: tx });
  return result.digest;
}

/**
 * Find a UserProfile shared object for a given owner address.
 * Queries ProfileCreated events emitted by the package, then fetches
 * the matching object.
 */
export async function getProfileByOwner(
  client:  AnySuiClient,
  owner:   string,
): Promise<{ id: string; username: string; bio: string; followerCount: number; followingCount: number; createdAt: number } | null> {
  try {
    let cursor: any = null;
    let found: any  = null;

    // Walk pages of ProfileCreated events (most recent first)
    while (!found) {
      const page = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::private_threads::ProfileCreated` },
        limit: 50,
        order: 'descending',
        cursor,
      });

      for (const ev of page.data) {
        if ((ev.parsedJson as any)?.owner === owner) {
          found = ev;
          break;
        }
      }

      if (found || !page.hasNextPage) break;
      cursor = page.nextCursor;
    }

    if (!found) return null;

    const profileId = (found.parsedJson as any).profile_id as string;
    const obj       = await client.getObject({ id: profileId, options: { showContent: true } });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;

    const f = (obj.data.content as any).fields;
    return {
      id:            profileId,
      username:      f.username as string,
      bio:           f.bio      as string,
      followerCount: Number(f.follower_count),
      followingCount:Number(f.following_count),
      createdAt:     Number(f.created_at),
    };
  } catch (err) {
    console.error('getProfileByOwner error:', err);
    return null;
  }
}

// ── Follower list ─────────────────────────────────────────────────────────────

export async function initFollowerList(
  signAndExecuteTransaction: SignAndExecute,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({ target: `${PACKAGE_ID}::private_threads::init_follower_list`, arguments: [] });
  const result = await signAndExecuteTransaction({ transaction: tx });
  return result.digest;
}

export async function followUser(
  signAndExecuteTransaction: SignAndExecute,
  followerListId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target:    `${PACKAGE_ID}::private_threads::follow`,
    arguments: [tx.object(followerListId)],
  });
  const result = await signAndExecuteTransaction({ transaction: tx });
  return result.digest;
}

export async function unfollowUser(
  signAndExecuteTransaction: SignAndExecute,
  followerListId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target:    `${PACKAGE_ID}::private_threads::unfollow`,
    arguments: [tx.object(followerListId)],
  });
  const result = await signAndExecuteTransaction({ transaction: tx });
  return result.digest;
}

/**
 * Find the FollowerList object ID owned by a given address.
 * Uses getOwnedObjects filtered by StructType.
 */
export async function getFollowerListByOwner(
  client: AnySuiClient,
  owner:  string,
): Promise<{ id: string; followers: string[] } | null> {
  try {
    const res = await client.getOwnedObjects({
      owner,
      filter: { StructType: `${PACKAGE_ID}::private_threads::FollowerList` },
      options: { showContent: true },
    });

    if (!res.data.length) return null;

    const obj = res.data[0];
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;

    const f = (obj.data.content as any).fields;
    return {
      id:        obj.data.objectId,
      followers: (f.followers as string[]) ?? [],
    };
  } catch (err) {
    console.error('getFollowerListByOwner error:', err);
    return null;
  }
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export interface EncryptedPostData {
  id:               string;
  author:           string;
  walrusBlobId:     string;
  sealId:           Uint8Array;
  sealEncryptedKey: Uint8Array;
  contentType:      'text' | 'image' | 'video';
  createdAt:        number;
  isTokenGated:     boolean;
  tokenType?:       string;
}

export async function createPost(
  signAndExecuteTransaction: SignAndExecute,
  walrusBlobId:     string,
  sealId:           Uint8Array,
  sealEncryptedKey: Uint8Array,
  contentType:      string,
  isTokenGated:     boolean = false,
  tokenType?:       string,
): Promise<string> {
  const tx = new Transaction();

  const tokenTypeBytes = tokenType ? new TextEncoder().encode(tokenType) : new Uint8Array(0);

  tx.moveCall({
    target:    `${PACKAGE_ID}::private_threads::create_post`,
    arguments: [
      tx.pure.string(walrusBlobId),
      tx.pure.vector('u8', Array.from(sealId)),
      tx.pure.vector('u8', Array.from(sealEncryptedKey)),
      tx.pure.string(contentType),
      tx.pure.bool(isTokenGated),
      tx.pure.vector('u8', Array.from(tokenTypeBytes)),
    ],
  });

  const result = await signAndExecuteTransaction({ transaction: tx });
  return result.digest;
}

/**
 * Return paginated posts by a specific author using PostCreated events.
 * If authorAddress is empty / undefined, returns posts from ALL authors
 * (useful for a global home feed).
 */
export async function getPostsByAuthor(
  client:        AnySuiClient,
  authorAddress: string,
  limit = 20,
): Promise<EncryptedPostData[]> {
  try {
    const posts: EncryptedPostData[] = [];
    let   cursor: any = null;

    while (posts.length < limit) {
      const page = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::private_threads::PostCreated` },
        limit: 50,
        order: 'descending',
        cursor,
      });

      for (const ev of page.data) {
        const json = ev.parsedJson as any;
        if (authorAddress && json?.author !== authorAddress) continue;

        const postId = json?.post_id as string | undefined;
        if (!postId) continue;

        const obj = await client.getObject({ id: postId, options: { showContent: true } });
        if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') continue;

        const f = (obj.data.content as any).fields;

        posts.push({
          id:               postId,
          author:           f.author as string,
          walrusBlobId:     f.walrus_blob_id as string,
          sealId:           new Uint8Array(f.seal_id as number[]),
          sealEncryptedKey: new Uint8Array(f.seal_encrypted_key as number[]),
          contentType:      f.content_type as 'text' | 'image' | 'video',
          createdAt:        Number(f.created_at),
          isTokenGated:     Boolean(f.is_token_gated),
          tokenType:        f.token_type ?? undefined,
        });

        if (posts.length >= limit) break;
      }

      if (!page.hasNextPage) break;
      cursor = page.nextCursor;
    }

    return posts;
  } catch (err) {
    console.error('getPostsByAuthor error:', err);
    return [];
  }
}

/**
 * Fetch the full data of a single EncryptedPost by its object ID.
 */
export async function getEncryptedPost(
  client: AnySuiClient,
  postId: string,
): Promise<EncryptedPostData | null> {
  try {
    const obj = await client.getObject({ id: postId, options: { showContent: true } });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;

    const f = (obj.data.content as any).fields;
    return {
      id:               postId,
      author:           f.author as string,
      walrusBlobId:     f.walrus_blob_id as string,
      sealId:           new Uint8Array(f.seal_id as number[]),
      sealEncryptedKey: new Uint8Array(f.seal_encrypted_key as number[]),
      contentType:      f.content_type as 'text' | 'image' | 'video',
      createdAt:        Number(f.created_at),
      isTokenGated:     Boolean(f.is_token_gated),
      tokenType:        f.token_type ?? undefined,
    };
  } catch (err) {
    console.error('getEncryptedPost error:', err);
    return null;
  }
}

// ── Legacy query helpers ───────────────────────────────────────────────────────

export async function getUserProfile(client: AnySuiClient, profileId: string) {
  return client.getObject({ id: profileId, options: { showContent: true } });
}

export async function getFollowerList(client: AnySuiClient, followerListId: string) {
  return client.getObject({ id: followerListId, options: { showContent: true } });
}
