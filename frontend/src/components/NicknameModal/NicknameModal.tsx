// frontend/src/components/NicknameModal/NicknameModal.tsx
// 사용자 닉네임 설정 모달

import { useState, useEffect, useCallback } from 'react';
import './NicknameModal.css';

const NICKNAME_KEY = 'qa_tool_nickname';

interface NicknameModalProps {
  isOpen: boolean;
  onClose: (nickname: string) => void;
  initialNickname?: string;
}

/**
 * 닉네임 설정 모달
 * 첫 접속 시 닉네임 입력을 요청하고 localStorage에 저장
 */
function NicknameModal({ isOpen, onClose, initialNickname = '' }: NicknameModalProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState<string>('');

  // 초기값 설정
  useEffect(() => {
    if (isOpen) {
      setNickname(initialNickname);
      setError('');
    }
  }, [isOpen, initialNickname]);

  // 닉네임 검증
  const validateNickname = useCallback((name: string): boolean => {
    if (!name.trim()) {
      setError('닉네임을 입력해주세요.');
      return false;
    }
    if (name.trim().length < 2) {
      setError('닉네임은 2자 이상이어야 합니다.');
      return false;
    }
    if (name.trim().length > 20) {
      setError('닉네임은 20자 이하여야 합니다.');
      return false;
    }
    setError('');
    return true;
  }, []);

  // 닉네임 저장
  const handleSubmit = useCallback(() => {
    const trimmedNickname = nickname.trim();
    if (!validateNickname(trimmedNickname)) {
      return;
    }

    // localStorage에 저장
    localStorage.setItem(NICKNAME_KEY, trimmedNickname);
    onClose(trimmedNickname);
  }, [nickname, validateNickname, onClose]);

  // Enter 키 처리
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="nickname-modal-overlay">
      <div className="nickname-modal">
        <div className="nickname-modal-header">
          <h2>QA Automation Tool</h2>
          <p className="nickname-modal-description">
            테스트 실행 시 다른 사용자가 누가 테스트 중인지 확인할 수 있도록
            닉네임을 설정해주세요.
          </p>
        </div>

        <div className="nickname-modal-body">
          <label htmlFor="nickname-input">닉네임</label>
          <input
            id="nickname-input"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="예: 홍길동, Kim QA"
            autoFocus
            maxLength={20}
          />
          {error && <span className="nickname-error">{error}</span>}
        </div>

        <div className="nickname-modal-footer">
          <button
            className="nickname-submit-btn"
            onClick={handleSubmit}
            disabled={!nickname.trim()}
          >
            확인
          </button>
        </div>

        <div className="nickname-modal-hint">
          * 닉네임은 브라우저에 저장되며 언제든 변경할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

// localStorage에서 닉네임 조회
export function getNickname(): string | null {
  return localStorage.getItem(NICKNAME_KEY);
}

// localStorage에 닉네임 저장
export function setNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

// localStorage에서 닉네임 삭제
export function clearNickname(): void {
  localStorage.removeItem(NICKNAME_KEY);
}

export default NicknameModal;
