import bcrypt from 'bcryptjs'

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$2')) {
    return bcrypt.compare(plain, stored)
  }
  // Senha em texto puro — compatibilidade retroativa
  return plain === stored
}
