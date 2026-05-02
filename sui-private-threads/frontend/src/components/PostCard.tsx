/**
 * PostCard component - displays an encrypted post
 */


import { DecryptedPost } from '../types';
import { Lock, Unlock, Image, Video, FileText } from 'lucide-react';

interface PostCardProps {
  post: DecryptedPost;
  onDecrypt?: () => void;
}

export function PostCard({ post, onDecrypt }: PostCardProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const renderContent = () => {
    if (!post.decrypted) {
      return (
        <div className="flex items-center justify-center p-8 bg-gray-100 rounded-lg">
          <div className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600 mb-4">This post is encrypted</p>
            {onDecrypt && (
              <button
                onClick={onDecrypt}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Unlock Post
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {post.content.text && (
          <div className="prose max-w-none">
            <p className="whitespace-pre-wrap">{post.content.text}</p>
          </div>
        )}
        
        {post.content.image && (
          <div className="rounded-lg overflow-hidden">
            <img
              src={URL.createObjectURL(post.content.image)}
              alt="Post content"
              className="w-full h-auto"
            />
          </div>
        )}
        
        {post.content.video && (
          <div className="rounded-lg overflow-hidden">
            <video
              src={URL.createObjectURL(post.content.video)}
              controls
              className="w-full h-auto"
            />
          </div>
        )}
      </div>
    );
  };

  const getContentIcon = () => {
    switch (post.contentType) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
            {post.author.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900">
              {post.author.slice(0, 8)}...{post.author.slice(-6)}
            </p>
            <p className="text-sm text-gray-500">{formatDate(post.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {getContentIcon()}
          {post.decrypted ? (
            <Unlock className="w-4 h-4 text-green-500" />
          ) : (
            <Lock className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      
      {renderContent()}
      
      {post.isTokenGated && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            Token Gated
          </span>
        </div>
      )}
    </div>
  );
}

