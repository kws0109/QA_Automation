// frontend/src/components/ScheduleManager/components/types.ts
// 스케줄 관리자 내부 타입 정의

// 요일 옵션
export type DayOption = 'everyday' | 'weekdays' | 'weekends' | 'custom';

// 스케줄 시간 설정
export interface ScheduleTime {
  dayOption: DayOption;
  customDays: number[];  // 0=일, 1=월, ..., 6=토
  hour: number;
  minute: number;
}

// 요일 레이블 옵션
export interface DayLabelOption {
  value: DayOption;
  label: string;
}

// 상수
export const DAY_LABELS: DayLabelOption[] = [
  { value: 'everyday', label: '매일' },
  { value: 'weekdays', label: '평일 (월~금)' },
  { value: 'weekends', label: '주말 (토,일)' },
  { value: 'custom', label: '요일 선택' },
];

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// Cron 표현식 → ScheduleTime 변환
export const parseCronToScheduleTime = (cron: string): ScheduleTime => {
  const parts = cron.split(' ');
  const minute = parts[0].startsWith('*/') ? 0 : parseInt(parts[0], 10) || 0;
  const hour = parts[1] === '*' ? 0 : parseInt(parts[1], 10) || 0;
  const dayOfWeek = parts[4];

  let dayOption: DayOption = 'everyday';
  let customDays: number[] = [];

  if (dayOfWeek === '*') {
    dayOption = 'everyday';
  } else if (dayOfWeek === '1-5') {
    dayOption = 'weekdays';
  } else if (dayOfWeek === '0,6' || dayOfWeek === '6,0') {
    dayOption = 'weekends';
  } else {
    dayOption = 'custom';
    customDays = dayOfWeek.split(',').map(d => parseInt(d, 10));
  }

  return { dayOption, customDays, hour, minute };
};

// ScheduleTime → Cron 표현식 변환
export const scheduleTimeToCron = (time: ScheduleTime): string => {
  let dayPart = '*';

  switch (time.dayOption) {
    case 'everyday':
      dayPart = '*';
      break;
    case 'weekdays':
      dayPart = '1-5';
      break;
    case 'weekends':
      dayPart = '0,6';
      break;
    case 'custom':
      dayPart = time.customDays.length > 0 ? time.customDays.sort().join(',') : '*';
      break;
  }

  return `${time.minute} ${time.hour} * * ${dayPart}`;
};

// 스케줄 시간 설명 생성
export const getScheduleDescription = (time: ScheduleTime): string => {
  const hourStr = time.hour < 12 ? `오전 ${time.hour === 0 ? 12 : time.hour}시` : `오후 ${time.hour === 12 ? 12 : time.hour - 12}시`;
  const minuteStr = time.minute > 0 ? ` ${time.minute}분` : '';

  let dayStr = '';
  switch (time.dayOption) {
    case 'everyday':
      dayStr = '매일';
      break;
    case 'weekdays':
      dayStr = '평일(월~금)';
      break;
    case 'weekends':
      dayStr = '주말(토,일)';
      break;
    case 'custom':
      dayStr = time.customDays.map(d => WEEKDAY_LABELS[d]).join(', ') + '요일';
      break;
  }

  return `${dayStr} ${hourStr}${minuteStr}에 실행`;
};

// Cron 표현식 설명
export const getCronDescription = (expr: string): string => {
  const time = parseCronToScheduleTime(expr);
  return getScheduleDescription(time);
};

// 시간 포맷팅
export const formatTime = (isoString?: string): string => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Suite 정보 타입
export interface SuiteInfo {
  name: string;
  scenarioCount: number;
  deviceCount: number;
}

// 기본 ScheduleTime 값
export const DEFAULT_SCHEDULE_TIME: ScheduleTime = {
  dayOption: 'everyday',
  customDays: [],
  hour: 10,
  minute: 0,
};

// 기본 Cron 표현식
export const DEFAULT_CRON_EXPRESSION = '0 10 * * *';
