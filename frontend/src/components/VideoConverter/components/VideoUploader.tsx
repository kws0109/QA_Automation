/**
 * 비디오 업로드 컴포넌트
 */

import React, { useRef } from 'react';

interface VideoUploaderProps {
  isUploading: boolean;
  uploadProgress: number;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function VideoUploader({
  isUploading,
  uploadProgress,
  onUpload,
}: VideoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="vc-upload-section">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
        onChange={onUpload}
        disabled={isUploading}
        hidden
      />
      <button
        className="vc-upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? `업로드 중... ${uploadProgress}%` : '비디오 업로드'}
      </button>
    </div>
  );
}
