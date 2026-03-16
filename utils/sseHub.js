const clients = new Set();
const MAX_SSE_CLIENTS = Number(process.env.SSE_MAX_CLIENTS || 20000);

const addClient = (res) => {
  if (clients.size >= MAX_SSE_CLIENTS) {
    return false;
  }

  clients.add(res);
  return true;
};

const removeClient = (res) => clients.delete(res);

const broadcast = (resource) => {
  const staleClients = [];

  for (const client of clients) {
    try {
      if (client.writableEnded || client.destroyed) {
        staleClients.push(client);
        continue;
      }

      client.write(`event: ${resource}\ndata: {}\n\n`);
    } catch {
      staleClients.push(client);
    }
  }

  for (const client of staleClients) {
    clients.delete(client);
  }
};

const getClientCount = () => clients.size;

module.exports = { addClient, removeClient, broadcast, getClientCount };
