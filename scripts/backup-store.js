import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export function backupStoreFile({
  sourceFile = STORE_FILE,
  backupDir = BACKUP_DIR,
} = {}) {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Source store file not found at ${sourceFile}`);
  }

  const raw = fs.readFileSync(sourceFile, 'utf-8');
  const parsed = JSON.parse(raw);

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetFile = path.join(backupDir, `store.backup.${stamp}.json`);
  fs.writeFileSync(targetFile, raw, 'utf-8');

  return {
    sourceFile,
    targetFile,
    bytes: Buffer.byteLength(raw, 'utf-8'),
    counts: {
      catalog: Array.isArray(parsed.catalog) ? parsed.catalog.length : 0,
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews.length : 0,
      users: Array.isArray(parsed.users) ? parsed.users.length : 0,
      orders: Array.isArray(parsed.orders) ? parsed.orders.length : 0,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = backupStoreFile();
  console.log('Store backup completed:', JSON.stringify(result, null, 2));
}
