/**
 * 비디오 분석기 모듈 진입점
 *
 * 이 모듈은 격리되어 있어 삭제 시 다른 부분에 영향을 주지 않습니다.
 *
 * 삭제 방법:
 * 1. backend/src/services/videoAnalyzer/ 폴더 삭제
 * 2. backend/src/routes/video.ts 삭제
 * 3. backend/src/index.ts에서 관련 import 및 라우트 제거
 * 4. frontend/src/components/VideoConverter/ 폴더 삭제
 * 5. App.tsx에서 관련 import 및 탭 제거
 */

export * from './types';
export { TapDetector, tapDetector } from './tapDetector';
export { VideoParser, videoParser } from './videoParser';
export { screenRecorder } from './screenRecorder';
export type { RecordingSession, RecordingOptions } from './screenRecorder';
