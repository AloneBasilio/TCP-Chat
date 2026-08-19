import net from "node:net";

const HOST = "0.0.0.0";
const PORT = 3000;

interface Client {
  id: number;
  socket: net.Socket;
  username: string;
}

const clients = new Map<number, Client>();

let nextClientId = 1;

function broadcast(message: string, senderId?: number): void {
  for (const client of clients.values()) {
    if (client.id !== senderId) {
      client.socket.write(message + "\n");
    }
  }
}

function sendSystemMessage(message: string): void {
  broadcast(`[SYSTEM] ${message}`);
}

const server = net.createServer((socket) => {
  const clientId = nextClientId++;

  console.log(
    `Nova conexão: ${socket.remoteAddress}:${socket.remotePort}`
  );

  socket.write("Bem-vindo ao TCP Chat!\n");
  socket.write("Digite seu nome:\n");

  let username = "";

  const client: Client = {
    id: clientId,
    socket,
    username: ""
  };

  let authenticated = false;

  socket.on("data", (data: Buffer) => {
    const messages = data
      .toString()
      .split("\n")
      .map((message) => message.trim())
      .filter(Boolean);

    for (const message of messages) {
      if (!authenticated) {
        username = message;

        client.username = username;
        clients.set(clientId, client);

        authenticated = true;

        socket.write(
          `Olá, ${username}! Você entrou no chat.\n`
        );

        sendSystemMessage(`${username} entrou no chat.`);

        console.log(
          `Cliente ${username} conectado. Total: ${clients.size}`
        );

        continue;
      }

      console.log(`[${username}] ${message}`);

      broadcast(
        `[${username}] ${message}`,
        clientId
      );
    }
  });

  socket.on("close", () => {
    if (authenticated) {
      clients.delete(clientId);

      sendSystemMessage(
        `${username} saiu do chat.`
      );

      console.log(
        `Cliente ${username} desconectado. Total: ${clients.size}`
      );
    }
  });

  socket.on("error", (error) => {
    console.error(
      `Erro no cliente ${clientId}:`,
      error.message
    );
  });
});

server.listen(PORT, HOST, () => {
  console.log("=================================");
  console.log("       TCP CHAT SERVER");
  console.log("=================================");
  console.log(`Host: ${HOST}`);
  console.log(`Port: ${PORT}`);
  console.log("Servidor aguardando conexões...");
});