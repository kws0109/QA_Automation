/**
 * 비디오 미선택 시 표시되는 플레이스홀더 컴포넌트
 */

import React from 'react';

export default function Placeholder() {
  return (
    <div className="vc-placeholder">
      <p>비디오를 업로드하거나 선택해주세요.</p>
      <div className="vc-instructions">
        <h4>사용 방법</h4>
        <ol>
          <li>Android 기기에서 개발자 옵션 &rarr; &quot;탭한 항목 표시&quot; 활성화</li>
          <li>화면을 녹화하며 테스트 시나리오 수행</li>
          <li>녹화된 비디오 업로드</li>
          <li>분석 시작 &rarr; 터치 동작 자동 감지</li>
          <li>시나리오에 적용</li>
        </ol>
      </div>
    </div>
  );
}
