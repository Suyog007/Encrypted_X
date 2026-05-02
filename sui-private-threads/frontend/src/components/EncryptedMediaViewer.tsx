/**
 * EncryptedMediaViewer component - displays decrypted media content
 */


import { Lock } from 'lucide-react';

interface EncryptedMediaViewerProps {
  content: Blob | null;
  contentType: 'image' | 'video';
  isDecrypted: boolean;
  onDecrypt?: () => void;
}

export function EncryptedMediaViewer({
  content,
  contentType,
  isDecrypted,
  onDecrypt,
}: EncryptedMediaViewerProps) {
  if (!isDecrypted || !content) {
    return (
      <div className="flex items-center justify-center p-12 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <Lock className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600 mb-4">Media is encrypted</p>
          {onDecrypt && (
            <button
              onClick={onDecrypt}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Decrypt & View
            </button>
          )}
        </div>
      </div>
    );
  }

  const url = URL.createObjectURL(content);

  return (
    <div className="rounded-lg overflow-hidden bg-gray-900">
      {contentType === 'image' ? (
        <img
          src={url}
          alt="Decrypted content"
          className="w-full h-auto max-h-[600px] object-contain"
        />
      ) : (
        <video
          src={url}
          controls
          className="w-full h-auto max-h-[600px]"
        />
      )}
    </div>
  );
}

