import { APIError, type APIErrorData, Bytes, PackedTransaction } from '@wharfkit/antelope'
import type { Session } from '@wharfkit/session'
import { GFResolvedSigningRequest } from 'globalforce-wallet-plugin'

export interface TransferInput {
  to: string
  quantity: string
  memo: string
}

export interface TransactionErrorData {
  code?: number
  message?: string
  error?: Partial<APIErrorData>
}

export interface NormalizedTransactionError {
  errorMessage: string
  parsedError: TransactionErrorData | null
}

const accountPattern = /^[a-z1-5.]{1,12}$/
const quantityPattern = /^\d+\.\d{4}\s[A-Z0-9]{1,7}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toTransactionErrorData(value: unknown): TransactionErrorData | null {
  if (!isRecord(value)) {
    return null
  }

  const parsed: TransactionErrorData = {}

  if (typeof value.code === 'number') {
    parsed.code = value.code
  }

  if (typeof value.message === 'string') {
    parsed.message = value.message
  }

  if (isRecord(value.error)) {
    const parsedError: Partial<APIErrorData> = {}

    if (typeof value.error.code === 'number') {
      parsedError.code = value.error.code
    }

    if (typeof value.error.name === 'string') {
      parsedError.name = value.error.name
    }

    if (typeof value.error.what === 'string') {
      parsedError.what = value.error.what
    }

    if (Array.isArray(value.error.details)) {
      parsedError.details = value.error.details as APIErrorData['details']
    }

    if (Object.keys(parsedError).length > 0) {
      parsed.error = parsedError
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null
}

function parseJsonErrorFromText(text: string): TransactionErrorData | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return null
  }

  try {
    return toTransactionErrorData(JSON.parse(jsonMatch[0]))
  } catch {
    return null
  }
}

export function normalizeTransactionError(err: unknown): NormalizedTransactionError {
  let errorMessage = 'Transaction failed'
  let parsedError: TransactionErrorData | null = null

  if (err instanceof APIError) {
    const apiErr = err as APIError & { json?: unknown }

    parsedError = toTransactionErrorData(apiErr.response?.json)

    if (!parsedError) {
      parsedError = toTransactionErrorData(apiErr.json)
    }

    if (!parsedError && apiErr.error) {
      parsedError = {
        code: apiErr.code,
        message: err.message,
        error: apiErr.error,
      }
    }

    if (!parsedError) {
      parsedError = parseJsonErrorFromText(err.message || String(err))
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
    parsedError = parseJsonErrorFromText(err.message || String(err))

    if (!parsedError) {
      parsedError = {
        message: err.message,
      }
    }

    errorMessage = err.message
  } else {
    parsedError = {
      message: 'Unknown error',
    }
  }

  return { errorMessage, parsedError }
}

export function stringifyTransactionError(error: TransactionErrorData | null): string | null {
  if (!error) {
    return null
  }

  const serialized = JSON.stringify(error, null, 2)
  return serialized === '{}' ? null : serialized
}

function validateTransferInput(input: TransferInput): TransferInput {
  const normalized: TransferInput = {
    to: input.to.trim(),
    quantity: input.quantity.trim().toUpperCase(),
    memo: input.memo.trim(),
  }

  if (!accountPattern.test(normalized.to)) {
    throw new Error('Invalid recipient account. Example: gf.dex')
  }

  if (!quantityPattern.test(normalized.quantity)) {
    throw new Error('Invalid quantity. Format: 0.1000 GFT')
  }

  return normalized
}

export async function sendTransfer(session: Session, input: TransferInput): Promise<string> {
  const transfer = validateTransferInput(input)

  const actions = [
    {
      account: 'eosio.token',
      name: 'transfer',
      authorization: [session.permissionLevel],
      data: {
        from: session.actor.toString(),
        to: transfer.to,
        quantity: transfer.quantity,
        memo: transfer.memo || 'Transfer from web dApp',
      },
    },
  ]

  const signed = await session.transact({ actions }, { broadcast: false })

  const resolved = GFResolvedSigningRequest.fromBase(signed.resolved)
  if (!resolved?.packedTransactionHex) {
    throw new Error('Wallet did not return packedTransactionHex')
  }

  const packed = PackedTransaction.from({
    packed_trx: Bytes.from(resolved.packedTransactionHex),
    compression: 0,
    packed_context_free_data: Bytes.from(''),
    signatures: signed.signatures,
  })

  const pushResult = await session.client.v1.chain.push_transaction(packed)

  if (!pushResult.transaction_id) {
    throw new Error('Transaction was signed, but transaction_id was not received')
  }

  return String(pushResult.transaction_id)
}
