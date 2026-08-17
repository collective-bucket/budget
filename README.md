# Budget

Collective Bucket altında gelir, harcama ve birikim hedeflerini takip eden uygulama.

## Özellikler

- Gelir kaynaklarını tanımla
- Aylık harcamaları not et (aktif/pasif)
- Birikim hedeflerine harcama olarak katkı
- Anasayfada pinned hedefler, kalan para ve günlük limit

## Adresler

- Canlı: `https://budget.collectivebucket.com`
- Hosting site: `cbucket-budget`
- Ay detayı: `/month?ym=YYYY-MM`
- Gelirler: `/incomes`
- Hedefler: `/goals`

## Yerel

```bash
npm install
npm run check
npm run serve
```

## Veri

Firestore `budgets/{uid}` belgesi. Okuma ve yazma yalnızca belge sahibi.
