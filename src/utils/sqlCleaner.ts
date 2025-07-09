// src/utils/sqlCleaner.ts
import path from 'path';
import fs from 'fs';
import Logger from './index';

/**
 * Limpia una cadena SQL eliminando delimitadores de código markdown,
 * comentarios y otros elementos que podrían causar problemas en la ejecución
 * @param sqlString - Cadena SQL a limpiar
 * @param operation - Operación relacionada (generate/reflect)
 * @param logger - Instancia de Logger para registrar diagnósticos
 * @returns Cadena SQL limpia
 */
export function cleanSqlResponse(
  sqlString: string, 
  operation: string = 'unknown',
  logger?: Logger
): string {
  if (!sqlString) return '';

  let cleanedSql = sqlString;

  // Eliminar bloques de código markdown (```sql ... ```) con varios formatos
  cleanedSql = cleanedSql.replace(/```\s*sql\s*/gi, '');  // ```sql
  cleanedSql = cleanedSql.replace(/```\s*mysql\s*/gi, ''); // ```mysql
  cleanedSql = cleanedSql.replace(/```\s*mariadb\s*/gi, ''); // ```mariadb
  cleanedSql = cleanedSql.replace(/```\s*$|```$/gmi, ''); // ``` al final
  cleanedSql = cleanedSql.replace(/```/gi, ''); // cualquier otro ```

  // Eliminar otros formatos de bloque de código
  cleanedSql = cleanedSql.replace(/`/g, '');

  // Eliminar comentarios SQL de una línea
  cleanedSql = cleanedSql.replace(/--.*$/gm, '');

  // Eliminar comentarios SQL multilinea
  cleanedSql = cleanedSql.replace(/\/\*[\s\S]*?\*\//g, '');

  // Eliminar texto explicativo que a veces incluye el modelo
  const explanatoryPhrases = [
    "Esta consulta", "Este query", "La consulta", "El query", 
    "A continuación", "Aquí está", "Consulta SQL", "La siguiente consulta",
    "Query SQL", "El siguiente SQL", "Código SQL"
  ];
  
  const regexPattern = new RegExp(`^(${explanatoryPhrases.join('|')}).*\\n`, 'gim');
  cleanedSql = cleanedSql.replace(regexPattern, '');
  
  // Eliminar líneas que empiezan con explicaciones
  cleanedSql = cleanedSql.replace(/^(Explicación|Explanation|Nota|Note):.*$/gim, '');
  
  // Eliminar líneas que parecen ser comentarios explicativos
  cleanedSql = cleanedSql.replace(/^(# |\/\/ ).*$/gm, '');

  // Eliminar líneas vacías y espacios en blanco excesivos
  cleanedSql = cleanedSql.split('\n')
    .filter(line => line.trim() !== '')
    .join('\n')
    .trim();

  // Si después de limpiar todo, la consulta empieza con algún 
  // carácter extraño o puntuación, eliminarlo
  cleanedSql = cleanedSql.replace(/^[^\w\s]/, '').trim();

  // Si después de la limpieza, la consulta está vacía o es demasiado corta
  if (cleanedSql.length < 5) {
    return sqlString.trim(); // Devolver la consulta original en este caso
  }

  // Registrar los cambios para diagnóstico
  if (cleanedSql !== sqlString && logger) {
    logSqlCleaning(sqlString, cleanedSql, operation, logger);
  }

  return cleanedSql;
}

/**
 * Registra los cambios realizados en la limpieza de SQL para diagnóstico
 */
function logSqlCleaning(
  originalSql: string, 
  cleanedSql: string, 
  operation: string,
  logger: Logger
): void {
  try {
    const logDir = path.join(logger['logDir'], 'sql_cleaning');
    
    // Asegurar que existe el directorio
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `${timestamp}_${operation}.log`);
    
    const logContent = [
      `[${timestamp}] Limpieza de SQL en operación: ${operation}`,
      '\n=== SQL ORIGINAL ===',
      originalSql,
      '\n=== SQL LIMPIO ===',
      cleanedSql,
      '\n=== DIFERENCIAS ===',
      `Caracteres originales: ${originalSql.length}`,
      `Caracteres limpios: ${cleanedSql.length}`,
      `Diferencia: ${originalSql.length - cleanedSql.length} caracteres eliminados`
    ].join('\n');
    
    fs.writeFileSync(logFile, logContent);
    logger.debug(`SQL cleaning logged: ${operation}`, { 
      originalLength: originalSql.length,
      cleanedLength: cleanedSql.length
    });
  } catch (error) {
    logger.error('Error logging SQL cleaning:', error);
  }
}

export default { cleanSqlResponse };
