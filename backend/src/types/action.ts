// 액션 관련 타입 정의

export type ActionType = 
  | 'click' 
  | 'input' 
  | 'swipe' 
  | 'wait' 
  | 'back' 
  | 'home'
  | 'screenshot'
  | 'launch'
  | 'clearData';

export interface ClickAction {
  type: 'click';
  x: number;
  y: number;
}

export interface InputAction {
  type: 'input';
  text: string;
}

export interface SwipeAction {
  type: 'swipe';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration?: number;
}

export interface WaitAction {
  type: 'wait';
  duration: number;
}

export interface LaunchAction {
  type: 'launch';
  appPackage: string;
  appActivity: string;
}

export interface ClearDataAction {
  type: 'clearData';
  appPackage: string;
}

export interface SimpleAction {
  type: 'back' | 'home' | 'screenshot';
}

export type Action = 
  | ClickAction 
  | InputAction 
  | SwipeAction 
  | WaitAction 
  | LaunchAction
  | ClearDataAction
  | SimpleAction;

export interface ActionResult {
  success: boolean;
  message?: string;
  screenshot?: string;
  error?: string;
  // 이미지 매칭 정보
  templateId?: string;
  confidence?: number;
  matchTime?: number;  // 이미지 매칭 소요 시간 (ms)
  matchMethod?: 'device' | 'backend';  // 매칭 방식 (디바이스 OpenCV vs 백엔드)
}