async function call(path, body, method = 'POST') {
  const res = await fetch(`/api/auth/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    throw new Error('Invalid server response.')
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}
export const signup = (b) => call('signup', b)
export const login = (b) => call('login', b)
export const logout = () => call('logout', {})
export const me = () => call('me', null, 'GET')
