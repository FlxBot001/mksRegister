import SessionGuard from '@/components/auth/session-guard';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }) {
  return <SessionGuard>{children}</SessionGuard>;
}
