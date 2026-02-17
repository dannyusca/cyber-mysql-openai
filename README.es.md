# Cyber-MySQL-OpenAI

**Traductor inteligente de lenguaje natural a SQL para Node.js**

Cyber-MySQL-OpenAI es una librería para Node.js que traduce consultas en lenguaje natural a SQL válido, ejecuta las consultas en MySQL y devuelve los resultados acompañados de explicaciones comprensibles, todo impulsado por OpenAI.

[English documentation](README.md)

---

## Tabla de Contenidos

- [Características](#características)
- [Instalación](#instalación)
- [Requisitos del Sistema](#requisitos-del-sistema)
- [Uso Básico](#uso-básico)
- [Opciones de Configuración](#opciones-de-configuración)
- [Sistema de Cache](#sistema-de-cache)
- [Soporte Multiidioma](#soporte-multiidioma)
- [Referencia de API](#referencia-de-api)
- [Solución de Problemas](#solución-de-problemas)
- [Estado del Proyecto](#estado-del-proyecto)
- [Licencia](#licencia)

---

## Características

- **Traducción de lenguaje natural a SQL** — Convierte preguntas en texto plano a consultas SQL válidas
- **Ejecución automática** — Ejecuta las consultas generadas directamente en tu base de datos MySQL
- **Corrección autónoma de errores** — Detecta y corrige consultas fallidas de forma autónoma (hasta 3 intentos de reflexión)
- **Explicaciones en lenguaje natural** — Traduce los resultados técnicos a respuestas comprensibles
- **Soporte multiidioma** — Español e inglés con cambio dinámico en tiempo de ejecución
- **Cache en memoria** — Capa de caché opcional de alto rendimiento con TTL variable y limpieza automática
- **Soporte completo para TypeScript** — Definiciones de tipos completas para una experiencia de desarrollo fluida
- **Altamente configurable** — Ajusta logging, cache, idioma y modelo según tus necesidades
- **Logging avanzado** — Sistema de logging estructurado con seguimiento de uso de tokens y auditoría de prompts/respuestas

---

## Instalación

```bash
npm install cyber-mysql-openai
```

---

## Requisitos del Sistema

| Requisito         | Detalles                                               |
| ----------------- | ------------------------------------------------------ |
| **Node.js**       | v16.x o superior (desarrollado y probado con v22.15.0) |
| **Base de datos** | MySQL o MariaDB                                        |
| **Clave API**     | Una clave API válida de OpenAI                         |

---

## Uso Básico

```typescript
import { CyberMySQLOpenAI } from "cyber-mysql-openai";
import "dotenv/config";

const translator = new CyberMySQLOpenAI({
  database: {
    host: process.env.DB_HOST || "localhost",
    port: 3306,
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "",
    ssl: false,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: "gpt-4",
  },
  language: "es",
});

async function main() {
  try {
    const result = await translator.query(
      "¿Cuál fue el producto más vendido el mes pasado?",
    );

    console.log("SQL generado:", result.sql);
    console.log("Resultados:", result.results);
    console.log("Explicación:", result.naturalResponse);

    await translator.close();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
```

---

## Opciones de Configuración

```typescript
const translator = new CyberMySQLOpenAI({
  // Conexión a la base de datos
  database: {
    host: "localhost",
    port: 3306,
    user: "username",
    password: "password",
    database: "my_database",
    ssl: false,
    socketPath: "/path/to/mysql.sock", // Opcional
  },

  // Configuración de OpenAI
  openai: {
    apiKey: "tu_clave_api",
    model: "gpt-4", // También soporta 'gpt-3.5-turbo', etc.
  },

  // Configuración del cache (opcional)
  cache: {
    enabled: true, // Habilitar/deshabilitar cache
    maxSize: 1000, // Máximo de entradas en cache
    defaultTTL: 300000, // TTL por defecto en milisegundos (5 min)
    cleanupInterval: 300000, // Intervalo de limpieza en milisegundos
  },

  // Configuración general
  maxReflections: 3, // Máximo de intentos de corrección ante errores SQL
  logLevel: "info", // 'error' | 'warn' | 'info' | 'debug' | 'none'
  logDirectory: "./logs", // Directorio para archivos de log
  logEnabled: true, // Establecer en false para desactivar logs
  language: "es", // 'es' (Español) o 'en' (Inglés)
});
```

---

## Sistema de Cache

Cyber-MySQL-OpenAI incluye un sistema de cache en memoria opcional que mejora significativamente los tiempos de respuesta para consultas repetidas o similares.

### Funcionamiento

- **Normalización de consultas** — Las consultas se normalizan antes de buscar en cache para maximizar aciertos
- **TTL variable** — El tiempo de vida se determina dinámicamente según el tipo de consulta:
  - Consultas de esquema/metadatos: 1 hora
  - Consultas agregadas (COUNT, SUM, AVG, GROUP BY): 15 minutos
  - Consultas simples: 5 minutos
- **Limpieza automática** — Las entradas expiradas se eliminan periódicamente
- **Métricas de rendimiento** — Estadísticas en tiempo real incluyendo tasa de aciertos y uso de memoria

### Uso Básico del Cache

```typescript
const translator = new CyberMySQLOpenAI({
  // ... configuración de BD y OpenAI
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTTL: 300000,
    cleanupInterval: 300000,
  },
});

const result1 = await translator.query("Muéstrame todos los usuarios"); // Consulta a la BD
const result2 = await translator.query("Muéstrame todos los usuarios"); // Resultado desde cache

console.log("Desde cache:", result2.fromCache); // true
console.log("Tiempo de ejecución:", result2.executionTime); // Significativamente más rápido
```

### Gestión del Cache

```typescript
// Obtener estadísticas de rendimiento
const stats = translator.getCacheStats();
console.log("Tasa de aciertos:", stats.hitRate);
console.log("Entradas:", stats.totalEntries);

// Limpiar todas las entradas
translator.clearCache();

// Activar/desactivar cache en tiempo de ejecución
translator.disableCache();
translator.enableCache();
console.log("Cache activo:", translator.isCacheEnabled());
```

### Mejores Prácticas para Integración en APIs

Usa una instancia global compartida para maximizar la efectividad del cache entre peticiones:

```typescript
// api-instance.ts
import { CyberMySQLOpenAI } from "cyber-mysql-openai";

export const translator = new CyberMySQLOpenAI({
  // ... configuración
  cache: { enabled: true, maxSize: 2000 },
});

// api-routes.ts
import { translator } from "./api-instance";

app.get("/query", async (req, res) => {
  const result = await translator.query(req.body.question);
  res.json({
    ...result,
    cached: result.fromCache,
    responseTime: result.executionTime,
  });
});
```

> **Nota:** El cache se comparte entre todas las peticiones y usuarios. Asegúrate de que este comportamiento sea apropiado para tu caso de uso. Para datos específicos por usuario, implementa estrategias de invalidación de cache.

Para más ejemplos, consulta [docs/cache-examples.md](docs/cache-examples.md).

---

## Soporte Multiidioma

La librería soporta español e inglés para todas las respuestas, mensajes de error y prompts de OpenAI. El idioma se puede configurar al inicializar o cambiar dinámicamente en tiempo de ejecución.

### Configuración

```typescript
// Establecer durante la inicialización
const translator = new CyberMySQLOpenAI({
  // ... otra configuración
  language: "es", // 'es' para Español, 'en' para Inglés
});

// Cambiar en tiempo de ejecución
translator.setLanguage("en");
console.log("Idioma actual:", translator.getLanguage());
```

### Qué se Localiza

- Mensajes de error
- Prompts enviados a OpenAI
- Explicaciones en lenguaje natural
- Etiquetas de interfaz y texto de estado

### Ejemplo: Cambio Dinámico

```typescript
translator.setLanguage("es");
const resultadoEspanol = await translator.query(
  "¿Cuáles son los 5 productos principales?",
);
console.log(resultadoEspanol.naturalResponse); // Respuesta en español

translator.setLanguage("en");
const englishResult = await translator.query("What are the top 5 products?");
console.log(englishResult.naturalResponse); // Respuesta en inglés
```

---

## Referencia de API

### CyberMySQLOpenAI

| Método                      | Descripción                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `constructor(config)`       | Crea una nueva instancia con la configuración proporcionada                        |
| `query(prompt, options?)`   | Traduce una pregunta en lenguaje natural a SQL, la ejecuta y devuelve el resultado |
| `executeSQL(sql, options?)` | Ejecuta una consulta SQL directamente (sin traducción)                             |
| `close()`                   | Cierra todas las conexiones a la base de datos                                     |
| `setLanguage(lang)`         | Establece el idioma de respuesta (`'es'` o `'en'`)                                 |
| `getLanguage()`             | Devuelve el idioma configurado actualmente                                         |

### Métodos del Cache

| Método                              | Descripción                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `getCacheStats()`                   | Devuelve estadísticas del cache (tasa de aciertos, uso de memoria, conteo de entradas) |
| `clearCache()`                      | Elimina todas las entradas del cache                                                   |
| `enableCache()`                     | Habilita el sistema de cache                                                           |
| `disableCache()`                    | Deshabilita el sistema de cache                                                        |
| `isCacheEnabled()`                  | Indica si el cache está activo actualmente                                             |
| `invalidateCacheByTable(tableName)` | Elimina entradas del cache relacionadas con una tabla específica                       |

### Opciones de Consulta

```typescript
const result = await translator.query("¿Cuál fue el mes con más ventas?", {
  detailed: true, // Solicitar una respuesta analítica detallada
  bypassCache: true, // Omitir cache y forzar una consulta nueva
});

console.log("Respuesta simple:", result.naturalResponse);
console.log("Respuesta detallada:", result.detailedResponse);
```

### Tipos de Respuesta

**TranslationResult** (devuelto por `query`):

| Campo              | Tipo           | Descripción                                      |
| ------------------ | -------------- | ------------------------------------------------ |
| `sql`              | `string`       | La consulta SQL generada                         |
| `results`          | `any[]`        | Resultados de la consulta desde la base de datos |
| `reflections`      | `Reflection[]` | Historial de correcciones de error (si hubo)     |
| `attempts`         | `number`       | Total de intentos de ejecución                   |
| `success`          | `boolean`      | Si la consulta fue exitosa                       |
| `naturalResponse`  | `string`       | Explicación comprensible                         |
| `detailedResponse` | `string`       | Análisis detallado (cuando `detailed: true`)     |
| `executionTime`    | `number`       | Tiempo total de ejecución en milisegundos        |
| `fromCache`        | `boolean`      | Si el resultado se sirvió desde el cache         |

---

## Solución de Problemas

### Reinicios de Nodemon

Si Nodemon se reinicia constantemente por la generación de archivos de log, agrega esto a tu `package.json` o `nodemon.json`:

```json
{
  "nodemonConfig": {
    "ignore": ["*.log", "tmp/*", "logs/*"]
  }
}
```

### Problemas con Respuestas Detalladas

1. Actualiza a la última versión: `npm update cyber-mysql-openai`
2. Verifica que tu clave API de OpenAI tenga créditos suficientes
3. Reduce la verbosidad del log con `logLevel: 'warn'` o `logLevel: 'error'`

### Configuración de Logs

```typescript
// Desactivar todos los logs
const translator = new CyberMySQLOpenAI({
  logEnabled: false,
});

// Registrar solo errores
const translator = new CyberMySQLOpenAI({
  logLevel: "error",
});
```

---

## Estado del Proyecto

Este proyecto está en **versión estable** y en desarrollo activo. Las contribuciones y comentarios son bienvenidos.

### Limitaciones Actuales

- Las consultas muy complejas pueden requerir múltiples iteraciones de corrección
- Algunas construcciones SQL avanzadas pueden no ser interpretadas correctamente
- El rendimiento depende de la complejidad del esquema de la base de datos y la latencia del modelo de OpenAI

### Hoja de Ruta

- Optimización de rendimiento para esquemas de base de datos grandes
- Soporte para dialectos SQL adicionales
- Mejora en el manejo de consultas complejas multi-tabla
- Ampliación de documentación y ejemplos de uso

---

## Licencia

MIT
