/**
 * Sistema de cache en memoria para consultas SQL
 * Optimiza el rendimiento almacenando resultados de consultas frecuentes
 */

export interface CacheEntry {
  sql: string;
  results: any[];
  naturalResponse: string;
  timestamp: number;
  ttl: number;
  language: string;
  executionTime: number;
}

export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number; // en bytes aproximados
  oldestEntry: number;
  newestEntry: number;
}

export class MemoryCache {
  private static instance: MemoryCache;
  private cache = new Map<string, CacheEntry>();
  private stats = { hits: 0, misses: 0 };
  private maxSize: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private enabled: boolean;

  private constructor(maxSize = 1000, cleanupIntervalMs = 300000) {
    this.maxSize = maxSize;
    this.enabled = true;
    
    // Cleanup automático cada 5 minutos por defecto
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    }
  }

  /**
   * Obtiene la instancia singleton del cache
   */
  static getInstance(maxSize = 1000, cleanupIntervalMs = 300000): MemoryCache {
    if (!MemoryCache.instance) {
      MemoryCache.instance = new MemoryCache(maxSize, cleanupIntervalMs);
    }
    return MemoryCache.instance;
  }

  /**
   * Genera una clave de cache normalizada
   */
  private generateKey(prompt: string, language: string, schemaHash: string): string {
    // Normalizar la consulta para mejorar hit rate
    const normalizedPrompt = prompt
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Múltiples espacios → un espacio
      .replace(/[¿?¡!\.]/g, '') // Remover signos de puntuación
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE') // Normalizar fechas
      .replace(/\d+/g, 'NUM'); // Normalizar números
    
    return `${this.hashString(normalizedPrompt)}_${language}_${schemaHash}`;
  }

  /**
   * Genera un hash simple para strings
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Determina el TTL basado en el tipo de consulta SQL
   */
  private getTTLByQueryType(sql: string): number {
    const upperSQL = sql.toUpperCase();
    
    // Consultas de esquema y metadatos → 1 hora
    if (upperSQL.includes('SHOW TABLES') || 
        upperSQL.includes('DESCRIBE') || 
        upperSQL.includes('INFORMATION_SCHEMA')) {
      return 3600000; // 1 hora
    }
    
    // Consultas agregadas y reportes → 15 minutos
    if (upperSQL.includes('COUNT(') || 
        upperSQL.includes('SUM(') || 
        upperSQL.includes('AVG(') ||
        upperSQL.includes('GROUP BY')) {
      return 900000; // 15 minutos
    }
    
    // Consultas simples → 5 minutos
    return 300000; // 5 minutos por defecto
  }

  /**
   * Obtiene una entrada del cache
   */
  get(prompt: string, language: string, schemaHash: string): CacheEntry | null {
    if (!this.enabled) return null;

    const key = this.generateKey(prompt, language, schemaHash);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verificar TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry;
  }

  /**
   * Almacena una entrada en el cache
   */
  set(prompt: string, language: string, schemaHash: string, sql: string, results: any[], naturalResponse: string, executionTime: number): void {
    if (!this.enabled) return;

    const key = this.generateKey(prompt, language, schemaHash);
    const ttl = this.getTTLByQueryType(sql);

    // Limpiar cache si está lleno
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    const entry: CacheEntry = {
      sql,
      results,
      naturalResponse,
      timestamp: Date.now(),
      ttl,
      language,
      executionTime
    };

    this.cache.set(key, entry);
  }

  /**
   * Elimina las entradas más antiguas cuando el cache está lleno
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Limpia entradas expiradas
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`[MemoryCache] Cleaned up ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Invalida entradas relacionadas con una tabla específica
   */
  invalidateByTable(tableName: string): number {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.sql.toLowerCase().includes(tableName.toLowerCase())) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    return keysToDelete.length;
  }

  /**
   * Obtiene estadísticas del cache
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const entries = Array.from(this.cache.values());
    
    return {
      totalEntries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : 0
    };
  }

  /**
   * Estima el uso de memoria del cache
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const entry of this.cache.values()) {
      // Estimación aproximada del tamaño en bytes
      totalSize += JSON.stringify(entry).length * 2; // 2 bytes por carácter en UTF-16
    }
    
    return totalSize;
  }

  /**
   * Limpia todo el cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Habilita o deshabilita el cache
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Verifica si el cache está habilitado
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Limpia los recursos del cache
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}
