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
  TokenUsage,
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
import { validateQuery } from "../utils/queryValidator";
import { QueryHistory, QueryRecord } from "../utils/queryHistory";

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
  private lightModel: string;
  private i18n: I18n;
  private cache: MemoryCache | null = null;
  private cacheEnabled: boolean;
  private schemaContext: SchemaContext | undefined;

  // Cache de schema
  private cachedSchema: Record<
    string,
    { columns: any[]; foreignKeys: any[] }
  > | null = null;
  private schemaCachedAt: number = 0;
  private schemaTTL: number;

  // Historial de consultas
  private queryHistory: QueryHistory;

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
    this.lightModel = openaiConfig.lightModel || "gpt-4o-mini";
    this.maxReflections = config.maxReflections || DEFAULT_MAX_REFLECTIONS;
    this.dbManager = new DBManager(dbConfig, this.logger);

    // Almacenar contexto de negocio (antes de ResponseFormatter para que buildResponseStyleInstruction funcione)
    this.schemaContext = config.context;

    this.responseFormatter = new ResponseFormatter(
      openaiConfig.apiKey,
      openaiConfig.model,
      config.language || "en",
      this.logger,
      config.context?.businessDescription
        ? `\nCONTEXTO DE NEGOCIO: ${config.context.businessDescription}\n`
        : "",
      this.buildResponseStyleInstruction(),
      this.lightModel, // Mejora 3: usar modelo ligero para formateo
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

    // TTL del cache de schema (5 minutos por defecto)
    this.schemaTTL = config.schemaTTL || 300000;

    // Historial de consultas
    this.queryHistory = new QueryHistory(100);

    this.logger.info("CyberMySQLOpenAI initialized successfully", {
      model: this.openaiModel,
      maxReflections: this.maxReflections,
      language: this.i18n.getLanguage(),
      cacheEnabled: this.cacheEnabled,
      schemaTTL: this.schemaTTL,
      hasContext: !!config.context,
      hasCustomInstructions: !!config.context?.customInstructions?.length,
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

      // Paso 1: Obtener el esquema de la base de datos (con cache)
      const schema = await this.getSchemaWithCache();
      const schemaHash = this.generateSchemaHash(schema);

      // Acumulador de tokens para este request
      const tokenAccumulator: TokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

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
      const generateResult = await this.generateSQL(
        prompt,
        schema,
        requestId,
        tokenAccumulator,
      );
      let sql = generateResult.sql;
      const confidence = generateResult.confidence;

      // Paso 3.5: Validar la query generada
      const validation = validateQuery(sql, schema);
      if (validation.warnings.length > 0) {
        this.logger.warn("Advertencias de validación de query", {
          warnings: validation.warnings,
        });
      }
      if (validation.suggestions.length > 0) {
        this.logger.debug("Sugerencias de validación de query", {
          suggestions: validation.suggestions,
        });
      }
      if (!validation.valid) {
        this.logger.error("Validación de query fallida", {
          errors: validation.errors,
        });
        // No bloquear — dejar que la DB devuelva el error real para auto-corrección
      }

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
      // Calcular costo estimado si hay tokens
      if (tokenAccumulator.totalTokens > 0) {
        tokenAccumulator.estimatedCost = this.estimateTokenCost(
          tokenAccumulator.promptTokens,
          tokenAccumulator.completionTokens,
        );
      }

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
        tokenUsage:
          tokenAccumulator.totalTokens > 0 ? tokenAccumulator : undefined,
      };

      if (detailedResponse) {
        result.detailedResponse = detailedResponse;
      }

      // Registrar en historial
      this.queryHistory.addRecord({
        id: requestId,
        timestamp: new Date(),
        naturalQuery: prompt,
        generatedSQL: sql,
        confidence,
        success,
        executionTime,
        fromCache: false,
        tokenUsage: result.tokenUsage,
      });

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
    tokenAccumulator?: TokenUsage,
  ): Promise<{ sql: string; confidence?: number }> {
    try {
      const schemaDescription = this.buildSchemaDescription(schema);

      // Construir secciones opcionales del prompt
      const businessContext = this.schemaContext?.businessDescription
        ? `\nCONTEXTO DE NEGOCIO: ${this.schemaContext.businessDescription}\n`
        : "";

      const relationships = this.buildRelationshipsSection(schema);
      const examples = this.buildExamplesSection();
      const customInstructions = this.buildCustomInstructionsSection();

      const systemPrompt = this.i18n.getMessageWithReplace(
        "prompts",
        "translateToSQL",
        {
          schema: schemaDescription,
          query: prompt,
          businessContext,
          relationships,
          examples,
          customInstructions,
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
          this.accumulateTokens(tokenAccumulator, response.usage);
        }

        const toolCall = response.choices[0]?.message?.tool_calls?.[0] as any;
        if (toolCall?.function?.arguments) {
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
      } catch (_fcError) {
        // Fallback: modo texto (compatible con modelos antiguos)
        this.logger.debug(
          "Function calling not available, falling back to text mode",
          {
            error: (_fcError as Error).message,
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
          this.accumulateTokens(tokenAccumulator, response.usage);
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
   * Construye la descripción comprimida del schema.
   * Formato: "tabla: col1* col2 col3→ref_tabla" (~20 tokens/tabla vs ~60 antes)
   * donde * = PRIMARY KEY, →ref = FK a otra tabla
   */
  private buildSchemaDescription(
    schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
  ): string {
    const tables = Object.keys(schema);
    return tables
      .map((tableName) => {
        const tableData = schema[tableName];
        const tableContext = this.schemaContext?.tables?.[tableName];

        // Mapear FKs por columna para anotarlas inline
        const fkMap: Record<string, string> = {};
        for (const fk of tableData.foreignKeys) {
          fkMap[fk.column_name] = fk.referenced_table;
        }

        // Columnas en formato comprimido
        const cols = tableData.columns
          .map((col: any) => {
            let c = col.column_name;
            if (col.column_key === "PRI") c += "*"; // PK
            if (fkMap[col.column_name]) c += `→${fkMap[col.column_name]}`; // FK
            // Anotar tipo solo si el usuario definió contexto de negocio para esta columna
            const colCtx = tableContext?.columns?.[col.column_name];
            if (colCtx) c += `(${colCtx})`;
            return c;
          })
          .join(" ");

        // Descripción de tabla: nombre + descripción de negocio si existe
        const tableDesc = tableContext?.description
          ? `${tableName}(${tableContext.description})`
          : tableName;

        return `${tableDesc}: ${cols}`;
      })
      .join("\n");
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
  /**
   * Extrae los nombres de tablas mencionados en una consulta SQL.
   * Se usa para filtrar el schema y no re-enviarlo completo en la reflexión.
   */
  private extractTablesFromSQL(sql: string): string[] {
    const matches =
      sql.match(/(?:FROM|JOIN|INTO|UPDATE)\s+([`"']?\w+[`"']?)/gi) || [];
    return matches.map((m) =>
      m.replace(/(?:FROM|JOIN|INTO|UPDATE)\s+/i, "").replace(/[`"']/g, ""),
    );
  }

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

    // Mejora 5: filtrar schema a solo las tablas del SQL fallido
    const involvedTables = this.extractTablesFromSQL(sql);
    const reducedSchema =
      involvedTables.length > 0
        ? Object.fromEntries(
            Object.entries(schema).filter(([t]) => involvedTables.includes(t)),
          )
        : schema; // fallback: schema completo si no se detectaron tablas

    while (attempts <= this.maxReflections && !success) {
      try {
        // Generar reflexión sobre el error (con schema reducido)
        const reflection = await this.generateReflection(
          prompt,
          currentSql,
          errorMessage,
          reducedSchema,
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
      // Mejora 3 + 5: schema ya viene filtrado y usamos el modelo ligero
      const schemaDescription = this.buildSchemaDescription(schema);
      const relationships = this.buildRelationshipsSection(schema);

      // Construir secciones de contexto para la reflexión
      const businessContext = this.schemaContext?.businessDescription
        ? `\nCONTEXTO DE NEGOCIO: ${this.schemaContext.businessDescription}\n`
        : "";
      const examples = this.buildExamplesSection();
      const customInstructions = this.buildCustomInstructionsSection();

      const systemPrompt = this.i18n.getMessageWithReplace(
        "prompts",
        "fixSQLError",
        {
          error: errorMessage,
          sql: sql,
          schema: schemaDescription,
          relationships,
          businessContext,
          examples,
          customInstructions,
        },
      );

      const userMessage = `Consulta original en lenguaje natural: ${prompt}\n\nConsulta SQL que falló:\n${sql}\n\nError recibido:\n${errorMessage}`;

      // Mejora 3: usar lightModel (gpt-4o-mini) para la reflexión
      try {
        const response = await this.openai.chat.completions.create({
          model: this.lightModel,
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
            this.lightModel,
          );
        }

        const toolCall = response.choices[0]?.message?.tool_calls?.[0] as any;
        if (toolCall?.function?.arguments) {
          const args = JSON.parse(toolCall.function.arguments);
          this.logger.debug("Generated reflection via function calling", {
            reasoning: args.reasoning,
            fixedSql: args.fixedSql,
          });
          return { reasoning: args.reasoning, fixedSql: args.fixedSql };
        }

        throw new Error("No tool_calls in reflection response");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_fcError) {
        // Fallback: modo texto (también usa lightModel)
        this.logger.debug(
          "Function calling not available for reflection, using text mode",
        );

        const response = await this.openai.chat.completions.create({
          model: this.lightModel,
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
            this.lightModel,
          );
        }

        // Extraer el razonamiento y la SQL corregida del texto
        const reasoningMatch = content.match(
          /RAZONAMIENTO:([\s\S]*?)SQL CORREGIDO:/i,
        );
        const sqlMatch = content.match(/SQL CORREGIDO:([\s\S]*)/i);

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

  // ========== Cache de Schema ==========

  /**
   * Obtiene el esquema de la base de datos con cache TTL
   */
  private async getSchemaWithCache(): Promise<
    Record<string, { columns: any[]; foreignKeys: any[] }>
  > {
    const now = Date.now();
    if (this.cachedSchema && now - this.schemaCachedAt < this.schemaTTL) {
      this.logger.debug("Usando schema cacheado", {
        age: `${Math.round((now - this.schemaCachedAt) / 1000)}s`,
        ttl: `${this.schemaTTL / 1000}s`,
      });
      return this.cachedSchema;
    }

    this.logger.debug("Obteniendo schema fresco de la base de datos");
    const schema = await this.dbManager.getDatabaseSchema();
    this.cachedSchema = schema;
    this.schemaCachedAt = now;
    return schema;
  }

  /**
   * Fuerza el refresco del schema cacheado
   */
  refreshSchema(): void {
    this.cachedSchema = null;
    this.schemaCachedAt = 0;
    this.logger.info(
      "Cache de schema invalidado — se refrescará en la próxima consulta",
    );
  }

  // ========== Instrucciones Personalizadas ==========

  /**
   * Construye la sección de instrucciones personalizadas para los prompts
   */
  private buildCustomInstructionsSection(): string {
    if (!this.schemaContext?.customInstructions?.length) {
      return "";
    }

    const instructions = this.schemaContext.customInstructions
      .map((instruction, i) => `${i + 1}. ${instruction}`)
      .join("\n");

    return `\nREGLAS PERSONALIZADAS DEL USUARIO:\n${instructions}\n`;
  }

  /**
   * Construye la instrucción de estilo de respuesta para los prompts
   */
  private buildResponseStyleInstruction(): string {
    const style = this.schemaContext?.responseStyle;
    if (!style) return "";

    const styleMap: Record<string, string> = {
      concise:
        "Responde con respuestas breves y directas. Evita detalles innecesarios.",
      detailed: "Proporciona explicaciones completas con contexto e insights.",
      technical: "Usa lenguaje técnico e incluye detalles SQL en la respuesta.",
    };

    return `\nESTILO DE RESPUESTA: ${styleMap[style] || ""}\n`;
  }

  // ========== Seguimiento de Tokens ==========

  /**
   * Acumula el uso de tokens de una respuesta de OpenAI
   */
  private accumulateTokens(
    accumulator: TokenUsage | undefined,
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    },
  ): void {
    if (!accumulator) return;
    accumulator.promptTokens += usage.prompt_tokens;
    accumulator.completionTokens += usage.completion_tokens;
    accumulator.totalTokens += usage.total_tokens;
  }

  /**
   * Estima el costo en USD basado en el modelo y la cantidad de tokens.
   * Precios por 1M de tokens (actualizados a Feb 2025).
   */
  private estimateTokenCost(
    promptTokens: number,
    completionTokens: number,
  ): number {
    // Precios por 1M de tokens [input, output] en USD
    const pricing: Record<string, [number, number]> = {
      "gpt-4o": [2.5, 10.0],
      "gpt-4o-2024-11-20": [2.5, 10.0],
      "gpt-4o-2024-08-06": [2.5, 10.0],
      "gpt-4o-mini": [0.15, 0.6],
      "gpt-4-turbo": [10.0, 30.0],
      "gpt-4": [30.0, 60.0],
      "gpt-3.5-turbo": [0.5, 1.5],
    };

    // Buscar precio exacto o por prefijo
    let rates = pricing[this.openaiModel];
    if (!rates) {
      // Intentar match parcial (ej: "gpt-4o-mini-2024-07-18" → "gpt-4o-mini")
      const modelLower = this.openaiModel.toLowerCase();
      for (const [key, value] of Object.entries(pricing)) {
        if (modelLower.startsWith(key)) {
          rates = value;
          break;
        }
      }
    }

    if (!rates) {
      // Modelo desconocido — usar precio de gpt-4o-mini como fallback conservador
      rates = [0.15, 0.6];
    }

    const inputCost = (promptTokens / 1_000_000) * rates[0];
    const outputCost = (completionTokens / 1_000_000) * rates[1];

    // Redondear a 6 decimales para claridad
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
  }

  // ========== Historial de Consultas ==========

  /**
   * Obtiene el historial de ejecución de consultas
   * @param limit - Número máximo de registros a devolver
   */
  getQueryHistory(limit?: number): QueryRecord[] {
    return this.queryHistory.getHistory(limit);
  }

  /**
   * Obtiene estadísticas sobre la ejecución de consultas
   */
  getQueryStats() {
    return this.queryHistory.getStats();
  }

  /**
   * Limpia el historial de consultas
   */
  clearQueryHistory(): void {
    this.queryHistory.clearHistory();
    this.logger.info("Historial de consultas limpiado");
  }

  /**
   * Exporta el historial de consultas como JSON
   */
  exportQueryHistory(): string {
    return this.queryHistory.exportHistory();
  }
}

export default CyberMySQLOpenAI;
