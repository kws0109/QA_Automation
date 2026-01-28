// backend/src/events/eventEmitter.ts
// 중앙 이벤트 발신 서비스
// 모든 Socket.IO emit을 이 서비스를 통해 수행

import { Server as SocketIOServer } from 'socket.io';
import { SocketEventName } from './eventTypes';

/**
 * 중앙 이벤트 발신 서비스
 *
 * 역할:
 * - Socket.IO 인스턴스 관리
 * - 타입 안전한 이벤트 발신
 * - 특정 클라이언트/룸으로 이벤트 발신
 */
class EventEmitter {
  private io: SocketIOServer | null = null;

  /**
   * Socket.IO 인스턴스 설정
   * 서버 시작 시 한 번만 호출됨
   */
  setIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Socket.IO 인스턴스 반환
   * 직접 접근이 필요한 경우에만 사용 (권장하지 않음)
   */
  getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * 모든 클라이언트에게 이벤트 발신 (브로드캐스트)
   *
   * @param event 이벤트 이름 (SOCKET_EVENTS 상수 사용 권장)
   * @param data 전송할 데이터
   */
  emit(event: SocketEventName | string, data: unknown): void {
    if (!this.io) {
      console.warn(`[EventEmitter] Socket.IO 인스턴스가 설정되지 않음. 이벤트 무시: ${event}`);
      return;
    }
    this.io.emit(event, data);
  }

  /**
   * 특정 클라이언트(Socket ID)에게 이벤트 발신
   *
   * @param socketId 대상 클라이언트의 Socket ID
   * @param event 이벤트 이름
   * @param data 전송할 데이터
   */
  emitTo(socketId: string, event: SocketEventName | string, data: unknown): void {
    if (!this.io) {
      console.warn(`[EventEmitter] Socket.IO 인스턴스가 설정되지 않음. 이벤트 무시: ${event}`);
      return;
    }
    this.io.to(socketId).emit(event, data);
  }

  /**
   * 특정 룸에 이벤트 발신
   *
   * @param room 대상 룸 이름
   * @param event 이벤트 이름
   * @param data 전송할 데이터
   */
  emitToRoom(room: string, event: SocketEventName | string, data: unknown): void {
    if (!this.io) {
      console.warn(`[EventEmitter] Socket.IO 인스턴스가 설정되지 않음. 이벤트 무시: ${event}`);
      return;
    }
    this.io.to(room).emit(event, data);
  }

  /**
   * Socket.IO 인스턴스가 설정되었는지 확인
   */
  isReady(): boolean {
    return this.io !== null;
  }
}

// 싱글톤 인스턴스 export
export const eventEmitter = new EventEmitter();
