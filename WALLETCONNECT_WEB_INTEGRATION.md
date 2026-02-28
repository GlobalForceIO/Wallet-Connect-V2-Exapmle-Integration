# WalletConnect Web Integration (GlobalForce Wallet)

You can find an example of how this can be implemented in this [repository](https://github.com/GlobalForceIO/Wallet-Connect-V2-Exapmle-Integration).

This document explains how to connect WalletConnect to a web project (if you need a custom solution in another programming language, contact us by email: `office@swisstechcorp.com`).

- `globalforce-wallet-plugin` - wallet plugin for WharfKit
- `react-globalforce-frontend` - working frontend example
- `wallet-connect-server` - Socket.IO bridge server between dApp and mobile wallet

## 1. How the Integration Works

Flow:

1. Your website (dApp) connects to `wallet-connect-server` through `globalforce-wallet-plugin`.
2. The plugin shows a QR/deeplink to open the GlobalForce wallet app.
3. The user confirms the connection in the wallet.
4. The dApp sends a transaction signing request.
5. The wallet signs and returns signatures/packed transaction data.
6. The dApp sends the transaction to the blockchain.

## 2. Software Requirements

Minimum:

- Node.js 18+ (LTS recommended)
- A web project (React/Vite, Next.js, Vue, etc.)

## 3. Installing Dependencies in a Web Project

Run the following commands:

```bash
cd ../your-web-project
npm install @wharfkit/session @wharfkit/web-renderer @wharfkit/antelope globalforce-wallet-plugin
```

## 4. Basic Initialization (Recommended Path)

### 4.1 Create `wallet.ts` (or a similar module)

```ts
import { SessionKit } from '@wharfkit/session'
import { WebRenderer } from '@wharfkit/web-renderer'
import {
  GlobalForceWalletPlugin,
  GlobalForceTestNet,
  GlobalForceMainNet,
  type GlobalForceWalletConfig,
} from 'globalforce-wallet-plugin'

const walletConfig: GlobalForceWalletConfig = {
  requiresChainSelect: false,
  requiresPermissionSelect: false,
  serverUrl: 'wss://wcs2.globalforce.io', // WalletConnect server URL
  chain: GlobalForceTestNet, // or GlobalForceMainNet
}

// Singleton WebRenderer instance
const webRenderer = new WebRenderer();

// Create SessionKit factory function
export const sessionKit = new SessionKit(
  {
    appName: 'My Web dApp',
    chains: [GlobalForceTestNet], // or GlobalForceMainNet
    ui: new WebRenderer(),
    walletPlugins: [new GlobalForceWalletPlugin(walletConfig)],
  },
  {
    transactPlugins: undefined,
  }
)
```

### 5.2 Login / Logout / Session Restore

```ts
import type { Session } from '@wharfkit/session'
import { sessionKit } from './wallet'

export async function restoreSession(): Promise<Session | null> {
  const restored = await sessionKit.restore()
  return restored ?? null
}

export async function login() {
  const result = await sessionKit.login()
  return result.session
}

export async function logout() {
  await sessionKit.logout()
}
```

What `login()` does:

- opens the UI prompt (QR + deeplink)
- waits for a wallet connection event
- returns a session object (`session`) for transaction signing

## 6. Transaction Signing and Sending

This project uses a safe flow:

1. `session.transact(..., { broadcast: false })` - sign only
2. manual `push_transaction` to blockchain

This lets you use `packedTransactionHex`, returned by the wallet.

```ts
import { Bytes, PackedTransaction } from '@wharfkit/antelope'
import type { Session } from '@wharfkit/session'
import { GFResolvedSigningRequest } from 'globalforce-wallet-plugin'

export async function sendTransfer(session: Session) {
  const actions = [
    {
      account: 'eosio.token',
      name: 'transfer',
      authorization: [session.permissionLevel],
      data: {
        from: session.actor,
        to: 'gf.dex',
        quantity: '0.1000 GFT',
        memo: 'Transfer from web dApp',
      },
    },
  ]

  const signed = await session.transact({ actions }, { broadcast: false })

  const resolved = GFResolvedSigningRequest.fromBase(signed.resolved)
  if (!resolved?.packedTransactionHex) {
    throw new Error('Wallet did not return packed transaction data')
  }

  const packed = PackedTransaction.from({
    packed_trx: Bytes.from(resolved.packedTransactionHex),
    compression: 0,
    packed_context_free_data: Bytes.from(''),
    signatures: signed.signatures,
  })

  const pushResult = await session.client.v1.chain.push_transaction(packed)
  return pushResult.transaction_id
}
```

### 6.1 How to Display Blockchain/API Errors

When `push_transaction(...)` fails, WharfKit usually throws `APIError` from `@wharfkit/antelope`. This error may contain a full node response in `response.json`, including `error.details`.

If you want to show not only `err.message`, but also detailed blockchain error data in UI, normalize the error first:

```ts
import { APIError, type APIErrorData } from '@wharfkit/antelope'

export interface TransactionErrorData {
  code?: number
  message?: string
  error?: Partial<APIErrorData>
}

export function normalizeTransactionError(err: unknown): {
  errorMessage: string
  parsedError: TransactionErrorData | null
} {
  let errorMessage = 'Transaction failed'
  let parsedError: TransactionErrorData | null = null

  if (err instanceof APIError) {
    const apiErr = err as APIError & { json?: unknown }

    if (apiErr.response?.json) {
      parsedError = apiErr.response.json
    } else if (apiErr.json) {
      parsedError = apiErr.json as TransactionErrorData
    } else if (apiErr.error) {
      parsedError = {
        code: apiErr.code,
        message: err.message,
        error: apiErr.error,
      }
    } else {
      try {
        const jsonMatch = (err.message || String(err)).match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedError = JSON.parse(jsonMatch[0]) as TransactionErrorData
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (!parsedError) {
      parsedError = {
        code: apiErr.code || 500,
        message: err.message || 'API Error',
        error: {
          name: err.name || 'api_error',
          what: err.message,
          details: apiErr.details,
        },
      }
    }

    errorMessage = `Transaction failed: ${err.message}`
  } else if (err instanceof Error) {
    parsedError = {
      message: err.message,
    }
    errorMessage = err.message
  } else {
    parsedError = {
      message: 'Unknown error',
    }
  }

  return { errorMessage, parsedError }
}
```

Then in the `catch` around `sendTransfer(...)`:

```ts
try {
  const txId = await sendTransfer(session)
  setLastTxId(txId)
} catch (err) {
  const { errorMessage, parsedError } = normalizeTransactionError(err)

  setError(errorMessage)
  setErrorDetails(parsedError ? JSON.stringify(parsedError, null, 2) : null)
}
```

And render both the short error text and the raw details:

```tsx
{error && <p style={{ color: 'red' }}>{error}</p>}
{errorDetails && <pre>{errorDetails}</pre>}
```

This is useful for:

- showing `error.details[0].message` from nodeos/Leap-compatible APIs
- debugging permission errors, RAM/CPU limits, invalid action data
- distinguishing wallet-side failures from blockchain-side failures

## 7. Full React Example (Minimal)

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '@wharfkit/session'
import { sessionKit } from './wallet'
import { normalizeTransactionError, sendTransfer } from './sendTransfer'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)

  useEffect(() => {
    sessionKit.restore().then((restored) => {
      if (restored) setSession(restored)
    })
  }, [])

  const onLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      setErrorDetails(null)
      const result = await sessionKit.login()
      setSession(result.session)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const onLogout = async () => {
    await sessionKit.logout()
    setSession(null)
  }

  const onSend = async () => {
    if (!session) return
    try {
      setLoading(true)
      setError(null)
      setErrorDetails(null)
      const txId = await sendTransfer(session)
      alert(`TX sent: ${txId}`)
    } catch (e) {
      const { errorMessage, parsedError } = normalizeTransactionError(e)
      setError(errorMessage)
      setErrorDetails(parsedError ? JSON.stringify(parsedError, null, 2) : null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>WalletConnect Web Integration</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {errorDetails && <pre>{errorDetails}</pre>}

      {!session ? (
        <button onClick={onLogin} disabled={loading}>
          {loading ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ) : (
        <>
          <p>Actor: {session.actor.toString()}</p>
          <p>Permission: {session.permission.toString()}</p>
          <button onClick={onSend} disabled={loading}>
            {loading ? 'Sending...' : 'Send Test Transaction'}
          </button>
          <button onClick={onLogout}>Disconnect</button>
        </>
      )}
    </div>
  )
}
```

## 8. Important Parameters and Common Mistakes

### `serverUrl`

- Production and development: use only `wss://...` (TLS is required)

### `chain`

- Use one of the networks provided by the `globalforce-wallet-plugin` npm package

```ts
import {
  GlobalForceTestNet,
  GlobalForceMainNet,
} from 'globalforce-wallet-plugin'
```

### UI Renderer

- For browser apps, `@wharfkit/web-renderer` is required. Otherwise `login()` cannot show the QR/deeplink prompt.

### CORS and Proxy

- If the server and website are on different domains, verify CORS/Reverse Proxy settings. If you run into issues, contact us by email: `office@swisstechcorp.com`.

## 9. What the Plugin Handles Automatically

`GlobalForceWalletPlugin` already handles:

- creating `client_id`
- connecting to Socket.IO (`/dapp/{client_id}`)
- generating deeplink for mobile wallet
- rendering QR/deeplink through WharfKit UI
- E2E payload encryption/decryption
- waiting for wallet response and returning signatures in `session.transact`

## 10. Quick Integration Validation (Checklist)

1. `wallet-connect-server` is running and reachable from the browser.
2. `walletConfig.serverUrl` is set to the correct URL.
3. `sessionKit.login()` opens a prompt with QR/deeplink.
4. After scanning, an active session appears (`session.actor` is filled).
5. Transaction is signed and sent (`transaction_id` is returned).

## 11. Troubleshooting

### Connection Error (`connect_error` / timeout)

- Check that `serverUrl` is reachable.
- Confirm the protocol is correct (`ws/wss` via Socket.IO).
- For production, use `wss://`, not `ws://`.

### Prompt Opened, but Wallet Does Not Connect

- Check that the deeplink opens in the mobile wallet app.
- Check chain id match between dApp and wallet.

### Signature Succeeds, but Transaction Is Not Pushed

- Check account permissions (`permission`) and available network resources.
- Check `actions` fields (account/name/data/authorization).
- Log `resolved.packedTransactionHex` and `signatures`.
- If available, log `APIError.response.json` or render `parsedError` in UI to see `error.details`.
