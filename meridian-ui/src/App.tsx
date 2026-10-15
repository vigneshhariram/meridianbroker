import { lazy, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getJson, postJson, setSession, type Session } from './api'
import { ErrorState, LoadingState } from './components/ui'
import './App.css'

const SignIn = lazy(() => import('./SignIn').then((module) => ({ default: module.SignIn })))
const ProducerDashboard = lazy(() =>
  import('./ProducerDashboard').then((module) => ({ default: module.ProducerDashboard }))
)
const RegionalDashboard = lazy(() =>
  import('./RegionalDashboard').then((module) => ({ default: module.RegionalDashboard }))
)

export default function App() {
  const client = useQueryClient()
  const [session, updateSession] = useState<Session | null | undefined>(undefined)
  const [openedAccount, setOpenedAccount] = useState('')
  const [notice, setNotice] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getJson<Session>('/auth/session', controller.signal)
      .then((restored) => {
        if (!controller.signal.aborted) {
          setSession(restored)
          updateSession(restored)
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          updateSession(null)
          if (error instanceof Error && !/sign in|session expired/i.test(error.message))
            setNotice(
              'Could not restore your session. Check that the API is running and sign in again.'
            )
        }
      })
    const expire = () => {
      setSession(null)
      updateSession(null)
      setOpenedAccount('')
      setNotice('Your session expired. Please sign in again.')
      client.clear()
    }
    window.addEventListener('meridian-session-expired', expire)
    return () => {
      controller.abort()
      window.removeEventListener('meridian-session-expired', expire)
    }
  }, [client])

  function signIn(value: Session) {
    client.clear()
    setSession(value)
    updateSession(value)
    setOpenedAccount('')
    setNotice('')
  }
  async function signOut() {
    setSigningOut(true)
    try {
      await postJson('/auth/logout', {})
      await client.cancelQueries()
      client.clear()
      setSession(null)
      updateSession(null)
      setOpenedAccount('')
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if (session === undefined)
    return (
      <main className="session-loading">
        <LoadingState label="Restoring your workspace…" />
      </main>
    )
  if (!session) return <SignIn onSignIn={signIn} notice={notice} />
  return (
    <>
      {notice && <ErrorState message={notice} />}
      {session.user.role === 'Regional Leader' && !openedAccount ? (
        <RegionalDashboard
          user={session.user}
          onSignOut={signOut}
          signingOut={signingOut}
          onOpenBrief={setOpenedAccount}
        />
      ) : (
        <ProducerDashboard
          key={`${session.user.userId}:${openedAccount}`}
          user={session.user}
          onSignOut={signOut}
          signingOut={signingOut}
          initialAccountId={openedAccount}
          initialTab={
            session.user.role === 'Regional Leader' && openedAccount ? 'ai-brief' : 'overview'
          }
          onBack={session.user.role === 'Regional Leader' ? () => setOpenedAccount('') : undefined}
        />
      )}
    </>
  )
}
