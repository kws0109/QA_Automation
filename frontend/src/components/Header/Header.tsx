// frontend/src/components/Header/Header.tsx

import './Header.css';

interface HeaderProps {
  isConnected: boolean;
  isSocketConnected: boolean;
  isRunning: boolean;
  scenarioName: string;
  onConnect: () => void;
  onRun: () => void;
  onStop: () => void;
  onScenario: () => void;
  onReport: () => void;
}

function Header({ 
  isConnected,
  isSocketConnected,
  isRunning,
  scenarioName,
  onConnect,
  onRun, 
  onStop,
  onScenario,
  onReport,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">🎮 Game Automation Tool</h1>
        <div className="header-status">
          <span className={`status-dot ${isSocketConnected ? 'connected' : ''}`} />
          <span className="status-text">
            {isSocketConnected ? '서버 연결됨' : '서버 연결 안됨'}
          </span>
        </div>
        {scenarioName && (
          <div className="header-scenario">
            📄 {scenarioName}
          </div>
        )}
      </div>
      
      <div className="header-center">
        <button 
          className={`header-btn ${isConnected ? 'connected' : ''}`}
          onClick={onConnect}
        >
          {isConnected ? '📱 디바이스 연결됨' : '📱 디바이스 연결'}
        </button>
        
        <button 
          className="header-btn"
          onClick={onScenario}
        >
          📁 시나리오
        </button>

        <button 
          className="header-btn"
          onClick={onReport}
        >
          📊 리포트
        </button>
      </div>
      
      <div className="header-right">
        <button 
          className={`header-btn run ${isRunning ? 'running' : ''}`}
          onClick={isRunning ? onStop : onRun}
          disabled={!isConnected}
        >
          {isRunning ? '⏹️ 중지' : '▶️ 실행'}
        </button>
      </div>
    </header>
  );
}

export default Header;