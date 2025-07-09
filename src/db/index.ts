// src/db/index.ts
import mysql from 'mysql2/promise';
import { DBConfig } from '../types';
import Logger from '../utils/index';

/**
 * Clase DBManager que maneja la conexión a la base de datos
 */
export class DBManager {
  private config: DBConfig;
  private logger: Logger;
  private pool: mysql.Pool | null = null;

  constructor(config: DBConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new Logger();
  }

  /**
   * Obtiene o crea el pool de conexiones
   */
  async getPool(): Promise<mysql.Pool> {
    if (!this.pool) {
      this.logger.debug('Creating new database connection pool');
      
      try {
        this.pool = mysql.createPool({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: this.config.database,
          ssl: this.config.ssl ? { rejectUnauthorized: true } : undefined,
          socketPath: this.config.socketPath,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
        
        // Probar la conexión
        const connection = await this.pool.getConnection();
        connection.release();
        this.logger.info('Database connection established successfully');
      } catch (error) {
        this.logger.error('Error creating database connection pool:', error);
        throw new Error(`Failed to connect to database: ${(error as Error).message}`);
      }
    }
    
    return this.pool;
  }

  /**
   * Cierra la conexión al pool
   */
  async closePool(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
        this.logger.info('Database connection pool closed');
      } catch (error) {
        this.logger.error('Error closing database connection pool:', error);
        throw error;
      }
    }
  }

  /**
   * Ejecuta una consulta SQL
   * @param sql - Consulta SQL
   * @param params - Parámetros para la consulta
   * @returns Resultado de la consulta
   */
  async executeQuery(sql: string, params: any[] = []): Promise<any> {
    try {
      const pool = await this.getPool();
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (error) {
      this.logger.error('Error executing SQL query:', error);
      throw error;
    }
  }

  /**
   * Ejecuta una consulta SQL de solo lectura, validando primero
   * @param sql - Consulta SQL
   * @returns Resultado de la consulta
   */
  async executeReadOnlyQuery(sql: string): Promise<any[]> {
    try {
      // Validar que sea consulta de solo lectura
      const sqlLowerCase = sql.toLowerCase().trim();
      
      // Verificar si es una consulta de lectura
      if (!sqlLowerCase.startsWith('select') && 
          !sqlLowerCase.startsWith('show') && 
          !sqlLowerCase.startsWith('describe') &&
          !sqlLowerCase.startsWith('desc') &&
          !sqlLowerCase.startsWith('explain')) {
        throw new Error('Only SELECT, SHOW, DESCRIBE, and EXPLAIN queries are allowed in read-only mode');
      }
      
      // Ejecutar la consulta
      const result = await this.executeQuery(sql);
      return result;
    } catch (error) {
      this.logger.error('Error executing read-only query:', error);
      throw error;
    }
  }

  /**
   * Obtiene el esquema de la base de datos
   * @returns Esquema de la base de datos
   */
  async getDatabaseSchema(): Promise<Record<string, any>> {
    try {
      // Obtener todas las tablas
      const tables = await this.executeQuery(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
      );
      
      // Resultado para almacenar el esquema
      const schema: Record<string, any> = {};
      
      // Para cada tabla, obtener sus columnas
      for (const table of tables) {
        const tableName = table.table_name;
        const columns = await this.executeQuery(
          "SELECT column_name, data_type, column_key, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
          [tableName]
        );
        
        schema[tableName] = columns;
      }
      
      return schema;
    } catch (error) {
      this.logger.error('Error fetching database schema:', error);
      throw error;
    }
  }

  /**
   * Obtiene las columnas de una tabla específica
   * @param tableName - Nombre de la tabla
   * @returns Columnas de la tabla
   */
  async getTableColumns(tableName: string): Promise<any[]> {
    try {
      const columns = await this.executeQuery(
        "SELECT column_name, data_type, column_key, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
        [tableName]
      );
      
      return columns;
    } catch (error) {
      this.logger.error(`Error fetching columns for table ${tableName}:`, error);
      throw error;
    }
  }
}

export default DBManager;
