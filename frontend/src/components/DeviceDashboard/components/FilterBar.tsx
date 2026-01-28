// frontend/src/components/DeviceDashboard/components/FilterBar.tsx

import React from 'react';

interface FilterOptions {
  brands: string[];
  osVersions: string[];
}

interface FilterBarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  filterStatus: string;
  onFilterStatusChange: (value: string) => void;
  filterBrand: string;
  onFilterBrandChange: (value: string) => void;
  filterOS: string;
  onFilterOSChange: (value: string) => void;
  filterOptions: FilterOptions;
  onReset: () => void;
  showResetButton: boolean;
  filteredCount: number;
  totalCount: number;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchText,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterBrand,
  onFilterBrandChange,
  filterOS,
  onFilterOSChange,
  filterOptions,
  onReset,
  showResetButton,
  filteredCount,
  totalCount,
}) => {
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <input
          type="text"
          placeholder="디바이스 검색 (ID, 이름, 모델, 브랜드)"
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
      <div className="filter-selects">
        <select value={filterStatus} onChange={e => onFilterStatusChange(e.target.value)}>
          <option value="all">모든 상태</option>
          <option value="connected">연결됨</option>
          <option value="session">세션 활성</option>
          <option value="offline">오프라인</option>
        </select>
        <select value={filterBrand} onChange={e => onFilterBrandChange(e.target.value)}>
          <option value="all">모든 브랜드</option>
          {filterOptions.brands.map(brand => (
            <option key={brand} value={brand}>{brand}</option>
          ))}
        </select>
        <select value={filterOS} onChange={e => onFilterOSChange(e.target.value)}>
          <option value="all">모든 OS</option>
          {filterOptions.osVersions.map(osVer => (
            <option key={osVer} value={osVer}>{osVer}</option>
          ))}
        </select>
        {showResetButton && (
          <button className="btn-reset-filter" onClick={onReset}>
            초기화
          </button>
        )}
      </div>
      <div className="filter-result">
        {filteredCount !== totalCount && (
          <span>{totalCount}개 중 {filteredCount}개 표시</span>
        )}
      </div>
    </div>
  );
};

export default FilterBar;
