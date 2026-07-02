import { type Session } from '@supabase/supabase-js'
import * as Linking from 'expo-linking'
import {
    createContext, useContext, useEffect, useState, type PropsWithChildren,
} from 'react'
import { supabase } from './supabase'
import { clearPushToken, registerPushToken } from './push-notifications'

type AuthState = {
  session: Session | null
  isLoading: boolean
  isRecovering: boolean
  signOut: () => Promise<void>
  clearRecovery: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function useSession() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && next?.user?.id) {
        registerPushToken(next.user.id)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return
      const { queryParams } = Linking.parse(url)
      const fragment = url.includes('#') ? url.split('#')[1] : ''
      const frag = new URLSearchParams(fragment)

      const code = (queryParams?.code as string) ?? null
      const accessToken = frag.get('access_token')
      const refreshToken = frag.get('refresh_token')
      const type = (queryParams?.type as string) ?? frag.get('type')

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
        }
        if (type === 'recovery') setIsRecovering(true)
      } catch (e) {
        console.warn('Auth deep link failed', e)
      }
    }

    Linking.getInitialURL().then(handleUrl)
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => sub.remove()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        isRecovering,
        signOut: async () => {
          await clearPushToken(session?.user?.id)
          await supabase.auth.signOut()
        },
        clearRecovery: () => setIsRecovering(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}