// frontend/src/components/Header/Header.jsx

import './Header.css';

function Header({ 
  isConnected,
  isSocketConnected,
  isRunning, 
  onConnect,  // 이제 연결/해제 모두 처리
  onRun, 
  onStop,
  onSave,
  onLoad
}) {
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
          onClick={onSave}
        >
          💾 저장
        </button>
        
        <button 
          className="header-btn"
          onClick={onLoad}
        >
          📂 불러오기
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