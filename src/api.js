/**
 * API client for the IECSE recruitment backend.
 *
 * Replaces the direct Supabase client. All calls go through the Express
 * backend at /api, which handles validation, rate limiting, and persistence.
 */

const API_BASE = "/api";

/**
 * Submit an application.
 * @param {object} payload – The application data (snake_case field names).
 * @returns {{ ok: boolean, data?: object, error?: string, fields?: object, code?: string }}
 */
export async function submitApplication(payload) {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || "Something went wrong.",
        fields: data.fields || null,
        code: data.code || null,
        status: res.status,
      };
    }

    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: "Network error. Check your connection and try again.",
    };
  }
}


/**
 * Ask whether a registration number has already been used.
 *
 * Fails open: any network or server problem resolves to `false`, so a broken
 * lookup can never stop somebody applying.
 *
 * @param {string} registration
 * @returns {Promise<boolean>} true when an application already exists
 */
export async function checkRegistration(registration) {
  const regNo = String(registration || "").trim();
  if (!/^\d{9,20}$/.test(regNo)) return false;

  try {
    const res = await fetch(`${API_BASE}/applications/check/${regNo}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.taken === true;
  } catch {
    return false;
  }
}

/**
 * Whether the backend is reachable.
 */
export async function isHealthy() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
