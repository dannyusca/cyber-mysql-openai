# Guía de Pruebas — cyber-mysql-openai v0.3.0

Guía para probar las nuevas funcionalidades de v0.3.0.

## 1. Instrucciones Personalizadas

Reglas personalizadas inyectadas directamente en el prompt de generación SQL:

```typescript
const agent = new CyberMySQLOpenAI({
  database: { host, user, password, database },
  openai: { apiKey, model: "gpt-4o-mini" },
  context: {
    businessDescription: "Tienda en línea de electrónicos",
    customInstructions: [
      "Siempre excluir productos deshabilitados (disabled = 0)",
      "Cuando pregunten por 'ingresos', usar SUM(total_amount) de la tabla sales",
      "Preferir aliases en español para los resultados",
    ],
    responseStyle: "concise", // 'concise' | 'detailed' | 'technical'
  },
});
```

### Opciones de responseStyle

| Estilo      | Comportamiento                                  |
| ----------- | ----------------------------------------------- |
| `concise`   | Respuestas cortas y directas                    |
| `detailed`  | Explicaciones completas con contexto e insights |
| `technical` | Lenguaje técnico con detalles SQL               |

---

## 2. Validación de Queries

La validación automática se ejecuta antes de cada consulta. No requiere configuración.

Para ver las advertencias de validación, habilita el logging en modo debug:

```typescript
const agent = new CyberMySQLOpenAI({
  // ...
  logLevel: "debug",
});
```

Validaciones incluidas:

- ✅ Solo queries SELECT permitidas
- ✅ Existencia de tablas en el schema
- ✅ Existencia de columnas (mejor esfuerzo)
- ✅ Advertencia si falta LIMIT
- ✅ Detección de productos cartesianos
- ✅ Sugerencia al usar SELECT \*

---

## 3. Cache de Schema

El schema se cachea por 5 minutos por defecto:

```typescript
const agent = new CyberMySQLOpenAI({
  // ...
  schemaTTL: 600000, // 10 minutos en ms
});

// Forzar refresco después de cambios en el schema:
agent.refreshSchema();
```

---

## 4. Seguimiento de Uso de Tokens

Cada resultado de consulta incluye el uso de tokens:

```typescript
const result = await agent.query("¿Cuántos productos tenemos?");

if (result.tokenUsage) {
  console.log(`Tokens de prompt: ${result.tokenUsage.promptTokens}`);
  console.log(`Tokens de completado: ${result.tokenUsage.completionTokens}`);
  console.log(`Tokens totales: ${result.tokenUsage.totalTokens}`);
}
```

---

## 5. Historial de Consultas

Rastrea todas las consultas ejecutadas en memoria:

```typescript
// Ejecutar algunas consultas
await agent.query("Total de ventas de este mes");
await agent.query("Top 5 productos por ingresos");

// Obtener historial
const historial = agent.getQueryHistory(); // todo
const ultimas5 = agent.getQueryHistory(5); // últimas 5

// Obtener estadísticas
const stats = agent.getQueryStats();
console.log(stats);
// {
//   totalQueries: 2,
//   successfulQueries: 2,
//   failedQueries: 0,
//   averageExecutionTime: 3500,
//   cacheHitRate: 0,
//   totalTokensUsed: 1200
// }

// Exportar como JSON
const json = agent.exportQueryHistory();

// Limpiar
agent.clearQueryHistory();
```

---

## 6. Prompts Mejorados

No requiere configuración — los prompts se mejoran automáticamente:

- **Mejor optimización SQL**: JOINs sobre subqueries, aliases descriptivos, LIMIT automático
- **Contexto de negocio en respuestas**: Las respuestas en lenguaje natural referencian tu contexto
- **Corrección de errores más inteligente**: fixSQLError ahora usa ejemplos y contexto de negocio
- **Desambiguación**: Usa el contexto de negocio para resolver consultas ambiguas

---

## Ejemplo Completo

```typescript
import { CyberMySQLOpenAI } from "cyber-mysql-openai";

const agent = new CyberMySQLOpenAI({
  database: {
    host: "localhost",
    user: "root",
    password: "password",
    database: "mi_tienda",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
  language: "es",
  schemaTTL: 300000,
  context: {
    businessDescription: "Sistema POS de licorería",
    customInstructions: [
      "Excluir productos deshabilitados (disabled = 0)",
      "Usar SUM(total_amount) para consultas de ingresos",
    ],
    responseStyle: "concise",
    tables: {
      products: { description: "Catálogo de productos" },
      sales: { description: "Transacciones de venta" },
    },
    examples: [
      {
        question: "¿Ventas mensuales?",
        sql: "SELECT SUM(total_amount) FROM sales WHERE MONTH(created_at) = MONTH(CURRENT_DATE())",
      },
    ],
  },
});

// Consulta con todas las funcionalidades activas
const result = await agent.query("Top 5 productos más vendidos");
console.log("SQL:", result.sql);
console.log("Tokens:", result.tokenUsage);

// Ver estadísticas
console.log("Stats:", agent.getQueryStats());

// Cerrar conexión
await agent.close();
```
