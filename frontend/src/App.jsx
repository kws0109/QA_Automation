import { useState, useEffect } from 'react'; // React 훅 불러오기
import axios from 'axios'; // HTTP 클라이언트 라이브러리 불러오기
import './App.css'; // 스타일시트 불러오기

// 백엔드 주소
const API_BASE = 'http://localhost:3001'; //주소 바뀔경우 여기도 변경

function App() {
  const [serverStatus, setServerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 왜 usestate를 사용할까?
  // 자동 업데이트: 상태가 변경되면 컴포넌트가 다시 렌더링되어 UI가 최신 상태로 유지됩니다.
  // 상태 관리: 컴포넌트 내에서 상태를 쉽게 관리하고 추적할 수 있습니다.
  // 간결한 코드: 클래스형 컴포넌트보다 함수형 컴포넌트에서 상태 관리를 더 간결하게 할 수 있습니다.

  // 서버 상태 확인

  // adsync/await란?
  // 비동기 함수(async function)는 내부에서 비동기 작업을 수행할 수 있는 함수입니다.
  // await 키워드는 프로미스가 처리될 때까지 함수 실행을 일시 중지합니다.
  // 이를 통해 비동기 코드를 동기 코드처럼 작성할 수 있어 가독성이 향상됩니다.
  const checkServer = async () => {
    setLoading(true);
    setError(null);
    
    //try/catch문이란?
    // try 블록 내의 코드를 실행하고, 오류가 발생하면 catch 블록에서 처리합니다.
    // 이를 통해 오류 발생 시 프로그램이 중단되지 않고 적절한 대응을 할 수 있습니다.
    try {
      const response = await axios.get(`${API_BASE}/api/health`); //이 작업이 끝날때까지 기다린다.
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

  // 빈 배열([])은 이 효과가 컴포넌트가 처음 렌더링될 때만 실행되도록 합니다.

  //jsx란?
  // JSX는 JavaScript XML의 약자로, 
  // JavaScript 코드 내에서 HTML과 유사한 구문을 작성할 수 있게 해줍니다.
  // React 컴포넌트의 UI 구조를 정의하는 데 사용되며,
  // 브라우저가 이해할 수 있는 순수 JavaScript로 변환됩니다.
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

/* 1.페이지로드
- useEffect 훅을 사용하여 컴포넌트가 처음 렌더링될 때 checkServer 함수가 호출됩니다.
- checkServer 함수는 서버 상태를 확인하기 위해 백엔드의 /api/health 엔드포인트에 GET 요청을 보냅니다.

2.서버상태확인
- 요청이 시작되면 loading 상태가 true로 설정되어 "서버 확인 중..." 메시지가 표시됩니다.
- 요청이 성공하면 서버에서 받은 응답 데이터가 serverStatus 상태에 저장되고, 
  loading 상태가 false로 변경됩니다.
- 요청이 실패하면 error 상태에 오류 메시지가 저장되고, loading 상태가 false로 변경됩니다.

3.UI업데이트
- loading 상태가 true인 동안 "서버 확인 중..." 메시지가 표시됩니다.
- error 상태에 값이 있으면 오류 메시지가 화면에 표시됩니다.
- serverStatus 상태에 값이 있으면 서버 상태 정보(상태, 메시지, 시간)가 화면에 표시됩니다.

4.다시확인버튼
- 사용자가 "다시 확인" 버튼을
  클릭하면 checkServer 함수가 다시 호출되어 서버 상태를 재확인합니다.
이 과정을 통해 사용자는 프론트엔드 애플리케이션에서 백엔드 서버의 상태를 실시간으로 확인할 수 있습니다.*/