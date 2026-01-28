// frontend/src/components/Header/Header.tsx

import './Header.css';

interface HeaderProps {
  isSocketConnected: boolean;
  userName?: string;
  userAvatarUrl?: string;
  onLogout?: () => void;
  onOpenSettings?: () => void;
}

function Header({ isSocketConnected, userName, userAvatarUrl, onLogout, onOpenSettings }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Game Automation Tool</h1>
      </div>

      <div className="header-right">
        {/* 설정 버튼 */}
        {onOpenSettings && (
          <button
            className="settings-btn"
            onClick={onOpenSettings}
            title="설정"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}

        {/* 사용자 정보 */}
        {userName && (
          <div className="header-user">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userName} className="user-avatar" />
            ) : (
              <span className="user-icon">👤</span>
            )}
            <span className="user-name">{userName}</span>
            {onLogout && (
              <button
                className="logout-btn"
                onClick={onLogout}
                title="로그아웃"
              >
                로그아웃
              </button>
            )}
          </div>
        )}

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