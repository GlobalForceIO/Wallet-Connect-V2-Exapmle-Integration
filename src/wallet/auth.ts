import type { Session } from '@wharfkit/session'
import { sessionKit } from './walletKit'

export async function restoreSession(): Promise<Session | null> {
  const restored = await sessionKit.restore()
  return restored ?? null
}

export async function login(): Promise<Session> {
  const result = await sessionKit.login()
  return result.session
}

export async function logout(session?: Session): Promise<void> {
  await sessionKit.logout(session)
}
