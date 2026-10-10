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
  errors.push(...checkQuerySafety(sql));

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

// Construcciones peligrosas aunque la consulta empiece con SELECT
const FORBIDDEN_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bINTO\s+(OUTFILE|DUMPFILE)\b/i,
    message: "Escritura de archivos (INTO OUTFILE/DUMPFILE) no permitida",
  },
  {
    pattern: /\bLOAD_FILE\s*\(/i,
    message: "Lectura de archivos del servidor (LOAD_FILE) no permitida",
  },
  {
    pattern: /\b(SLEEP|BENCHMARK|GET_LOCK)\s*\(/i,
    message:
      "Funciones que pueden bloquear el servidor (SLEEP, BENCHMARK, GET_LOCK) no permitidas",
  },
  {
    pattern: /\bFOR\s+(UPDATE|SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i,
    message: "Bloqueo de filas (FOR UPDATE / LOCK IN SHARE MODE) no permitido",
  },
  {
    pattern: /`?\b(mysql|performance_schema)`?\s*\.\s*`?\w/i,
    message:
      "Acceso a esquemas del sistema (mysql, performance_schema) no permitido",
  },
];

// Palabras clave de escritura. INSERT() y TRUNCATE() también son funciones de
// texto/numéricas de MySQL, por eso se excluyen cuando van seguidas de "(".
const WRITE_KEYWORDS =
  /\b(INSERT(?!\s*\()|UPDATE|DELETE|REPLACE\s+INTO|DROP|CREATE|ALTER|TRUNCATE(?!\s*\()|RENAME|GRANT|REVOKE|CALL|LOAD\s+DATA)\b/i;

// Literales de texto y comentarios no ejecutables
const STRINGS_AND_COMMENTS =
  /'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|\/\*[\s\S]*?\*\/|--(?=\s|$)[^\n]*|#[^\n]*/g;

/**
 * Revisa que una consulta de solo lectura no contenga construcciones peligrosas
 * (escritura/lectura de archivos, bloqueos, DoS, múltiples sentencias, etc.).
 * @returns Lista de problemas encontrados; vacía si la consulta es segura
 */
export function checkQuerySafety(sql: string): string[] {
  const errors: string[] = [];

  // Los comentarios ejecutables (/*! ... */ y /*M! ... */) pueden ocultar cualquier cláusula
  if (/\/\*M?!/.test(sql)) {
    errors.push(
      "Comentarios ejecutables de MySQL (/*! ... */) no están permitidos",
    );
  }

  // Quitar literales y comentarios para no confundir su contenido con código
  const code = sql.replace(STRINGS_AND_COMMENTS, " ");

  // Solo una sentencia; se tolera un ";" final
  if (code.replace(/;\s*$/, "").includes(";")) {
    errors.push("Solo se permite una sentencia SQL por consulta");
  }

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  // SHOW no modifica datos y su sintaxis incluye CREATE (SHOW CREATE TABLE)
  if (!/^\s*SHOW\b/i.test(code)) {
    // Ignorar identificadores entre backticks (ej: una columna llamada `delete`)
    const match = code.replace(/`[^`]*`/g, " ").match(WRITE_KEYWORDS);
    if (match) {
      errors.push(
        `Operación peligrosa detectada: ${match[1].replace(/\s+/g, " ").toUpperCase()}`,
      );
    }
  }

  return errors;
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
