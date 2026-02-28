import { useEffect, useRef, useState } from 'react'
import type { Session } from '@wharfkit/session'
import './App.css'
import { login, logout, restoreSession } from './wallet/auth'
import {
  normalizeTransactionError,
  sendTransfer,
  stringifyTransactionError,
  type TransferInput,
} from './wallet/sendTransfer'
import { chainLabel, walletServerUrl } from './wallet/walletKit'

type AppStatus = 'idle' | 'restoring' | 'connecting' | 'connected' | 'sending'
type LogTone = 'info' | 'success' | 'error'

interface LogEntry {
  id: number
  time: string
  message: string
  tone: LogTone
}

const initialTransfer: TransferInput = {
  to: 'gf',
  quantity: '0.1000 GFT',
  memo: 'Transfer from web dApp',
}

const statusLabels: Record<AppStatus, string> = {
  idle: 'Disconnected',
  restoring: 'Restoring session',
  connecting: 'Connecting wallet',
  connected: 'Wallet connected',
  sending: 'Signing and sending',
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AppStatus>('restoring')
  const [transfer, setTransfer] = useState<TransferInput>(initialTransfer)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [lastTxId, setLastTxId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const logIndex = useRef(0)

  const pushLog = (message: string, tone: LogTone = 'info') => {
    logIndex.current += 1
    const entry: LogEntry = {
      id: logIndex.current,
      time: new Date().toLocaleTimeString(),
      message,
      tone,
    }

    setLogs((current) => [entry, ...current].slice(0, 8))
  }

  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const restored = await restoreSession()
        if (!active) {
          return
        }

        if (restored) {
          setSession(restored)
          setStatus('connected')
          pushLog(`Session restored: ${restored.actor.toString()}`, 'success')
          return
        }

        setStatus('idle')
        pushLog('No active session found')
      } catch (restoreError) {
        if (!active) {
          return
        }

        const message =
          restoreError instanceof Error ? restoreError.message : 'Failed to restore session'
        setError(message)
        setErrorDetails(null)
        setStatus('idle')
        pushLog(`Restore error: ${message}`, 'error')
      }
    }

    void restore()

    return () => {
      active = false
    }
  }, [])

  const onConnect = async () => {
    try {
      setError(null)
      setErrorDetails(null)
      setLastTxId(null)
      setStatus('connecting')
      pushLog('WalletConnect prompt opened')

      const nextSession = await login()
      setSession(nextSession)
      setStatus('connected')
      pushLog(`Connected: ${nextSession.actor.toString()}@${nextSession.permission.toString()}`, 'success')
    } catch (connectError) {
      const message = connectError instanceof Error ? connectError.message : 'Connection error'
      setStatus('idle')
      setError(message)
      setErrorDetails(null)
      pushLog(`Connection failed: ${message}`, 'error')
    }
  }

  const onDisconnect = async () => {
    try {
      await logout(session ?? undefined)
      setSession(null)
      setStatus('idle')
      setLastTxId(null)
      setError(null)
      setErrorDetails(null)
      pushLog('Session disconnected', 'success')
    } catch (disconnectError) {
      const message =
        disconnectError instanceof Error ? disconnectError.message : 'Failed to disconnect wallet'
      setError(message)
      setErrorDetails(null)
      pushLog(`Logout error: ${message}`, 'error')
    }
  }

  const onSendTransfer = async () => {
    if (!session) {
      return
    }

    try {
      setError(null)
      setErrorDetails(null)
      setStatus('sending')
      pushLog(`Preparing transfer ${transfer.quantity} -> ${transfer.to}`)

      const txId = await sendTransfer(session, transfer)
      setLastTxId(txId)
      setStatus('connected')
      setErrorDetails(null)
      pushLog(`Transaction sent: ${txId}`, 'success')
    } catch (sendError) {
      const { errorMessage, parsedError } = normalizeTransactionError(sendError)
      setStatus('connected')
      setError(errorMessage)
      setErrorDetails(stringifyTransactionError(parsedError))
      pushLog(`Transaction rejected: ${errorMessage}`, 'error')
    }
  }

  const isBusy = status === 'restoring' || status === 'connecting' || status === 'sending'
  const canSend = Boolean(session) && !isBusy

  return (
    <main className="app-shell">
      <div className="background-grid" />

      <section className="panel hero">
        <h1>GlobalForce WalletConnect Demo</h1>
        <p className="hero-subtitle">
          Web demo with `globalforce-wallet-plugin`, session restore, and test `transfer` sending.
        </p>
        <div className="hero-meta">
          <span className="chip">{chainLabel}</span>
          <span className="chip chip--mono">{walletServerUrl}</span>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel card">
          <header className="card-header">
            <h2>Session</h2>
            <span className={`status-pill status-pill--${session ? 'connected' : 'idle'}`}>
              {statusLabels[status]}
            </span>
          </header>

          <div className="session-info">
            <div>
              <span className="label">Actor</span>
              <code>{session?.actor.toString() ?? '—'}</code>
            </div>
            <div>
              <span className="label">Permission</span>
              <code>{session?.permission.toString() ?? '—'}</code>
            </div>
            <div>
              <span className="label">Chain ID</span>
              <code>{session?.chain.id.toString() ?? '—'}</code>
            </div>
          </div>

          <div className="button-row">
            {!session ? (
              <button className="button button--primary" onClick={onConnect} disabled={isBusy}>
                {status === 'connecting' ? 'Connecting...' : 'Connect wallet'}
              </button>
            ) : (
              <button className="button button--ghost" onClick={onDisconnect} disabled={isBusy}>
                Disconnect
              </button>
            )}
          </div>

          {error ? <p className="message message--error">{error}</p> : null}
          {errorDetails ? <pre className="message message--error message--error-detail">{errorDetails}</pre> : null}
          {lastTxId ? (
            <p className="message message--success">
              Last transaction: <code>{lastTxId}</code>
            </p>
          ) : null}
        </article>

        <article className="panel card">
          <header className="card-header">
            <h2>Test Transfer</h2>
            <span className="chip">broadcast: false + push_transaction</span>
          </header>

          <label className="field">
            <span className="label">To</span>
            <input
              type="text"
              value={transfer.to}
              disabled={!session || isBusy}
              onChange={(event) =>
                setTransfer((current) => ({ ...current, to: event.target.value.trim() }))
              }
              placeholder="gf"
            />
          </label>

          <label className="field">
            <span className="label">Quantity</span>
            <input
              type="text"
              value={transfer.quantity}
              disabled={!session || isBusy}
              onChange={(event) =>
                setTransfer((current) => ({ ...current, quantity: event.target.value.toUpperCase() }))
              }
              placeholder="0.1000 GFT"
            />
          </label>

          <label className="field">
            <span className="label">Memo</span>
            <textarea
              rows={3}
              value={transfer.memo}
              disabled={!session || isBusy}
              onChange={(event) => setTransfer((current) => ({ ...current, memo: event.target.value }))}
              placeholder="Transfer from web dApp"
            />
          </label>

          <div className="button-row">
            <button className="button button--primary" onClick={onSendTransfer} disabled={!canSend}>
              {status === 'sending' ? 'Sending...' : 'Sign and send'}
            </button>
          </div>
        </article>
      </section>

      <section className="panel card">
        <header className="card-header">
          <h2>Integration Log</h2>
          <span className="chip">{logs.length} events</span>
        </header>

        {logs.length === 0 ? (
          <p className="log-empty">Events will appear after session restore and login/transact calls.</p>
        ) : (
          <ul className="log-list">
            {logs.map((entry) => (
              <li key={entry.id} className={`log-item log-item--${entry.tone}`}>
                <span className="log-time">{entry.time}</span>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
