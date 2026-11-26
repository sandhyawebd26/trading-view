# Trading View – live charting demo

A TradingView-style live chart with Pine Script indicators run internally, plus signup/login.

- **Chart:** [TradeCanvas](https://github.com/bonguynvan/tradecanvas) (MIT)
- **Pine Script:** [PineTS](https://github.com/QuantForgeOrg/PineTS) runs `src/clientEma.pine` and draws it on the chart with a TradingView-style legend. PineTS is AGPL-3.0 / commercial: a closed-source product needs its commercial licence (or the client's own engine).
- **Data:** Binance public REST (crypto) – demo only
- **Auth:** Express + SQLite, bcrypt passwords, httpOnly cookie sessions

## Run locally

```bash
npm install
npm run dev     # web on :5173, API on :4317
```

Open http://localhost:5173 and create an account.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `API_PORT` | `4317` | API port |
| `DB_PATH` | `data/app.db` | SQLite file |
| `NODE_ENV` | – | `production` makes the session cookie `secure` |

## Status

Done: chart, internal Pine script, signup/login. Next: live streaming, saved layouts, global data provider.
