// frontend/src/components/Panel/constants.ts

import type { ActionTypeItem, SelectOption } from './types';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001';

export const ACTION_TYPES: ActionTypeItem[] = [
  // 터치
  { value: 'tap', label: '탭', group: 'touch' },
  { value: 'longPress', label: '롱프레스', group: 'touch' },
  { value: 'swipe', label: '스와이프', group: 'touch' },
  // 대기
  { value: 'wait', label: '대기 (ms)', group: 'wait' },
  { value: 'waitUntilGone', label: '요소 사라짐 대기', group: 'wait' },
  { value: 'waitUntilExists', label: '요소 나타남 대기', group: 'wait' },
  { value: 'waitUntilTextGone', label: '텍스트 사라짐 대기', group: 'wait' },
  { value: 'waitUntilTextExists', label: '텍스트 나타남 대기', group: 'wait' },
  // 이미지
  { value: 'tapImage', label: '이미지 탭', group: 'image' },
  { value: 'waitUntilImage', label: '이미지 나타남 대기', group: 'image' },
  { value: 'waitUntilImageGone', label: '이미지 사라짐 대기', group: 'image' },
  // 텍스트 OCR
  { value: 'tapTextOcr', label: '텍스트 탭 (OCR)', group: 'text' },
  { value: 'waitUntilTextOcr', label: '텍스트 나타남 대기 (OCR)', group: 'text' },
  { value: 'waitUntilTextGoneOcr', label: '텍스트 사라짐 대기 (OCR)', group: 'text' },
  { value: 'assertTextOcr', label: '텍스트 검증 (OCR)', group: 'text' },
  // 시스템
  { value: 'launchApp', label: '앱 실행', group: 'system' },
  { value: 'terminateApp', label: '앱 종료', group: 'system' },
  { value: 'back', label: '뒤로가기', group: 'system' },
  { value: 'home', label: '홈', group: 'system' },
  { value: 'restart', label: '앱 재시작', group: 'system' },
  { value: 'clearData', label: '앱 데이터 삭제', group: 'system' },
  { value: 'clearCache', label: '앱 캐시 삭제', group: 'system' },
];

export const CONDITION_TYPES: SelectOption[] = [
  { value: 'elementExists', label: '요소 존재함' },
  { value: 'elementNotExists', label: '요소 존재하지 않음' },
  { value: 'textContains', label: '요소 텍스트 포함' },
  { value: 'screenContainsText', label: '화면에 텍스트 존재' },
  { value: 'elementEnabled', label: '요소 활성화됨' },
  { value: 'elementDisplayed', label: '요소 표시됨' },
];

export const LOOP_TYPES: SelectOption[] = [
  { value: 'count', label: '횟수 반복' },
  { value: 'whileExists', label: '요소 존재하는 동안' },
  { value: 'whileNotExists', label: '요소 없는 동안' },
];

export const SELECTOR_STRATEGIES: SelectOption[] = [
  { value: 'id', label: 'Resource ID' },
  { value: 'text', label: '텍스트' },
  { value: 'xpath', label: 'XPath' },
  { value: 'accessibility id', label: 'Accessibility ID' },
  { value: 'className', label: 'Class Name' },
];
