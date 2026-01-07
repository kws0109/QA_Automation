// frontend/src/App.jsx

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

import Header from './components/Header/Header';
import Sidebar from './components/Sidebar/Sidebar';
import Canvas from './components/Canvas/Canvas';
import Panel from './components/Panel/Panel';
import Console from './components/Console/Console';
import ConnectionModal from './components/ConnectionModal/ConnectionModal';

import './App.css';

const API_BASE = 'http://localhost:3001';

function App() {
  // 상태
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [executionLogs, setExecutionLogs] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);  // 모달 상태

  // WebSocket 연결
  useEffect(() => {
    const newSocket = io(API_BASE);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('✅ WebSocket 연결됨');
      setIsSocketConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket 연결 해제');
      setIsSocketConnected(false);
    });

    newSocket.on('scenario:start', () => {
      setIsRunning(true);
      setExecutionLogs([]);
    });

    newSocket.on('scenario:node', (data) => {
      setExecutionLogs(prev => [...prev, data]);
    });

    newSocket.on('scenario:complete', () => {
      setIsRunning(false);
    });

    newSocket.on('scenario:error', () => {
      setIsRunning(false);
    });

    newSocket.on('scenario:stop', () => {
      setIsRunning(false);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // 디바이스 연결 상태 확인 + 자동 연결
  useEffect(() => {
    const initConnection = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/device/status`);
        if (res.data.connected) {
          setIsConnected(true);
        } else {
          // 마지막 연결 정보로 자동 연결 시도
          const lastConnection = localStorage.getItem('lastConnection');
          if (lastConnection) {
            const config = JSON.parse(lastConnection);
            await axios.post(`${API_BASE}/api/device/connect`, config);
            setIsConnected(true);
            console.log('✅ 디바이스 자동 연결됨');
          }
        }
      } catch {
        setIsConnected(false);
      }
    };
    initConnection();
  }, []);

  // 노드 삭제
  const handleNodeDelete = useCallback((nodeId) => {
    if (!nodeId) return;
    
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(prev => prev.filter(
      conn => conn.from !== nodeId && conn.to !== nodeId
    ));
    setSelectedNodeId(prev => prev === nodeId ? null : prev);
  }, []);

  // 키보드 이벤트
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        handleNodeDelete(selectedNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, handleNodeDelete]);

  // 디바이스 연결 (모달에서 호출)
  const handleConnect = async (config) => {
    await axios.post(`${API_BASE}/api/device/connect`, config);
    setIsConnected(true);
  };

  // 디바이스 연결 해제
  const handleDisconnect = async () => {
    try {
      await axios.post(`${API_BASE}/api/device/disconnect`);
      setIsConnected(false);
    } catch (err) {
      alert('연결 해제 실패: ' + err.message);
    }
  };

  // 연결 버튼 클릭
  const handleConnectClick = () => {
    if (isConnected) {
      handleDisconnect();
    } else {
      setIsModalOpen(true);
    }
  };

  // 시나리오 실행
  const handleRun = async () => {
    if (nodes.length === 0) {
      alert('노드를 추가해주세요.');
      return;
    }

    try {
      const scenario = {
        name: '임시 시나리오',
        nodes,
        connections,
      };
      const res = await axios.post(`${API_BASE}/api/scenarios`, scenario);
      await axios.post(`${API_BASE}/api/scenarios/${res.data.data.id}/run`);
    } catch (err) {
      alert('실행 실패: ' + err.message);
    }
  };

  // 실행 중지
  const handleStop = async () => {
    try {
      await axios.post(`${API_BASE}/api/scenarios/stop`);
    } catch (err) {
      alert('중지 실패: ' + err.message);
    }
  };

  // 시나리오 저장
  const handleSave = async () => {
    const name = prompt('시나리오 이름을 입력하세요:', '새 시나리오');
    if (!name) return;

    try {
      await axios.post(`${API_BASE}/api/scenarios`, {
        name,
        nodes,
        connections,
      });
      alert('저장되었습니다!');
    } catch (err) {
      alert('저장 실패: ' + err.message);
    }
  };

  // 시나리오 불러오기
  const handleLoad = async () => {
    const id = prompt('불러올 시나리오 ID를 입력하세요:');
    if (!id) return;

    try {
      const res = await axios.get(`${API_BASE}/api/scenarios/${id}`);
      setNodes(res.data.data.nodes || []);
      setConnections(res.data.data.connections || []);
      alert('불러왔습니다!');
    } catch (err) {
      alert('불러오기 실패: ' + err.message);
    }
  };

  // 노드 추가
  const handleNodeAdd = (type, x, y) => {
    const newNode = {
      id: `node_${Date.now()}`,
      type,
      x,
      y,
      params: type === 'action' ? { actionType: '' } : {},
    };
    setNodes(prev => [...prev, newNode]);
    
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setConnections(prev => [...prev, { from: lastNode.id, to: newNode.id }]);
    }
  };

  // 노드 선택
  const handleNodeSelect = (nodeId) => {
    setSelectedNodeId(nodeId);
  };

  // 노드 이동
  const handleNodeMove = (nodeId, x, y) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, x, y } : node
    ));
  };

  // 노드 업데이트
  const handleNodeUpdate = (nodeId, updates) => {
    setNodes(prev => prev.map(node =>
      node.id === nodeId ? { ...node, ...updates } : node
    ));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="app">
      <Header
        isConnected={isConnected}
        isSocketConnected={isSocketConnected}
        isRunning={isRunning}
        onConnect={handleConnectClick}
        onDisconnect={handleDisconnect}
        onRun={handleRun}
        onStop={handleStop}
        onSave={handleSave}
        onLoad={handleLoad}
      />
      
      <div className="app-body">
        <Sidebar />
        
        <Canvas
          nodes={nodes}
          connections={connections}
          selectedNodeId={selectedNodeId}
          onNodeSelect={handleNodeSelect}
          onNodeMove={handleNodeMove}
          onNodeAdd={handleNodeAdd}
          onNodeDelete={handleNodeDelete}
        />
        
        <Panel
          selectedNode={selectedNode}
          onNodeUpdate={handleNodeUpdate}
          onNodeDelete={handleNodeDelete}
        />
      </div>
      
      <Console
        logs={executionLogs}
        isRunning={isRunning}
      />

      {/* 연결 모달 */}
      <ConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnect={handleConnect}
      />
    </div>
  );
}

export default App;