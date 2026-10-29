export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function result<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('session-expired'));
    const body = await response.json().catch(() => ({}));
    const message = body.message || (response.status === 401 ? 'Usuário ou senha inválidos, ou sessão expirada.' : response.status === 403 ? 'A sessão de segurança expirou. Atualize a página e tente novamente.' : 'Não foi possível concluir a operação.');
    throw new ApiError(body.errors?.length ? `${message} ${body.errors.join(' ')}` : message, response.status);
  }
  return response.status === 204 || response.headers.get('content-length') === '0' ? undefined as T : response.text().then(text => text ? JSON.parse(text) as T : undefined as T);
}

export async function get<T>(path: string): Promise<T> {
  return result<T>(await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } }));
}

export async function mutate<T>(path: string, body: unknown, key: string, method = 'POST'): Promise<T> {
  const csrf = await get<{ token: string; header: string }>('/api/auth/csrf');
  return result<T>(await fetch(path, { method, credentials: 'same-origin', headers: {
    'Content-Type': 'application/json', [csrf.header]: csrf.token, 'Idempotency-Key': key,
  }, body: JSON.stringify(body) }));
}

export async function login(username: string, password: string): Promise<void> {
  const csrf = await get<{ token: string; header: string }>('/api/auth/csrf');
  await result(await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: {
    'Content-Type': 'application/x-www-form-urlencoded', [csrf.header]: csrf.token,
  }, body: new URLSearchParams({ username, password }) }));
}

export async function logout(): Promise<void> {
  const csrf = await get<{ token: string; header: string }>('/api/auth/csrf');
  await result(await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { [csrf.header]: csrf.token } }));
}
