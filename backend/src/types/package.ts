// 패키지 관련 타입 정의

export interface Package {
  id: string;
  name: string;           // 표시 이름 (예: "게임 A")
  packageName: string;    // Android 패키지명 (예: "com.company.game")
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PackageListItem {
  id: string;
  name: string;
  packageName: string;
  description?: string;
  scenarioCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackageRequest {
  name: string;
  packageName: string;
  description?: string;
}

export interface UpdatePackageRequest {
  name?: string;
  packageName?: string;
  description?: string;
}
