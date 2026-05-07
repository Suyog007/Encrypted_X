/**
 * Home page – shows the PostComposer and a global feed of encrypted posts.
 */

import { useEffect } from 'react';
import { PostCard }     from '../components/PostCard';
import { PostComposer } from '../components/PostComposer';
import { usePosts }     from '../hooks/usePosts';
import { useSuiWallet } from '../hooks/useSuiWallet';
import { Loader2, RefreshCw } from 'lucide-react';

export function Home() {
  const { address, isConnected } = useSuiWallet();
  const { posts, loading, error, loadPosts, decryptPost } = usePosts();

  useEffect(() => {
    if (isConnected && address) {
      loadPosts(); // empty string → fetch all recent posts
    }
  }, [isConnected, address]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Sui Private Threads</h1>
          <p className="text-gray-600">Connect your wallet to view your encrypted feed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sui Private Threads</h1>
            <p className="text-sm text-gray-500">End-to-end encrypted social feed</p>
          </div>
          <button
            onClick={() => loadPosts()}
            disabled={loading}
            className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Composer */}
        <PostComposer onPostCreated={() => loadPosts()} />

        {/* Feed */}
        <div className="space-y-4">
          {loading && posts.length === 0 && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {!loading && posts.length === 0 && !error && (
            <div className="text-center p-8 bg-white rounded-lg shadow-md">
              <p className="text-gray-600">No posts yet.  Create your first encrypted post above!</p>
            </div>
          )}

          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDecrypt={!post.decrypted ? () => loadPosts() : undefined}
            />
          ))}
        </div>

      </div>
    </div>
  );
}
