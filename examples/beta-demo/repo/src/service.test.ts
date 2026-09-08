import { calculateTotal, formatTotal } from "./service";

export function testCalculateTotal(): void {
  if (calculateTotal([1, 2, 3]) !== 6) {
    throw new Error("calculateTotal failed");
  }
}

export function testFormatTotal(): void {
  if (formatTotal(3) !== "$3.00") {
    throw new Error("formatTotal failed");
  }
}
