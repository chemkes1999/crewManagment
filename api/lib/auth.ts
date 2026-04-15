import { createClient } from '@supabase/supabase-js'
import type { NextFunction, Request, Response } from 'express'
import { getEnv } from './env.js'
import { createSupabaseForToken } from './supabase.js'

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string
    accessToken: string
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization')
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ success: false, error: 'Missing bearer token' })
    return
  }

  const token = header.slice('bearer '.length).trim()
  if (!token) {
    res.status(401).json({ success: false, error: 'Missing bearer token' })
    return
  }

  try {
    const url = getEnv('SUPABASE_URL')
    const anonKey = getEnv('SUPABASE_ANON_KEY')
    const supabase = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      res.status(401).json({ success: false, error: 'Invalid token' })
      return
    }

    const r = req as AuthenticatedRequest
    r.auth = {
      userId: data.user.id,
      accessToken: token,
    }

    next()
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' })
  }
}

export function getAuthedSupabase(req: AuthenticatedRequest) {
  return createSupabaseForToken(req.auth.accessToken)
}
