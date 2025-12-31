// frontend/src/App.jsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// 백엔드 주소
const API_BASE = 'http://localhost:3001';

function App() {
  const [serverStatus, setServerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 서버 상태 확인
  const checkServer = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.get(`${API_BASE}/api/health`);
      setServerStatus(response.data);
    } catch (err) {
      setError('서버 연결 실패! 백엔드가 실행 중인지 확인하세요.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // 컴포넌트 마운트 시 서버 확인
  useEffect(() => {
    checkServer();
  }, []);

  return (
    <div className="App">
      <h1>🎮 Game Automation Tool</h1>
      
      <div className="status-card">
        <h2>서버 연결 상태</h2>
        
        {loading && <p>🔄 서버 확인 중...</p>}
        
        {error && (
          <div className="error">
            <p>❌ {error}</p>
          </div>
        )}
        
        {serverStatus && (
          <div className="success">
            <p>✅ 상태: {serverStatus.status}</p>
            <p>📝 메시지: {serverStatus.message}</p>
            <p>⏰ 시간: {serverStatus.timestamp}</p>
          </div>
        )}
        
        <button onClick={checkServer}>
          🔄 다시 확인
        </button>
      </div>
    </div>
  );
}

export default App;