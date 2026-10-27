import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

/**
 * Where the Sweet Eye API lives.
 *  1. EXPO_PUBLIC_API_URL, when set (e.g. a deployed server).
 *  2. Expo Go / dev client: the same computer that serves the JS bundle, on port 4000.
 *  3. Web: the site's own address when it's deployed (the API serves the web
 *     app); on the Expo dev server (port 8081) the same host on port 4000.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const { protocol, hostname, port, origin } = window.location;
    return port === '8081' || port === '19006' ? `${protocol}//${hostname}:${API_PORT}` : origin;
  }

  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:${API_PORT}`;

  return Platform.OS === 'android' ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();

/**
 * A menu photo at the width it's shown (the API returns a resized WebP), always
 * pointed at the current API address — photo URLs saved in the bag may still
 * carry an old address if the computer's network IP changed.
 * Leaves other URIs (e.g. a photo just picked on the phone) untouched.
 */
export function sized(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  if (!/^https?:\/\//.test(url) || !url.includes('/images/')) return url;
  const rebased = url.replace(/^https?:\/\/[^/]+/, API_URL);
  const withoutWidth = rebased.replace(/([?&])w=\d+(&|$)/, (_m, lead: string, tail: string) => (tail ? lead : '')).replace(/[?&]$/, '');
  return `${withoutWidth}${withoutWidth.includes('?') ? '&' : '?'}w=${width}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};

type Options = { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal };

export async function api<T>(method: string, path: string, { body, headers, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(0, `Can't reach Sweet Eye right now. Check your connection and that the API is running (${API_URL}).`);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.message ?? 'Something went wrong. Please try again.');
  return json as T;
}

export const get = <T,>(path: string, o?: Options) => api<T>('GET', path, o);
export const post = <T,>(path: string, body?: unknown, o?: Options) => api<T>('POST', path, { ...o, body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown, o?: Options) => api<T>('PATCH', path, { ...o, body: body ?? {} });
export const put = <T,>(path: string, body?: unknown, o?: Options) => api<T>('PUT', path, { ...o, body: body ?? {} });
export const del = <T,>(path: string, body?: unknown, o?: Options) => api<T>('DELETE', path, { ...o, body: body ?? {} });

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
