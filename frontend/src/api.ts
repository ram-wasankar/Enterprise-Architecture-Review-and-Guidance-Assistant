export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : body.detail
              ?.map(
                (e: { loc: string[]; msg: string }) =>
                  `${e.loc.slice(1).join(".")}: ${e.msg}`,
              )
              .join("; ") || message;
    } catch {
      /* Keep the status when a proxy returns HTML. */
    }
    throw new Error(message);
  }
  return response.json();
}
