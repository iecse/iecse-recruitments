import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Missing environment variables used to throw at import time, which took the
 * whole page down with a blank screen. Now the client is simply absent and the
 * form reports a configuration problem instead of disappearing.
 */
export const isConfigured = Boolean(url && key);

export const supabase = isConfigured ? createClient(url, key) : null;
