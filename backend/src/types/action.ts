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
}