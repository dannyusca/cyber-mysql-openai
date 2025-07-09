// src/config/index.ts
import dotenv from 'dotenv';
import { OpenAIConfig, DBConfig, CyberMySQLOpenAIConfig } from '../types';

// Cargar variables de entorno si existen
dotenv.config();

// Versión de la librería
export const VERSION = '0.1.0';

// Configuración predeterminada de OpenAI
export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  model: process.env.OPENAI_MODEL || "gpt-4",
  apiKey: process.env.OPENAI_API_KEY || ""
};

// Configuración predeterminada de la base de datos
export const DEFAULT_DB_CONFIG: DBConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_DATABASE || "",
  ssl: process.env.DB_SSL === "true",
  socketPath: process.env.DB_SOCKET_PATH
};

// Valores predeterminados para la configuración
export const DEFAULT_MAX_REFLECTIONS = 3;
export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_LOG_DIRECTORY = './logs';
export const DEFAULT_LOG_ENABLED = true;

// Función para validar la configuración
export function validateConfig(config: Partial<CyberMySQLOpenAIConfig>): string[] {
  const errors: string[] = [];

  // Validar configuración de OpenAI
  if (!config.openai) {
    errors.push('Falta la configuración de OpenAI');
  } else {
    if (!config.openai.apiKey) {
      errors.push('Falta la clave API de OpenAI (openai.apiKey)');
    }
  }

  // Validar configuración de la base de datos
  if (!config.database) {
    errors.push('Falta la configuración de la base de datos');
  } else {
    if (!config.database.user) {
      errors.push('Falta el usuario de la base de datos (database.user)');
    }
    // La contraseña puede ser vacía en algunos casos, no validamos
    if (!(config.database.host || config.database.socketPath)) {
      errors.push('Debe especificar un host o socketPath para la base de datos');
    }
  }

  return errors;
}
