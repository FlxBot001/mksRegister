import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    const checks = {
      mongodb: 'connected',
      auth_encryption_key: process.env.AUTH_ENCRYPTION_KEY?.trim().length >= 32 ? 'configured' : 'missing',
      auth_audit_hash_secret: process.env.AUTH_AUDIT_HASH_SECRET?.trim().length >= 32 ? 'configured' : 'missing',
      recovery_email: process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim() ? 'configured' : 'not_configured',
    };
    const ready = checks.mongodb === 'connected' && checks.auth_encryption_key === 'configured' && checks.auth_audit_hash_secret === 'configured';
    return NextResponse.json({ status: ready ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() }, { status: ready ? 200 : 503 });
  } catch (error) {
    const message = String(error?.message || '');
    return NextResponse.json({ status: 'error', checks: { mongodb: message.includes('not configured') ? 'not_configured' : 'unavailable' }, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
