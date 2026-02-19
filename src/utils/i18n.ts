// src/utils/i18n.ts

/**
 * Diccionario de mensajes multiidioma para cyber-mysql-openai
 */

export type SupportedLanguage = "es" | "en";

export interface MessageDictionary {
  // Mensajes de error
  errors: {
    noResults: string;
    connectionFailed: string;
    invalidQuery: string;
    maxReflectionsReached: string;
    openaiError: string;
    databaseError: string;
  };

  // Mensajes de éxito
  success: {
    queryExecuted: string;
    connectionEstablished: string;
    responseGenerated: string;
  };

  // Prompts para OpenAI
  prompts: {
    translateToSQL: string;
    generateNaturalResponse: string;
    generateDetailedResponse: string;
    fixSQLError: string;
  };

  // Mensajes de respuesta natural por defecto
  responses: {
    noResultsFound: string;
    multipleResults: string;
    singleResult: string;
    dataAnalysis: string;
    queryCompleted: string;
  };

  // Etiquetas y texto de interfaz
  labels: {
    sqlGenerated: string;
    results: string;
    naturalResponse: string;
    detailedResponse: string;
    attempts: string;
    reflections: string;
    executionTime: string;
    rowsAffected: string;
  };
}

/**
 * Diccionario en español
 */
export const spanishMessages: MessageDictionary = {
  errors: {
    noResults: "No se encontraron resultados que coincidan con tu consulta.",
    connectionFailed:
      "Error al conectar con la base de datos. Verifica tu configuración.",
    invalidQuery: "La consulta generada no es válida o no es segura.",
    maxReflectionsReached:
      "Se alcanzó el número máximo de intentos de corrección.",
    openaiError: "Error al comunicarse con el servicio de OpenAI.",
    databaseError: "Error en la base de datos al ejecutar la consulta.",
  },

  success: {
    queryExecuted: "Consulta ejecutada exitosamente.",
    connectionEstablished:
      "Conexión a la base de datos establecida correctamente.",
    responseGenerated: "Respuesta natural generada con éxito.",
  },

  prompts: {
    translateToSQL: `Eres un experto en SQL y bases de datos MySQL. Tu tarea es traducir consultas en lenguaje natural al SQL más preciso y optimizado posible.

REGLAS OBLIGATORIAS:
1. SOLO genera consultas SELECT de solo lectura
2. NO uses INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
3. Usa ÚNICAMENTE nombres de tablas y columnas que existan en el esquema proporcionado
4. Genera SQL válido para MySQL
5. Si la consulta no se puede resolver con los datos disponibles, responde: "ERROR: No es posible generar esta consulta"

REGLAS DE OPTIMIZACIÓN:
6. Prefiere JOINs explícitos (INNER JOIN, LEFT JOIN) sobre subqueries cuando sea posible
7. Usa aliases descriptivos para tablas y columnas (ej: p.name AS nombre_producto)
8. Incluye LIMIT cuando la consulta podría devolver muchos registros y el usuario no especifica cantidad
9. Usa funciones de agregación (SUM, AVG, COUNT) cuando el usuario pida totales, promedios o conteos
10. Cuando haya ambigüedad, usa el contexto de negocio para tomar la mejor decisión
{businessContext}
{customInstructions}
Esquema de la base de datos:
{schema}
{relationships}
{examples}
Consulta en lenguaje natural: {query}`,

    generateNaturalResponse: `Eres un asistente experto en análisis de datos. Tu tarea es explicar los resultados de una consulta SQL en lenguaje natural, claro y comprensible.

INSTRUCCIONES:
1. Explica qué muestran los resultados de manera simple
2. Usa un lenguaje amigable y profesional
3. Si hay múltiples registros, haz un resumen general y destaca los más relevantes
4. Si hay datos numéricos importantes, menciónalos con formato legible (ej: $1,234.56)
5. Mantén la respuesta concisa pero informativa
6. Responde en español
7. Si el contexto de negocio está disponible, úsalo para dar más significado a los datos
{businessContext}
{responseStyleInstruction}
Consulta SQL ejecutada: {sql}

Resultados obtenidos: {results}

Explicación:`,

    generateDetailedResponse: `Eres un analista de datos experto. Proporciona un análisis detallado y profesional de los resultados SQL.

INSTRUCCIONES:
1. Haz un análisis completo de los datos
2. Identifica patrones, tendencias o insights relevantes
3. Proporciona contexto y significado empresarial
4. Usa formato markdown para organizar la información
5. Incluye estadísticas o métricas importantes
6. Responde en español
7. Si el contexto de negocio está disponible, úsalo para enriquecer el análisis
{businessContext}
Consulta SQL: {sql}
Resultados: {results}

Análisis detallado:`,

    fixSQLError: `Eres un experto en SQL y depuración de consultas. Tienes una consulta que generó un error y necesitas corregirla.

ERROR ENCONTRADO: {error}
CONSULTA ORIGINAL: {sql}
ESQUEMA DE BASE DE DATOS: {schema}
{relationships}
{businessContext}
{examples}
{customInstructions}

INSTRUCCIONES:
1. Analiza el error y su causa raíz
2. Corrige la consulta manteniendo la intención original del usuario
3. Asegúrate de que sea una consulta SELECT válida para MySQL
4. Usa SOLO nombres de tablas y columnas que existan en el esquema
5. Si el error es de columna o tabla inexistente, busca la alternativa correcta en el esquema
6. Si hay ejemplos similares, úsalos como referencia
7. Si hay reglas personalizadas, respétalas en la corrección`,
  },

  responses: {
    noResultsFound:
      "No se encontraron datos que coincidan con los criterios de búsqueda.",
    multipleResults:
      "Se encontraron {count} registros que coinciden con tu consulta.",
    singleResult: "Se encontró 1 registro que coincide con tu consulta.",
    dataAnalysis: "Análisis de los datos obtenidos:",
    queryCompleted: "Consulta completada exitosamente.",
  },

  labels: {
    sqlGenerated: "SQL generado",
    results: "Resultados",
    naturalResponse: "Respuesta natural",
    detailedResponse: "Respuesta detallada",
    attempts: "Intentos",
    reflections: "Reflexiones",
    executionTime: "Tiempo de ejecución",
    rowsAffected: "Filas afectadas",
  },
};

/**
 * Diccionario en inglés
 */
export const englishMessages: MessageDictionary = {
  errors: {
    noResults: "No results found matching your query.",
    connectionFailed:
      "Failed to connect to the database. Please check your configuration.",
    invalidQuery: "The generated query is invalid or not safe.",
    maxReflectionsReached: "Maximum number of correction attempts reached.",
    openaiError: "Error communicating with OpenAI service.",
    databaseError: "Database error occurred while executing the query.",
  },

  success: {
    queryExecuted: "Query executed successfully.",
    connectionEstablished: "Database connection established successfully.",
    responseGenerated: "Natural response generated successfully.",
  },

  prompts: {
    translateToSQL: `You are an expert in SQL and MySQL databases. Your task is to translate natural language queries into the most precise and optimized SQL possible.

MANDATORY RULES:
1. ONLY generate SELECT read-only queries
2. DO NOT use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
3. Use ONLY table and column names that exist in the provided schema
4. Generate valid SQL for MySQL
5. If the query cannot be resolved with available data, respond: "ERROR: Cannot generate this query"

OPTIMIZATION RULES:
6. Prefer explicit JOINs (INNER JOIN, LEFT JOIN) over subqueries when possible
7. Use descriptive aliases for tables and columns (e.g: p.name AS product_name)
8. Include LIMIT when the query could return many records and the user doesn't specify a quantity
9. Use aggregate functions (SUM, AVG, COUNT) when the user asks for totals, averages, or counts
10. When there is ambiguity, use the business context to make the best decision
{businessContext}
{customInstructions}
Database schema:
{schema}
{relationships}
{examples}
Natural language query: {query}`,

    generateNaturalResponse: `You are an expert data analysis assistant. Your task is to explain SQL query results in clear, understandable natural language.

INSTRUCTIONS:
1. Explain what the results show in simple terms
2. Use friendly and professional language
3. If there are multiple records, provide a general summary and highlight the most relevant ones
4. If there are important numerical data, mention them in readable format (e.g: $1,234.56)
5. Keep the response concise but informative
6. Respond in English
7. If business context is available, use it to give more meaning to the data
{businessContext}
{responseStyleInstruction}
SQL query executed: {sql}

Results obtained: {results}

Explanation:`,

    generateDetailedResponse: `You are an expert data analyst. Provide a detailed and professional analysis of the SQL results.

INSTRUCTIONS:
1. Perform a comprehensive analysis of the data
2. Identify relevant patterns, trends, or insights
3. Provide business context and meaning
4. Use markdown format to organize information
5. Include important statistics or metrics
6. Respond in English
7. If business context is available, use it to enrich the analysis
{businessContext}
SQL Query: {sql}
Results: {results}

Detailed Analysis:`,

    fixSQLError: `You are a SQL expert and query debugger. You have a query that generated an error and needs to be fixed.

ERROR FOUND: {error}
ORIGINAL QUERY: {sql}
DATABASE SCHEMA: {schema}
{relationships}
{businessContext}
{examples}
{customInstructions}

INSTRUCTIONS:
1. Analyze the error and its root cause
2. Fix the query while maintaining the original user intent
3. Ensure it's a valid SELECT query for MySQL
4. Use ONLY table and column names that exist in the schema
5. If the error is about a nonexistent column or table, find the correct alternative in the schema
6. If similar examples are available, use them as reference
7. If there are custom rules, respect them in the correction`,
  },

  responses: {
    noResultsFound: "No data found matching the search criteria.",
    multipleResults: "Found {count} records matching your query.",
    singleResult: "Found 1 record matching your query.",
    dataAnalysis: "Analysis of the obtained data:",
    queryCompleted: "Query completed successfully.",
  },

  labels: {
    sqlGenerated: "Generated SQL",
    results: "Results",
    naturalResponse: "Natural response",
    detailedResponse: "Detailed response",
    attempts: "Attempts",
    reflections: "Reflections",
    executionTime: "Execution time",
    rowsAffected: "Rows affected",
  },
};

/**
 * Clase para manejar internacionalización
 */
export class I18n {
  private language: SupportedLanguage;
  private messages: MessageDictionary;

  constructor(language: SupportedLanguage = "en") {
    this.language = language;
    this.messages = this.getMessages(language);
  }

  /**
   * Obtiene el diccionario de mensajes para un idioma específico
   */
  private getMessages(language: SupportedLanguage): MessageDictionary {
    switch (language) {
      case "en":
        return englishMessages;
      case "es":
      default:
        return spanishMessages;
    }
  }

  /**
   * Cambia el idioma activo
   */
  setLanguage(language: SupportedLanguage): void {
    this.language = language;
    this.messages = this.getMessages(language);
  }

  /**
   * Obtiene el idioma actual
   */
  getLanguage(): SupportedLanguage {
    return this.language;
  }

  /**
   * Obtiene un mensaje específico
   */
  getMessage(category: keyof MessageDictionary, key: string): string {
    const categoryMessages = this.messages[category] as Record<string, string>;
    return categoryMessages[key] || `Missing translation: ${category}.${key}`;
  }

  /**
   * Obtiene un mensaje con reemplazo de variables
   */
  getMessageWithReplace(
    category: keyof MessageDictionary,
    key: string,
    replacements: Record<string, string | number>,
  ): string {
    let message = this.getMessage(category, key);

    // Reemplazar variables en el mensaje
    Object.entries(replacements).forEach(([placeholder, value]) => {
      const regex = new RegExp(`\\{${placeholder}\\}`, "g");
      message = message.replace(regex, String(value));
    });

    return message;
  }

  /**
   * Obtiene todos los mensajes de una categoría
   */
  getCategory(category: keyof MessageDictionary): Record<string, string> {
    return this.messages[category] as Record<string, string>;
  }
}

// Instancia por defecto
export const defaultI18n = new I18n("en");
