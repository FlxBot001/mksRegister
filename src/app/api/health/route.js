import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    const supabaseConfigured = Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim());
    return NextResponse.json({ status: 'ok', checks: { mongodb: 'connected', supabase_environment: supabaseConfigured ? 'configured' : 'missing' }, timestamp: new Date().toISOString() }, { status: supabaseConfigured ? 200 : 503 });
  } catch (error) {
    const message = String(error?.message || '');
    const missing = message.includes('not configured');
    return NextResponse.json({ status: 'error', checks: { mongodb: missing ? 'not_configured' : 'unavailable', supabase_environment: process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? 'configured' : 'missing' }, timestamp: new Date().toISOString() }, { status: 503 });
  }
}
