# GlobalForce WalletConnect Demo (Web)

Demo website built with React + Vite, integrating `globalforce-wallet-plugin` through WharfKit.
You can find an example of how this can be implemented in this [repository](https://github.com/GlobalForceIO/Wallet-Connect-V2-Exapmle-Integration).
## Implemented Features

- `SessionKit` initialization with `GlobalForceWalletPlugin`
- `restoreSession()` when the app starts
- `login()` / `logout()` via WalletConnect prompt (QR + deeplink)
- `transfer` signing via `session.transact(..., { broadcast: false })`
- Manual `push_transaction` using `packedTransactionHex`
- UI for wallet connection, test transaction sending, and integration logs

## Requirements

- Node.js 18+
- Reachable WalletConnect server (default: `wss://wcs2.globalforce.io`)

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

For Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Environment Variables

See `.env.example`:

- `VITE_APP_NAME` - dApp name shown in the WharfKit prompt
- `VITE_GF_SERVER_URL` - wallet-connect-server URL (`wss://...`)
- `VITE_GF_NETWORK` - `testnet` or `mainnet`

## Quick Integration Check

1. Click `Connect wallet` and verify that the WalletConnect prompt opens.
2. Confirm the connection in the GlobalForce mobile wallet.
3. Verify `Actor` and `Permission` are shown in the UI.
4. Click `Sign and send`.
5. Verify `transaction_id` appears in the UI.
