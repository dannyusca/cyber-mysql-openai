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

// Configuración principal de CyberMySQLOpenAI
export interface CyberMySQLOpenAIConfig {
  database: DBConfig;
  openai: OpenAIConfig;
  maxReflections?: number;
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'none';
  logDirectory?: string;
  logEnabled?: boolean;
  language?: 'es' | 'en'; // Idioma para respuestas (español o inglés)
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
}

// Resultado de una ejecución SQL directa
export interface SQLResult {
  sql: string;
  results: any[];
  success: boolean;
  naturalResponse?: string;
  detailedResponse?: string;
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
}
