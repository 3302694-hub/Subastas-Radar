// Настройки сайта — меняйте здесь
window.SITE_CONFIG = {
  name: "SubastaRadar",
  tagline: "subastas públicas · España",
  defaultLang: "es",            // "es", "en" или "ru" (если браузер на одном из них — берётся язык браузера)
  telegramUrl: "",               // например "https://t.me/mi_canal_subastas" (пусто — блок скрыт)
  rssUrl: "feed.xml",
  pageSize: 24,
  contactEmail: "",              // адрес для вопросов о доступе (показывается пользователям без доступа)

  // Supabase: Project Settings → API. Ключ anon публичный по замыслу, его можно хранить здесь.
  // Пока поля пустые, сайт работает в открытом режиме (все данные из site/data/subastas.json).
  supabaseUrl: "",               // например "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",           // длинный ключ "eyJ..." (anon / public)
  oauthProviders: ["google", "apple"]  // кнопки входа; уберите те, что не настроены в Supabase
};
