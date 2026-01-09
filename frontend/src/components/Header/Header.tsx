// frontend/src/components/Header/Header.tsx

import './Header.css';

interface HeaderProps {
  isSocketConnected: boolean;
}

function Header({ isSocketConnected }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Game Automation Tool</h1>
      </div>

      <div className="header-right">
        <div className="header-status">
          <span className={`status-dot ${isSocketConnected ? 'connected' : ''}`} />
          <span className="status-text">
            {isSocketConnected ? '서버 연결됨' : '서버 연결 안됨'}
          </span>
        </div>
      </div>
    </header>
  );
}

export default Header;