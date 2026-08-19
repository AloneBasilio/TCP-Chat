import net from 'net';
import tls from 'tls';
import readline from 'readline';

const HOST = process.env.CHAT_HOST || process.argv.find((a) => a.startsWith('--host='))?.split('=')[1] || 'localhost';
const PORT = parseInt(
  process.env.CHAT_PORT || process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] || '3000',
  10
);
const USE_TLS = process.env.CHAT_TLS === 'true' || process.argv.includes('--tls');
const REJECT_UNAUTHORIZED = process.env.CHAT_TLS_INSECURE !== 'true'; // set CHAT_TLS_INSECURE=true for self-signed certs

let currentRoom: string | null = null;
let buffer = '';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

function log(line: string) {
  console.log(line);
}

function connect(): net.Socket | tls.TLSSocket {
  if (USE_TLS) {
    log(`[client] a ligar via TLS a ${HOST}:${PORT} ...`);
    return tls.connect({ host: HOST, port: PORT, rejectUnauthorized: REJECT_UNAUTHORIZED });
  }
  log(`[client] a ligar via TCP a ${HOST}:${PORT} ...`);
  return net.connect({ host: HOST, port: PORT });
}

const socket = connect();
socket.setEncoding('utf8');

function send(obj: unknown) {
  socket.write(JSON.stringify(obj) + '\n');
}

socket.on(USE_TLS ? 'secureConnect' : 'connect', () => {
  log('[client] ligado! Escreva /help para ver os comandos.');
  rl.prompt();
});

socket.on('data', (chunk: string) => {
  buffer += chunk;
  const parts = buffer.split('\n');
  buffer = parts.pop() ?? '';
  for (const line of parts) {
    if (!line.trim()) continue;
    handleServerMessage(JSON.parse(line));
  }
  rl.prompt(true);
});

socket.on('close', () => {
  log('\n[client] ligação fechada pelo servidor.');
  process.exit(0);
});

socket.on('error', (err) => {
  log(`[client] erro de socket: ${err.message}`);
  process.exit(1);
});

function handleServerMessage(msg: any) {
  switch (msg.type) {
    case 'system':
      log(`\n*** ${msg.message}`);
      break;
    case 'error':
      log(`\n[erro] ${msg.message}`);
      break;
    case 'auth_result':
      if (msg.success) {
        log(`\n[auth] autenticado como ${msg.username} (token guardado em memória)`);
      } else {
        log(`\n[auth] falhou: ${msg.error}`);
      }
      break;
    case 'joined':
      currentRoom = msg.room;
      log(`\n[sala] entrou em "${msg.room}" (${msg.members} membro(s)) — sala activa`);
      break;
    case 'left':
      log(`\n[sala] saiu de "${msg.room}"`);
      if (currentRoom === msg.room) currentRoom = null;
      break;
    case 'rooms':
      log(`\n[salas] ${msg.rooms.join(', ') || '(nenhuma)'}`);
      break;
    case 'history':
      log(`\n--- histórico de "${msg.room}" ---`);
      for (const m of msg.messages) {
        log(`  [${m.created_at}] ${m.username}: ${m.content}`);
      }
      log('--- fim do histórico ---');
      break;
    case 'message':
      log(`\n[${msg.room}] ${msg.from}: ${msg.content}`);
      break;
    case 'ping':
      send({ type: 'pong' });
      break;
    default:
      log(`\n[?] mensagem desconhecida: ${JSON.stringify(msg)}`);
  }
}

function printHelp() {
  log(`
Comandos disponíveis:
  /register <user> <pass>   registar novo utilizador
  /login <user> <pass>      autenticar
  /join <room>              entrar numa sala (torna-se a sala activa)
  /leave <room>             sair de uma sala
  /use <room>                trocar a sala activa (sem sair de nenhuma)
  /rooms                    listar salas existentes
  /history <room> [limit]   pedir histórico de uma sala
  /quit                     sair
  <qualquer outro texto>    enviar mensagem para a sala activa
`);
}

rl.on('line', (line) => {
  const input = line.trim();
  if (!input) return rl.prompt();

  if (input.startsWith('/')) {
    const [cmd, ...rest] = input.slice(1).split(' ');
    switch (cmd) {
      case 'help':
        printHelp();
        break;
      case 'register': {
        const [user, pass] = rest;
        if (!user || !pass) { log('uso: /register <user> <pass>'); break; }
        send({ type: 'register', username: user, password: pass });
        break;
      }
      case 'login': {
        const [user, pass] = rest;
        if (!user || !pass) { log('uso: /login <user> <pass>'); break; }
        send({ type: 'login', username: user, password: pass });
        break;
      }
      case 'join': {
        const room = rest[0];
        if (!room) { log('uso: /join <room>'); break; }
        send({ type: 'join', room });
        break;
      }
      case 'leave': {
        const room = rest[0] || currentRoom;
        if (!room) { log('uso: /leave <room>'); break; }
        send({ type: 'leave', room });
        break;
      }
      case 'use': {
        const room = rest[0];
        if (!room) { log('uso: /use <room>'); break; }
        currentRoom = room;
        log(`[sala] sala activa: ${room}`);
        break;
      }
      case 'rooms':
        send({ type: 'list_rooms' });
        break;
      case 'history': {
        const room = rest[0] || currentRoom;
        const limit = rest[1] ? parseInt(rest[1], 10) : undefined;
        if (!room) { log('uso: /history <room> [limit]'); break; }
        send({ type: 'history', room, limit });
        break;
      }
      case 'quit':
        socket.end();
        rl.close();
        process.exit(0);
        break;
      default:
        log(`comando desconhecido: /${cmd}. Escreva /help.`);
    }
  } else {
    if (!currentRoom) {
      log('nenhuma sala activa. Use /join <room> primeiro.');
    } else {
      send({ type: 'message', room: currentRoom, content: input });
    }
  }

  rl.prompt();
});

rl.on('close', () => {
  socket.end();
  process.exit(0);
});
