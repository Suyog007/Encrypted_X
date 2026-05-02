/**
 * FollowButton – follow / unfollow a user on-chain.
 */

import { useState } from 'react';
import { UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { useSuiWallet } from '../hooks/useSuiWallet';
import { followUser, unfollowUser } from '../lib/sui';

interface FollowButtonProps {
  followerListId: string;
  isFollowing:    boolean;
  onFollowChange?: () => void;
}

export function FollowButton({ followerListId, isFollowing, onFollowChange }: FollowButtonProps) {
  const { signAndExecuteTransaction } = useSuiWallet();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleClick = async () => {
    if (!signAndExecuteTransaction) {
      setError('Please connect your wallet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isFollowing) {
        await unfollowUser(signAndExecuteTransaction, followerListId);
      } else {
        await followUser(signAndExecuteTransaction, followerListId);
      }
      onFollowChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to update follow status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
          isFollowing
            ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /><span>Processing…</span></>
        ) : isFollowing ? (
          <><UserMinus className="w-4 h-4" /><span>Unfollow</span></>
        ) : (
          <><UserPlus className="w-4 h-4" /><span>Follow</span></>
        )}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
