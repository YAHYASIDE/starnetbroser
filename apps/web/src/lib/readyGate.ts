/**
 * A one-shot async gate: whenReady() never resolves until markReady() has been called at least
 * once, however many times whenReady() itself is called before or after that. Framework-free and
 * directly testable on its own, deliberately decoupled from React's render/effect timing - the
 * bug it exists to prevent (see HomeView's Stage-1 sync listener) is that a native pending-sync
 * drain could start reading `accounts` before the initial account load (demo-from-localStorage or
 * real-from-API) has actually landed, silently treating a real account like "mounay" as
 * nonexistent and discarding its sync result - and no amount of React effect-ordering care
 * fully rules that out, since the drain's own native round-trip latency is unpredictable.
 */
export interface ReadyGate {
  /** Resolves once markReady() has been called - awaited before an operation may proceed. */
  whenReady(): Promise<void>;
  /** Idempotent - safe to call more than once (e.g. on every retry of the operation being gated). */
  markReady(): void;
  readonly isReady: boolean;
}

export function createReadyGate(): ReadyGate {
  let ready = false;
  let resolveReady: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  return {
    whenReady: () => promise,
    markReady: () => {
      if (ready) return;
      ready = true;
      resolveReady();
    },
    get isReady() {
      return ready;
    },
  };
}
