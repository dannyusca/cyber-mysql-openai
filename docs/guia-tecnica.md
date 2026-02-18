# Guía Técnica de cyber-mysql-openai

Esta guía está diseñada para ayudarte a entender la estructura del proyecto `cyber-mysql-openai`, facilitando su mantenimiento y la incorporación de nuevas funcionalidades.

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Componentes Principales](#componentes-principales)
4. [Flujo de Trabajo](#flujo-de-trabajo)
5. [Configuración](#configuración)
6. [Sistemas de Registro (Logging)](#sistemas-de-registro)
7. [Tipos y Interfaces](#tipos-y-interfaces)
8. [Guía para Agregar Nuevas Funcionalidades](#guía-para-agregar-nuevas-funcionalidades)
9. [Pruebas](#pruebas)
10. [Publicación y Distribución](#publicación-y-distribución)

## Visión General

`cyber-mysql-openai` es una librería para Node.js que traduce consultas en lenguaje natural a SQL válido utilizando la API de OpenAI. La librería ejecuta las consultas generadas en una base de datos MySQL y proporciona resultados con explicaciones en lenguaje natural.

### Características Principales:

- Traducción de lenguaje natural a SQL
- Ejecución automática en MySQL
- Corrección autónoma de errores en consultas
- Explicaciones en lenguaje natural de los resultados
- Contexto de negocio configurable para mayor precisión
- Detección automática de relaciones Foreign Key
- Ejemplos few-shot para guiar al modelo
- Function calling con fallback automático a texto
- Puntuación de confianza en cada consulta
- Soporte completo para TypeScript
- Logging avanzado

## Estructura del Proyecto

```
cyber-mysql-openai/
├── dist/               # Código compilado (generado en build)
├── docs/               # Documentación
├── examples/           # Ejemplos de uso
├── scripts/            # Scripts de utilidad
├── src/                # Código fuente
│   ├── agent/          # Agentes de IA y procesamiento
│   ├── config/         # Configuración y validación
│   ├── db/             # Gestión de la base de datos
│   ├── types/          # Definiciones de tipos e interfaces
│   ├── utils/          # Utilidades y herramientas
│   └── index.ts        # Punto de entrada principal
└── tests/              # Pruebas unitarias y de integración
```

## Componentes Principales

### 1. Clase CyberMySQLOpenAI

**Ubicación**: `src/agent/cyberMySQLOpenAI.ts`

Esta es la clase principal que los usuarios utilizarán para interactuar con la librería. Proporciona métodos para traducir consultas en lenguaje natural a SQL, ejecutar consultas y obtener resultados formateados.

**Métodos clave**:

- `query()`: Procesa una consulta en lenguaje natural, la traduce a SQL y la ejecuta
- `executeSQL()`: Ejecuta una consulta SQL directamente
- `close()`: Cierra las conexiones a la base de datos

### 2. DBManager

**Ubicación**: `src/db/index.ts`

Maneja toda la interacción con la base de datos MySQL, incluyendo:

- Gestión de conexiones
- Ejecución de consultas
- Obtención del esquema de la base de datos (con columnas y foreign keys)
- Detección automática de relaciones FK vía `information_schema`
- Validación de consultas de solo lectura

### 3. ResponseFormatter

**Ubicación**: `src/utils/responseFormatter.ts`

Se encarga de convertir los resultados técnicos de SQL en explicaciones en lenguaje natural:

- Genera respuestas simples para resultados estándar
- Produce análisis detallados cuando se solicita
- Formatea los resultados para una mejor legibilidad

### 4. Limpiador SQL (sqlCleaner)

**Ubicación**: `src/utils/sqlCleaner.ts`

Limpia y formatea las consultas SQL generadas por la IA:

- Elimina comentarios innecesarios
- Extrae la consulta SQL real de la respuesta de la IA
- Garantiza que las consultas sean seguras y bien formadas

## Flujo de Trabajo

El flujo típico de una consulta es:

1. **Recepción de consulta en lenguaje natural**:
   - El usuario envía una consulta usando el método `query()`

2. **Obtención del esquema de la base de datos**:
   - `DBManager` recupera la estructura de la base de datos (columnas + foreign keys)

3. **Construcción del prompt enriquecido**:
   - Se inyecta contexto de negocio (si está configurado)
   - Se incluyen relaciones FK detectadas
   - Se agregan ejemplos few-shot (si están definidos)

4. **Generación de SQL**:
   - Se intenta usar function calling de OpenAI para obtener `{ sql, confidence, reasoning }`
   - Si el modelo no soporta function calling, se cae automáticamente a modo texto con `sqlCleaner`

5. **Ejecución de la consulta**:
   - `DBManager` ejecuta la consulta en la base de datos MySQL

6. **Corrección de errores (si es necesario)**:
   - Si hay errores, se inician "reflexiones" para corregir la consulta
   - Las reflexiones también usan function calling con fallback
   - Se puede intentar hasta `maxReflections` veces

7. **Generación de respuesta natural**:
   - `ResponseFormatter` convierte los resultados técnicos en texto comprensible

8. **Devolución de resultados**:
   - Se devuelve un objeto con SQL, resultados, confianza y explicaciones

## Configuración

La librería es altamente configurable a través de varios parámetros:

### Configuración de la Base de Datos

```typescript
{
  host: 'localhost',
  port: 3306,
  user: 'username',
  password: 'password',
  database: 'my_database',
  ssl: false,
  socketPath: '/path/to/mysql.sock' // Opcional
}
```

### Configuración de OpenAI

```typescript
{
  apiKey: 'tu_clave_api',
  model: 'gpt-4' // o 'gpt-3.5-turbo', etc.
}
```

### Configuración Adicional

```typescript
{
  maxReflections: 3, // Número máximo de intentos de corrección
  logLevel: 'info', // 'error', 'warn', 'info', 'debug'
  logDirectory: './logs', // Directorio para logs
  language: 'en' // Idioma de respuestas: 'es' (español) o 'en' (inglés)
}
```

### Configuración de Contexto de Inteligencia (v0.2.0)

```typescript
{
  context: {
    businessDescription: 'Descripción del dominio de negocio',
    tables: {
      nombre_tabla: {
        description: 'Descripción de la tabla',
        columns: {
          nombre_columna: 'Descripción de la columna'
        }
      }
    },
    examples: [
      { question: 'Pregunta de ejemplo', sql: 'SELECT ...' }
    ]
  }
}
```

## Sistemas de Registro

**Ubicación**: `src/utils/index.ts`

La librería incluye un sistema de logging avanzado que:

- Registra operaciones en diferentes niveles (error, warn, info, debug)
- Almacena logs en archivos para diagnóstico
- Captura uso de tokens de OpenAI para seguimiento de costos
- Registra prompts y respuestas para auditoría

## Tipos y Interfaces

**Ubicación**: `src/types/index.ts`

Principales interfaces:

- `DBConfig`: Configuración de la base de datos
- `OpenAIConfig`: Configuración de OpenAI
- `CyberMySQLOpenAIConfig`: Configuración completa (incluye `context` opcional)
- `TranslationResult`: Resultado de una traducción (incluye `confidence` opcional)
- `SQLResult`: Resultado de una ejecución SQL directa
- `Reflection`: Estructura de una reflexión para corrección
- `NaturalResponseOptions`: Opciones para respuestas naturales
- `SchemaContext`: Contexto de negocio y metadata del esquema
- `TableContext`: Descripción y metadata de columnas por tabla
- `QueryExample`: Par pregunta/SQL para ejemplos few-shot

## Guía para Agregar Nuevas Funcionalidades

### 1. Añadir un Nuevo Método a CyberMySQLOpenAI

Para añadir una nueva capacidad a la librería:

1. Actualiza las interfaces en `src/types/index.ts` si es necesario
2. Implementa el nuevo método en `src/agent/cyberMySQLOpenAI.ts`
3. Añade la funcionalidad de bajo nivel en los módulos correspondientes
4. Asegúrate de que el nuevo método esté correctamente exportado en `src/index.ts`

### 2. Ampliar Capacidades de Procesamiento de Lenguaje

Para mejorar la comprensión de lenguaje natural:

1. Modifica los prompts en `src/utils/i18n.ts` (soporte para placeholders `{businessContext}`, `{relationships}`, `{examples}`)
2. Añade contexto de negocio vía `SchemaContext` en la configuración
3. Proporciona ejemplos few-shot para patrones específicos de tu dominio
4. Considera ajustar parámetros de la API de OpenAI para diferentes casos

### 3. Añadir Soporte para Características de MySQL

Para añadir soporte para más características de MySQL:

1. Amplía `src/db/index.ts` para manejar nuevos tipos de consultas o características
2. Actualiza la validación en `executeReadOnlyQuery()` si es necesario
3. Mejora la obtención del esquema para incluir más metadatos

### 4. Crear Nuevos Formatos de Respuesta

Para ofrecer nuevos formatos de respuesta:

1. Añade nuevos métodos a `src/utils/responseFormatter.ts`
2. Actualiza la interfaz `NaturalResponseOptions` con nuevas opciones
3. Implementa el soporte en `query()` y `executeSQL()`

## Pruebas

**Ubicación**: `tests/` y `docs/testing-guide.md`

La librería utiliza Jest para las pruebas. Para ejecutar las pruebas:

```bash
npm test
```

Para añadir nuevas pruebas:

1. Crea archivos de prueba en la carpeta `tests/`
2. Para pruebas de integración, necesitarás una base de datos MySQL de prueba
3. Utiliza mocks para pruebas unitarias que no requieren una base de datos real

## Publicación y Distribución

La librería está preparada para su distribución a través de npm:

1. Incrementa la versión en `package.json`
2. Ejecuta las pruebas: `npm test`
3. Construye la librería: `npm run build`
4. Publica en npm: `npm publish --access public   `

Para pruebas locales antes de publicar, consulta `docs/testing-guide.md`.

### CI/CD

El proyecto incluye un workflow de GitHub Actions (`.github/workflows/publish.yml`) que:

- Ejecuta build, lint y tests en cada push a `master` y en PRs
- Publica automáticamente a npm cuando se crea un tag de versión (e.g., `v0.2.0`)

Para publicar una nueva versión:

1. Actualiza la versión en `package.json` (o usa `npm version patch|minor|major`)
2. Crea y sube el tag: `git tag v0.2.0 && git push origin v0.2.0`
3. El workflow se encarga del resto

## Sistema de Cache en Memoria

**Ubicación**: `src/cache/memoryCache.ts`

La librería incluye un sistema de cache en memoria opcional que puede mejorar significativamente el rendimiento al evitar consultas repetitivas a OpenAI y MySQL.

### Características del Cache

- **Cache inteligente**: TTL (Time To Live) variable según el tipo de consulta
- **Normalización de consultas**: Mejora la tasa de aciertos del cache
- **Gestión automática de memoria**: Limpieza automática de entradas expiradas
- **Invalidación selectiva**: Posibilidad de invalidar cache por tabla específica
- **Estadísticas detalladas**: Monitoreo del rendimiento del cache

### Configuración del Cache

```typescript
const translator = new CyberMySQLOpenAI({
  // ... otras configuraciones
  cache: {
    enabled: true, // Habilitar cache (default: true)
    maxSize: 1000, // Máximo número de entradas (default: 1000)
    cleanupIntervalMs: 300000, // Intervalo de limpieza en ms (default: 5min)
  },
});

// Cache deshabilitado
const translatorNoCache = new CyberMySQLOpenAI({
  // ... otras configuraciones
  cache: {
    enabled: false,
  },
});
```

### Tipos de TTL por Consulta

El sistema aplica diferentes tiempos de vida según el tipo de consulta:

- **Consultas de esquema** (SHOW TABLES, DESCRIBE): 1 hora
- **Consultas agregadas** (COUNT, SUM, AVG, GROUP BY): 15 minutos
- **Consultas normales**: 5 minutos

### Uso en APIs

```typescript
// Instancia compartida para APIs (recomendado)
const translator = new CyberMySQLOpenAI({
  // ... configuración
  cache: { enabled: true },
});

// En Express.js
app.post("/api/query", async (req, res) => {
  const result = await translator.query(req.body.prompt);
  res.json({
    ...result,
    cached: result.fromCache,
    executionTime: result.executionTime,
  });
});
```

### Métodos del Cache

```typescript
// Obtener estadísticas
const stats = translator.getCacheStats();
console.log(`Hit rate: ${stats.hitRate}%`);

// Limpiar cache completamente
translator.clearCache();

// Invalidar cache por tabla
translator.invalidateCacheByTable("products");

// Habilitar/deshabilitar dinámicamente
translator.setCacheEnabled(false);
console.log(translator.isCacheEnabled()); // false

// Bypass cache para consulta específica
const result = await translator.query("Show me latest data", {
  bypassCache: true,
});
```

### Beneficios de Rendimiento

- **Reducción de latencia**: 90-95% menos tiempo en consultas repetitivas
- **Ahorro de costos**: Menos llamadas a OpenAI API
- **Mejor UX**: Respuestas instantáneas para consultas frecuentes
- **Escalabilidad**: Soporte para más requests simultáneos

### Ejemplo Práctico

```typescript
// Primera consulta: ~1500ms (OpenAI + MySQL)
const result1 = await translator.query("Show me total sales");

// Segunda consulta idéntica: ~50ms (desde cache)
const result2 = await translator.query("Show me total sales");

console.log(result2.fromCache); // true
console.log(result2.executionTime); // ~50ms
```

## Soporte Multiidioma

**Ubicación**: `src/utils/i18n.ts`

La librería incluye soporte nativo para múltiples idiomas en las respuestas generadas. Actualmente soporta:

- **Español (es)**: Idioma por defecto
- **Inglés (en)**: Disponible desde la versión actual

### Configuración de Idioma

```typescript
// Al inicializar
const translator = new CyberMySQLOpenAI({
  // ... otras configuraciones
  language: "en", // 'es' (español) o 'en' (inglés)
});

// Cambiar idioma dinámicamente
translator.setLanguage("en");
console.log("Idioma actual:", translator.getLanguage());
```

### Características Localizadas

- **Mensajes de error**: Todos los mensajes de error están localizados
- **Prompts de OpenAI**: Los prompts enviados a OpenAI están en el idioma seleccionado
- **Respuestas naturales**: Las explicaciones se generan en el idioma configurado
- **Etiquetas de interfaz**: Labels y textos de la interfaz están traducidos

### Diccionario de Mensajes

El sistema utiliza diccionarios estructurados que incluyen:

- `errors`: Mensajes de error
- `success`: Mensajes de éxito
- `prompts`: Plantillas para prompts de OpenAI
- `responses`: Respuestas naturales por defecto
- `labels`: Etiquetas de interfaz

### Ejemplo de Uso

```typescript
import { CyberMySQLOpenAI } from "cyber-mysql-openai";

const translator = new CyberMySQLOpenAI({
  // ... configuración de DB y OpenAI
  language: "en",
});

// Consulta en inglés
const result = await translator.query("What are the top 5 products?");
console.log(result.naturalResponse); // Respuesta en inglés

// Cambiar a español
translator.setLanguage("es");
const resultado = await translator.query(
  "¿Cuáles son los 5 productos principales?",
);
console.log(resultado.naturalResponse); // Respuesta en español
```

---

Esta guía técnica está diseñada para ayudarte a navegar y extender el proyecto `cyber-mysql-openai`. Si encuentras algún problema o tienes preguntas, revisa las pruebas y ejemplos existentes como referencia.
