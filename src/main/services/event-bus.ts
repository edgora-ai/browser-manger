// 极简内部事件总线(main 进程内,供 automation 事件触发用)
type EventPayload = Record<string, unknown>;
type Handler = (payload: EventPayload) => void;

const handlers = new Map<string, Set<Handler>>();

export function emitEvent(name: string, payload: EventPayload = {}): void {
  const set = handlers.get(name);
  if (!set) return;
  for (const h of set) {
    try { h(payload); } catch (e) { console.error(`[event-bus] handler error for ${name}:`, e); }
  }
}

export function onEvent(name: string, handler: Handler): () => void {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)!.add(handler);
  return () => { handlers.get(name)?.delete(handler); };
}
