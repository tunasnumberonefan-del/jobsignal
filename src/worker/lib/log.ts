// Structured logs. Workers Observability indexes JSON lines, so keep it one object per line.
// Never log emails, tokens, or raw IPs.

type Level = 'debug' | 'info' | 'warn' | 'error';

export function log(level: Level, msg: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, msg, t: new Date().toISOString(), ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
