// frontend/src/components/ErrorBoundary/ErrorBoundary.tsx
// React Error Boundary 컴포넌트

import React, { Component, ErrorInfo, ReactNode } from 'react';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  /** 에러 발생 시 표시할 Fallback UI (선택) */
  fallback?: ReactNode;
  /** 컴포넌트 식별용 이름 (로깅/디버깅용) */
  name?: string;
  /** 에러 발생 시 호출되는 콜백 */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary 컴포넌트
 *
 * React 컴포넌트 트리에서 발생하는 JavaScript 에러를 캐치하고
 * 전체 앱이 크래시되는 것을 방지합니다.
 *
 * @example
 * <ErrorBoundary name="Dashboard">
 *   <Dashboard />
 * </ErrorBoundary>
 *
 * @example 커스텀 Fallback UI
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <RiskyComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // 다음 렌더링에서 fallback UI를 표시하도록 상태 업데이트
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 에러 정보 저장
    this.setState({ errorInfo });

    // 콘솔에 에러 로깅
    const componentName = this.props.name || 'Unknown';
    console.error(`[ErrorBoundary: ${componentName}] 에러 발생:`, error);
    console.error('컴포넌트 스택:', errorInfo.componentStack);

    // onError 콜백 호출
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, name } = this.props;

    if (hasError) {
      // 커스텀 Fallback UI가 제공된 경우
      if (fallback) {
        return fallback;
      }

      // 기본 에러 UI
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">⚠️</div>
            <h2 className="error-boundary__title">
              {name ? `${name}에서 오류가 발생했습니다` : '오류가 발생했습니다'}
            </h2>
            <p className="error-boundary__message">
              예기치 않은 오류로 인해 이 섹션을 표시할 수 없습니다.
            </p>

            {error && (
              <details className="error-boundary__details">
                <summary>오류 상세 정보</summary>
                <div className="error-boundary__error-info">
                  <p className="error-boundary__error-name">{error.name}: {error.message}</p>
                  {errorInfo && (
                    <pre className="error-boundary__stack">
                      {errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </details>
            )}

            <div className="error-boundary__actions">
              <button
                className="error-boundary__button error-boundary__button--primary"
                onClick={this.handleRetry}
              >
                다시 시도
              </button>
              <button
                className="error-boundary__button error-boundary__button--secondary"
                onClick={() => window.location.reload()}
              >
                페이지 새로고침
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
