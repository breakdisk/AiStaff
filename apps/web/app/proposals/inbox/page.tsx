import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import ProposalsInboxClient from './ProposalsInboxClient'

export default async function ProposalsInboxPage() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = (session.user as any)?.role as string | undefined
  if (role === 'talent') redirect('/proposals')

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-50">Proposals Inbox</h1>
        <ProposalsInboxClient session={session} />
      </div>
    </main>
  )
}
