// frontend/src/components/TemplateModal/TemplateModal.tsx

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import type { ImageTemplate } from '../../types';
import './TemplateModal.css';

const API_BASE = 'http://localhost:3001';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (template: ImageTemplate) => void;
  isConnected: boolean;
}

interface CaptureRegion {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function TemplateModal({ isOpen, onClose, onSelect, isConnected }: TemplateModalProps) {
  const [templates, setTemplates] = useState<ImageTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'capture'>('list');
  
  // 업로드 상태
  const [uploadName, setUploadName] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  
  // 캡처 상태
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<boolean>(false);
  const [captureName, setCaptureName] = useState<string>('');
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [region, setRegion] = useState<CaptureRegion | null>(null);
  const [deviceSize, setDeviceSize] = useState({ width: 1080, height: 1920 });
  const imageRef = useRef<HTMLImageElement>(null);

  // 템플릿 목록 불러오기
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await axios.get<{ data: ImageTemplate[] }>(`${API_BASE}/api/image/templates`);
      setTemplates(res.data.data || []);
    } catch (err) {
      console.error('템플릿 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setActiveTab('list');
      resetUpload();
      resetCapture();
    }
  }, [isOpen]);

  const resetUpload = () => {
    setUploadName('');
    setUploadFile(null);
  };

  const resetCapture = () => {
    setScreenshot(null);
    setCaptureName('');
    setRegion(null);
    setIsSelecting(false);
  };

  // 파일 업로드
  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      alert('이름과 파일을 모두 입력해주세요.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', uploadName);
      formData.append('image', uploadFile);

      await axios.post(`${API_BASE}/api/image/templates`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      alert('업로드 완료!');
      resetUpload();
      setActiveTab('list');
      fetchTemplates();
    } catch (err) {
      const error = err as Error;
      alert('업로드 실패: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // 템플릿 삭제
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('이 템플릿을 삭제하시겠습니까?')) return;

    try {
      await axios.delete(`${API_BASE}/api/image/templates/${id}`);
      fetchTemplates();
    } catch (err) {
      const error = err as Error;
      alert('삭제 실패: ' + error.message);
    }
  };

  // 스크린샷 캡처
  const captureScreen = async () => {
    if (!isConnected) {
      alert('디바이스가 연결되지 않았습니다.');
      return;
    }

    setCapturing(true);
    try {
      const infoRes = await axios.get<{ windowSize?: { width: number; height: number } }>(
        `${API_BASE}/api/device/info`
      );
      if (infoRes.data.windowSize) {
        setDeviceSize({
          width: infoRes.data.windowSize.width,
          height: infoRes.data.windowSize.height,
        });
      }

      const res = await axios.get<{ screenshot?: string }>(`${API_BASE}/api/device/screenshot`);
      if (res.data.screenshot) {
        setScreenshot(res.data.screenshot);
        setRegion(null);
      }
    } catch (err) {
      console.error('스크린샷 캡처 실패:', err);
      alert('스크린샷 캡처에 실패했습니다.');
    } finally {
      setCapturing(false);
    }
  };

  // 영역 선택 시작
  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setRegion({ startX: x, startY: y, endX: x, endY: y });
  };

  // 영역 선택 중
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isSelecting || !imageRef.current || !region) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    setRegion({ ...region, endX: x, endY: y });
  };

  // 영역 선택 완료
  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  // 선택 영역을 디바이스 좌표로 변환
  const getDeviceRegion = () => {
    if (!region || !imageRef.current) return null;

    const imgWidth = imageRef.current.clientWidth;
    const imgHeight = imageRef.current.clientHeight;

    const x = Math.min(region.startX, region.endX);
    const y = Math.min(region.startY, region.endY);
    const width = Math.abs(region.endX - region.startX);
    const height = Math.abs(region.endY - region.startY);

    return {
      x: Math.round((x / imgWidth) * deviceSize.width),
      y: Math.round((y / imgHeight) * deviceSize.height),
      width: Math.round((width / imgWidth) * deviceSize.width),
      height: Math.round((height / imgHeight) * deviceSize.height),
    };
  };

  // 선택 영역 저장
  const handleSaveCapture = async () => {
    if (!captureName.trim()) {
      alert('템플릿 이름을 입력해주세요.');
      return;
    }

    const deviceRegion = getDeviceRegion();
    if (!deviceRegion || deviceRegion.width < 10 || deviceRegion.height < 10) {
      alert('영역을 선택해주세요 (최소 10x10 픽셀).');
      return;
    }

    setCapturing(true);
    try {
      await axios.post(`${API_BASE}/api/image/capture-template`, {
        name: captureName,
        ...deviceRegion,
      });

      alert('템플릿 저장 완료!');
      resetCapture();
      setActiveTab('list');
      fetchTemplates();
    } catch (err) {
      const error = err as Error;
      alert('저장 실패: ' + error.message);
    } finally {
      setCapturing(false);
    }
  };

  // 템플릿 선택
  const handleSelect = (template: ImageTemplate) => {
    onSelect?.(template);
    onClose();
  };

  if (!isOpen) return null;

  const selectionStyle = region ? {
    left: Math.min(region.startX, region.endX),
    top: Math.min(region.startY, region.endY),
    width: Math.abs(region.endX - region.startX),
    height: Math.abs(region.endY - region.startY),
  } : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="template-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🖼️ 이미지 템플릿 관리</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button 
            className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            📋 목록
          </button>
          <button 
            className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            📤 업로드
          </button>
          <button 
            className={`tab-btn ${activeTab === 'capture' ? 'active' : ''}`}
            onClick={() => setActiveTab('capture')}
          >
            📷 화면 캡처
          </button>
        </div>

        <div className="modal-body">
          {/* 목록 탭 */}
          {activeTab === 'list' && (
            <div className="template-list">
              {loading ? (
                <div className="list-loading">불러오는 중...</div>
              ) : templates.length === 0 ? (
                <div className="list-empty">
                  <p>저장된 템플릿이 없습니다.</p>
                  <p>업로드 또는 화면 캡처로 템플릿을 추가하세요.</p>
                </div>
              ) : (
                <div className="template-grid">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="template-item"
                      onClick={() => handleSelect(template)}
                    >
                      <img
                        src={`${API_BASE}/templates/${template.filename}`}
                        alt={template.name}
                        className="template-thumb"
                      />
                      <div className="template-info">
                        <div className="template-name">{template.name}</div>
                        <div className="template-size">
                          {template.width}x{template.height}
                        </div>
                      </div>
                      <button
                        className="btn-delete"
                        onClick={(e) => handleDelete(template.id, e)}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 업로드 탭 */}
          {activeTab === 'upload' && (
            <div className="upload-form">
              <div className="form-field">
                <label>템플릿 이름 *</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="예: 로그인 버튼"
                />
              </div>

              <div className="form-field">
                <label>이미지 파일 *</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>

              {uploadFile && (
                <div className="upload-preview">
                  <img
                    src={URL.createObjectURL(uploadFile)}
                    alt="Preview"
                    className="preview-image"
                  />
                </div>
              )}

              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || !uploadName.trim() || !uploadFile}
              >
                {uploading ? '업로드 중...' : '📤 업로드'}
              </button>
            </div>
          )}

          {/* 화면 캡처 탭 */}
          {activeTab === 'capture' && (
            <div className="capture-form">
              {!screenshot ? (
                <div className="capture-start">
                  <p>디바이스 화면을 캡처하여 원하는 영역을 템플릿으로 저장합니다.</p>
                  <button
                    className="btn-primary"
                    onClick={captureScreen}
                    disabled={capturing || !isConnected}
                  >
                    {capturing ? '캡처 중...' : '📷 화면 캡처'}
                  </button>
                  {!isConnected && (
                    <p className="capture-warning">⚠️ 디바이스를 먼저 연결해주세요.</p>
                  )}
                </div>
              ) : (
                <div className="capture-editor">
                  <div className="capture-image-wrapper">
                    <img
                      ref={imageRef}
                      src={screenshot}
                      alt="Screenshot"
                      className="capture-image"
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      draggable={false}
                    />
                    {selectionStyle && selectionStyle.width > 0 && (
                      <div className="selection-box" style={selectionStyle} />
                    )}
                  </div>

                  <div className="capture-controls">
                    <div className="form-field">
                      <label>템플릿 이름 *</label>
                      <input
                        type="text"
                        value={captureName}
                        onChange={(e) => setCaptureName(e.target.value)}
                        placeholder="예: 확인 버튼"
                      />
                    </div>

                    {region && (
                      <div className="region-info">
                        선택 영역: {getDeviceRegion()?.width}x{getDeviceRegion()?.height}
                      </div>
                    )}

                    <div className="capture-buttons">
                      <button className="btn-secondary" onClick={captureScreen}>
                        🔄 다시 캡처
                      </button>
                      <button
                        className="btn-primary"
                        onClick={handleSaveCapture}
                        disabled={capturing || !captureName.trim() || !region}
                      >
                        {capturing ? '저장 중...' : '💾 저장'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default TemplateModal;