// src/types/index.ts

// Configuración de la base de datos
export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  socketPath?: string;
}

// Configuración de OpenAI
export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

// Configuración del sistema de cache
export interface CacheConfig {
  enabled?: boolean; // Habilitar/deshabilitar cache (default: true)
  maxSize?: number; // Máximo número de entradas (default: 1000)
  cleanupIntervalMs?: number; // Intervalo de limpieza en ms (default: 300000 = 5min)
}

// Configuración principal de CyberMySQLOpenAI
export interface CyberMySQLOpenAIConfig {
  database: DBConfig;
  openai: OpenAIConfig;
  maxReflections?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
  logDirectory?: string;
  logEnabled?: boolean;
  language?: 'es' | 'en'; // Idioma para respuestas (español o inglés)
  cache?: CacheConfig; // Configuración del sistema de cache
}

// Resultado de una traducción de lenguaje natural a SQL
export interface TranslationResult {
  sql: string;
  results: any[];
  reflections: Reflection[];
  attempts: number;
  success: boolean;
  naturalResponse?: string;
  detailedResponse?: string;
  executionTime?: number; // Tiempo de ejecución en ms
  fromCache?: boolean; // Indica si el resultado vino del cache
}

// Resultado de una ejecución SQL directa
export interface SQLResult {
  sql: string;
  results: any[];
  success: boolean;
  naturalResponse?: string;
  detailedResponse?: string;
  executionTime?: number; // Tiempo de ejecución en ms
  fromCache?: boolean; // Indica si el resultado vino del cache
}

// Reflexión del agente
export interface Reflection {
  error: string;
  reasoning: string;
  fixAttempt: string;
}

// Tipo de log
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'none';

// Opciones para generar respuestas naturales
export interface NaturalResponseOptions {
  detailed?: boolean;
  bypassCache?: boolean; // Opcional: ignorar cache y forzar nueva consulta
}

// Estadísticas del cache
export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}
