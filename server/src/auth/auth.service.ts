import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { createUser, findUserByUsername } from '../database/database';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export interface AuthSuccess {
  success: true;
  token: string;
  username: string;
}

export interface AuthFailure {
  success: false;
  error: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

export interface TokenPayload {
  username: string;
}

function validateCredentials(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return 'username deve ter 3-32 caracteres alfanuméricos (._- permitidos)';
  }
  if (typeof password !== 'string' || password.length < 6) {
    return 'password deve ter pelo menos 6 caracteres';
  }
  return null;
}

export async function register(username: string, password: string): Promise<AuthResult> {
  const validationError = validateCredentials(username, password);
  if (validationError) return { success: false, error: validationError };

  const existing = await findUserByUsername(username);
  if (existing) return { success: false, error: 'username já está em uso' };

  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(username, hash);
  const token = signToken({ username: user.username });
  return { success: true, token, username: user.username };
}

export async function login(username: string, password: string): Promise<AuthResult> {
  const user = await findUserByUsername(username);
  if (!user) return { success: false, error: 'credenciais inválidas' };

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) return { success: false, error: 'credenciais inválidas' };

  const token = signToken({ username: user.username });
  return { success: true, token, username: user.username };
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  } catch {
    return null;
  }
}
