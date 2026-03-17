const clients = new Set();
const MAX_SSE_CLIENTS = Number(process.env.SSE_MAX_CLIENTS || 20000);
let eventSequence = 0;

const addClient = (res) => {
  if (clients.size >= MAX_SSE_CLIENTS) {
    return false;
  }

  clients.add(res);
  return true;
};

const removeClient = (res) => clients.delete(res);

const broadcast = (resource) => {
  eventSequence += 1;
  const eventId = eventSequence;
  const payload = JSON.stringify({ ts: Date.now() });
  const staleClients = [];

  for (const client of clients) {
    try {
      if (client.writableEnded || client.destroyed) {
        staleClients.push(client);
        continue;
      }

      client.write(`id: ${eventId}\nevent: ${resource}\ndata: ${payload}\n\n`);
      if (typeof client.flush === 'function') {
        client.flush();
      }
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
