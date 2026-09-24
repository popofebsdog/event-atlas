const base = (import.meta.env.VITE_API_URL || "http://localhost:8787").replace(
  /\/$/,
  "",
);
export async function api(path, options = {}) {
  const response = await fetch(`${base}/api${path}`, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "連線失敗");
  return data;
}
export async function all(path) {
  const items = [];
  let offset = 0;
  do {
    const page = await api(`${path}?offset=${offset}`);
    items.push(...page.items);
    offset = page.next;
  } while (offset !== null);
  return items;
}
