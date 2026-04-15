import { supabase } from './supabaseClient'
let redirectingToLogin = false;
function redirectToLogin() {
  if (typeof window === 'undefined') return;
  if (redirectingToLogin) return;          // evita múltiples
  if (window.location.pathname === '/login') return;
  redirectingToLogin = true;
  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/login?reason=unauthorized&redirect=${encodeURIComponent(redirect)}`);
}

async function handleUnauthorized() {
  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.error('sign-out error', e)
    // ignore sign-out errors
  }
  redirectToLogin()
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init?.headers)
  headers.set('content-type', headers.get('content-type') || 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)

  const res = await fetch(input, { ...init, headers })
  const json = await res.json().catch(() => null)
  if (res.status === 401) {
    await handleUnauthorized()
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || 'Request failed'
    throw new Error(msg)
  }
  return json as T
}

export async function apiFetchForm<T>(input: string, form: FormData): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)

  const res = await fetch(input, { method: 'POST', body: form, headers })
  const json = await res.json().catch(() => null)
  if (res.status === 401) {
    await handleUnauthorized()
  }
  if (!res.ok) {
    const msg = json?.error || json?.message || 'Request failed'
    throw new Error(msg)
  }
  return json as T
}
