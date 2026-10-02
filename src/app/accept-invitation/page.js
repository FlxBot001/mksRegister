import AcceptInvitationClient from '@/components/auth/accept-invitation-client';

export default async function AcceptInvitationPage({ searchParams }) {
  const params = await searchParams;
  return <AcceptInvitationClient token={typeof params?.token === 'string' ? params.token : ''} />;
}
