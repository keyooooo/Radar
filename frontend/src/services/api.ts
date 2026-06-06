/**
 * Unified HTTP client for Radar (乐搭) — wraps Taro.request for
 * cross-platform (WeChat Mini-Program + H5) compatibility.
 */

import Taro from '@tarojs/taro';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = 'http://127.0.0.1:8000/api/v1';

const TOKEN_KEY = 'radar_token';
const USER_KEY = 'radar_user';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export function getToken(): string | null {
  try {
    // Use raw localStorage instead of Taro.getStorageSync because
    // Taro's H5 polyfill does JSON.parse() on the stored value,
    // which breaks plain JWT strings (they aren't valid JSON).
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(TOKEN_KEY) || null;
    }
    // Fallback to Taro for non-H5 platforms (WeChat Mini-Program)
    return Taro.getStorageSync(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  Taro.setStorageSync(TOKEN_KEY, token);
}

export function clearAuth(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    return;
  }
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(USER_KEY);
}

/** Check if user is logged in (token exists). */
export function isLoggedIn(): boolean {
  return !!getToken();
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  data: T;
  statusCode: number;
  ok: boolean;
}

async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: {
    data?: Record<string, unknown>;
    header?: Record<string, string>;
  },
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.header,
  };

  // Inject JWT token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data: options?.data,
      header: headers,
      // Allow HTTP during development
      // (mini-program requires https in production)
    });

    // Global response interceptor
    if (res.statusCode === 401) {
      clearAuth();
      Taro.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      // Redirect to login — deferred to caller via ok: false
      return {
        data: res.data as T,
        statusCode: res.statusCode,
        ok: false,
      };
    }

    if (res.statusCode === 403) {
      Taro.showToast({
        title: '权限不足',
        icon: 'none',
        duration: 2000,
      });
    }

    const ok = res.statusCode >= 200 && res.statusCode < 300;
    return {
      data: res.data as T,
      statusCode: res.statusCode,
      ok,
    };
  } catch (err) {
    Taro.showToast({
      title: '网络连接失败，请检查网络',
      icon: 'none',
      duration: 2000,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const api = {
  get<T = unknown>(path: string, header?: Record<string, string>) {
    return request<T>('GET', path, { header });
  },

  post<T = unknown>(path: string, data?: Record<string, unknown>) {
    return request<T>('POST', path, { data });
  },

  patch<T = unknown>(path: string, data?: Record<string, unknown>) {
    return request<T>('PATCH', path, { data });
  },

  delete<T = unknown>(path: string) {
    return request<T>('DELETE', path);
  },
};

export default api;
