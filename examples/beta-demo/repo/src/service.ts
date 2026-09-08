export function calculateTotal(items: number[]): number {
  return items.reduce((sum, value) => sum + value, 0);
}

export function formatTotal(total: number): string {
  return `$${total.toFixed(2)}`;
}
