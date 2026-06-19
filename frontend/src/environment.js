const isLocal = window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1' || 
                window.location.hostname.startsWith('192.168.') || 
                window.location.hostname.startsWith('10.') || 
                window.location.hostname.startsWith('172.');

const server = isLocal 
  ? `http://${window.location.hostname}:8080` 
  : "https://video-conferencing-platform-backend-h90p.onrender.com";

export default server;