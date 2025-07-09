// src/utils/i18n.ts

/**
 * Diccionario de mensajes multiidioma para cyber-mysql-openai
 */

export type SupportedLanguage = 'es' | 'en';

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
    connectionFailed: "Error al conectar con la base de datos. Verifica tu configuración.",
    invalidQuery: "La consulta generada no es válida o no es segura.",
    maxReflectionsReached: "Se alcanzó el número máximo de intentos de corrección.",
    openaiError: "Error al comunicarse con el servicio de OpenAI.",
    databaseError: "Error en la base de datos al ejecutar la consulta."
  },
  
  success: {
    queryExecuted: "Consulta ejecutada exitosamente.",
    connectionEstablished: "Conexión a la base de datos establecida correctamente.",
    responseGenerated: "Respuesta natural generada con éxito."
  },
  
  prompts: {
    translateToSQL: `Eres un experto en SQL y bases de datos. Tu tarea es traducir consultas en lenguaje natural al SQL correcto.

REGLAS IMPORTANTES:
1. SOLO genera consultas SELECT de solo lectura
2. NO uses INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
3. Usa nombres de tablas y columnas existentes según el esquema proporcionado
4. Genera SQL válido para MySQL
5. Responde SOLO con la consulta SQL, sin explicaciones adicionales
6. Si la consulta no se puede resolver con los datos disponibles, responde: "ERROR: No es posible generar esta consulta"

Esquema de la base de datos:
{schema}

Consulta en lenguaje natural: {query}

SQL:`,

    generateNaturalResponse: `Eres un asistente experto en análisis de datos. Tu tarea es explicar los resultados de una consulta SQL en lenguaje natural, claro y comprensible.

INSTRUCCIONES:
1. Explica qué muestran los resultados de manera simple
2. Usa un lenguaje amigable y profesional
3. Si hay múltiples registros, haz un resumen
4. Si hay datos numéricos importantes, menciónalos
5. Mantén la respuesta concisa pero informativa
6. Responde en español

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

Consulta SQL: {sql}
Resultados: {results}

Análisis detallado:`,

    fixSQLError: `Eres un experto en SQL. Tienes una consulta que generó un error y necesitas corregirla.

ERROR ENCONTRADO: {error}
CONSULTA ORIGINAL: {sql}
ESQUEMA DE BASE DE DATOS: {schema}

INSTRUCCIONES:
1. Analiza el error y su causa
2. Corrige la consulta manteniendo la intención original
3. Asegúrate de que sea una consulta SELECT válida
4. Usa solo nombres de tablas y columnas que existan en el esquema
5. Responde SOLO con la consulta SQL corregida

SQL CORREGIDO:`
  },
  
  responses: {
    noResultsFound: "No se encontraron datos que coincidan con los criterios de búsqueda.",
    multipleResults: "Se encontraron {count} registros que coinciden con tu consulta.",
    singleResult: "Se encontró 1 registro que coincide con tu consulta.",
    dataAnalysis: "Análisis de los datos obtenidos:",
    queryCompleted: "Consulta completada exitosamente."
  },
  
  labels: {
    sqlGenerated: "SQL generado",
    results: "Resultados",
    naturalResponse: "Respuesta natural",
    detailedResponse: "Respuesta detallada",
    attempts: "Intentos",
    reflections: "Reflexiones",
    executionTime: "Tiempo de ejecución",
    rowsAffected: "Filas afectadas"
  }
};

/**
 * Diccionario en inglés
 */
export const englishMessages: MessageDictionary = {
  errors: {
    noResults: "No results found matching your query.",
    connectionFailed: "Failed to connect to the database. Please check your configuration.",
    invalidQuery: "The generated query is invalid or not safe.",
    maxReflectionsReached: "Maximum number of correction attempts reached.",
    openaiError: "Error communicating with OpenAI service.",
    databaseError: "Database error occurred while executing the query."
  },
  
  success: {
    queryExecuted: "Query executed successfully.",
    connectionEstablished: "Database connection established successfully.",
    responseGenerated: "Natural response generated successfully."
  },
  
  prompts: {
    translateToSQL: `You are an expert in SQL and databases. Your task is to translate natural language queries into correct SQL.

IMPORTANT RULES:
1. ONLY generate SELECT read-only queries
2. DO NOT use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER
3. Use existing table and column names according to the provided schema
4. Generate valid SQL for MySQL
5. Respond ONLY with the SQL query, no additional explanations
6. If the query cannot be resolved with available data, respond: "ERROR: Cannot generate this query"

Database schema:
{schema}

Natural language query: {query}

SQL:`,

    generateNaturalResponse: `You are an expert data analysis assistant. Your task is to explain SQL query results in clear, understandable natural language.

INSTRUCTIONS:
1. Explain what the results show in simple terms
2. Use friendly and professional language
3. If there are multiple records, provide a summary
4. If there are important numerical data, mention them
5. Keep the response concise but informative
6. Respond in English

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

SQL Query: {sql}
Results: {results}

Detailed Analysis:`,

    fixSQLError: `You are a SQL expert. You have a query that generated an error and needs to be fixed.

ERROR FOUND: {error}
ORIGINAL QUERY: {sql}
DATABASE SCHEMA: {schema}

INSTRUCTIONS:
1. Analyze the error and its cause
2. Fix the query while maintaining the original intent
3. Ensure it's a valid SELECT query
4. Use only table and column names that exist in the schema
5. Respond ONLY with the corrected SQL query

CORRECTED SQL:`
  },
  
  responses: {
    noResultsFound: "No data found matching the search criteria.",
    multipleResults: "Found {count} records matching your query.",
    singleResult: "Found 1 record matching your query.",
    dataAnalysis: "Analysis of the obtained data:",
    queryCompleted: "Query completed successfully."
  },
  
  labels: {
    sqlGenerated: "Generated SQL",
    results: "Results",
    naturalResponse: "Natural response",
    detailedResponse: "Detailed response",
    attempts: "Attempts",
    reflections: "Reflections",
    executionTime: "Execution time",
    rowsAffected: "Rows affected"
  }
};

/**
 * Clase para manejar internacionalización
 */
export class I18n {
  private language: SupportedLanguage;
  private messages: MessageDictionary;
  
  constructor(language: SupportedLanguage = 'en') {
    this.language = language;
    this.messages = this.getMessages(language);
  }
  
  /**
   * Obtiene el diccionario de mensajes para un idioma específico
   */
  private getMessages(language: SupportedLanguage): MessageDictionary {
    switch (language) {
      case 'en':
        return englishMessages;
      case 'es':
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
    replacements: Record<string, string | number>
  ): string {
    let message = this.getMessage(category, key);
    
    // Reemplazar variables en el mensaje
    Object.entries(replacements).forEach(([placeholder, value]) => {
      const regex = new RegExp(`\\{${placeholder}\\}`, 'g');
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
export const defaultI18n = new I18n('en');
