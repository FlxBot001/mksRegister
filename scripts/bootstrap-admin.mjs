import { MongoClient } from 'mongodb';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MONGODB_URI', 'MONGODB_DB_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FULL_NAME', 'ADMIN_TENANT_NAME', 'ADMIN_TENANT_SLUG'];
for (const name of required) {
  if (!process.env[name]?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.trim().replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME.trim();
const tenantName = process.env.ADMIN_TENANT_NAME.trim();
const tenantSlug = process.env.ADMIN_TENANT_SLUG.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
if (fullName.length < 2 || tenantName.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) throw new Error('Admin name, tenant name, or tenant slug is invalid.');

async function supabase(path, options = {}) {
  const response = await fetch(supabaseUrl + path, {
    ...options,
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${data?.msg || data?.message || data?.error_description || 'request rejected'}`);
  return data;
}

const mongo = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000, appName: 'mks-register-admin-bootstrap' });
try {
  await mongo.connect();
  await mongo.db(process.env.MONGODB_DB_NAME).command({ ping: 1 });
  console.log('MongoDB connection verified.');

  const users = await supabase('/auth/v1/admin/users?page=1&per_page=1000');
  let user = (users?.users || []).find((item) => item.email?.toLowerCase() === email);
  if (!user) {
    const created = await supabase('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
    });
    user = created.user || created;
    console.log('Initial administrator Auth account created.');
  } else {
    console.log('Administrator Auth account already exists; password was not changed.');
  }
  if (!user?.id) throw new Error('Supabase did not return a valid administrator user ID.');

  let tenant;
  try {
    tenant = await supabase('/rest/v1/tenants', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: tenantName, slug: tenantSlug, status: 'ACTIVE' }),
    });
    tenant = Array.isArray(tenant) ? tenant[0] : tenant;
  } catch (error) {
    const lookup = await supabase('/rest/v1/tenants?slug=eq.' + encodeURIComponent(tenantSlug) + '&select=id,name,slug&limit=1');
    tenant = lookup[0];
    if (!tenant) throw error;
  }
  if (!tenant?.id) throw new Error('Could not resolve the initial tenant.');

  await supabase('/rest/v1/tenant_memberships?on_conflict=tenant_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ tenant_id: tenant.id, user_id: user.id, role: 'OWNER', status: 'ACTIVE' }),
  });
  console.log('Administrator has OWNER access to the configured workspace.');
  console.log(`Workspace ID: ${tenant.id}`);
  console.log('Bootstrap complete. Remove ADMIN_PASSWORD from the execution environment after use.');
} finally {
  await mongo.close();
}
