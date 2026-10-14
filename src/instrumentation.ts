/**
 * Next uruchamia `register()` raz przy starcie serwera.
 * Tędy wchodzi harmonogram codziennej synchronizacji.
 */
export async function register(): Promise<void> {
  // Instrumentacja odpala sie takze w srodowisku brzegowym, gdzie nie ma
  // dostepu do dysku ani bazy - tam nie ma czego uruchamiac.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Import dynamiczny: moduly bazy nie moga trafic do pakietu brzegowego.
  const { startScheduler } = await import("./lib/scheduler.ts");
  startScheduler();
}
