// src/utils/queryValidator.ts

import { ValidationResult } from "../types";

/**
 * Valida una consulta SQL generada contra el esquema de la base de datos
 * para detectar posibles problemas antes de la ejecución.
 */
export function validateQuery(
  sql: string,
  schema: Record<string, { columns: any[]; foreignKeys: any[] }>,
): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const suggestions: string[] = [];

  const normalizedSQL = sql.toUpperCase().trim();
  const schemaTableNames = Object.keys(schema).map((t) => t.toLowerCase());

  // 1. Verificar que es una consulta SELECT
  if (!normalizedSQL.startsWith("SELECT")) {
    errors.push("Solo se permiten consultas SELECT");
    return { valid: false, warnings, errors, suggestions };
  }

  // 2. Bloquear operaciones peligrosas
  const dangerousKeywords = [
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "CREATE",
    "ALTER",
    "TRUNCATE",
    "EXEC",
    "EXECUTE",
  ];
  for (const keyword of dangerousKeywords) {
    // Buscar keyword como palabra completa (no como parte de un nombre de columna)
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      errors.push(`Operación peligrosa detectada: ${keyword}`);
    }
  }

  // 3. Extraer tablas referenciadas del SQL
  const referencedTables = extractTablesFromSQL(sql);

  // 4. Validar que las tablas existan en el esquema
  for (const table of referencedTables) {
    if (!schemaTableNames.includes(table.toLowerCase())) {
      errors.push(
        `Tabla '${table}' no encontrada en el esquema. Disponibles: ${schemaTableNames.join(", ")}`,
      );
    }
  }

  // 5. Validar que las columnas existan (mejor esfuerzo para queries simples)
  const referencedColumns = extractColumnsFromSQL(sql);
  for (const { table, column } of referencedColumns) {
    if (table && schema[table]) {
      const tableColumns = schema[table].columns.map((c: any) =>
        (c.COLUMN_NAME || c.column_name || c.Field || "").toLowerCase(),
      );
      if (
        tableColumns.length > 0 &&
        !tableColumns.includes(column.toLowerCase())
      ) {
        warnings.push(
          `La columna '${column}' podría no existir en la tabla '${table}'`,
        );
      }
    }
  }

  // 6. Advertir si falta LIMIT
  if (
    !normalizedSQL.includes("LIMIT") &&
    !normalizedSQL.includes("COUNT(") &&
    !normalizedSQL.includes("SUM(") &&
    !normalizedSQL.includes("AVG(") &&
    !normalizedSQL.includes("MAX(") &&
    !normalizedSQL.includes("MIN(")
  ) {
    warnings.push(
      "La consulta no tiene cláusula LIMIT — podría devolver muchas filas",
    );
    suggestions.push(
      "Considera agregar LIMIT para evitar conjuntos de resultados grandes",
    );
  }

  // 7. Advertir sobre posibles productos cartesianos
  const joinCount = (normalizedSQL.match(/\bJOIN\b/g) || []).length;
  const onCount = (normalizedSQL.match(/\bON\b/g) || []).length;
  if (joinCount > 0 && onCount < joinCount) {
    warnings.push(
      "Posible producto cartesiano: JOINs detectados sin cláusulas ON correspondientes",
    );
  }

  // 8. Advertir sobre SELECT *
  if (normalizedSQL.includes("SELECT *")) {
    suggestions.push(
      "Considera especificar columnas en lugar de SELECT * para mejor rendimiento",
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    suggestions,
  };
}

/**
 * Extrae nombres de tablas de una consulta SQL (análisis de mejor esfuerzo)
 */
function extractTablesFromSQL(sql: string): string[] {
  const tables: Set<string> = new Set();

  // Buscar FROM nombre_tabla
  const fromRegex = /\bFROM\s+`?(\w+)`?/gi;
  let match;
  while ((match = fromRegex.exec(sql)) !== null) {
    tables.add(match[1]);
  }

  // Buscar JOIN nombre_tabla
  const joinRegex = /\bJOIN\s+`?(\w+)`?/gi;
  while ((match = joinRegex.exec(sql)) !== null) {
    tables.add(match[1]);
  }

  return Array.from(tables);
}

/**
 * Extrae referencias de columnas con sus aliases de tabla (análisis de mejor esfuerzo)
 */
function extractColumnsFromSQL(
  sql: string,
): { table: string | null; column: string }[] {
  const columns: { table: string | null; column: string }[] = [];

  // Buscar patrones tabla.columna
  const qualifiedRegex = /\b(\w+)\.`?(\w+)`?/g;
  let match;
  while ((match = qualifiedRegex.exec(sql)) !== null) {
    // Omitir palabras clave SQL y funciones
    const keyword = match[1].toUpperCase();
    if (
      !["DATE", "YEAR", "MONTH", "DAY", "CURRENT_DATE", "NOW"].includes(keyword)
    ) {
      columns.push({ table: match[1], column: match[2] });
    }
  }

  return columns;
}
