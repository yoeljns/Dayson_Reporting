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
- **Haftalık ziyaret planı** — pazarlamacı haftalık ziyaret planını oluşturup
  gönderir; ilerideki haftalar için de plan yapabilir. Yönetici gönderilen
  planları görür.
- **Son ziyaret tarihleri** — pazarlamacı kendi müşterilerinin, yönetici tüm
  bayilerin en son ne zaman ziyaret edildiğini (en eskiler üstte) görür. Bir
  firmaya dokununca o firmanın ziyaret geçmişine inilir.
- **Ziyaret geçmişi (yönetici)** — yönetici tüm ekibin ziyaret geçmişini
  pazarlamacıya / firmaya / duruma göre filtreleyerek görür.
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

## Dağıtım (Vercel) — sıfır kurulum

Elle SQL çalıştırmaya gerek yok. Uygulama **ilk açılışta veritabanı şemasını
kendisi kurar** ve seni "ilk yönetici hesabı oluştur" ekranına alır.

1. Bu repoyu Vercel'e bağlayın (Import Project).
2. Proje ekranında **Integrations → Supabase**'i ekleyin (yeni veya mevcut bir
   Supabase projesi seçin). Entegrasyon gerekli tüm ortam değişkenlerini
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL_NON_POOLING`) otomatik ekler.
3. **Deploy.**
4. Açılan adreste uygulama şemayı otomatik kurar; **`/setup`** ekranında
   yönetici hesabınızı oluşturursunuz. Tamam — sistem çalışıyor.

Sonraki kullanıcıları uygulama içinden **Yönetim → Kullanıcılar** ekranından
eklersiniz (rol: pazarlamacı / yönetici / admin).

## Yerel geliştirme

1. Bir Supabase projesi açın, **Settings → API** ve **Settings → Database**'den
   değerleri alın.
2. `.env.example` → `.env.local` kopyalayın ve doldurun (özellikle
   `POSTGRES_URL_NON_POOLING` — şemanın otomatik kurulması için).
3. Çalıştırın:

```bash
npm install
npm run dev
```

İlk açılışta şema kurulur; `/setup` ile yönetici hesabını oluşturun.

> Şemayı elle kurmak isterseniz `supabase/migrations/0001_init.sql` ve
> `0002_seed.sql` dosyalarını Supabase SQL editöründe çalıştırabilirsiniz; bu
> durumda otomatik kurulum atlanır.

## Veri akışı

1. **Admin** bayi listesini `Yönetim → Excel İçe Aktar`'dan yükler
   (şablonu ekrandan indirin). Kolonlar: `logo_kodu, bayi_adi, segment,
   borc_durumu, sehir, telefon, pazarlamaci_email`.
2. `pazarlamaci_email` mevcut bir kullanıcıyla eşleşirse bayi ona atanır.
3. **Pazarlamacı** sahada ziyaret/şikayet/rakip kaydı girer; yalnız kendi
   bayilerini görür.

## Kullanıcı ekleme: geçici şifre veya e-posta daveti

Yönetim → Kullanıcılar ekranında iki yol var:

- **Geçici şifre** (varsayılan, ekstra ayar gerektirmez): bir geçici şifre
  belirleyip kullanıcıya iletirsiniz; kullanıcı **Hesabım** ekranından kendi
  şifresini değiştirebilir.
- **E-posta ile davet**: kullanıcı bağlantıya tıklayıp şifresini kendi
  belirler. Bunun çalışması için Supabase'de iki ayar gerekir:
  1. **Authentication → Providers/Email → SMTP**: kendi SMTP'nizi tanımlayın
     (Resend/SendGrid vb.). Varsayılan Supabase e-postası yalnız ekip üyelerine
     ve çok düşük limitle gönderir.
  2. **Authentication → URL Configuration → Redirect URLs**: site adresinizi
     ekleyin, ör. `https://dayson-reporting.vercel.app/**`.

  Bu ayarlar yoksa geçici şifre yöntemini kullanın.

> **Güvenlik — public signup'ı kapatın:** Kullanıcılar yalnızca yönetici
> tarafından eklenmeli. Supabase'de **Authentication → Providers → Email →
> "Allow new users to sign up"** seçeneğini KAPATIN; aksi halde herkes anon
> anahtarla kendine hesap açabilir. (Uygulama tarafında yeni hesaplar her durumda
> 'salesperson' rolüyle doğar; admin/yönetici rolü yalnızca Kullanıcılar
> ekranından atanır.)

## Notlar

- Mobilde "Ana ekrana ekle" ile PWA olarak kurulabilir.

- PWA ikonları `public/icons/icon-192.png` ve `icon-512.png` olarak
  eklenmelidir (manifest bunlara referans verir). Eklenene kadar uygulama
  çalışır; yalnız "ana ekrana ekle" görselini etkiler.
- Tam tip güvenliği için Supabase tip üretimi:
  `supabase gen types typescript --project-id <id> > src/types/supabase.ts`.

## Yol haritası (Faz 2)

Yönetici dashboard'ları (ziyaret hacmi, şikayet SLA/yaşlanma) · rakip fiyat
haritası grafikleri · raf/stok gözlemi · RFMPS/ABC/borç analizine SQL view
bağı ve CSV export.
