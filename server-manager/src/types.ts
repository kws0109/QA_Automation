export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServerState {
  name: string;
  status: ServerStatus;
  pid: number | null;
  port: number;
  logs: string[];
}

export interface PortSettings {
  backend: number;
  frontend: number;
  appium: number;
}
