import net from "node:net";
import readline from "node:readline";

const SERVER_HOST =
  process.env.SERVER_HOST || "127.0.0.1";

const SERVER_PORT =
  Number(process.env.SERVER_PORT) || 3000;

const socket = new net.Socket();

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(
  `Conectando ao servidor ${SERVER_HOST}:${SERVER_PORT}...`
);

socket.connect(
  SERVER_PORT,
  SERVER_HOST,
  () => {
    console.log(
      "Conectado ao servidor!"
    );
  }
);

socket.on("data", (data: Buffer) => {
  process.stdout.write(data.toString());
});

socket.on("close", () => {
  console.log(
    "\nConexão encerrada pelo servidor."
  );

  terminal.close();

  process.exit(0);
});

socket.on("error", (error) => {
  console.error(
    "\nErro de conexão:",
    error.message
  );

  terminal.close();

  process.exit(1);
});

terminal.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  socket.write(line.trim() + "\n");
});

process.on("SIGINT", () => {
  console.log("\nSaindo...");

  socket.end();

  terminal.close();
});