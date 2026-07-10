export class GameConnection extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.id = null;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'welcome') this.id = message.id;
      this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
    });
    this.socket.addEventListener('open', () => this.dispatchEvent(new Event('open')));
    this.socket.addEventListener('close', () => this.dispatchEvent(new Event('close')));
  }

  send(type, payload = {}) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...payload }));
    }
  }
}
