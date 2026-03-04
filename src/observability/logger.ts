import pino from 'pino';

let _logger: pino.Logger | null = null;

export function createLogger(level: string = 'info'): pino.Logger {
  if (_logger) return _logger;

  _logger = pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });

  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger();
  }
  return _logger;
}
