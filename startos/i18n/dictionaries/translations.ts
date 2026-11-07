import { LangDict } from './default'

export default {
  es_ES: {
    0: '¡Iniciando SwapSha!',
    1: 'Esperando a que PostgreSQL esté listo',
    2: 'PostgreSQL está listo',
    3: 'El nodo de BTC. SwapSha lee la cadena por RPC y ZeroMQ, y su monedero de BTC está aquí.',
    4: 'El nodo SHA-256. SwapSha lee la cadena por RPC y ZeroMQ, y su monedero SHA-256 está aquí.',
    5: 'Crear el acceso RPC que SwapSha usa en este nodo',
    6: 'Activar el índice de transacciones y ZeroMQ para SwapSha',
    7: 'Activar ZeroMQ y el monedero para SwapSha',
  },
  de_DE: {
    0: 'Starte SwapSha!',
    1: 'Warte, bis PostgreSQL bereit ist',
    2: 'PostgreSQL ist bereit',
    3: 'Der BTC-Knoten. SwapSha liest die Chain über RPC und ZeroMQ, und seine BTC-Wallet liegt hier.',
    4: 'Der SHA-256-Knoten. SwapSha liest die Chain über RPC und ZeroMQ, und seine SHA-256-Wallet liegt hier.',
    5: 'Den RPC-Zugang anlegen, den SwapSha auf diesem Knoten nutzt',
    6: 'Transaktionsindex und ZeroMQ für SwapSha einschalten',
    7: 'ZeroMQ und die Wallet für SwapSha einschalten',
  },
  pl_PL: {
    0: 'Uruchamianie SwapSha!',
    1: 'Oczekiwanie na gotowość PostgreSQL',
    2: 'PostgreSQL jest gotowy',
    3: 'Węzeł BTC. SwapSha odczytuje łańcuch przez RPC i ZeroMQ, a jego portfel BTC jest tutaj.',
    4: 'Węzeł SHA-256. SwapSha odczytuje łańcuch przez RPC i ZeroMQ, a jego portfel SHA-256 jest tutaj.',
    5: 'Utwórz login RPC, którego SwapSha używa na tym węźle',
    6: 'Włącz indeks transakcji i ZeroMQ dla SwapSha',
    7: 'Włącz ZeroMQ i portfel dla SwapSha',
  },
  fr_FR: {
    0: 'Démarrage de SwapSha !',
    1: 'En attente de PostgreSQL',
    2: 'PostgreSQL est prêt',
    3: 'Le nœud BTC. SwapSha lit la chaîne par RPC et ZeroMQ, et son portefeuille BTC se trouve ici.',
    4: 'Le nœud SHA-256. SwapSha lit la chaîne par RPC et ZeroMQ, et son portefeuille SHA-256 se trouve ici.',
    5: "Créer l'accès RPC que SwapSha utilise sur ce nœud",
    6: "Activer l'index des transactions et ZeroMQ pour SwapSha",
    7: 'Activer ZeroMQ et le portefeuille pour SwapSha',
  },
} satisfies Record<string, LangDict>
