/**
 * Type definitions for Sui Private Threads
 */

export interface UserProfile {
  id:             string;
  owner:          string;
  username:       string;
  bio:            string;
  createdAt:      number;
  followerCount:  number;
  followingCount: number;
}

export interface EncryptedPost {
  id:               string;
  author:           string;
  walrusBlobId:     string;
  /** 32-byte random SEAL namespace identifier */
  sealId:           Uint8Array;
  sealEncryptedKey: Uint8Array;
  contentType:      'text' | 'image' | 'video';
  createdAt:        number;
  isTokenGated:     boolean;
  tokenType?:       string;
}

export interface PostContent {
  text?:  string;
  image?: Blob;
  video?: Blob;
}

export interface DecryptedPost extends EncryptedPost {
  content:   PostContent;
  decrypted: boolean;
}

export interface FollowerList {
  id:        string;
  owner:     string;
  followers: string[];
}

export interface CreatePostParams {
  content:      PostContent;
  contentType:  'text' | 'image' | 'video';
  isTokenGated?: boolean;
  tokenType?:   string;
}
