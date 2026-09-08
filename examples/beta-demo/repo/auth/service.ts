export function isAllowed(role: string): boolean {
  return role === "admin";
}

export function redactUserId(userId: string): string {
  return `${userId.slice(0, 2)}***`;
}
