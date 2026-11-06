// Настройки сайта — меняйте здесь
window.SITE_CONFIG = {
  name: "SubastaRadar",
  tagline: "subastas públicas · España",
  defaultLang: "es",            // "es", "en" или "ru" (если браузер на одном из них — берётся язык браузера)
  telegramUrl: "",               // например "https://t.me/mi_canal_subastas" (пусто — блок скрыт)
  rssUrl: "feed.xml",
  pageSize: 24,
  contactEmail: "subastaradar@gmail.com",              // адрес для вопросов о доступе (показывается пользователям без доступа)

  // Supabase: Project Settings → API. Ключ anon публичный по замыслу, его можно хранить здесь.
  // Пока поля пустые, сайт работает в открытом режиме (все данные из site/data/subastas.json).
  supabaseUrl: "https://jkxvxdhmothlamhotecu.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreHZ4ZGhtb3RobGFtaG90ZWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NzczNzgsImV4cCI6MjEwOTU1MzM3OH0.S4CoToxM2Ai9Sm87UDp5DwlpAAnPrpjkJ-nYa4Akc1g",  // публичный ключ (anon)
  oauthProviders: ["google"]  // "apple" — после настройки Apple в Supabase
};
