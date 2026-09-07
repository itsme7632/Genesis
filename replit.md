# Genesis

Genesis is a mobile-first digital asset wallet and investment platform centered on the upcoming Genesis G token.

## Run locally

```bash
npm run dev
```

The app serves on port 5000.

## Current scope

The app is a mobile-first Genesis wallet and investment foundation with:

- PostgreSQL schema covering users, sessions, assets, wallets, balances, investment products, investments, G rewards, generation events, conversions, deposits, withdrawals, transactions, market prices, platform settings, admin users, and audit logs
- Secure password hashing with bcrypt, server-side sessions, HTTP-only cookies, session expiration, login/logout, validation, and basic login rate limiting
- Authenticated API reads for platform configuration, wallet balances, and portfolio data
- The five core destinations: Home, Invest, Wallet, Portfolio, and Markets
- Profile menu, asset detail and conversion flows, deposit/withdrawal preparation screens, and a protected Admin entry point

New accounts start with zero database-backed balances. No live market price, blockchain address, transaction, withdrawal, or investment reward is fabricated. G remains PRE-LAUNCH with a backend-configured reference price. Custody, live market, and balance-changing transaction providers still need to be connected before real assets can move.

Run with:

```bash
npm run dev
```

The development schema is in `schema.sql`; the application uses `DATABASE_URL` and serves on port 5000.