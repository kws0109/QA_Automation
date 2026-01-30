import React, { useState, useEffect } from 'react';

interface PortSettings {
  backend: number;
  frontend: number;
  appium: number;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onPortsChange: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose, onPortsChange }) => {
  const [ports, setPorts] = useState<PortSettings>({
    backend: 3001,
    frontend: 5173,
    appium: 4900
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPorts();
    }
  }, [isOpen]);

  const loadPorts = async () => {
    try {
      const currentPorts = await window.electronAPI.getPorts();
      setPorts(currentPorts);
    } catch (err) {
      console.error('Failed to load ports:', err);
    }
  };

  const handleSave = async () => {
    setError(null);

    // Validate ports
    const portValues = [ports.backend, ports.frontend, ports.appium];
    for (const port of portValues) {
      if (port < 1 || port > 65535) {
        setError('포트는 1-65535 범위여야 합니다');
        return;
      }
    }

    // Check for duplicates
    const uniquePorts = new Set(portValues);
    if (uniquePorts.size !== portValues.length) {
      setError('각 서버는 서로 다른 포트를 사용해야 합니다');
      return;
    }

    setIsSaving(true);
    try {
      await window.electronAPI.setPorts(ports);
      onPortsChange();
      onClose();
    } catch (err) {
      setError('포트 저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePortChange = (key: keyof PortSettings, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue)) {
      setPorts(prev => ({ ...prev, [key]: numValue }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>Server Ports</h3>
            <p className="settings-hint">서버 포트를 변경하려면 모든 서버를 먼저 중지하세요</p>

            <div className="settings-field">
              <label htmlFor="port-backend">Backend</label>
              <input
                id="port-backend"
                type="number"
                min="1"
                max="65535"
                value={ports.backend}
                onChange={e => handlePortChange('backend', e.target.value)}
              />
            </div>

            <div className="settings-field">
              <label htmlFor="port-frontend">Frontend</label>
              <input
                id="port-frontend"
                type="number"
                min="1"
                max="65535"
                value={ports.frontend}
                onChange={e => handlePortChange('frontend', e.target.value)}
              />
            </div>

            <div className="settings-field">
              <label htmlFor="port-appium">Appium</label>
              <input
                id="port-appium"
                type="number"
                min="1"
                max="65535"
                value={ports.appium}
                onChange={e => handlePortChange('appium', e.target.value)}
              />
            </div>
          </div>

          {error && <div className="settings-error">{error}</div>}
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
