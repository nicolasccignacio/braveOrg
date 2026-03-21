import { LightningElement } from 'lwc';

export default class WebSocketComponent extends LightningElement {
  message = '';
  serverMessages = '';
  socket;

  connectedCallback() {
    // Conectar al servidor de WebSocket
    this.socket = new WebSocket('ws://9c9a4b90-f6bd-40d0-8766-4c21e80df197-00-15p343fhwdnu2.spock.replit.dev/');

    // Manejar la apertura de la conexión
    this.socket.addEventListener('open', () => {
      console.log('Conectado al servidor de WebSocket');
      this.serverMessages += 'Conectado al servidor de WebSocket\n';
    });

    // Manejar mensajes recibidos del servidor
    this.socket.addEventListener('message', (event) => {
      console.log('Mensaje del servidor:', event.data);
      this.serverMessages += `Mensaje del servidor: ${event.data}\n`;
    });

    // Manejar la desconexión del servidor
    this.socket.addEventListener('close', () => {
      console.log('Desconectado del servidor de WebSocket');
      this.serverMessages += 'Desconectado del servidor de WebSocket\n';
    });

    // Manejar errores
    this.socket.addEventListener('error', (event) => {
      console.error('Error en la conexión de WebSocket:', JSON.stringify(event));
      this.serverMessages += `Error en la conexión de WebSocket: ${event}\n`;
    });
  }

  handleMessageChange(event) {
    this.message = event.target.value;
  }

  sendMessage() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(this.message);
      this.serverMessages += `Tú: ${this.message}\n`;
      this.message = '';
    } else {
      this.serverMessages += 'No conectado al servidor de WebSocket\n';
    }
  }
}