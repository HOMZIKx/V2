/**
 * Node fetch may join multiple Set-Cookie values when read via Headers.forEach
 * / get("set-cookie"). Prefer getSetCookie() so OAuth state + session cookies
 * stay intact.
 */
export function collectUpstreamSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    const cookies = headers.getSetCookie().filter((value) => value.length > 0);
    if (cookies.length > 0) {
      return cookies;
    }
  }

  const joined = headers.get('set-cookie');
  if (joined === null || joined.trim() === '') {
    return [];
  }
  return [joined];
}
