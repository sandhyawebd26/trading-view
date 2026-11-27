# Live Chart (Next.js)

TradeCanvas chart workspace with Pine Script (PineTS), login, light/dark theme. Crypto via Binance for now.

```bash
npm install
npm run dev     # http://localhost:3010
```

## Deploy on Railway

- Set the service's **Root Directory** to `chart-app`.
- Start command: `npm start` (reads `PORT`). Health check: `/api/health`.
- Add a Volume mounted at `/data` and set `DB_PATH=/data/app.db` (SQLite file).
- Set `COOKIE_SECURE=true`.

PineTS is AGPL-3.0 / commercial: a closed-source product needs its commercial licence.
