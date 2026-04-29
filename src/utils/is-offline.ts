export function isOffline(): boolean {
  const value = process.env.PI_OFFLINE;
  return value === "1" || value === "true" || value === "yes";
}
