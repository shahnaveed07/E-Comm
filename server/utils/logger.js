export function createLogger(level = 'info') {
  const order = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = order[level] ?? 20;

  function emit(lvl, message, meta = {}) {
    if ((order[lvl] ?? 20) < threshold) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level: lvl,
      message,
      ...meta,
    };
    const line = JSON.stringify(entry);
    if (lvl === 'error') {
      console.error(line);
    } else if (lvl === 'warn') {
      console.warn(line);
    } else if (process.env.NODE_ENV !== 'test') {
      console.log(line);
    }
  }

  return {
    debug: (msg, meta) => emit('debug', msg, meta),
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  };
}
