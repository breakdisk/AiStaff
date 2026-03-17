import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import EngagementsClient from './EngagementsClient'

export default async function EngagementsPage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-lg font-semibold text-zinc-50">Active Engagements</h1>
        <EngagementsClient session={session} />
      </div>
    </main>
  )
}
