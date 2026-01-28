# Shared Types

Frontend/Backend 간 공유 타입 정의 폴더입니다.

## 포함된 타입

### schedule.ts
- `Schedule` - 스케줄 정보
- `CreateScheduleRequest` - 스케줄 생성 요청
- `UpdateScheduleRequest` - 스케줄 수정 요청
- `ScheduleHistory` - 스케줄 실행 이력
- `ScheduleListItem` - 스케줄 목록 아이템

### device.ts
- `DeviceOS` - 디바이스 OS 타입 ('Android' | 'iOS')
- `DeviceRole` - 디바이스 역할 ('editing' | 'testing')
- `DeviceInfo` - 디바이스 정보
- `SessionInfo` - 세션 정보 (createdAt: string으로 통일)
- `SavedDevice` - 저장된 디바이스 정보

## 사용 방법

### Frontend (Vite)
```typescript
import type { Schedule, DeviceInfo } from '@shared/types';
```

### Backend (ts-node)
tsconfig-paths 설치 후:
```typescript
import type { Schedule, DeviceInfo } from '@shared/types';
```

## 주의사항

1. **타입 동기화**: shared 폴더의 타입이 단일 진실 소스(SSOT)입니다.
2. **변경 시**: shared 타입 변경 시 Frontend/Backend 모두 영향 받음
3. **Date vs string**: `SessionInfo.createdAt`은 string(ISO)으로 통일
