import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function withoutPassword<T extends { password: string }>(
  row: T,
): Omit<T, 'password'> {
  const { password, ...rest } = row;
  void password;
  return rest;
}
