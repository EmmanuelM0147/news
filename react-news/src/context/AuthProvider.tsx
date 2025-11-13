import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!isMounted) {
        return
      }

      if (error) {
        setAuthError(error.message)
      }

      setSession(data.session ?? null)
      setIsLoading(false)
    }

    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInAnonymously = useCallback(async () => {
    setAuthError(null)
    setIsSigningIn(true)

    const { error } = await supabase.auth.signInAnonymously()

    if (error) {
      setAuthError(error.message)
    }

    setIsSigningIn(false)
  }, [])

  const signOut = useCallback(async () => {
    setAuthError(null)

    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthError(error.message)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isSigningIn,
      authError,
      signInAnonymously,
      signOut,
    }),
    [session, isLoading, isSigningIn, authError, signInAnonymously, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
