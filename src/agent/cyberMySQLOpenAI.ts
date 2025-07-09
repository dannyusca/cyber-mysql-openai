// src/agent/cyberMySQLOpenAI.ts
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { 
  CyberMySQLOpenAIConfig, 
  TranslationResult, 
  SQLResult,
  NaturalResponseOptions
} from '../types';
import { 
  DEFAULT_OPENAI_CONFIG, 
  DEFAULT_DB_CONFIG,
  DEFAULT_MAX_REFLECTIONS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_DIRECTORY,
  DEFAULT_LOG_ENABLED,
  validateConfig
} from '../config';
import Logger from '../utils';
import { cleanSqlResponse } from '../utils/sqlCleaner';
import { ResponseFormatter } from '../utils/responseFormatter';
import { DBManager } from '../db';
import { I18n, SupportedLanguage } from '../utils/i18n';

/**
 * Clase principal que proporciona la funcionalidad para traducir
 * lenguaje natural a SQL y ejecutar consultas
 */
export class CyberMySQLOpenAI {
  private openai: OpenAI;
  private dbManager: DBManager;
  private logger: Logger;
  private responseFormatter: ResponseFormatter;
  private maxReflections: number;
  private openaiModel: string;
  private i18n: I18n;

  /**
   * Constructor de la clase CyberMySQLOpenAI
   * @param config - Configuración de la librería
   */
  constructor(config: Partial<CyberMySQLOpenAIConfig> = {}) {
    // Validar configuración
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }

    // Configurar el logger
    this.logger = new Logger(
      config.logLevel || DEFAULT_LOG_LEVEL,
      config.logDirectory || DEFAULT_LOG_DIRECTORY,
      config.logEnabled !== undefined ? config.logEnabled : DEFAULT_LOG_ENABLED
    );

    // Inicializar i18n
    this.i18n = new I18n(config.language || 'en');

    // Inicializar la configuración
    const openaiConfig = {
      ...DEFAULT_OPENAI_CONFIG,
      ...config.openai
    };

    const dbConfig = {
      ...DEFAULT_DB_CONFIG,
      ...config.database
    };

    // Inicializar componentes
    this.openai = new OpenAI({
      apiKey: openaiConfig.apiKey,
    });
    
    this.openaiModel = openaiConfig.model;
    this.maxReflections = config.maxReflections || DEFAULT_MAX_REFLECTIONS;
    this.dbManager = new DBManager(dbConfig, this.logger);
    this.responseFormatter = new ResponseFormatter(
      openaiConfig.apiKey,
      openaiConfig.model,
      config.language || 'en',
      this.logger
    );

    this.logger.info('CyberMySQLOpenAI initialized successfully', {
      model: this.openaiModel,
      maxReflections: this.maxReflections,
      language: this.i18n.getLanguage()
    });
  }

  /**
   * Procesa una consulta en lenguaje natural, la traduce a SQL y la ejecuta
   * @param prompt - Consulta en lenguaje natural
   * @param options - Opciones adicionales
   * @returns Resultado de la consulta
   */
  async query(
    prompt: string, 
    options: NaturalResponseOptions = {}
  ): Promise<TranslationResult> {
    const requestId = uuidv4();
    
    try {
      this.logger.info('Processing natural language query', { prompt });
      
      // Paso 1: Obtener el esquema de la base de datos
      const schema = await this.dbManager.getDatabaseSchema();
      
      // Paso 2: Generar SQL a partir del lenguaje natural
      let sql = await this.generateSQL(prompt, schema, requestId);
      
      // Limpiar la consulta SQL generada
      sql = cleanSqlResponse(sql, 'generate', this.logger);
      
      // Paso 3: Ejecutar la consulta SQL
      let results;
      let reflections = [];
      let attempts = 0;
      let success = false;
      
      try {
        results = await this.dbManager.executeReadOnlyQuery(sql);
        success = true;
      } catch (error) {
        // Si falla, intentar reflexionar y corregir
        this.logger.warn('Error executing SQL, attempting to reflect and fix', { error: (error as Error).message });
        
        const reflectionResult = await this.reflectAndFix(
          prompt, 
          sql, 
          (error as Error).message, 
          schema, 
          requestId
        );
        
        sql = reflectionResult.sql;
        reflections = reflectionResult.reflections;
        attempts = reflectionResult.attempts;
        
        if (reflectionResult.success) {
          results = reflectionResult.results;
          success = true;
        } else {
          results = [];
          this.logger.error('Failed to execute query after reflection', { attempts });
        }
      }
      
      // Paso 4: Generar respuesta en lenguaje natural
      let naturalResponse = this.responseFormatter.generateSimpleResponse(sql, results);
      
      if (!naturalResponse) {
        naturalResponse = await this.responseFormatter.generateNaturalResponse(
          sql, 
          results, 
          { detailed: false }
        );
      }
      
      // Generar respuesta detallada si se solicita
      let detailedResponse;
      if (options.detailed) {
        try {
          detailedResponse = await this.responseFormatter.generateNaturalResponse(
            sql, 
            results, 
            { detailed: true }
          );
        } catch (error) {
          this.logger.error('Error generating detailed response', { error: (error as Error).message });
          detailedResponse = "No se pudo generar la respuesta detallada.";
        }
      }
      
      // Paso 5: Devolver resultado
      const result: TranslationResult = {
        sql,
        results,
        reflections,
        attempts,
        success,
        naturalResponse
      };
      
      if (detailedResponse) {
        result.detailedResponse = detailedResponse;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error processing query', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Ejecuta una consulta SQL directamente
   * @param sql - Consulta SQL
   * @param options - Opciones adicionales
   * @returns Resultado de la consulta
   */
  async executeSQL(
    sql: string, 
    options: NaturalResponseOptions = {}
  ): Promise<SQLResult> {
    try {
      this.logger.info('Executing SQL query directly', { sql });
      
      // Limpiar la consulta SQL
      const cleanedSql = cleanSqlResponse(sql, 'direct', this.logger);
      
      // Ejecutar la consulta
      const results = await this.dbManager.executeReadOnlyQuery(cleanedSql);
      
      // Generar respuesta en lenguaje natural
      let naturalResponse = this.responseFormatter.generateSimpleResponse(cleanedSql, results);
      
      if (!naturalResponse) {
        naturalResponse = await this.responseFormatter.generateNaturalResponse(
          cleanedSql, 
          results, 
          { detailed: false }
        );
      }
      
      // Generar respuesta detallada si se solicita
      let detailedResponse;
      if (options.detailed) {
        try {
          detailedResponse = await this.responseFormatter.generateNaturalResponse(
            cleanedSql, 
            results, 
            { detailed: true }
          );
        } catch (error) {
          this.logger.error('Error generating detailed response', { error: (error as Error).message });
          detailedResponse = "No se pudo generar la respuesta detallada.";
        }
      }
      
      // Devolver resultado
      const result: SQLResult = {
        sql: cleanedSql,
        results,
        success: true,
        naturalResponse
      };
      
      if (detailedResponse) {
        result.detailedResponse = detailedResponse;
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error executing SQL query', { error: (error as Error).message });
      
      return {
        sql,
        results: [],
        success: false,
        naturalResponse: `Error ejecutando la consulta: ${(error as Error).message}`
      };
    }
  }

  /**
   * Cierra la conexión a la base de datos
   */
  async close(): Promise<void> {
    await this.dbManager.closePool();
    this.logger.info('CyberMySQLOpenAI connections closed');
  }

  /**
   * Cambia el idioma de las respuestas
   * @param language - Idioma a establecer ('es' | 'en')
   */
  setLanguage(language: SupportedLanguage): void {
    this.i18n.setLanguage(language);
    this.responseFormatter.setLanguage(language);
    this.logger.info('Language changed', { language });
  }

  /**
   * Obtiene el idioma actual
   * @returns Idioma actual
   */
  getLanguage(): SupportedLanguage {
    return this.i18n.getLanguage();
  }

  /**
   * Genera SQL a partir de lenguaje natural usando OpenAI
   * @param prompt - Consulta en lenguaje natural
   * @param schema - Esquema de la base de datos
   * @param requestId - ID de la solicitud para logging
   * @returns Consulta SQL generada
   */
  private async generateSQL(
    prompt: string, 
    schema: Record<string, any>, 
    requestId: string
  ): Promise<string> {
    try {
      const tables = Object.keys(schema);
      const schemaDescription = tables.map(tableName => {
        const columns = schema[tableName];
        const columnDescriptions = columns.map((col: any) => 
          `${col.column_name} (${col.data_type}${col.column_key === 'PRI' ? ', PRIMARY KEY' : ''})`)
          .join(', ');
        
        return `Tabla ${tableName}: ${columnDescriptions}`;
      }).join('\n\n');
      
      // Usar el prompt localizado
      const systemPrompt = this.i18n.getMessageWithReplace('prompts', 'translateToSQL', {
        schema: schemaDescription,
        query: prompt
      });
      
      const response = await this.openai.chat.completions.create({
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ]
      });
      
      const sql = response.choices[0]?.message?.content?.trim() || '';
      
      // Registrar uso de tokens
      if (response.usage) {
        this.logger.logTokenUsage(
          requestId,
          'generate-sql',
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.usage.total_tokens,
          this.openaiModel
        );
      }
      
      this.logger.debug('SQL generated from prompt', { sql });
      return sql;
    } catch (error) {
      this.logger.error('Error generating SQL from prompt', { error: (error as Error).message });
      throw new Error(`Failed to generate SQL: ${(error as Error).message}`);
    }
  }

  /**
   * Intenta corregir una consulta SQL fallida mediante reflexión
   * @param prompt - Consulta original en lenguaje natural
   * @param sql - Consulta SQL que falló
   * @param errorMessage - Mensaje de error
   * @param schema - Esquema de la base de datos
   * @param requestId - ID de la solicitud para logging
   * @returns Resultado después de intentar corregir
   */
  private async reflectAndFix(
    prompt: string,
    sql: string,
    errorMessage: string,
    schema: Record<string, any>,
    requestId: string
  ): Promise<any> {
    const reflections = [];
    let attempts = 1;
    let currentSql = sql;
    let results = [];
    let success = false;
    
    while (attempts <= this.maxReflections && !success) {
      try {
        // Generar reflexión sobre el error
        const reflection = await this.generateReflection(
          prompt, 
          currentSql, 
          errorMessage, 
          schema, 
          requestId
        );
        
        // Limpiar la SQL corregida
        const correctedSql = cleanSqlResponse(reflection.fixedSql, 'reflect', this.logger);
        
        reflections.push({
          error: errorMessage,
          reasoning: reflection.reasoning,
          fixAttempt: correctedSql
        });
        
        // Intentar ejecutar la consulta corregida
        results = await this.dbManager.executeReadOnlyQuery(correctedSql);
        success = true;
        currentSql = correctedSql;
        
        this.logger.info('Query fixed successfully on attempt', { attempt: attempts });
      } catch (error) {
        attempts++;
        errorMessage = (error as Error).message;
        
        this.logger.warn('Reflection attempt failed', { 
          attempt: attempts, 
          error: errorMessage 
        });
        
        if (attempts > this.maxReflections) {
          this.logger.error('Max reflection attempts reached', { maxReflections: this.maxReflections });
          break;
        }
      }
    }
    
    return {
      sql: currentSql,
      reflections,
      attempts,
      results,
      success
    };
  }

  /**
   * Genera una reflexión sobre un error en una consulta SQL
   * @param prompt - Consulta original en lenguaje natural
   * @param sql - Consulta SQL que falló
   * @param errorMessage - Mensaje de error
   * @param schema - Esquema de la base de datos
   * @param requestId - ID de la solicitud para logging
   * @returns Reflexión y SQL corregido
   */
  private async generateReflection(
    prompt: string,
    sql: string,
    errorMessage: string,
    schema: Record<string, any>,
    requestId: string
  ): Promise<{ reasoning: string; fixedSql: string }> {
    try {
      const tables = Object.keys(schema);
      const schemaDescription = tables.map(tableName => {
        const columns = schema[tableName];
        const columnDescriptions = columns.map((col: any) => 
          `${col.column_name} (${col.data_type}${col.column_key === 'PRI' ? ', PRIMARY KEY' : ''})`)
          .join(', ');
        
        return `Tabla ${tableName}: ${columnDescriptions}`;
      }).join('\n\n');
      
      // Usar el prompt localizado para corregir errores SQL
      const systemPrompt = this.i18n.getMessageWithReplace('prompts', 'fixSQLError', {
        error: errorMessage,
        sql: sql,
        schema: schemaDescription
      });
      
      const response = await this.openai.chat.completions.create({
        model: this.openaiModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `
Consulta original en lenguaje natural: ${prompt}

Consulta SQL que falló:
${sql}

Error recibido:
${errorMessage}

Por favor, analiza el error y corrige la consulta SQL.
` }
        ]
      });
      
      const content = response.choices[0]?.message?.content?.trim() || '';
      
      // Registrar uso de tokens
      if (response.usage) {
        this.logger.logTokenUsage(
          requestId,
          'reflect-fix',
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.usage.total_tokens,
          this.openaiModel
        );
      }
      
      // Extraer el razonamiento y la SQL corregida
      const reasoningMatch = content.match(/RAZONAMIENTO:([\s\S]*?)SQL CORREGIDO:/i);
      const sqlMatch = content.match(/SQL CORREGIDO:([\s\S]*)/i);
      
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No se proporcionó razonamiento';
      const fixedSql = sqlMatch ? sqlMatch[1].trim() : content;
      
      this.logger.debug('Generated reflection', { reasoning, fixedSql });
      
      return {
        reasoning,
        fixedSql
      };
    } catch (error) {
      this.logger.error('Error generating reflection', { error: (error as Error).message });
      throw new Error(`Failed to generate reflection: ${(error as Error).message}`);
    }
  }
}

export default CyberMySQLOpenAI;
