// src/utils/queryHistory.ts

import { TokenUsage } from "../types";

/**
 * Registro de una ejecución de consulta
 */
export interface QueryRecord {
  id: string;
  timestamp: Date;
  naturalQuery: string;
  generatedSQL: string;
  confidence?: number;
  success: boolean;
  executionTime: number;
  fromCache: boolean;
  tokenUsage?: TokenUsage;
  error?: string;
}

/**
 * Administrador de historial de consultas en memoria.
 * Almacena un registro rotativo de ejecuciones para depuración y análisis.
 */
export class QueryHistory {
  private history: QueryRecord[] = [];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Agrega un registro de consulta al historial
   */
  addRecord(record: QueryRecord): void {
    this.history.push(record);

    // Recortar al tamaño máximo (eliminar las entradas más antiguas)
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(this.history.length - this.maxSize);
    }
  }

  /**
   * Obtiene el historial de consultas, opcionalmente limitado a las últimas N entradas
   */
  getHistory(limit?: number): QueryRecord[] {
    if (limit && limit > 0) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * Obtiene la última consulta ejecutada
   */
  getLastQuery(): QueryRecord | null {
    return this.history.length > 0
      ? this.history[this.history.length - 1]
      : null;
  }

  /**
   * Obtiene estadísticas sobre la ejecución de consultas
   */
  getStats(): {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageExecutionTime: number;
    cacheHitRate: number;
    totalTokensUsed: number;
  } {
    const total = this.history.length;
    if (total === 0) {
      return {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        averageExecutionTime: 0,
        cacheHitRate: 0,
        totalTokensUsed: 0,
      };
    }

    const successful = this.history.filter((r) => r.success).length;
    const cacheHits = this.history.filter((r) => r.fromCache).length;
    const totalExecTime = this.history.reduce(
      (sum, r) => sum + r.executionTime,
      0,
    );
    const totalTokens = this.history.reduce(
      (sum, r) => sum + (r.tokenUsage?.totalTokens || 0),
      0,
    );

    return {
      totalQueries: total,
      successfulQueries: successful,
      failedQueries: total - successful,
      averageExecutionTime: Math.round(totalExecTime / total),
      cacheHitRate: Math.round((cacheHits / total) * 100) / 100,
      totalTokensUsed: totalTokens,
    };
  }

  /**
   * Limpia el historial completo
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Exporta el historial como cadena JSON
   */
  exportHistory(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        stats: this.getStats(),
        queries: this.history,
      },
      null,
      2,
    );
  }
}
