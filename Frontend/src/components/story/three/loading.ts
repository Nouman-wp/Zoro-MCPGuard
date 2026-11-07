/**
 * Real loading progress for the preloader: each task reports when it is actually done (fonts ready, the WebGL code
 * chunk loaded, the first frame of the hero scene drawn). No timers pretending to load.
 */
type Listener = (p: number) => void;

const TASKS = { fonts: 1, three: 2, frame: 1 } as const;
export type Task = keyof typeof TASKS;

const done = new Set<Task>();
const listeners = new Set<Listener>();
const total = Object.values(TASKS).reduce((a, b) => a + b, 0);

export const progress = () => [...done].reduce((a, t) => a + TASKS[t], 0) / total;

export function complete(task: Task) {
  if (done.has(task)) return;
  done.add(task);
  const p = progress();
  listeners.forEach((l) => l(p));
}

export function onProgress(l: Listener) {
  listeners.add(l);
  l(progress());
  return () => void listeners.delete(l);
}
