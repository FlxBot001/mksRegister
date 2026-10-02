import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/server';
import { canManageMembers } from '@/lib/auth/tenant';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';
import { parseCsv } from '@/lib/csv/parse';

export const dynamic = 'force-dynamic';


export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send JSON containing csv and tenant_id.' } }, { status: 400 }); }
  const tenant = request.headers.get('x-tenant-id') || body?.tenant_id || '';
  if (!await canManageMembers(auth.accessToken, auth.user.id, tenant)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot import members.' } }, { status: 403 });
  if (typeof body?.csv !== 'string' || body.csv.length > 2_000_000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'CSV text is required and must be at most 2 MB.' } }, { status: 400 });
  let rows;
  try { rows = parseCsv(body.csv); } catch (error) { return NextResponse.json({ success: false, error: { code: 'INVALID_CSV', message: error.message } }, { status: 400 }); }
  if (rows.length < 2) return NextResponse.json({ success: false, error: { code: 'EMPTY_IMPORT', message: 'Include a header row and at least one member.' } }, { status: 400 });
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const nameIndex = headers.indexOf('full_name');
  const emailIndex = headers.indexOf('email');
  const phoneIndex = headers.indexOf('phone');
  if (nameIndex < 0) return NextResponse.json({ success: false, error: { code: 'MISSING_HEADER', message: 'CSV must include a full_name column; email and phone are optional.' } }, { status: 400 });
  if (rows.length > 1001) return NextResponse.json({ success: false, error: { code: 'IMPORT_TOO_LARGE', message: 'Import at most 1000 members at a time.' } }, { status: 400 });
  const valid = [], errors = [], seenEmails = new Set();
  rows.slice(1).forEach((row, index) => {
    const full_name = (row[nameIndex] || '').trim().replace(/\s+/g, ' ');
    const email = emailIndex >= 0 ? (row[emailIndex] || '').trim().toLowerCase() : '';
    const phone = phoneIndex >= 0 ? (row[phoneIndex] || '').trim() : '';
    if (full_name.length < 2 || full_name.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || phone.length > 40) errors.push({ row: index + 2, reason: 'Invalid name, email, or phone.' });
    else valid.push({ tenant_id: tenant, full_name, email: email || null, email_normalized: email || undefined, phone: phone || null, membership_status: 'ACTIVE', created_by: auth.user.id, created_at: new Date(), deleted_at: null });
  });
  if (errors.length) return NextResponse.json({ success: false, error: { code: 'IMPORT_VALIDATION_FAILED', message: 'No records were imported because some rows are invalid.', rows: errors.slice(0, 100) } }, { status: 400 });
  try {
    const db = await getDatabase();
    const emails = valid.map((member) => member.email_normalized).filter(Boolean);
    if (emails.length) {
      const existing = await db.collection('members').find({ tenant_id: tenant, email_normalized: { $in: emails }, deleted_at: null }, { projection: { email_normalized: 1 } }).limit(1001).toArray();
      if (existing.length) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_MEMBER', message: 'One or more imported emails already exist in this workspace; resolve duplicates and retry.' } }, { status: 409 });
    }
    const result = await db.collection('members').insertMany(valid, { ordered: true });
    await db.collection('audit_logs').insertOne({ tenant_id: tenant, actor_id: auth.user.id, action: 'members.imported', entity_type: 'member_import', entity_id: result.insertedIds[0]?.toString() || '', details: { count: result.insertedCount }, created_at: new Date() });
    return NextResponse.json({ success: true, data: { imported: result.insertedCount, rejected: 0 }, message: 'Member import completed.' }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_MEMBER', message: 'An imported email already exists in this workspace; resolve duplicates and retry.' } }, { status: 409 });
    const e = mongoUnavailable(error);
    return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: e.message } }, { status: e.status });
  }
}
