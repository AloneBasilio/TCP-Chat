## TCP Chat — TypeScript + Docker

Este projeto é um exemplo de chat em tempo real utilizando TCP Sockets, desenvolvido em TypeScript/Node.js e executado com Docker.

O projeto permite que vários clientes se conectem a um servidor TCP e troquem mensagens. Os clientes podem estar na mesma máquina, em máquinas diferentes na rede local ou, com a configuração adequada, através da Internet.

### Arquitetura

                 TCP :3000
              ┌──────────────────────────┐
              │                          │
              ▼                          ▼
       ┌─────────────┐            ┌─────────────┐
       │  Cliente A  │            │  Cliente B  │
       │ TypeScript  │            │ TypeScript  │
       └──────┬──────┘            └──────┬──────┘
              │                          │
              └──────────┬───────────────┘
                         ▼
                ┌─────────────────┐
                │   Chat Server   │
                │ Node + TypeScript│
                │     TCP :3000   │
                └────────┬────────┘
                         │
                      Docker

### Requisitos

Antes de começar, tenha instalado:
- Node.js
- npm
- Docker
- Docker Compose

### Executar o projecto
1. Executar o servidor
```bash
    cd tcp-chat
    docker compose up -d --build
```

2. Ver os logs do servidor
* Para acompanhar as conexões:
```bash
    docker compose logs -f
```

3. Instalar o cliente
```bash
    cd tcp-chat/client
    npm install
```