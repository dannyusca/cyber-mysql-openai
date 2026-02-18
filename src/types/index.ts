// src/types/index.ts

// Contexto de negocio para una tabla
export interface TableContext {
  description?: string; // Descripción de la tabla en lenguaje de negocio
  columns?: Record<string, string>; // column_name → descripción de negocio
}

// Par de ejemplo pregunta/SQL para few-shot learning
export interface QueryExample {
  question: string; // Pregunta en lenguaje natural
  sql: string; // Consulta SQL correspondiente
}

// Contexto completo del schema para mejorar precisión
export interface SchemaContext {
  businessDescription?: string; // Descripción general de la base de datos
  tables?: Record<string, TableContext>; // Metadata de negocio por tabla
  examples?: QueryExample[]; // Ejemplos de consultas (máximo ~10 recomendado)
  customInstructions?: string[]; // Reglas adicionales del usuario para el prompt
  responseStyle?: "concise" | "detailed" | "technical"; // Estilo de respuesta preferido
}

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
  context?: SchemaContext; // Contexto de negocio para mejorar precisión
  maxReflections?: number;
  logLevel?: "error" | "warn" | "info" | "debug" | "none";
  logDirectory?: string;
  logEnabled?: boolean;
  language?: "es" | "en"; // Idioma para respuestas (español o inglés)
  cache?: CacheConfig; // Configuración del sistema de cache
  schemaTTL?: number; // TTL del cache de schema en ms (default: 300000 = 5min)
}

// Uso de tokens de OpenAI
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number; // Costo estimado en USD
}

// Resultado de una traducción de lenguaje natural a SQL
export interface TranslationResult {
  sql: string;
  results: any[];
  reflections: Reflection[];
  attempts: number;
  success: boolean;
  confidence?: number; // Nivel de confianza del modelo (0-1), disponible con function calling
  naturalResponse?: string;
  detailedResponse?: string;
  executionTime?: number; // Tiempo de ejecución en ms
  fromCache?: boolean; // Indica si el resultado vino del cache
  tokenUsage?: TokenUsage; // Uso de tokens de OpenAI
}

// Resultado de validación de query
export interface ValidationResult {
  valid: boolean;
  warnings: string[]; // No bloquean ejecución
  errors: string[]; // Bloquean ejecución
  suggestions: string[]; // Mejoras sugeridas
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
export type LogLevel = "error" | "warn" | "info" | "debug" | "none";

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
