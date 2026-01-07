// frontend/src/components/ConnectionModal/ConnectionModal.tsx

import { useState, useEffect } from 'react';
import type { ConnectionFormData } from '../../types';
import './ConnectionModal.css';

// ========== 타입 정의 ==========
interface Preset {
  name: string;
  appPackage: string;
  appActivity: string;
}

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (formData: ConnectionFormData) => Promise<void>;
}

// 기본 프리셋
const DEFAULT_PRESETS: Preset[] = [
  { 
    name: '설정 앱', 
    appPackage: 'com.android.settings', 
    appActivity: '.Settings', 
  },
];

function ConnectionModal({ isOpen, onClose, onConnect }: ConnectionModalProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [formData, setFormData] = useState<ConnectionFormData>({
    deviceName: 'device',
    appPackage: '',
    appActivity: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 저장된 프리셋 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('connectionPresets');
    if (saved) {
      setPresets(JSON.parse(saved) as Preset[]);
    } else {
      setPresets(DEFAULT_PRESETS);
      localStorage.setItem('connectionPresets', JSON.stringify(DEFAULT_PRESETS));
    }
    
    // 마지막 연결 정보 불러오기
    const lastConnection = localStorage.getItem('lastConnection');
    if (lastConnection) {
      setFormData(JSON.parse(lastConnection) as ConnectionFormData);
    }
  }, []);

  // 프리셋 선택
  const handlePresetSelect = (preset: Preset) => {
    setSelectedPreset(preset.name);
    setFormData({
      deviceName: 'device',
      appPackage: preset.appPackage,
      appActivity: preset.appActivity,
    });
  };

  // 입력 변경
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSelectedPreset(null);
  };

  // 연결
  const handleConnect = async () => {
    if (!formData.appPackage || !formData.appActivity) {
      alert('패키지명과 액티비티를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await onConnect(formData);
      localStorage.setItem('lastConnection', JSON.stringify(formData));
      onClose();
    } catch (err) {
      const error = err as Error;
      alert('연결 실패: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 프리셋 저장
  const handleSavePreset = () => {
    const name = prompt('프리셋 이름을 입력하세요:');
    if (!name) return;

    const newPreset: Preset = {
      name,
      appPackage: formData.appPackage,
      appActivity: formData.appActivity,
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('connectionPresets', JSON.stringify(updated));
    alert('프리셋이 저장되었습니다!');
  };

  // 프리셋 삭제
  const handleDeletePreset = (presetName: string) => {
    if (!confirm(`"${presetName}" 프리셋을 삭제하시겠습니까?`)) return;
    
    const updated = presets.filter(p => p.name !== presetName);
    setPresets(updated);
    localStorage.setItem('connectionPresets', JSON.stringify(updated));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📱 디바이스 연결</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="preset-section">
            <h3>저장된 앱</h3>
            <div className="preset-list">
              {presets.map((preset) => (
                <div 
                  key={preset.name}
                  className={`preset-item ${selectedPreset === preset.name ? 'selected' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                >
                  <span className="preset-name">{preset.name}</span>
                  <button 
                    className="preset-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePreset(preset.name);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3>연결 정보</h3>
            
            <div className="form-field">
              <label>패키지명</label>
              <input
                type="text"
                name="appPackage"
                value={formData.appPackage}
                onChange={handleChange}
                placeholder="com.example.app"
              />
            </div>

            <div className="form-field">
              <label>액티비티</label>
              <input
                type="text"
                name="appActivity"
                value={formData.appActivity}
                onChange={handleChange}
                placeholder=".MainActivity"
              />
            </div>

            <button 
              className="btn-save-preset"
              onClick={handleSavePreset}
              disabled={!formData.appPackage}
            >
              💾 프리셋으로 저장
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            취소
          </button>
          <button 
            className="btn-connect" 
            onClick={handleConnect}
            disabled={isLoading}
          >
            {isLoading ? '연결 중...' : '🔌 연결'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionModal;