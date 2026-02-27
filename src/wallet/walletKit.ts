import { SessionKit } from '@wharfkit/session'
import { WebRenderer } from '@wharfkit/web-renderer'
import {
  GlobalForceMainNet,
  GlobalForceTestNet,
  GlobalForceWalletPlugin,
  type GlobalForceWalletConfig,
} from 'globalforce-wallet-plugin'

const appName = import.meta.env.VITE_APP_NAME?.trim() || 'GlobalForce WalletConnect Demo'
const network = import.meta.env.VITE_GF_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

const selectedChain = network === 'mainnet' ? GlobalForceMainNet : GlobalForceTestNet

export const chainLabel = network === 'mainnet' ? 'GlobalForce MainNet' : 'GlobalForce TestNet'
export const walletServerUrl = import.meta.env.VITE_GF_SERVER_URL?.trim() || 'wss://wcs2.globalforce.io'

const walletConfig: GlobalForceWalletConfig = {
  requiresChainSelect: false,
  requiresPermissionSelect: false,
  serverUrl: walletServerUrl,
  chain: selectedChain,
}

export const sessionKit = new SessionKit({
  appName,
  chains: [selectedChain],
  ui: new WebRenderer(),
  walletPlugins: [new GlobalForceWalletPlugin(walletConfig)],
})
