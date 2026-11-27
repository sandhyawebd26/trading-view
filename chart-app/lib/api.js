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
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.reason = data?.reason
    throw err
  }
  return data
}
export const signup = (b) => call('signup', b)
export const login = (b) => call('login', b)
export const logout = () => call('logout', {})
export const me = () => call('me', null, 'GET')

// Saved custom indicators (per account).
async function indicators(path, method = 'GET', body) {
  const res = await fetch(`/api/indicators${path}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) { const err = new Error(data?.error || `Request failed (${res.status})`); err.status = res.status; throw err }
  return data
}
export const listIndicators = () => indicators('')
export const saveIndicator = (name, source) => indicators('', 'POST', { name, source })
export const deleteIndicator = (id) => indicators(`/${id}`, 'DELETE')
