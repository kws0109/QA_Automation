// frontend/src/App.jsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = 'http://localhost:3001';

function App() {
  const [serverStatus, setServerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

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

  // WebSocket 연결
  useEffect(() => {
    const newSocket = io(API_BASE);
    setSocket(newSocket);

    // 연결 성공
    newSocket.on('connect', () => {
      console.log('✅ WebSocket 연결됨:', newSocket.id);
    });

    // 연결 해제
    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket 연결 해제');
    });

    // 시나리오 시작
    newSocket.on('scenario:start', (data) => {
      console.log('🎮 시나리오 시작:', data);
      setIsRunning(true);
      setExecutionLogs([]);
    });

    // 노드 실행
    newSocket.on('scenario:node', (data) => {
      console.log('📍 노드 실행:', data);
      setExecutionLogs(prev => [...prev, data]);
    });

    // 시나리오 완료
    newSocket.on('scenario:complete', (data) => {
      console.log('✅ 시나리오 완료:', data);
      setIsRunning(false);
    });

    // 시나리오 에러
    newSocket.on('scenario:error', (data) => {
      console.log('❌ 시나리오 에러:', data);
      setIsRunning(false);
    });

    // 시나리오 중지
    newSocket.on('scenario:stop', (data) => {
      console.log('⏹️ 시나리오 중지:', data);
      setIsRunning(false);
    });

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
      newSocket.close();
    };
  }, []);

  // 서버 확인
  useEffect(() => {
    checkServer();
  }, []);

  return (
    <div className="App">
      <h1>🎮 Game Automation Tool</h1>
      
      {/* 서버 상태 */}
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
            <p>✅ HTTP: {serverStatus.status}</p>
            <p>🔌 WebSocket: {socket?.connected ? '연결됨' : '연결 안됨'}</p>
          </div>
        )}
        
        <button onClick={checkServer}>🔄 다시 확인</button>
      </div>

      {/* 실행 상태 */}
      <div className="status-card">
        <h2>시나리오 실행 상태</h2>
        <p>{isRunning ? '🏃 실행 중...' : '⏸️ 대기 중'}</p>
      </div>

      {/* 실행 로그 */}
      <div className="status-card">
        <h2>실행 로그 ({executionLogs.length})</h2>
        <div className="log-container">
          {executionLogs.length === 0 ? (
            <p>로그 없음</p>
          ) : (
            executionLogs.map((log, index) => (
              <div key={index} className={`log-entry ${log.status}`}>
                <span className="log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="log-node">[{log.nodeId}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;