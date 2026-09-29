import { preview } from 'vite';

const requestedPort = Number.parseInt(process.env.PORT || '10000', 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0
  ? requestedPort
  : 10000;

const server = await preview({
  preview: {
    host: '0.0.0.0',
    port,
    strictPort: true,
  },
});

server.printUrls();

function shutdown() {
  server.httpServer.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
