# TCP Chat — TypeScript + Docker

Chat em tempo real construído sobre **TCP Sockets** puros (com suporte adicional a **WebSocket**),
escrito em **TypeScript/Node.js** e orquestrado com **Docker Compose**.

Suporta múltiplos clientes ligados em simultâneo, várias salas, autenticação de utilizadores,
protocolo JSON, heartbeat (ping/pong), TLS, persistência de mensagens em PostgreSQL e
escalabilidade horizontal através de **Redis Pub/Sub** entre várias instâncias do servidor.

```
TCP Chat
   │
   ├── Multiple Rooms          → server/src/chat/room.service.ts
   ├── User Authentication     → server/src/auth/auth.service.ts (bcrypt + JWT)
   ├── JSON Protocol           → server/src/protocol/protocol.ts
   ├── Heartbeat / Ping-Pong   → server/src/tcp/tcp.server.ts, server/src/websocket/websocket.server.ts
   ├── TLS                     → server/certs/*, config TLS_ENABLED=true
   ├── Message Persistence     → server/src/database/database.ts (PostgreSQL)
   ├── WebSocket                → server/src/websocket/websocket.server.ts
   ├── Redis Pub/Sub            → server/src/redis/redis.ts
   └── Multiple Chat Servers   → docker-compose.yml (chat-server-1 + chat-server-2)
```

## Arquitetura

```
                         ┌──────────────────┐
                         │    PostgreSQL    │
                         │ Users / Messages │
                         └────────▲─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
             ┌──────┴──────┐             ┌──────┴──────┐
             │ Chat Server 1│             │ Chat Server 2│
             │ TCP :3000    │             │ TCP :3001    │
             │ WS  :8080    │             │ WS  :8081    │
             └──────┬──────┘             └──────┬──────┘
                    │                           │
                    └───────────┬───────────────┘
                                │
                         ┌──────▼──────┐
                         │    Redis    │
                         │ Pub / Sub   │
                         └─────────────┘
```

Cada instância do chat server é *stateless* em termos de sessões: só mantém em memória as ligações
locais (TCP/WS) e a associação local a salas. Quando um cliente envia uma mensagem:

```
Client
  │
  ▼
Server
  │
  ├────► PostgreSQL   (guarda a mensagem — histórico durável)
  │
  └────► Redis         (publica no canal chat:messages)
              │
              ▼
      outras instâncias do servidor
      (subscritas ao mesmo canal)
              │
              ▼
      reenviam a mensagem aos seus
      clientes locais na mesma sala
```

Isto permite que um cliente ligado ao `Chat Server 1` converse em tempo real com um cliente ligado
ao `Chat Server 2`, sem que os dois servidores tenham de se conhecer diretamente — o Redis é o
ponto de coordenação, e o PostgreSQL garante que o histórico da sala é o mesmo independentemente
de a que instância cada cliente se ligou.

## Estrutura do projeto

```
tcp-chat/
│
├── server/
│   ├── src/
│   │   ├── config/config.ts              variáveis de ambiente centralizadas
│   │   ├── database/database.ts          pool PostgreSQL, schema, queries
│   │   ├── redis/redis.ts                publisher/subscriber Redis
│   │   ├── auth/auth.service.ts          registo/login (bcrypt + JWT)
│   │   ├── chat/
│   │   │   ├── session.ts                abstração de ligação (TCP ou WS) + ClientSession
│   │   │   ├── room.service.ts           gestão de salas locais
│   │   │   ├── message.service.ts        persistência + broadcast local + publish Redis
│   │   │   └── dispatcher.ts             roteamento das mensagens do protocolo
│   │   ├── tcp/tcp.server.ts             servidor TCP (net/tls) + heartbeat
│   │   ├── websocket/websocket.server.ts servidor WebSocket (ws) + heartbeat
│   │   ├── protocol/protocol.ts          tipos do protocolo JSON + framing por linha
│   │   └── index.ts                       bootstrap
│   ├── certs/server.crt, server.key       certificado TLS auto-assinado (demo)
│   ├── package.json / tsconfig.json / Dockerfile
│
├── client/
│   └── src/client.ts                      cliente CLI interativo (TCP ou TLS)
│
├── docker-compose.yml
├── .env
└── README.md
```

## Como correr

Pré-requisitos: Docker e Docker Compose instalados.

```bash
cd tcp-chat
docker compose up --build
```

Isto sobe:
- `postgres` (porta 5432)
- `redis` (porta 6379)
- `chat-server-1` — TCP `3000`, WebSocket `8080`
- `chat-server-2` — TCP `3001`, WebSocket `8081`

As duas instâncias partilham a mesma base de dados e o mesmo canal Redis, pelo que um utilizador
ligado ao servidor 1 vê em tempo real as mensagens de um utilizador ligado ao servidor 2, desde
que estejam na mesma sala.

## Cliente CLI

O cliente pode correr localmente (fora do Docker) ligando-se a qualquer uma das instâncias:

```bash
cd client
npm install
npm run build

# ligar ao chat-server-1 (TCP simples)
CHAT_HOST=localhost CHAT_PORT=3000 npm start

# ligar ao chat-server-2
CHAT_HOST=localhost CHAT_PORT=3001 npm start

# ligar com TLS (aceitando o certificado auto-assinado)
CHAT_HOST=localhost CHAT_PORT=3000 CHAT_TLS=true CHAT_TLS_INSECURE=true npm start
```

Comandos disponíveis no cliente:

```
/register <user> <pass>   registar novo utilizador
/login <user> <pass>      autenticar
/join <room>               entrar numa sala (torna-se a sala ativa)
/leave <room>               sair de uma sala
/use <room>                 trocar a sala ativa sem sair de nenhuma
/rooms                      listar salas existentes
/history <room> [limit]     pedir histórico de uma sala
/quit                       sair
<texto livre>                enviar mensagem para a sala ativa
```

Também é possível testar rapidamente com `netcat`/`openssl s_client`, já que o protocolo é apenas
JSON delimitado por `\n`:

```bash
nc localhost 3000
{"type":"login","username":"alone","password":"segredo123"}
{"type":"join","room":"general"}
{"type":"message","room":"general","content":"olá pessoal!"}
```

## Protocolo (JSON, uma mensagem por linha em TCP / um frame por mensagem em WS)

**Cliente → Servidor**
| type | campos |
|---|---|
| `register` | `username`, `password` |
| `login` | `username`, `password` |
| `join` | `room` |
| `leave` | `room` |
| `message` | `room`, `content` |
| `list_rooms` | — |
| `history` | `room`, `limit?` |
| `pong` | — (resposta ao `ping` do servidor) |

**Servidor → Cliente**
| type | campos |
|---|---|
| `auth_result` | `success`, `token?`, `username?`, `error?` |
| `joined` | `room`, `members` |
| `left` | `room` |
| `message` | `room`, `from`, `content`, `timestamp`, `serverId` |
| `rooms` | `rooms[]` |
| `history` | `room`, `messages[]` |
| `system` | `message` |
| `error` | `message` |
| `ping` | — (cliente deve responder com `pong`) |

## Heartbeat

Cada servidor envia `{"type":"ping"}` periodicamente (`HEARTBEAT_INTERVAL_MS`, por omissão 30s).
Se não receber `{"type":"pong"}` dentro de `HEARTBEAT_TIMEOUT_MS` (por omissão 15s), a ligação é
fechada — protege o servidor contra clientes mortos/pendurados que nunca se desligam corretamente.

## TLS

Por omissão o TLS está desativado (`TLS_ENABLED=false`) para facilitar testes locais. Para ativar:

1. Defina `TLS_ENABLED=true` no `.env`.
2. O `Dockerfile` do servidor já gera um certificado auto-assinado em build (`server/certs/`) caso
   não exista um. Para produção, substitua `server/certs/server.crt` e `server/certs/server.key`
   por um certificado válido (ex. emitido pela Let's Encrypt) antes de construir a imagem.

## Variáveis de ambiente principais (`.env`)

| variável | descrição |
|---|---|
| `PG_HOST/PORT/USER/PASSWORD/DATABASE` | ligação PostgreSQL |
| `REDIS_URL`, `REDIS_CHANNEL` | ligação e canal Redis Pub/Sub |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | assinatura dos tokens de autenticação |
| `TLS_ENABLED`, `TLS_CERT_PATH`, `TLS_KEY_PATH` | configuração TLS |
| `HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_TIMEOUT_MS` | ping/pong |
| `DEFAULT_ROOMS` | salas criadas automaticamente no arranque |
| `HISTORY_LIMIT` | nº de mensagens devolvidas ao entrar numa sala |

## Escalar para mais instâncias

Para adicionar um `chat-server-3`, basta copiar o bloco de serviço no `docker-compose.yml`,
atribuir um `INSTANCE_ID` único e portas TCP/WS livres — não é necessário nenhum código adicional,
graças ao Redis Pub/Sub e à persistência partilhada em PostgreSQL.
