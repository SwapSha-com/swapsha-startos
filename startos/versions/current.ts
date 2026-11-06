import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '3.13.0:0',
  releaseNotes: {
    en_US:
      'First test build of the SwapSha package: PostgreSQL only, the backend follows. Not live: swaps on mainnet are switched off.',
    es_ES:
      'Primera compilación de prueba del paquete SwapSha: solo PostgreSQL, el backend llegará después. No está en producción: los intercambios en mainnet están desactivados.',
    de_DE:
      'Erster Test-Build des SwapSha-Pakets: nur PostgreSQL, das Backend folgt. Nicht live: Swaps im Mainnet sind abgeschaltet.',
    pl_PL:
      'Pierwsza testowa wersja pakietu SwapSha: tylko PostgreSQL, backend pojawi się później. Nie działa produkcyjnie: wymiany w sieci głównej są wyłączone.',
    fr_FR:
      'Première version de test du paquet SwapSha : PostgreSQL uniquement, le backend suivra. Pas en production : les échanges sur le mainnet sont désactivés.',
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
