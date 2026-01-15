// frontend/src/components/Panel/components/RecognitionTest.tsx

import type { ImageTestResult, OcrTestResult } from '../types';

interface ImageRecognitionTestProps {
  type: 'image';
  isTesting: boolean;
  testResult: ImageTestResult | null;
  testError: string | null;
  onTest: () => Promise<void>;
  selectedDeviceId?: string;
}

interface OcrRecognitionTestProps {
  type: 'ocr';
  isTesting: boolean;
  testResult: OcrTestResult | null;
  testError: string | null;
  onTest: () => Promise<void>;
  selectedDeviceId?: string;
  searchText?: string;
}

type RecognitionTestProps = ImageRecognitionTestProps | OcrRecognitionTestProps;

function RecognitionTest(props: RecognitionTestProps) {
  const { type, isTesting, testError, onTest, selectedDeviceId } = props;
  const title = type === 'image' ? '🔍 인식 테스트' : '🔍 OCR 테스트';

  return (
    <div className="recognition-test">
      <div className="recognition-test-header">
        <span>{title}</span>
        <button
          type="button"
          className={`btn-test ${isTesting ? 'testing' : ''}`}
          onClick={onTest}
          disabled={isTesting || !selectedDeviceId}
          title={!selectedDeviceId ? '디바이스를 먼저 선택하세요' : `현재 화면에서 ${type === 'image' ? '템플릿 인식' : 'OCR'} 테스트`}
        >
          {isTesting ? '테스트 중...' : '테스트'}
        </button>
      </div>

      {testError && (
        <div className="test-result error">
          <div className="test-result-message fail">
            <span>❌</span> {testError}
          </div>
        </div>
      )}

      {type === 'image' && props.testResult && (
        <ImageTestResultView result={props.testResult} />
      )}

      {type === 'ocr' && props.testResult && (
        <OcrTestResultView result={props.testResult} searchText={props.searchText} />
      )}

      {!selectedDeviceId && (
        <div className="panel-hint">
          ⚠️ 테스트하려면 디바이스를 선택하세요
        </div>
      )}
    </div>
  );
}

function ImageTestResultView({ result }: { result: ImageTestResult }) {
  return (
    <div className={`test-result ${result.matched ? 'success' : 'fail'}`}>
      <div className={`test-result-message ${result.matched ? 'success' : 'fail'}`}>
        <span>{result.matched ? '✅' : '❌'}</span>
        {result.matched ? '이미지 발견!' : '이미지 없음'}
      </div>
      <div className="test-result-row">
        <span className="test-result-label">신뢰도</span>
        <span className="test-result-value confidence">
          {(result.confidence * 100).toFixed(1)}%
        </span>
      </div>
      <div className="test-result-row">
        <span className="test-result-label">임계값</span>
        <span className="test-result-value">
          {(result.threshold * 100).toFixed(0)}%
        </span>
      </div>
      {result.location && (
        <div className="test-result-row">
          <span className="test-result-label">위치</span>
          <span className="test-result-value location">
            ({result.location.centerX}, {result.location.centerY})
          </span>
        </div>
      )}
      <div className="test-result-row">
        <span className="test-result-label">소요시간</span>
        <span className="test-result-value time">
          {result.timing.totalTime}ms
        </span>
      </div>
    </div>
  );
}

function OcrTestResultView({ result, searchText }: { result: OcrTestResult; searchText?: string }) {
  return (
    <div className={`test-result ${result.found ? 'success' : 'fail'}`}>
      <div className={`test-result-message ${result.found ? 'success' : 'fail'}`}>
        <span>{result.found ? '✅' : '❌'}</span>
        {result.found
          ? `"${result.match?.text}" 발견!`
          : `"${searchText || ''}" 없음`}
      </div>
      {result.match && (
        <>
          <div className="test-result-row">
            <span className="test-result-label">신뢰도</span>
            <span className="test-result-value confidence">
              {(result.match.confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="test-result-row">
            <span className="test-result-label">위치</span>
            <span className="test-result-value location">
              ({Math.round(result.match.centerX)}, {Math.round(result.match.centerY)})
            </span>
          </div>
        </>
      )}
      <div className="test-result-row">
        <span className="test-result-label">소요시간</span>
        <span className="test-result-value time">
          {result.timing.totalTime}ms
        </span>
      </div>
      {result.allMatches && result.allMatches.length > 1 && (
        <div className="ocr-matches">
          <div className="ocr-matches-title">
            전체 매치 ({result.matchCount}개)
          </div>
          {result.allMatches.slice(0, 5).map((m, i) => (
            <div key={i} className="ocr-match-item">
              <span className="ocr-match-text">{m.text}</span>
              <span className="ocr-match-confidence">
                {(m.confidence * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RecognitionTest;
