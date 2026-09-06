/* Preencha somente com valores publicos do projeto Supabase. Nunca use service_role aqui. */
window.SUPABASE_URL = "https://zmfjxroiibmoihryomox.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable__mfgCSDV9wGDOXcUYytGAw_vZqD7wGp";

const supabaseLibrary = window.supabaseJs || window.supabase;

if (!supabaseLibrary?.createClient) {
  throw new Error("A biblioteca supabase-js precisa ser carregada antes de supabase-config.js");
}

window.supabaseClient = supabaseLibrary.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
window.supabase = window.supabaseClient;
