// frontend/src/components/DevicePreview/index.ts

export { default } from './DevicePreview';
export { default as DevicePreview } from './DevicePreview';

// Re-export types
export type {
  ClickPosition,
  DeviceSize,
  ElementInfo,
  SelectionRegion,
  NormalizedRegion,
  DeviceRegion,
  ExtractedTextResult,
  DevicePreviewProps,
  UseDeviceConnectionReturn,
  UseScreenCaptureReturn,
} from './types';

// Re-export hooks
export { useDeviceConnection, useScreenCapture } from './hooks';

// Re-export sub-components
export {
  PreviewHeader,
  ScreenshotViewer,
  InfoPanel,
  CapturePanel,
  TextExtractPanel,
  RegionSelectPanel,
} from './components';
