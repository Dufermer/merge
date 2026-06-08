// auth_module.js — Модуль аутентификации и авторизации
// Используется для тестирования семантического поиска по коду

const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // импорт для примера

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

/**
 * handleUserLogin — Обрабатывает вход пользователя.
 * Проверяет учетные данные и возвращает JWT-токен.
 * 
 * @param {string} username - Имя пользователя
 * @param {string} password - Пароль (в открытом виде, хэшируется внутри)
 * @returns {object} { success: boolean, token: string|null, error: string|null }
 */
async function handleUserLogin(username, password) {
  try {
    // Валидация входных данных
    if (!username || !password) {
      return { success: false, token: null, error: 'Username and password are required' };
    }

    // Поиск пользователя в БД (заглушка)
    const user = await findUserByUsername(username);
    if (!user) {
      return { success: false, token: null, error: 'User not found' };
    }

    // Проверка пароля
    const isValid = await validatePassword(password, user.passwordHash);
    if (!isValid) {
      return { success: false, token: null, error: 'Invalid password' };
    }

    // Генерация JWT
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    return { success: true, token, error: null };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, token: null, error: 'Internal server error' };
  }
}

/**
 * validateToken — Проверяет валидность JWT-токена.
 * Возвращает декодированный payload или null.
 * 
 * @param {string} token - JWT-токен для проверки
 * @returns {object|null} Декодированный payload или null
 */
function validateToken(token) {
  try {
    if (!token) return null;
    
    // Проверка формата токена
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}

/**
 * generateToken — Генерирует JWT-токен для пользователя.
 * 
 * @param {object} payload - Данные для включения в токен
 * @returns {string} JWT-токен
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * authorizeRequest — Проверяет права доступа.
 * 
 * @param {object} user - Объект пользователя { id, role }
 * @param {string} requiredRole - Необходимая роль
 * @returns {boolean} Есть ли доступ
 */
function authorizeRequest(user, requiredRole) {
  if (!user || !user.role) return false;
  
  const roles = {
    admin: ['read', 'write', 'delete', 'admin'],
    editor: ['read', 'write'],
    viewer: ['read'],
  };

  const userPermissions = roles[user.role] || [];
  const requiredPermissions = roles[requiredRole] || [];

  return requiredPermissions.every(perm => userPermissions.includes(perm));
}

/**
 * DatabaseConnector — Класс для работы с БД пользователей.
 */
class DatabaseConnector {
  constructor(config) {
    this.host = config.host || 'localhost';
    this.port = config.port || 5432;
    this.database = config.database || 'users';
    this.connected = false;
  }

  async connect() {
    // Заглушка подключения
    this.connected = true;
    return { success: true };
  }

  async query(sql, params) {
    if (!this.connected) {
      throw new Error('Database not connected');
    }
    // Заглушка запроса
    return { rows: [], rowCount: 0 };
  }

  async disconnect() {
    this.connected = false;
    return { success: true };
  }
}

/**
 * hashPassword — Хэширует пароль с солью.
 * 
 * @param {string} password - Пароль в открытом виде
 * @returns {string} Хэш пароля
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Приватные вспомогательные функции

/**
 * findUserByUsername — Поиск пользователя по имени (заглушка).
 * @param {string} username
 * @returns {object|null}
 */
async function findUserByUsername(username) {
  // Заглушка: возвращаем тестового пользователя
  if (username === 'testuser') {
    return {
      id: 1,
      username: 'testuser',
      role: 'admin',
      passwordHash: hashPassword('testpass123'),
    };
  }
  return null;
}

/**
 * validatePassword — Проверка пароля (заглушка).
 * @param {string} password
 * @param {string} hash
 * @returns {boolean}
 */
async function validatePassword(password, hash) {
  const [salt, storedHash] = hash.split(':');
  const computedHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return computedHash === storedHash;
}

module.exports = {
  handleUserLogin,
  validateToken,
  generateToken,
  authorizeRequest,
  DatabaseConnector,
  hashPassword,
};
