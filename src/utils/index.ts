// src/utils/index.ts
import fs from 'fs';
import path from 'path';
import { LogLevel } from '../types';

/**
 * Clase Logger que maneja diferentes niveles de log
 */
export class Logger {
  private level: LogLevel;
  private logDir: string;
  private enabled: boolean;

  constructor(level: LogLevel = 'info', logDir: string = './logs', enabled: boolean = true) {
    this.level = level;
    this.logDir = logDir;
    this.enabled = enabled && level !== 'none';
    if (this.enabled) {
      this.ensureDirectoryExists(this.logDir);
    }
  }

  /**
   * Configura el nivel de log
   */
  setLevel(level: LogLevel): void {
    this.level = level;
    this.enabled = this.enabled && level !== 'none';
  }

  /**
   * Habilita o deshabilita los logs
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled && this.level !== 'none';
  }

  /**
   * Configura el directorio de logs
   */
  setLogDirectory(dir: string): void {
    this.logDir = dir;
    if (this.enabled) {
      this.ensureDirectoryExists(this.logDir);
    }
  }

  /**
   * Registra un mensaje de error
   */
  error(message: string, data?: any): void {
    if (this.enabled && this.level !== 'none') {
      this.log('error', message, data);
    }
  }

  /**
   * Registra un mensaje de advertencia
   */
  warn(message: string, data?: any): void {
    if (this.enabled && ['error', 'warn', 'info', 'debug'].includes(this.level)) {
      this.log('warn', message, data);
    }
  }

  /**
   * Registra un mensaje informativo
   */
  info(message: string, data?: any): void {
    if (this.enabled && ['info', 'debug'].includes(this.level)) {
      this.log('info', message, data);
    }
  }

  /**
   * Registra un mensaje de depuración
   */
  debug(message: string, data?: any): void {
    if (this.enabled && this.level === 'debug') {
      this.log('debug', message, data);
    }
  }

  /**
   * Función interna de log
   */
  private log(level: LogLevel, message: string, data: any = ''): void {
    const date = new Date().toISOString();
    const colorMap: Record<string, string> = {
      info: '\x1b[36m', // cyan
      error: '\x1b[31m', // red
      warn: '\x1b[33m', // yellow
      debug: '\x1b[35m' // purple
    };
    const resetColor = '\x1b[0m';
    const color = colorMap[level] || '';
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
    
    const logMessage = `[${date}] [${level.toUpperCase()}] ${message} ${dataStr}`;
    console.log(`${color}${logMessage}${resetColor}`);
    
    try {
      const logFile = path.join(this.logDir, `${level}.log`);
      fs.appendFileSync(logFile, `${logMessage}\n`);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  /**
   * Asegura que exista un directorio
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Registra el uso de tokens en un archivo de log
   */
  logTokenUsage(
    requestId: string,
    operation: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    model: string
  ): void {
    if (!this.enabled) return;
    
    try {
      const logFile = path.join(this.logDir, 'token_usage.log');
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp}|${requestId}|${operation}|${promptTokens}|${completionTokens}|${totalTokens}|${model}\n`;
      
      fs.appendFileSync(logFile, logEntry);
      this.debug('Token usage logged', { requestId, operation, totalTokens });
    } catch (error) {
      this.error('Error logging token usage:', error);
    }
  }

  /**
   * Registra prompts y respuestas para análisis
   */
  logPromptAndResponse(
    requestId: string,
    operation: string,
    prompt: string,
    response: string,
    success: boolean,
    attempt: number = 1,
    model: string = 'unknown'
  ): void {
    if (!this.enabled) return;
    
    try {
      // Log resumido
      const logFile = path.join(this.logDir, 'prompts_responses.log');
      const timestamp = new Date().toISOString();
      const status = success ? 'SUCCESS' : 'FAILURE';
      const logEntry = `${timestamp}|${requestId}|${operation}|${status}|${attempt}|${model}\n`;
      
      fs.appendFileSync(logFile, logEntry);
      
      // Log detallado en archivos JSON separados
      const detailsDir = path.join(this.logDir, 'details');
      this.ensureDirectoryExists(detailsDir);
      
      const detailFile = path.join(detailsDir, `${requestId}_${operation}_${attempt}.json`);
      const detailData = {
        timestamp,
        requestId,
        operation,
        success,
        attempt,
        model,
        prompt,
        response
      };
      
      fs.writeFileSync(detailFile, JSON.stringify(detailData, null, 2));
      this.debug('Prompt and response logged', { requestId, operation, success });
    } catch (error) {
      this.error('Error logging prompt and response:', error);
    }
  }
}

/**
 * Cuenta tokens en un texto (estimación simple)
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  // Una estimación simple: cada 4 caracteres es aproximadamente un token
  return Math.ceil(text.length / 4);
}

export default Logger;
