// src/agent/cyberMySQLOpenAI.ts
import { OpenAI } from "openai";
import { randomUUID } from "crypto";
import {
  CyberMySQLOpenAIConfig,
  TranslationResult,
  SQLResult,
  NaturalResponseOptions,
  CacheStats,
  SchemaContext,
  TokenUsage,
  QueryStreamChunk,
  Reflection,
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
  private mode: "direct" | "agentic";

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
    this.mode = config.mode || "direct";

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
      mode: this.mode,
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
    const stream = this.queryStream(prompt, options);
    let finalResult: TranslationResult | undefined;
    for await (const chunk of stream) {
      if (chunk.type === "chunk" && options.onChunk && chunk.content) {
        options.onChunk(chunk.content);
      }
      if (chunk.type === "done" && chunk.metadata) {
        finalResult = chunk.metadata as TranslationResult;
      }
    }
    if (!finalResult) {
      throw new Error("Query stream failed to complete");
    }
    return finalResult;
  }

  /**
   * Procesa una consulta en lenguaje natural devolviendo un generador asíncrono
   * para consumo de eventos y texto en tiempo real (streaming)
   * @param prompt - Consulta en lenguaje natural
   * @param options - Opciones adicionales
   * @returns Generador asíncrono de eventos de consulta
   */
  async *queryStream(
    prompt: string,
    options: NaturalResponseOptions = {},
  ): AsyncGenerator<QueryStreamChunk, TranslationResult, unknown> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const tokenAccumulator: TokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    if (this.mode === "agentic") {
      this.logger.info("Processing natural language query in agentic mode", { prompt });
      const messages: any[] = [
        {
          role: "system",
          content: "You are an agentic database explorer. Your goal is to answer the user's natural language question by exploring the database tables, retrieving schemas when necessary, executing queries, and providing a natural explanation of the results. Always use tools to inspect tables and execute queries."
        },
        { role: "user", content: prompt }
      ];

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "list_tables",
            description: "List all table names in the database schema",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function" as const,
          function: {
            name: "describe_table",
            description: "Get detailed columns information for a specific table",
            parameters: {
              type: "object",
              properties: {
                table_name: { type: "string", description: "Table name to describe" }
              },
              required: ["table_name"]
            }
          }
        },
        {
          type: "function" as const,
          function: {
            name: "execute_sql_query",
            description: "Execute a SELECT SQL query on the database and return results",
            parameters: {
              type: "object",
              properties: {
                sql: { type: "string", description: "SELECT query to run" }
              },
              required: ["sql"]
            }
          }
        }
      ];

      let loopCount = 0;
      let success = false;
      let sql = "";
      let results: any[] = [];

      while (loopCount < 5 && !success) {
        loopCount++;
        const response = await this.openai.chat.completions.create({
          model: this.openaiModel,
          messages,
          tools,
          tool_choice: "auto"
        });

        if (response.usage) {
          this.accumulateTokens(tokenAccumulator, response.usage);
        }

        const choice = response.choices[0];
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          messages.push(choice.message);

          for (const toolCall of choice.message.tool_calls) {
            const tc = toolCall as any;
            const name = tc.function.name;
            const args = JSON.parse(tc.function.arguments);

            if (name === "list_tables") {
              this.logger.debug("Agent called list_tables");
              const dbSchema = await this.getSchemaWithCache();
              const tableNames = Object.keys(dbSchema);
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name,
                content: JSON.stringify({ tables: tableNames })
              });
              yield { type: "chunk", content: `\n[Agent]: Listando tablas...\n` };
            } else if (name === "describe_table") {
              this.logger.debug("Agent called describe_table", { table: args.table_name });
              const columns = await this.dbManager.getTableColumns(args.table_name);
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name,
                content: JSON.stringify({ table: args.table_name, columns })
              });
              yield { type: "chunk", content: `\n[Agent]: Describiendo tabla '${args.table_name}'...\n` };
            } else if (name === "execute_sql_query") {
              this.logger.debug("Agent called execute_sql_query", { sql: args.sql });
              sql = args.sql;
              yield { type: "sql", sql };

              try {
                results = await this.dbManager.executeReadOnlyQuery(args.sql);
                success = true;
                yield { type: "results", results };
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  name,
                  content: JSON.stringify({ results })
                });
                yield { type: "chunk", content: `\n[Agent]: Ejecutando consulta SQL...\n` };
              } catch (err) {
                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  name,
                  content: JSON.stringify({ error: (err as Error).message })
                });
                yield { type: "chunk", content: `\n[Agent]: Fallo al ejecutar SQL: ${(err as Error).message}\n` };
              }
            }
          }
        } else {
          const text = choice.message.content || "";
          yield { type: "chunk", content: text };
          break;
        }
      }

      let naturalResponseAccumulator = "";
      if (success) {
        const responseStream = this.responseFormatter.generateNaturalResponseStream(sql, results, options);
        for await (const chunk of responseStream) {
          naturalResponseAccumulator += chunk;
          yield { type: "chunk", content: chunk };
        }
      } else {
        const errorMsg = `No se pudo obtener resultados en modo agéntico.`;
        naturalResponseAccumulator = errorMsg;
        yield { type: "chunk", content: errorMsg };
      }

      const executionTime = Date.now() - startTime;
      if (tokenAccumulator.totalTokens > 0) {
        tokenAccumulator.estimatedCost = this.estimateTokenCost(
          tokenAccumulator.promptTokens,
          tokenAccumulator.completionTokens,
        );
      }

      const finalResult: TranslationResult = {
        sql,
        results,
        reflections: [],
        attempts: loopCount,
        success,
        naturalResponse: naturalResponseAccumulator,
        executionTime,
        fromCache: false,
        tokenUsage: tokenAccumulator.totalTokens > 0 ? tokenAccumulator : undefined,
      };

      yield { type: "done", metadata: finalResult };

      this.queryHistory.addRecord({
        id: requestId,
        timestamp: new Date(),
        naturalQuery: prompt,
        generatedSQL: sql,
        success,
        executionTime,
        fromCache: false,
        tokenUsage: finalResult.tokenUsage,
      });

      return finalResult;
    }

    try {
      this.logger.info("Processing natural language query in direct mode", { prompt });

      // Paso 1: Obtener el esquema de la base de datos (con cache)
      const schema = await this.getSchemaWithCache();
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

          yield { type: "sql", sql: cachedResult.sql };
          yield { type: "results", results: cachedResult.results };
          yield { type: "chunk", content: cachedResult.naturalResponse };

          const finalResult: TranslationResult = {
            sql: cachedResult.sql,
            results: cachedResult.results,
            reflections: [],
            attempts: 0,
            success: true,
            naturalResponse: cachedResult.naturalResponse,
            executionTime,
            fromCache: true,
          };
          yield { type: "done", metadata: finalResult };
          return finalResult;
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

      yield { type: "sql", sql };

      // Paso 3.5: Validar la query generada. Las reglas de seguridad se aplican
      // en executeReadOnlyQuery; los errores de schema son de mejor esfuerzo
      // (pueden dar falsos positivos) y solo se registran.
      const validation = validateQuery(sql, schema);
      if (validation.errors.length > 0 || validation.warnings.length > 0) {
        this.logger.warn("Advertencias de validación de query", {
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      // Paso 4: Ejecutar la consulta SQL
      let results: any[] = [];
      let reflections: Reflection[] = [];
      let attempts = 0;
      let success = false;

      try {
        results = await this.dbManager.executeReadOnlyQuery(sql);
        success = true;
        yield { type: "results", results };
      } catch (error) {
        yield { type: "reflection", content: `Error ejecutando SQL: ${(error as Error).message}. Iniciando autorreflexión...` };
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

        yield { type: "sql", sql };

        if (reflectionResult.success) {
          results = reflectionResult.results;
          success = true;
          yield { type: "results", results };
        } else {
          results = [];
          yield { type: "results", results };
          this.logger.error("Failed to execute query after reflection", {
            attempts,
          });
        }
      }

      // Paso 5: Generar respuesta en lenguaje natural
      let naturalResponseAccumulator = "";
      if (success) {
        const simpleResponse = this.responseFormatter.generateSimpleResponse(
          sql,
          results,
        );

        if (simpleResponse) {
          naturalResponseAccumulator = simpleResponse;
          yield { type: "chunk", content: simpleResponse };
        } else {
          const responseStream = this.responseFormatter.generateNaturalResponseStream(
            sql,
            results,
            { detailed: false },
          );
          for await (const chunk of responseStream) {
            naturalResponseAccumulator += chunk;
            yield { type: "chunk", content: chunk };
          }
        }
      } else {
        const errorMsg = `No se pudo obtener resultados debido a un error persistente en SQL.`;
        naturalResponseAccumulator = errorMsg;
        yield { type: "chunk", content: errorMsg };
      }

      // Generar respuesta detallada si se solicita
      let detailedResponse;
      if (options.detailed && success) {
        try {
          const detailedStream = this.responseFormatter.generateNaturalResponseStream(
            sql,
            results,
            { detailed: true },
          );
          let detailedAccumulator = "";
          for await (const chunk of detailedStream) {
            detailedAccumulator += chunk;
          }
          detailedResponse = detailedAccumulator;
        } catch (error) {
          this.logger.error("Error generating detailed response", {
            error: (error as Error).message,
          });
          detailedResponse = "No se pudo generar la respuesta detallada.";
        }
      }

      const executionTime = Date.now() - startTime;

      // Paso 6: Guardar en cache si fue exitoso
      if (this.cache && this.cacheEnabled && success && naturalResponseAccumulator) {
        this.cache.set(
          prompt,
          this.i18n.getLanguage(),
          schemaHash,
          sql,
          results,
          naturalResponseAccumulator,
          executionTime,
        );
        this.logger.info("Result cached successfully");
      }

      // Paso 7: Devolver resultado
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
        naturalResponse: naturalResponseAccumulator,
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

      yield { type: "done", metadata: result };
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

  private levenshtein(a: string, b: string): number {
    const tmp = [];
    let i, j;
    for (i = 0; i <= a.length; i++) {
      tmp.push([i]);
    }
    for (j = 0; j <= b.length; j++) {
      tmp[0][j] = j;
    }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        tmp[i][j] = Math.min(
          tmp[i - 1][j] + 1,
          tmp[i][j - 1] + 1,
          tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return tmp[a.length][b.length];
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
    let results: any[] = [];
    let success = false;
    let currentErrorMessage = errorMessage;

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
        // Levenshtein schema hints
        let enhancedErrorMessage = currentErrorMessage;
        const tableMatch = currentErrorMessage.match(/Table\s+'[^']+\.([^']+)'\s+doesn't\s+exist/i) || 
                           currentErrorMessage.match(/Table\s+'([^']+)'\s+doesn't\s+exist/i);
        if (tableMatch) {
          const missingTable = tableMatch[1];
          const allTables = Object.keys(schema);
          const suggestions = allTables
            .map(t => ({ name: t, dist: this.levenshtein(missingTable, t) }))
            .filter(t => t.dist <= 3)
            .sort((x, y) => x.dist - y.dist)
            .map(t => `'${t.name}'`);
          
          if (suggestions.length > 0) {
            enhancedErrorMessage += `\n(Hint: La tabla '${missingTable}' no existe. ¿Quisiste decir alguna de estas?: ${suggestions.join(", ")})`;
          }
        }

        const columnMatch = currentErrorMessage.match(/Unknown\s+column\s+'([^']+)'\s+in/i);
        if (columnMatch) {
          const missingColumn = columnMatch[1];
          const columnsToCheck: string[] = [];
          for (const t of involvedTables) {
            if (schema[t]) {
              schema[t].columns.forEach((col: any) => {
                const colName = col.column_name || col.COLUMN_NAME;
                if (colName && !columnsToCheck.includes(colName)) {
                  columnsToCheck.push(colName);
                }
              });
            }
          }
          
          const suggestions = columnsToCheck
            .map(c => ({ name: c, dist: this.levenshtein(missingColumn, c) }))
            .filter(c => c.dist <= 3)
            .sort((x, y) => x.dist - y.dist)
            .map(c => `'${c.name}'`);
          
          if (suggestions.length > 0) {
            enhancedErrorMessage += `\n(Hint: La columna '${missingColumn}' no existe en las tablas involucradas. ¿Quisiste decir alguna de estas?: ${suggestions.join(", ")})`;
          }
        }

        // Generar reflexión sobre el error (con schema reducido)
        const reflection = await this.generateReflection(
          prompt,
          currentSql,
          enhancedErrorMessage,
          reducedSchema,
          requestId,
        );

        // Ejecutar candidatos en paralelo
        const cleanedCandidates = reflection.fixedSqlCandidates.map((cand: string) => 
          cleanSqlResponse(cand, "reflect", this.logger)
        );

        this.logger.debug("Executing SQL candidates in parallel", { candidates: cleanedCandidates });

        const executionPromises = cleanedCandidates.map(async (candidate: string, index: number) => {
          try {
            const res = await this.dbManager.executeReadOnlyQuery(candidate);
            return { index, candidate, results: res, error: undefined as string | undefined, success: true };
          } catch (err) {
            return { index, candidate, results: [] as any[], error: (err as Error).message as string | undefined, success: false };
          }
        });

        const executionResults = await Promise.all(executionPromises);
        const successfulRun = executionResults.find(r => r.success);

        if (successfulRun) {
          success = true;
          currentSql = successfulRun.candidate;
          results = successfulRun.results;
          reflections.push({
            error: currentErrorMessage,
            reasoning: reflection.reasoning,
            fixAttempt: currentSql,
          });
          this.logger.info("Query fixed successfully via parallel candidate execution", {
            attempt: attempts,
            candidateIndex: successfulRun.index,
          });
        } else {
          reflections.push({
            error: currentErrorMessage,
            reasoning: reflection.reasoning,
            fixAttempt: cleanedCandidates.join(" | "),
          });
          currentErrorMessage = executionResults.map(r => r.error).join(" ; ");
          attempts++;
          this.logger.warn("All parallel candidates failed", { attempt: attempts, errors: currentErrorMessage });
        }
      } catch (error) {
        attempts++;
        currentErrorMessage = (error as Error).message;

        this.logger.warn("Reflection attempt failed due to system error", {
          attempt: attempts,
          error: currentErrorMessage,
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
  ): Promise<{ reasoning: string; fixedSqlCandidates: string[] }> {
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
                  "Fix a failed SQL query by providing alternative candidate queries, ordered by likelihood of success",
                parameters: {
                  type: "object",
                  properties: {
                    fixedSqlCandidates: {
                      type: "array",
                      items: { type: "string" },
                      description: "List of up to 3 candidate MySQL queries that solve the error, ordered by likelihood of success",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Explanation of what went wrong and how it was fixed",
                    },
                  },
                  required: ["fixedSqlCandidates", "reasoning"],
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
          const fixedSqlCandidates = args.fixedSqlCandidates || [args.fixedSql];
          this.logger.debug("Generated reflection via function calling", {
            reasoning: args.reasoning,
            candidates: fixedSqlCandidates,
          });
          return { reasoning: args.reasoning, fixedSqlCandidates };
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

        return { reasoning, fixedSqlCandidates: [fixedSql] };
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
