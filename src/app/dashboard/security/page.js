import SessionSecurityClient from '@/components/auth/session-security-client';

export const metadata = { title: 'Account security' };
export const dynamic = 'force-dynamic';

export default function AccountSecurityPage() {
  return <SessionSecurityClient />;
}
