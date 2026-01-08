// 모든 타입을 한 곳에서 export

export * from './device';
export * from './action';
export * from './scenario';
export * from './execution';
export * from './image';

// ActionType에 이미지 액션 추가 (기존 타입이 있다면 확장)
export type ImageActionType = 
  | 'tapImage'
  | 'waitUntilImage'
  | 'waitUntilImageGone';