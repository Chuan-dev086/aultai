const call = async (url, method = 'GET', body) => {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
};
export const api = {
  get: (u) => call(u),
  post: (u, b) => call(u, 'POST', b),
  put: (u, b) => call(u, 'PUT', b),
  patch: (u, b) => call(u, 'PATCH', b),
  del: (u) => call(u, 'DELETE'),
};
