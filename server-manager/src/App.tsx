import React, { useState, useEffect, useCallback } from 'react';
import { ServerCard } from './components/ServerCard';
import { LogViewer } from './components/LogViewer';
import { Settings } from './components/Settings';
import { ServerState } from './types';

const App: React.FC = () => {
  const [servers, setServers] = useState<ServerState[]>([]);
  const [selectedLogServer, setSelectedLogServer] = useState<string>('Backend');
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Load initial states
  useEffect(() => {
    const loadStates = async () => {
      try {
        const states = await window.electronAPI.getStates();
        setServers(states);
        if (states.length > 0 && !states.find(s => s.name === selectedLogServer)) {
          setSelectedLogServer(states[0].name);
        }
      } catch (err) {
        console.error('Failed to load states:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStates();
  }, []);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribeStateChange = window.electronAPI.onStateChange(({ name, state }) => {
      setServers(prev => prev.map(s => s.name === name ? state : s));
    });

    const unsubscribeLog = window.electronAPI.onLog(({ name, message }) => {
      setServers(prev => prev.map(s => {
        if (s.name === name) {
          const newLogs = [...s.logs, message];
          // Keep only last 500 logs
          return { ...s, logs: newLogs.slice(-500) };
        }
        return s;
      }));
    });

    const unsubscribeLogsCleared = window.electronAPI.onLogsCleared(({ name }) => {
      setServers(prev => prev.map(s =>
        s.name === name ? { ...s, logs: [] } : s
      ));
    });

    return () => {
      unsubscribeStateChange();
      unsubscribeLog();
      unsubscribeLogsCleared();
    };
  }, []);

  const handleStart = useCallback(async (name: string) => {
    await window.electronAPI.startServer(name);
  }, []);

  const handleStop = useCallback(async (name: string) => {
    await window.electronAPI.stopServer(name);
  }, []);

  const handleRestart = useCallback(async (name: string) => {
    await window.electronAPI.restartServer(name);
  }, []);

  const handleStartAll = useCallback(async () => {
    await window.electronAPI.startAll();
  }, []);

  const handleStopAll = useCallback(async () => {
    await window.electronAPI.stopAll();
  }, []);

  const handleClearLogs = useCallback(() => {
    window.electronAPI.clearLogs(selectedLogServer);
  }, [selectedLogServer]);

  const refreshStates = useCallback(async () => {
    const states = await window.electronAPI.getStates();
    setServers(states);
  }, []);

  const allRunning = servers.every(s => s.status === 'running');
  const anyRunning = servers.some(s => s.status === 'running' || s.status === 'starting');
  const anyPending = servers.some(s => s.status === 'starting' || s.status === 'stopping');

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>QA Server Manager</h1>
        <button
          className="btn btn-settings"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <main className="app-main">
        <section className="servers-section">
          <div className="servers-grid">
            {servers.map(server => (
              <ServerCard
                key={server.name}
                server={server}
                onStart={() => handleStart(server.name)}
                onStop={() => handleStop(server.name)}
                onRestart={() => handleRestart(server.name)}
              />
            ))}
          </div>

          <div className="global-actions">
            <button
              className="btn btn-primary btn-start-all"
              onClick={handleStartAll}
              disabled={allRunning || anyPending}
            >
              ▶ Start All
            </button>
            <button
              className="btn btn-danger btn-stop-all"
              onClick={handleStopAll}
              disabled={!anyRunning || anyPending}
            >
              ■ Stop All
            </button>
          </div>
        </section>

        <section className="logs-section">
          <LogViewer
            servers={servers}
            selectedServer={selectedLogServer}
            onSelectServer={setSelectedLogServer}
            onClearLogs={handleClearLogs}
          />
        </section>
      </main>

      <Settings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onPortsChange={refreshStates}
      />
    </div>
  );
};

export default App;
