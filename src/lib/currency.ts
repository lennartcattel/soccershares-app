export function useCurrency() {
  return {
    format: (n: number): string =>
      n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    formatInt: (n: number): string =>
      Math.round(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 }),
  }
}
