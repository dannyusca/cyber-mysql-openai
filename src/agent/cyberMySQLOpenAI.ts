// src/agent/cyberMySQLOpenAI.ts
import { OpenAI } from "openai";
import { v4 as uuidv4 } from "uuid";
import {
  CyberMySQLOpenAIConfig,
  TranslationResult,
  SQLResult,
  NaturalResponseOptions,
  CacheStats,
  SchemaContext,
} from "../types";
import {
  DEFAULT_OPENAI_CONFIG,
  DEFAULT_DB_CONFIG,
  DEFAULT_MAX_REFLECTIONS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_LOG_DIRECTORY,
  DEFAULT_LOG_ENABLED,
  validateConfig,
} from "../config";
import Logger from "../utils";
import { cleanSqlResponse } from "../utils/sqlCleaner";
import { ResponseFormatter } from "../utils/responseFormatter";
import { DBManager } from "../db";
import { I18n, SupportedLanguage } from "../utils/i18n";
import { MemoryCache } from "../cache/memoryCache";

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
  private cache: MemoryCache | null = null;
  private cacheEnabled: boolean;
  private schemaContext: SchemaContext | undefined;

  /**
   * Constructor de la clase CyberMySQLOpenAI
   * @param config - Configuración de la librería
   */
  constructor(config: Partial<CyberMySQLOpenAIConfig> = {}) {
    // Validar configuración
    const errors = validateConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid configuration: ${errors.join(", ")}`);
    }

    // Configurar el logger
    this.logger = new Logger(
      config.logLevel || DEFAULT_LOG_LEVEL,
      config.logDirectory || DEFAULT_LOG_DIRECTORY,
      config.logEnabled !== undefined ? config.logEnabled : DEFAULT_LOG_ENABLED,
    );

    // Inicializar i18n
    this.i18n = new I18n(config.language || "en");

    // Inicializar la configuración
    const openaiConfig = {
      ...DEFAULT_OPENAI_CONFIG,
      ...config.openai,
    };

    const dbConfig = {
      ...DEFAULT_DB_CONFIG,
      ...config.database,
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
      config.language || "en",
      this.logger,
    );

    // Inicializar sistema de cache
    this.cacheEnabled = config.cache?.enabled !== false; // Por defecto habilitado
    if (this.cacheEnabled) {
      this.cache = MemoryCache.getInstance(
        config.cache?.maxSize || 1000,
        config.cache?.cleanupIntervalMs || 300000,
      );
      this.logger.info("Memory cache enabled", {
        maxSize: config.cache?.maxSize || 1000,
        cleanupInterval: config.cache?.cleanupIntervalMs || 300000,
      });
    } else {
      this.logger.info("Memory cache disabled");
    }

    // Almacenar contexto de negocio
    this.schemaContext = config.context;

    this.logger.info("CyberMySQLOpenAI initialized successfully", {
      model: this.openaiModel,
      maxReflections: this.maxReflections,
      language: this.i18n.getLanguage(),
      cacheEnabled: this.cacheEnabled,
      hasContext: !!config.context,
      hasExamples: !!config.context?.examples?.length,
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
    options: NaturalResponseOptions = {},
  ): Promise<TranslationResult> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      this.logger.info("Processing natural language query", { prompt });

      // Paso 1: Obtener el esquema de la base de datos
      const schema = await this.dbManager.getDatabaseSchema();
      const schemaHash = this.generateSchemaHash(schema);

      // Paso 2: Intentar obtener resultado del cache
      if (this.cache && this.cacheEnabled && !options.bypassCache) {
        const cachedResult = this.cache.get(
          prompt,
          this.i18n.getLanguage(),
          schemaHash,
        );

        if (cachedResult) {
          const executionTime = Date.now() - startTime;
          this.logger.info(
            `🎯 Cache HIT for query: ${prompt.substring(0, 50)}...`,
            {
              executionTime: `${executionTime}ms`,
              originalExecutionTime: `${cachedResult.executionTime}ms`,
            },
          );

          return {
            sql: cachedResult.sql,
            results: cachedResult.results,
            reflections: [],
            attempts: 0,
            success: true,
            naturalResponse: cachedResult.naturalResponse,
            executionTime,
            fromCache: true,
          };
        }

        this.logger.info(
          `💫 Cache MISS for query: ${prompt.substring(0, 50)}...`,
        );
      }

      // Paso 3: Generar SQL a partir del lenguaje natural
      const generateResult = await this.generateSQL(prompt, schema, requestId);
      let sql = generateResult.sql;
      const confidence = generateResult.confidence;

      // Paso 4: Ejecutar la consulta SQL
      let results;
      let reflections = [];
      let attempts = 0;
      let success = false;

      try {
        results = await this.dbManager.executeReadOnlyQuery(sql);
        success = true;
      } catch (error) {
        // Si falla, intentar reflexionar y corregir
        this.logger.warn("Error executing SQL, attempting to reflect and fix", {
          error: (error as Error).message,
        });

        const reflectionResult = await this.reflectAndFix(
          prompt,
          sql,
          (error as Error).message,
          schema,
          requestId,
        );

        sql = reflectionResult.sql;
        reflections = reflectionResult.reflections;
        attempts = reflectionResult.attempts;

        if (reflectionResult.success) {
          results = reflectionResult.results;
          success = true;
        } else {
          results = [];
          this.logger.error("Failed to execute query after reflection", {
            attempts,
          });
        }
      }

      // Paso 5: Generar respuesta en lenguaje natural
      let naturalResponse = this.responseFormatter.generateSimpleResponse(
        sql,
        results,
      );

      if (!naturalResponse) {
        naturalResponse = await this.responseFormatter.generateNaturalResponse(
          sql,
          results,
          { detailed: false },
        );
      }

      // Generar respuesta detallada si se solicita
      let detailedResponse;
      if (options.detailed) {
        try {
          detailedResponse =
            await this.responseFormatter.generateNaturalResponse(sql, results, {
              detailed: true,
            });
        } catch (error) {
          this.logger.error("Error generating detailed response", {
            error: (error as Error).message,
          });
          detailedResponse = "No se pudo generar la respuesta detallada.";
        }
      }

      const executionTime = Date.now() - startTime;

      // Paso 6: Guardar en cache si fue exitoso
      if (this.cache && this.cacheEnabled && success && naturalResponse) {
        this.cache.set(
          prompt,
          this.i18n.getLanguage(),
          schemaHash,
          sql,
          results,
          naturalResponse,
          executionTime,
        );
        this.logger.info("Result cached successfully");
      }

      // Paso 7: Devolver resultado
      const result: TranslationResult = {
        sql,
        results,
        reflections,
        attempts,
        success,
        confidence,
        naturalResponse,
        executionTime,
        fromCache: false,
      };

      if (detailedResponse) {
        result.detailedResponse = detailedResponse;
      }

      return result;
    } catch (error) {
      this.logger.error("Error processing query", {
        error: (error as Error).message,
      });
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
    options: NaturalResponseOptions = {},
  ): Promise<SQLResult> {
    const startTime = Date.now();

    try {
      this.logger.info("Executing SQL query directly", { sql });

      // Limpiar la consulta SQL
      const cleanedSql = cleanSqlResponse(sql, "direct", this.logger);

      // Ejecutar la consulta
      const results = await this.dbManager.executeReadOnlyQuery(cleanedSql);

      // Generar respuesta en lenguaje natural
      let naturalResponse = this.responseFormatter.generateSimpleResponse(
        cleanedSql,
        results,
      );

      if (!naturalResponse) {
        naturalResponse = await this.responseFormatter.generateNaturalResponse(
          cleanedSql,
          results,
          { detailed: false },
        );
      }

      // Generar respuesta detallada si se solicita
      let detailedResponse;
      if (options.detailed) {
        try {
          detailedResponse =
            await this.responseFormatter.generateNaturalResponse(
              cleanedSql,
              results,
              { detailed: true },
            );
        } catch (error) {
          this.logger.error("Error generating detailed response", {
            error: (error as Error).message,
          });
          detailedResponse = "No se pudo generar la respuesta detallada.";
        }
      }

      const executionTime = Date.now() - startTime;

      // Devolver resultado
      const result: SQLResult = {
        sql: cleanedSql,
        results,
        success: true,
        naturalResponse,
        executionTime,
        fromCache: false,
      };

      if (detailedResponse) {
        result.detailedResponse = detailedResponse;
      }

      return result;
    } catch (error) {
      this.logger.error("Error executing SQL query", {
        error: (error as Error).message,
      });

      return {
        sql,
        results: [],
        success: false,
        naturalResponse: `Error ejecutando la consulta: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Cierra la conexión a la base de datos
   */
  async close(): Promise<void> {
    await this.dbManager.closePool();
    this.logger.info("CyberMySQLOpenAI connections closed");
  }

  /**
   * Cambia el idioma de las respuestas
   * @param language - Idioma a establecer ('es' | 'en')
   */
  setLanguage(language: SupportedLanguage): void {
    this.i18n.setLanguage(language);
    this.responseFormatter.setLanguage(language);
    this.logger.info("Language changed", { language });
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
   * Intenta usar function calling para respuestas estructuradas;
   * si el modelo no lo soporta, cae al modo texto con sqlCleaner.
   */
  private async generateSQL(
    prompt: string,
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
    requestId: string,
  ): Promise<{ sql: string; confidence?: number }> {
    try {
      const schemaDescription = this.buildSchemaDescription(schema);

      // Construir secciones opcionales del prompt
      const businessContext = this.schemaContext?.businessDescription
        ? `\nCONTEXTO DE NEGOCIO: ${this.schemaContext.businessDescription}\n`
        : "";

      const relationships = this.buildRelationshipsSection(schema);
      const examples = this.buildExamplesSection();

      const systemPrompt = this.i18n.getMessageWithReplace(
        "prompts",
        "translateToSQL",
        {
          schema: schemaDescription,
          query: prompt,
          businessContext,
          relationships,
          examples,
        },
      );

      // Intentar function calling (modo inteligente)
      try {
        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function" as const,
              function: {
                name: "execute_sql_query",
                description:
                  "Execute a SQL SELECT query against the MySQL database",
                parameters: {
                  type: "object",
                  properties: {
                    sql: {
                      type: "string",
                      description: "Valid MySQL SELECT query",
                    },
                    confidence: {
                      type: "number",
                      description:
                        "Confidence score from 0 to 1 that this query correctly answers the question",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Brief explanation of why this query answers the question",
                    },
                  },
                  required: ["sql", "confidence"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function" as const,
            function: { name: "execute_sql_query" },
          },
        });

        // Registrar uso de tokens
        if (response.usage) {
          this.logger.logTokenUsage(
            requestId,
            "generate-sql-fc",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            this.openaiModel,
          );
        }

        const toolCall = response.choices[0]?.message?.tool_calls?.[0];
        if (toolCall && toolCall.function?.arguments) {
          const args = JSON.parse(toolCall.function.arguments);
          this.logger.debug("SQL generated via function calling", {
            sql: args.sql,
            confidence: args.confidence,
            reasoning: args.reasoning,
          });
          return { sql: args.sql, confidence: args.confidence };
        }

        // Si no hay tool_calls, caer al contenido de mensaje
        throw new Error("No tool_calls in response");
      } catch (fcError) {
        // Fallback: modo texto (compatible con modelos antiguos)
        this.logger.debug(
          "Function calling not available, falling back to text mode",
          {
            error: (fcError as Error).message,
          },
        );

        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        });

        const sql = response.choices[0]?.message?.content?.trim() || "";

        if (response.usage) {
          this.logger.logTokenUsage(
            requestId,
            "generate-sql-text",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            this.openaiModel,
          );
        }

        // Limpiar con sqlCleaner en modo texto
        const cleanedSql = cleanSqlResponse(sql, "generate", this.logger);
        this.logger.debug("SQL generated via text mode (fallback)", {
          sql: cleanedSql,
        });
        return { sql: cleanedSql };
      }
    } catch (error) {
      this.logger.error("Error generating SQL from prompt", {
        error: (error as Error).message,
      });
      throw new Error(`Failed to generate SQL: ${(error as Error).message}`);
    }
  }

  /**
   * Construye la descripción del schema enriquecida con metadata de negocio
   */
  private buildSchemaDescription(
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
  ): string {
    const tables = Object.keys(schema);
    return tables
      .map((tableName) => {
        const tableData = schema[tableName];
        const tableContext = this.schemaContext?.tables?.[tableName];

        // Descripción de la tabla
        let description = `Tabla ${tableName}`;
        if (tableContext?.description) {
          description += ` (${tableContext.description})`;
        }
        description += ":";

        // Columnas con metadata de negocio
        const columnDescriptions = tableData.columns
          .map((col: any) => {
            let colDesc = `${col.column_name} (${col.data_type}${col.column_key === "PRI" ? ", PRIMARY KEY" : ""})`;
            const colContext = tableContext?.columns?.[col.column_name];
            if (colContext) {
              colDesc += ` -- ${colContext}`;
            }
            return colDesc;
          })
          .join(", ");

        return `${description} ${columnDescriptions}`;
      })
      .join("\n\n");
  }

  /**
   * Construye la sección de relaciones FK para el prompt
   */
  private buildRelationshipsSection(
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
  ): string {
    const allFKs: string[] = [];
    for (const [tableName, tableData] of Object.entries(schema)) {
      for (const fk of tableData.foreignKeys) {
        allFKs.push(
          `${tableName}.${fk.column_name} → ${fk.referenced_table}.${fk.referenced_column}`,
        );
      }
    }

    if (allFKs.length === 0) return "";

    const lang = this.i18n.getLanguage();
    const header =
      lang === "es" ? "RELACIONES ENTRE TABLAS:" : "TABLE RELATIONSHIPS:";
    return `\n${header}\n${allFKs.join("\n")}\n`;
  }

  /**
   * Construye la sección de ejemplos few-shot para el prompt
   */
  private buildExamplesSection(): string {
    if (!this.schemaContext?.examples?.length) return "";

    const lang = this.i18n.getLanguage();
    const header =
      lang === "es" ? "EJEMPLOS DE REFERENCIA:" : "REFERENCE EXAMPLES:";
    const qLabel = lang === "es" ? "Pregunta" : "Question";
    const sLabel = "SQL";

    const exampleLines = this.schemaContext.examples
      .map(
        (ex, i) =>
          `${i + 1}. ${qLabel}: "${ex.question}"\n   ${sLabel}: ${ex.sql}`,
      )
      .join("\n");

    return `\n${header}\n${exampleLines}\n`;
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
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
    requestId: string,
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
          requestId,
        );

        // Limpiar la SQL corregida
        const correctedSql = cleanSqlResponse(
          reflection.fixedSql,
          "reflect",
          this.logger,
        );

        reflections.push({
          error: errorMessage,
          reasoning: reflection.reasoning,
          fixAttempt: correctedSql,
        });

        // Intentar ejecutar la consulta corregida
        results = await this.dbManager.executeReadOnlyQuery(correctedSql);
        success = true;
        currentSql = correctedSql;

        this.logger.info("Query fixed successfully on attempt", {
          attempt: attempts,
        });
      } catch (error) {
        attempts++;
        errorMessage = (error as Error).message;

        this.logger.warn("Reflection attempt failed", {
          attempt: attempts,
          error: errorMessage,
        });

        if (attempts > this.maxReflections) {
          this.logger.error("Max reflection attempts reached", {
            maxReflections: this.maxReflections,
          });
          break;
        }
      }
    }

    return {
      sql: currentSql,
      reflections,
      attempts,
      results,
      success,
    };
  }

  /**
   * Genera una reflexión sobre un error en una consulta SQL.
   * Usa function calling cuando está disponible, con fallback a texto.
   */
  private async generateReflection(
    prompt: string,
    sql: string,
    errorMessage: string,
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
    requestId: string,
  ): Promise<{ reasoning: string; fixedSql: string }> {
    try {
      const schemaDescription = this.buildSchemaDescription(schema);
      const relationships = this.buildRelationshipsSection(schema);

      const systemPrompt = this.i18n.getMessageWithReplace(
        "prompts",
        "fixSQLError",
        {
          error: errorMessage,
          sql: sql,
          schema: schemaDescription,
          relationships,
        },
      );

      const userMessage = `Consulta original en lenguaje natural: ${prompt}\n\nConsulta SQL que falló:\n${sql}\n\nError recibido:\n${errorMessage}`;

      // Intentar function calling
      try {
        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          tools: [
            {
              type: "function" as const,
              function: {
                name: "fix_sql_query",
                description:
                  "Fix a failed SQL query based on the error message",
                parameters: {
                  type: "object",
                  properties: {
                    fixedSql: {
                      type: "string",
                      description: "The corrected MySQL SELECT query",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Explanation of what went wrong and how it was fixed",
                    },
                  },
                  required: ["fixedSql", "reasoning"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function" as const,
            function: { name: "fix_sql_query" },
          },
        });

        if (response.usage) {
          this.logger.logTokenUsage(
            requestId,
            "reflect-fix-fc",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            this.openaiModel,
          );
        }

        const toolCall = response.choices[0]?.message?.tool_calls?.[0];
        if (toolCall && toolCall.function?.arguments) {
          const args = JSON.parse(toolCall.function.arguments);
          this.logger.debug("Generated reflection via function calling", {
            reasoning: args.reasoning,
            fixedSql: args.fixedSql,
          });
          return { reasoning: args.reasoning, fixedSql: args.fixedSql };
        }

        throw new Error("No tool_calls in reflection response");
      } catch (fcError) {
        // Fallback: modo texto
        this.logger.debug(
          "Function calling not available for reflection, using text mode",
        );

        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        });

        const content = response.choices[0]?.message?.content?.trim() || "";

        if (response.usage) {
          this.logger.logTokenUsage(
            requestId,
            "reflect-fix-text",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            this.openaiModel,
          );
        }

        // Extraer el razonamiento y la SQL corregida del texto
        const reasoningMatch = content.match(
          /RAZONAMIENTO:([\\s\\S]*?)SQL CORREGIDO:/i,
        );
        const sqlMatch = content.match(/SQL CORREGIDO:([\\s\\S]*)/i);

        const reasoning = reasoningMatch
          ? reasoningMatch[1].trim()
          : "No reasoning provided";
        const fixedSql = sqlMatch ? sqlMatch[1].trim() : content;

        this.logger.debug("Generated reflection via text mode", {
          reasoning,
          fixedSql,
        });

        return { reasoning, fixedSql };
      }
    } catch (error) {
      this.logger.error("Error generating reflection", {
        error: (error as Error).message,
      });
      throw new Error(
        `Failed to generate reflection: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Genera un hash del esquema de la base de datos para usar como clave de cache
   * @param schema - Esquema de la base de datos
   * @returns Hash del esquema
   */
  private generateSchemaHash(schema: any): string {
    try {
      const schemaString = JSON.stringify(schema);
      let hash = 0;
      for (let i = 0; i < schemaString.length; i++) {
        const char = schemaString.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convertir a 32bit integer
      }
      return Math.abs(hash).toString(36);
    } catch (error) {
      this.logger.warn("Error generating schema hash, using default", {
        error: (error as Error).message,
      });
      return "default";
    }
  }

  /**
   * Obtiene estadísticas del cache
   * @returns Estadísticas del cache o null si está deshabilitado
   */
  getCacheStats(): CacheStats | null {
    if (!this.cache || !this.cacheEnabled) {
      return null;
    }
    return this.cache.getStats();
  }

  /**
   * Limpia el cache completamente
   */
  clearCache(): void {
    if (this.cache && this.cacheEnabled) {
      this.cache.clear();
      this.logger.info("Cache cleared successfully");
    }
  }

  /**
   * Invalida entradas del cache relacionadas con una tabla específica
   * @param tableName - Nombre de la tabla
   * @returns Número de entradas invalidadas
   */
  invalidateCacheByTable(tableName: string): number {
    if (!this.cache || !this.cacheEnabled) {
      return 0;
    }

    const invalidated = this.cache.invalidateByTable(tableName);
    this.logger.info(
      `Invalidated ${invalidated} cache entries for table: ${tableName}`,
    );
    return invalidated;
  }

  /**
   * Habilita o deshabilita el cache dinámicamente
   * @param enabled - Estado del cache
   */
  setCacheEnabled(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (this.cache) {
      this.cache.setEnabled(enabled);
    }
    this.logger.info(`Cache ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Verifica si el cache está habilitado
   * @returns Estado del cache
   */
  isCacheEnabled(): boolean {
    return this.cacheEnabled;
  }
}

export default CyberMySQLOpenAI;
