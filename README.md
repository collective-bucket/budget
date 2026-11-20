# Budget

Collective Bucket altında gelir, harcama ve birikim hedeflerini takip eden uygulama.

## Özellikler

- Gelir kaynaklarını tanımla
- Aylık harcamaları not et (aktif/pasif)
- Birikim hedeflerine harcama olarak katkı
- Anasayfada pinned hedefler, kalan para ve günlük limit
- Gelirlere ayın günü veya tek seferlik tarih
- Borçlar: kredi kartı (kesim/son ödeme günü, asgari oran, faiz + KKDF/BSMV), tek seferlik ve alınan borç
- Harcamalarda tarih, nakit/kart ve borç ödemesi
- Plan: hedef son tarihine kadar gün gün simülasyon; günlük sınır, ekstre takvimi, köprü borç uyarısı (`public/assets/plan.js`, test: `node --test test/plan.test.js`)

## Adresler

- Canlı: `https://budget.collectivebucket.com`
- Hosting site: `cbucket-budget`
- Ay detayı: `/month?ym=YYYY-MM`
- Gelirler: `/incomes`
- Hedefler: `/goals`
- Borçlar: `/debts`
- Plan: `/plan`

## Yerel

```bash
npm install
npm run check
npm run serve
```

## Veri

Firestore `budgets/{uid}` belgesi. Okuma ve yazma yalnızca belge sahibi.

Kurallar [collective-bucket/firestore](https://github.com/collective-bucket/firestore)
reposunda tutulur ve yalnızca oradan deploy edilir; bu repo yalnızca hosting deploy eder.
