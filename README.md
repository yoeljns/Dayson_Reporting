# Dayson Raporlama

Pazarlama ekibi için mobil + masaüstü saha raporlama sistemi. Ziyaretler,
şikayetler (iş emri akışı), rakip istihbaratı tek yerde — alanların çoğu
seçmeli/enum olduğu için veriler sonradan analiz edilebilir.

## Özellikler

- **Ziyaret raporlama** — bayi (distribütör) veya distribütör-dışı firma için.
  Firma + ziyaret cinsi seçilince **taslak** oluşur; detaylar sonra (gün sonu)
  tamamlanabilir. Sorular admin tarafından yönetilen dinamik bir kataloğdan gelir.
- **Şikayet = iş emri** — sahibi (departman) ve durumu (açık → işlemde → çözüldü)
  olan, her adımı not'la belgelenen bir akış. Geçişler veritabanı RPC'si ile
  doğrulanır.
- **Rakip istihbaratı** — fiyat/ürün gözlemleri; pazarlamacı kendi girdiğini,
  yönetici toplu fiyat haritasını görür.
- **Rol bazlı erişim** — pazarlamacı yalnız kendine atanan bayileri, yönetici
  herkesi görür. Postgres Row Level Security ile veritabanı katmanında zorlanır.
- **Excel/CSV içe aktarım** — bayi listesi `logo_kodu` ile upsert; hatalı satır
  raporu + içe aktarım denetimi.
- **PWA / çevrimdışı** — çekmeyen yerde taslak cihazda saklanır, bağlantı
  gelince otomatik gönderilir.

## Teknoloji

Next.js 14 (App Router) · TypeScript · Supabase (Postgres + Auth + RLS) ·
Tailwind · react-hook-form + zod · SheetJS · TanStack Query · idb (IndexedDB).

## Kurulum

### 1. Supabase projesi

1. [supabase.com](https://supabase.com) üzerinde proje açın.
2. SQL editöründe sırayla çalıştırın:
   - `supabase/migrations/0001_init.sql` (şema, enum, RLS, RPC, trigger)
   - `supabase/migrations/0002_seed.sql` (standart ziyaret soru seti + rakipler)
3. **Settings → API**'dan `URL`, `anon key`, `service_role key` değerlerini alın.

### 2. Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayın ve doldurun:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # yalnız sunucu; importer + kullanıcı yönetimi
```

### 3. Çalıştırma

```bash
npm install
npm run dev
```

### 4. İlk admin kullanıcı

İlk kullanıcıyı Supabase **Authentication → Add user** ile oluşturun, ardından
SQL editöründe rolünü yükseltin:

```sql
update profiles set role = 'admin' where email = 'siz@firma.com';
```

Sonraki kullanıcıları uygulama içinden **Yönetim → Kullanıcılar** ekranından
ekleyebilirsiniz.

## Veri akışı

1. **Admin** bayi listesini `Yönetim → Excel İçe Aktar`'dan yükler
   (şablonu ekrandan indirin). Kolonlar: `logo_kodu, bayi_adi, segment,
   borc_durumu, sehir, telefon, pazarlamaci_email`.
2. `pazarlamaci_email` mevcut bir kullanıcıyla eşleşirse bayi ona atanır.
3. **Pazarlamacı** sahada ziyaret/şikayet/rakip kaydı girer; yalnız kendi
   bayilerini görür.

## Dağıtım (Vercel)

1. Repoyu Vercel'e bağlayın.
2. Üç ortam değişkenini Vercel proje ayarlarına girin.
3. Deploy. Mobilde "Ana ekrana ekle" ile PWA olarak kurulabilir.

## Notlar

- PWA ikonları `public/icons/icon-192.png` ve `icon-512.png` olarak
  eklenmelidir (manifest bunlara referans verir). Eklenene kadar uygulama
  çalışır; yalnız "ana ekrana ekle" görselini etkiler.
- Tam tip güvenliği için Supabase tip üretimi:
  `supabase gen types typescript --project-id <id> > src/types/supabase.ts`.

## Yol haritası (Faz 2)

Yönetici dashboard'ları (ziyaret hacmi, şikayet SLA/yaşlanma) · rakip fiyat
haritası grafikleri · raf/stok gözlemi · RFMPS/ABC/borç analizine SQL view
bağı ve CSV export.
