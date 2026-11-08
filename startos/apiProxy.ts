import { apiPort, apiProxyPort, sidecarApiPort, sidecarWsPort } from './utils'

// The API interface: one port for the backend's REST API, the sidecar's API
// and its WebSocket, routed as swapsha-backend/docker/nginx.conf routes them
// (the setup the backend's own Docker deployment uses). main.ts writes it to
// the main volume; the nginx daemon reads it from /etc/nginx/conf.d.
const backend = `http://127.0.0.1:${apiPort}`
const sidecar = `http://127.0.0.1:${sidecarApiPort}`

export const apiProxyConf = `# Written by SwapSha's main.ts on every start; edits are lost.
server {
    listen ${apiProxyPort};
    server_tokens off;

    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Headers' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, PATCH, POST, DELETE, OPTIONS' always;

    if ($request_method = OPTIONS) {
        return 200;
    }

    location /v2/ws {
        proxy_pass http://127.0.0.1:${sidecarWsPort}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    location /streamswapstatus {
        proxy_pass ${sidecar};
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_set_header X-Forwarded-For $remote_addr;
        keepalive_timeout 3600;

        chunked_transfer_encoding off;
    }

    location ~ ^/v2/swap/[^/]+/stats/[^/]+/[^/]+$ {
        proxy_pass ${sidecar};
    }

    location ~ ^/v2/swap/rescue {
        proxy_pass ${sidecar};
    }

    location ~ ^/v2/swap/restore {
        proxy_pass ${sidecar};
    }

    location /v2/lightning/ {
        proxy_pass ${sidecar};
    }

    location ~ ^/v2/quote {
        proxy_pass ${sidecar};
    }

    location ~ ^/v2/asset {
        proxy_pass ${sidecar};
    }

    location / {
        proxy_pass ${backend};
    }
}
`
