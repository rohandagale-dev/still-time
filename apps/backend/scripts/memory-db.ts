/**
 * Starts a local MongoDB for development without Docker, using the binary that
 * mongodb-memory-server downloads. Data persists in apps/backend/.data/mongodb.
 *
 *   npm run db:memory            # mongodb://127.0.0.1:27017/stilltime
 *   MONGO_PORT=27018 npm run db:memory
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env['MONGO_PORT'] ?? 27017);
const dbPath = fileURLToPath(new URL('../.data/mongodb', import.meta.url));
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
});

console.log(`MongoDB ready at ${server.getUri()}stilltime  (data: ${dbPath})`);
console.log('Press Ctrl+C to stop.');

const stop = async (): Promise<void> => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
