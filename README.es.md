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
- [Funciones de Inteligencia (v0.2.0)](#funciones-de-inteligencia)
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
- **Salida estructurada con function calling** — Usa function calling de OpenAI para respuestas JSON predecibles con fallback automático a texto
- **Contexto de negocio** — Enriquece la IA con conocimiento específico del dominio sobre tus tablas y columnas
- **Detección de relaciones Foreign Key** — Descubre automáticamente las relaciones FK para JOINs precisos
- **Ejemplos few-shot** — Proporciona pares pregunta/SQL de referencia para guiar al modelo
- **Puntuación de confianza** — Cada consulta incluye un score de confianza indicando qué tan bien responde a la pregunta
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

## Funciones de Inteligencia

> Nuevo en v0.2.0

Cyber-MySQL-OpenAI se puede configurar con contexto de negocio para mejorar drásticamente la precisión y relevancia de las consultas SQL generadas.

### Contexto de Negocio

Proporciona a la IA conocimiento específico del dominio sobre tu base de datos:

```typescript
import { CyberMySQLOpenAI, SchemaContext } from "cyber-mysql-openai";

const context: SchemaContext = {
  businessDescription:
    "Plataforma de e-commerce para productos electrónicos con pedidos, clientes e inventario",
  tables: {
    orders: {
      description: "Pedidos de compra con seguimiento de estado",
      columns: {
        status:
          "Estado del pedido: 'pending', 'shipped', 'delivered', 'cancelled'",
        total_amount: "Total en USD incluyendo impuestos y envío",
      },
    },
    products: {
      description: "Catálogo de productos con precios y niveles de stock",
      columns: {
        sku: "Identificador único del producto usado en sistemas de almacén",
        price: "Precio actual de venta en USD (antes de descuentos)",
      },
    },
  },
};

const translator = new CyberMySQLOpenAI({
  database: {
    /* ... */
  },
  openai: {
    /* ... */
  },
  context, // Se inyecta en cada prompt
});
```

### Ejemplos Few-Shot

Guía al modelo con pares pregunta/SQL de referencia específicos de tu dominio:

```typescript
const context: SchemaContext = {
  businessDescription: "Plataforma de e-commerce",
  tables: {
    /* ... */
  },
  examples: [
    {
      question: "¿Cuáles son las ventas totales de este mes?",
      sql: "SELECT SUM(total_amount) as total_ventas FROM orders WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())",
    },
    {
      question: "¿Qué productos tienen poco stock?",
      sql: "SELECT name, stock FROM products WHERE stock < 10 ORDER BY stock ASC",
    },
  ],
};
```

### Relaciones Foreign Key

La librería detecta automáticamente las relaciones FK desde el `information_schema` de tu base de datos y las incluye en el prompt de la IA. Esto permite al modelo construir JOINs precisos sin necesidad de describir manualmente las relaciones entre tablas.

### Function Calling con Fallback

La librería usa la funcionalidad de function calling de OpenAI para respuestas estructuradas y predecibles:

- **Modo primario (function calling):** Devuelve `{ sql, confidence, reasoning }` como JSON estructurado
- **Modo fallback (texto):** Si el modelo no soporta function calling, la librería cae automáticamente al parsing de texto con `sqlCleaner`

Este enfoque dual asegura compatibilidad con todos los modelos de OpenAI (GPT-3.5, GPT-4, GPT-4o, etc.).

### Puntuación de Confianza

Cada resultado de consulta incluye un campo opcional `confidence` (0–1) cuando function calling está disponible:

```typescript
const result = await translator.query(
  "¿Cuáles son los 5 productos con más ingresos?",
);

console.log(result.confidence); // 0.95
console.log(result.sql); // SELECT ...
```

Usa `confidence` para implementar lógica como advertir al usuario cuando el modelo no está seguro, o activar una revisión manual para consultas con baja confianza.

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

| Campo              | Tipo           | Descripción                                               |
| ------------------ | -------------- | --------------------------------------------------------- |
| `sql`              | `string`       | La consulta SQL generada                                  |
| `results`          | `any[]`        | Resultados de la consulta desde la base de datos          |
| `reflections`      | `Reflection[]` | Historial de correcciones de error (si hubo)              |
| `attempts`         | `number`       | Total de intentos de ejecución                            |
| `success`          | `boolean`      | Si la consulta fue exitosa                                |
| `confidence`       | `number?`      | Score de confianza (0–1), disponible con function calling |
| `naturalResponse`  | `string`       | Explicación comprensible                                  |
| `detailedResponse` | `string`       | Análisis detallado (cuando `detailed: true`)              |
| `executionTime`    | `number`       | Tiempo total de ejecución en milisegundos                 |
| `fromCache`        | `boolean`      | Si el resultado se sirvió desde el cache                  |

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

- ~~Contexto de negocio y metadata de esquema~~ (incluido en v0.2.0)
- ~~Detección de relaciones Foreign Key~~ (incluido en v0.2.0)
- ~~Function calling con salida estructurada~~ (incluido en v0.2.0)
- ~~Soporte de ejemplos few-shot~~ (incluido en v0.2.0)
- Optimización de rendimiento para esquemas de base de datos grandes
- Soporte para dialectos SQL adicionales
- Ampliación de documentación y ejemplos de uso

---

## Licencia

MIT
