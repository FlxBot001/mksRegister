import 'server-only';
import { MongoClient } from 'mongodb';

const URI = process.env.MONGODB_URI?.trim();
const DB_NAME = process.env.MONGODB_DB_NAME?.trim();

let clientPromise;

export async function getDatabase() {
  if (!URI || !DB_NAME) throw new Error('MongoDB is not configured. Set MONGODB_URI and MONGODB_DB_NAME.');
  if (!clientPromise) {
    const client = new MongoClient(URI, {
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      serverSelectionTimeoutMS: 8000,
      appName: 'mks-register',
    });
    clientPromise = client.connect().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  await Promise.all([
    db.collection('services').createIndex({ tenant_id: 1, name_normalized: 1 }, { unique: true, partialFilterExpression: { deleted_at: null } }),
    db.collection('members').createIndex({ tenant_id: 1, email_normalized: 1 }, { unique: true, partialFilterExpression: { email_normalized: { $type: 'string' }, deleted_at: null } }),
    db.collection('attendance').createIndex({ tenant_id: 1, member_id: 1, recorded_at: -1 }),
    db.collection('attendance').createIndex({ tenant_id: 1, service_id: 1, recorded_at: -1 }),
    db.collection('invitations').createIndex({ tenant_id: 1, email_normalized: 1, status: 1 }),
    db.collection('audit_logs').createIndex({ tenant_id: 1, created_at: -1 }),
  ]);
  return db;
}

export function isValidObjectId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
}

export function toObjectId(value) {
  if (!isValidObjectId(value)) return null;
  const { ObjectId } = require('mongodb');
  return new ObjectId(value);
}

export function mongoUnavailable(error) {
  const message = error instanceof Error ? error.message : '';
  return {
    status: message.includes('not configured') ? 503 : 500,
    message: message.includes('not configured')
      ? 'The application database is not configured.'
      : 'The database operation failed. Check server configuration and try again.',
  };
}
