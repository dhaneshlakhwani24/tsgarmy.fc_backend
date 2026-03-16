const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const WINDOW_5M_MS = 5 * 60 * 1000;
const WINDOW_1M_MS = 60 * 1000;
const WINDOW_1H_MS = 60 * 60 * 1000;

const metricsState = {
  startedAt: Date.now(),
  totalRequests: 0,
  totalInBytes: 0,
  totalOutBytes: 0,
  totalErrors: 0,
  events: [],
};

const toClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
};

const toPathKey = (req) => {
  const path = req.originalUrl || req.url || '/';
  return path.split('?')[0];
};

const purgeOldEvents = (now) => {
  metricsState.events = metricsState.events.filter((event) => now - event.ts <= WINDOW_24H_MS);
};

const requestMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const requestInBytes = Number(req.headers['content-length'] || 0) || 0;
  const ip = toClientIp(req);
  const path = toPathKey(req);

  res.on('finish', () => {
    const now = Date.now();
    const durationMs = now - startTime;
    const status = res.statusCode || 0;
    const responseOutBytes = Number(res.getHeader('content-length') || 0) || 0;

    metricsState.totalRequests += 1;
    metricsState.totalInBytes += requestInBytes;
    metricsState.totalOutBytes += responseOutBytes;
    if (status >= 400) {
      metricsState.totalErrors += 1;
    }

    metricsState.events.push({
      ts: now,
      ip,
      path,
      status,
      durationMs,
      inBytes: requestInBytes,
      outBytes: responseOutBytes,
    });

    purgeOldEvents(now);
  });

  next();
};

const getMetricsSnapshot = () => {
  const now = Date.now();
  purgeOldEvents(now);

  const lastMinuteEvents = metricsState.events.filter((event) => now - event.ts <= WINDOW_1M_MS);
  const lastFiveMinuteEvents = metricsState.events.filter((event) => now - event.ts <= WINDOW_5M_MS);
  const lastHourEvents = metricsState.events.filter((event) => now - event.ts <= WINDOW_1H_MS);

  const activeUsersNow = new Set(lastFiveMinuteEvents.map((event) => event.ip)).size;
  const uniqueVisitors24h = new Set(metricsState.events.map((event) => event.ip)).size;
  const requestsPerMinute = lastMinuteEvents.length;

  const avgResponseMs =
    lastFiveMinuteEvents.length > 0
      ? Math.round(lastFiveMinuteEvents.reduce((sum, event) => sum + event.durationMs, 0) / lastFiveMinuteEvents.length)
      : 0;

  const routeHitMap = {};
  lastHourEvents.forEach((event) => {
    routeHitMap[event.path] = (routeHitMap[event.path] || 0) + 1;
  });

  const topRoutesLastHour = Object.entries(routeHitMap)
    .map(([path, hits]) => ({ path, hits }))
    .sort((first, second) => second.hits - first.hits)
    .slice(0, 6);

  const trafficInLastHourBytes = lastHourEvents.reduce((sum, event) => sum + event.inBytes, 0);
  const trafficOutLastHourBytes = lastHourEvents.reduce((sum, event) => sum + event.outBytes, 0);

  return {
    timestamp: new Date(now).toISOString(),
    uptimeSeconds: Math.floor((now - metricsState.startedAt) / 1000),
    totalRequests: metricsState.totalRequests,
    requestsPerMinute,
    activeUsersNow,
    uniqueVisitors24h,
    avgResponseMs,
    totalErrors: metricsState.totalErrors,
    totalInBytes: metricsState.totalInBytes,
    totalOutBytes: metricsState.totalOutBytes,
    trafficInLastHourBytes,
    trafficOutLastHourBytes,
    topRoutesLastHour,
  };
};

module.exports = {
  requestMetricsMiddleware,
  getMetricsSnapshot,
};
