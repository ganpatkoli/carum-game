import { io, type Socket } from 'socket.io-client';
import { API_URL, getAccessToken } from '../api/client';
import { getInstallIdSync } from '../api/device';

let socket: Socket | null = null;

/** One shared realtime connection. The token is read on every (re)connect so refreshed tokens are used. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() ?? '', deviceKey: getInstallIdSync() ?? undefined }),
      reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000,
    });
  }
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export function emitAck<T = any>(event: string, payload?: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    s.emit(event, payload, (r: T) => { clearTimeout(timer); resolve(r); });
  });
}
