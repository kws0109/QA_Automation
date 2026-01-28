/**
 * 비디오 목록 컴포넌트
 */

import React from 'react';
import type { UploadedVideo } from './types';

interface VideoListProps {
  videos: UploadedVideo[];
  selectedVideo: UploadedVideo | null;
  onSelect: (video: UploadedVideo) => void;
  onDelete: (videoId: string) => void;
}

// 파일 크기 포맷
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// 시간 포맷
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default function VideoList({
  videos,
  selectedVideo,
  onSelect,
  onDelete,
}: VideoListProps) {
  return (
    <div className="vc-video-list">
      <h3>업로드된 비디오</h3>
      {videos.length === 0 ? (
        <p className="vc-empty">업로드된 비디오가 없습니다.</p>
      ) : (
        videos.map((video) => (
          <div
            key={video.videoId}
            className={`vc-video-item ${selectedVideo?.videoId === video.videoId ? 'selected' : ''}`}
            onClick={() => onSelect(video)}
          >
            <div className="vc-video-info">
              <span className="vc-video-name">{video.filename}</span>
              <span className="vc-video-meta">
                {formatSize(video.size)}
                {video.duration && ` | ${formatDuration(video.duration)}`}
                {video.width && video.height && ` | ${video.width}x${video.height}`}
              </span>
            </div>
            <button
              className="vc-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(video.videoId);
              }}
            >
              X
            </button>
          </div>
        ))
      )}
    </div>
  );
}
