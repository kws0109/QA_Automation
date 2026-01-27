// frontend/src/components/Header/Header.tsx

import './Header.css';

interface HeaderProps {
  isSocketConnected: boolean;
  userName?: string;
  userAvatarUrl?: string;
  onChangeNickname?: () => void;
  onLogout?: () => void;
}

function Header({ isSocketConnected, userName, userAvatarUrl, onChangeNickname, onLogout }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Game Automation Tool</h1>
      </div>

      <div className="header-right">
        {/* 사용자 정보 */}
        {userName && (
          <div className="header-user">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userName} className="user-avatar" />
            ) : (
              <span className="user-icon">👤</span>
            )}
            <span className="user-name">{userName}</span>
            {onChangeNickname && (
              <button
                className="change-nickname-btn"
                onClick={onChangeNickname}
                title="닉네임 변경"
              >
                변경
              </button>
            )}
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