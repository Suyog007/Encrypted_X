/**
 * Profile page – shows a user's on-chain profile and their encrypted posts.
 */

import { useEffect, useState, useCallback } from 'react';
import { PostCard }      from '../components/PostCard';
import { FollowButton }  from '../components/FollowButton';
import { useSuiWallet }  from '../hooks/useSuiWallet';
import { usePosts }      from '../hooks/usePosts';
import {
  getProfileByOwner,
  getFollowerListByOwner,
  initFollowerList,
  createProfile,
} from '../lib/sui';
import { UserProfile } from '../types';
import { Loader2, User, Plus } from 'lucide-react';

interface ProfileProps {
  /** Address of the profile to view. Defaults to current wallet. */
  address?: string;
}

export function Profile({ address: profileAddress }: ProfileProps) {
  const {
    address: currentAddress,
    client,
    isConnected,
    signAndExecuteTransaction,
  } = useSuiWallet();

  const { posts, loading: postsLoading, loadPosts, decryptPost } = usePosts();

  const [profile,          setProfile]          = useState<UserProfile | null>(null);
  const [followerListId,   setFollowerListId]   = useState<string | null>(null);
  const [isFollowing,      setIsFollowing]      = useState(false);
  const [profileLoading,   setProfileLoading]   = useState(false);

  // Setup state for profile/follower-list creation
  const [creatingProfile,  setCreatingProfile]  = useState(false);
  const [creatingList,     setCreatingList]     = useState(false);
  const [username,         setUsername]         = useState('');
  const [bio,              setBio]              = useState('');
  const [showCreateForm,   setShowCreateForm]   = useState(false);

  const address = profileAddress || currentAddress;
  const isOwnProfile = currentAddress?.toLowerCase() === address?.toLowerCase();

  // ── Load profile data ────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!client || !address) return;
    setProfileLoading(true);

    try {
      const p = await getProfileByOwner(client, address);
      if (p) {
        setProfile({
          id:            p.id,
          owner:         address,
          username:      p.username,
          bio:           p.bio,
          createdAt:     p.createdAt,
          followerCount: p.followerCount,
          followingCount:p.followingCount,
        });
      } else {
        setProfile(null);
      }

      // Fetch follower list
      const fl = await getFollowerListByOwner(client, address);
      if (fl) {
        setFollowerListId(fl.id);
        if (currentAddress) {
          setIsFollowing(fl.followers.includes(currentAddress));
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [client, address, currentAddress]);

  useEffect(() => {
    if (address && client) {
      loadProfile();
      loadPosts(address);
    }
  }, [address, client]);

  // ── Create profile ────────────────────────────────────────────────────────

  const handleCreateProfile = async () => {
    if (!signAndExecuteTransaction || !username.trim()) return;
    setCreatingProfile(true);
    try {
      await createProfile(signAndExecuteTransaction, username.trim(), bio.trim());
      setShowCreateForm(false);
      await loadProfile();
    } catch (err: any) {
      alert(`Failed to create profile: ${err.message}`);
    } finally {
      setCreatingProfile(false);
    }
  };

  // ── Init follower list ────────────────────────────────────────────────────

  const handleInitFollowerList = async () => {
    if (!signAndExecuteTransaction) return;
    setCreatingList(true);
    try {
      await initFollowerList(signAndExecuteTransaction);
      await loadProfile();
    } catch (err: any) {
      alert(`Failed to create follower list: ${err.message}`);
    } finally {
      setCreatingList(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please connect your wallet.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">

        {/* ── Profile header ─────────────────────────────────────────────── */}
        {profileLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : profile ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white">
                  <User className="w-10 h-10" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{profile.username}</h1>
                  <p className="text-gray-600 mt-1">{profile.bio}</p>
                  <div className="flex space-x-4 mt-3 text-sm text-gray-500">
                    <span><strong>{profile.followerCount}</strong> followers</span>
                    <span><strong>{profile.followingCount}</strong> following</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 font-mono">
                    {address?.slice(0, 10)}…{address?.slice(-8)}
                  </p>
                </div>
              </div>

              {!isOwnProfile && followerListId && (
                <FollowButton
                  followerListId={followerListId}
                  isFollowing={isFollowing}
                  onFollowChange={() => {
                    setIsFollowing(!isFollowing);
                    loadProfile();
                  }}
                />
              )}
            </div>

            {/* Own profile – follower list setup */}
            {isOwnProfile && !followerListId && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800 mb-2">
                  Initialise your follower list so others can follow you and see your posts.
                </p>
                <button
                  onClick={handleInitFollowerList}
                  disabled={creatingList}
                  className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 text-sm"
                >
                  {creatingList ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{creatingList ? 'Creating…' : 'Create follower list'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── No profile found ──────────────────────────────────────────── */
          <div className="bg-white rounded-lg shadow-md p-6">
            {isOwnProfile ? (
              <>
                <p className="text-gray-600 mb-4">You don't have a profile yet.</p>
                {!showCreateForm ? (
                  <button
                    onClick={() => setShowCreateForm(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create profile</span>
                  </button>
                ) : (
                  <div className="space-y-3 max-w-md">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Bio (optional)"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={handleCreateProfile}
                        disabled={creatingProfile || !username.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingProfile ? 'Creating…' : 'Create'}
                      </button>
                      <button
                        onClick={() => setShowCreateForm(false)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-600">Profile not found.</p>
            )}
          </div>
        )}

        {/* ── Posts section ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Posts</h2>
          {postsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-lg shadow-md">
              <p className="text-gray-600">No posts yet.</p>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onDecrypt={!post.decrypted ? () => loadPosts(address) : undefined}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
