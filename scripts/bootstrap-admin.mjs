import { MongoClient, ObjectId } from 'mongodb';
import { hashPassword } from '../src/lib/auth/credentials.mjs';

const required = ['MONGODB_URI', 'MONGODB_DB_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FULL_NAME', 'ADMIN_TENANT_NAME', 'ADMIN_TENANT_SLUG'];
for (const name of required) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME.trim();
const tenantName = process.env.ADMIN_TENANT_NAME.trim();
const tenantSlug = process.env.ADMIN_TENANT_SLUG.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
if (fullName.length < 2 || tenantName.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) throw new Error('Admin name, tenant name, or tenant slug is invalid.');

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, appName: 'mks-register-admin-bootstrap' });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);
  await db.command({ ping: 1 });
  const now = new Date();
  let user = await db.collection('users').findOne({ email_normalized: email });
  if (!user) {
    user = { _id: new ObjectId(), email, email_normalized: email, full_name: fullName, password_hash: await hashPassword(password), status: 'ACTIVE', email_verified: true, mfa_enabled: false, created_at: now, updated_at: now, password_changed_at: now };
    await db.collection('users').insertOne(user);
    console.log('Initial administrator account created.');
  } else {
    console.log('Administrator account already exists; its password was not changed.');
  }
  let tenant = await db.collection('tenants').findOne({ slug_normalized: tenantSlug });
  if (!tenant) {
    tenant = { _id: new ObjectId(), name: tenantName, slug: tenantSlug, slug_normalized: tenantSlug, status: 'ACTIVE', created_by: user._id.toString(), created_at: now, updated_at: now };
    await db.collection('tenants').insertOne(tenant);
  }
  await db.collection('memberships').updateOne(
    { tenant_id: tenant._id.toString(), user_id: user._id },
    { $set: { role: 'OWNER', status: 'ACTIVE', updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
  await db.collection('audit_logs').insertOne({ tenant_id: tenant._id.toString(), actor_id: user._id.toString(), action: 'bootstrap.admin_provisioned', entity_type: 'user', entity_id: user._id.toString(), created_at: now });
  console.log('Administrator has OWNER access to the configured workspace.');
  console.log(`Workspace ID: ${tenant._id.toString()}`);
  console.log('Bootstrap complete. Remove ADMIN_PASSWORD from the execution environment after use.');
} finally {
  await client.close();
}
