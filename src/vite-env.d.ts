/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_GF_SERVER_URL?: string
  readonly VITE_GF_NETWORK?: 'testnet' | 'mainnet'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
