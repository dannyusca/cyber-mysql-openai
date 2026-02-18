# Cyber-MySQL-OpenAI

**Intelligent natural language to SQL translator for Node.js**

Cyber-MySQL-OpenAI is a powerful Node.js library that translates natural language queries into valid SQL, executes them against MySQL databases, and returns results accompanied by human-readable explanations — all powered by OpenAI.

[Spanish documentation / Documentación en español](README.es.md)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [System Requirements](#system-requirements)
- [Basic Usage](#basic-usage)
- [Intelligence Features (v0.3.0)](#intelligence-features-v030)
- [Configuration Options](#configuration-options)
- [Cache System](#cache-system)
- [Multi-Language Support](#multi-language-support)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Project Status](#project-status)
- [License](#license)

---

## Features

- **Natural language to SQL translation** — Converts plain-text questions into valid SQL queries
- **Automatic execution** — Runs generated queries directly against your MySQL database
- **Self-correcting error handling** — Detects and autonomously corrects failed queries (up to 3 reflection attempts)
- **Natural language explanations** — Translates technical query results into user-friendly responses
- **Structured output with function calling** — Uses OpenAI function calling for predictable JSON responses with automatic text fallback
- **Business context awareness** — Enrich the AI with domain-specific knowledge about your tables and columns
- **Foreign key relationship detection** — Automatically discovers and uses FK relationships for accurate JOINs
- **Few-shot examples** — Provide reference question/SQL pairs to guide the model
- **Confidence scoring** — Each query includes a confidence score indicating how well it answers the question
- **Multi-language support** — English and Spanish with dynamic runtime switching
- **In-memory cache** — Optional high-performance caching layer with variable TTL and automatic cleanup
- **Full TypeScript support** — Complete type definitions for a seamless developer experience
- **Highly configurable** — Adjust logging, caching, language, and model settings to fit your needs
- **Enhanced Intelligence (v0.3.0)** — Improved prompts with SQL optimization rules, aliases, and better disambiguation
- **Custom Instructions** — Inject your own business rules and response styles into the AI
- **Query Validation Layer** — Automatically checks generated SQL for safety, table existence, and cartesian products
- **Schema Caching** — Configurable TTL to reduce database load and improve latency
- **Token Usage Tracking** — Detailed token counts and estimated cost per query
- **Query History** — In-memory log of executed queries with performance statistics
- **Advanced logging** — Structured logging system with token usage tracking and prompt/response audit trails

---

## Installation

```bash
npm install cyber-mysql-openai
```

---

## System Requirements

| Requirement  | Details                                              |
| ------------ | ---------------------------------------------------- |
| **Node.js**  | v16.x or higher (developed and tested with v22.15.0) |
| **Database** | MySQL or MariaDB                                     |
| **API Key**  | A valid OpenAI API key                               |

---

## Basic Usage

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
  language: "en",
});

async function main() {
  try {
    const result = await translator.query(
      "What was the best-selling product last month?",
    );

    console.log("Generated SQL:", result.sql);
    console.log("Results:", result.results);
    console.log("Explanation:", result.naturalResponse);

    await translator.close();
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
```

---

## Intelligence Features

> New in v0.2.0

Cyber-MySQL-OpenAI can be configured with business context to dramatically improve the accuracy and relevance of generated SQL queries.

### Business Context

Provide the AI with domain-specific knowledge about your database:

````typescript
import { CyberMySQLOpenAI, SchemaContext } from "cyber-mysql-openai";

const context: SchemaContext = {
  businessDescription:
    "E-commerce platform for electronic products with orders, customers, and inventory",
  tables: {
    orders: {
      description: "Customer purchase orders with status tracking",
      columns: {
        status: "Order status: 'pending', 'shipped', 'delivered', 'cancelled'",
        total_amount: "Total in USD including taxes and shipping",
      },
    },
    products: {
      description: "Product catalog with pricing and stock levels",
      columns: {
        sku: "Unique product identifier used in warehouse systems",
        price: "Current retail price in USD (before discounts)",
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
  context,
});
```

---

## Intelligence Features (v0.3.0)

### 1. Custom Instructions & Response Style

You can now inject specific business rules and control the personality of the AI:

```typescript
const translator = new CyberMySQLOpenAI({
  // ...
  context: {
    businessDescription: "E-commerce platform",
    // v0.3.0: Custom rules
    customInstructions: [
      "Always exclude soft-deleted records (deleted_at IS NOT NULL)",
      "When asked for 'revenue', use the sum of total_amount from orders table",
    ],
    // v0.3.0: Response style ('concise', 'detailed', 'technical')
    responseStyle: "concise",
  },
});
````

### 2. Query Validation

Every generated query is automatically validated before execution. The system checks for:

- **Dangerous operations**: Only `SELECT` statements are allowed; `UPDATE`, `DROP`, etc., are blocked.
- **Schema validation**: Checks for non-existent tables or columns (best-effort).
- **Cartesian products**: Warns about potential cartesian products due to missing JOIN conditions.
- **Performance checks**: Identifies missing `LIMIT` clauses on potentially large result sets.

### 3. Schema Caching

Reduce latency and database load by caching schema definitions:

```typescript
const translator = new CyberMySQLOpenAI({
  // ...
  schemaTTL: 600000, // Cache schema for 10 minutes (default: 5 min)
});

// Force refresh if schema changes
translator.refreshSchema();
```

### 4. Query History & Stats

Track performance and usage during the session:

```typescript
const stats = translator.getQueryStats();
console.log(stats);
// {
//   totalQueries: 10,
//   successfulQueries: 9,
//   averageExecutionTime: 450ms,
//   totalTokensUsed: 5200
// }

// Get last 5 queries
const history = translator.getQueryHistory(5);
```

### 5. Token Usage & Cost Estimation

Each result now includes detailed token usage and estimated cost:

```typescript
const result = await translator.query("Sales count?");
console.log(result.tokenUsage);
// {
//   promptTokens: 500,
//   completionTokens: 50,
//   totalTokens: 550,
//   estimatedCost: 0.0015 // USD (based on current model pricing)
// }
```

---

### Foreign Key Relationships

The library automatically detects FK relationships from your database's `information_schema` and includes them in the AI prompt. This enables the model to construct accurate JOINs without you having to describe table relationships manually.

### Few-Shot Examples

Guide the model with reference question/SQL pairs specific to your domain:

```typescript
const context: SchemaContext = {
  businessDescription: "E-commerce platform",
  tables: {
    /* ... */
  },
  examples: [
    {
      question: "What are this month's total sales?",
      sql: "SELECT SUM(total_amount) as total_sales FROM orders WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())",
    },
    {
      question: "Which products are low on stock?",
      sql: "SELECT name, stock FROM products WHERE stock < 10 ORDER BY stock ASC",
    },
  ],
};
```

### Foreign Key Relationships

The library automatically detects FK relationships from your database's `information_schema` and includes them in the AI prompt. This enables the model to construct accurate JOINs without you having to describe table relationships manually.

### Function Calling with Fallback

The library uses OpenAI's function calling feature for structured, predictable responses:

- **Primary mode (function calling):** Returns `{ sql, confidence, reasoning }` as structured JSON
- **Fallback mode (text):** If the model does not support function calling, the library automatically falls back to text parsing with `sqlCleaner`

This dual-mode approach ensures compatibility across all OpenAI models (GPT-3.5, GPT-4, GPT-4o, etc.).

### Confidence Score

Every query result includes an optional `confidence` field (0–1) when function calling is available:

```typescript
const result = await translator.query(
  "What are the top 5 products by revenue?",
);

console.log(result.confidence); // 0.95
console.log(result.sql); // SELECT ...
```

Use `confidence` to implement logic like warning users when the model is unsure, or triggering a manual review for low-confidence queries.

---

## Configuration Options

```typescript
const translator = new CyberMySQLOpenAI({
  // Database connection
  database: {
    host: "localhost",
    port: 3306,
    user: "username",
    password: "password",
    database: "my_database",
    ssl: false,
    socketPath: "/path/to/mysql.sock", // Optional
  },

  // OpenAI settings
  openai: {
    apiKey: "your_api_key",
    model: "gpt-4", // Also supports 'gpt-3.5-turbo', etc.
  },

  // Cache settings (optional)
  cache: {
    enabled: true, // Enable/disable cache
    maxSize: 1000, // Maximum number of cache entries
    defaultTTL: 300000, // Default TTL in milliseconds (5 min)
    cleanupInterval: 300000, // Cleanup interval in milliseconds
  },

  // General settings
  maxReflections: 3, // Max correction attempts on SQL errors
  logLevel: "info", // 'error' | 'warn' | 'info' | 'debug' | 'none'
  logDirectory: "./logs", // Directory for log files
  logEnabled: true, // Set to false to disable all logging
  language: "en", // 'en' (English) or 'es' (Spanish)
});
```

---

## Cache System

Cyber-MySQL-OpenAI includes an optional in-memory cache that significantly improves response times for repeated or similar queries.

### How It Works

- **Query normalization** — Queries are normalized before cache lookup to maximize hit rates
- **Variable TTL** — Time-to-live is determined dynamically based on query type:
  - Schema/metadata queries: 1 hour
  - Aggregate queries (COUNT, SUM, AVG, GROUP BY): 15 minutes
  - Simple queries: 5 minutes
- **Automatic cleanup** — Expired entries are periodically removed
- **Performance metrics** — Real-time statistics including hit rate and memory usage

### Basic Cache Usage

```typescript
const translator = new CyberMySQLOpenAI({
  // ... database and OpenAI config
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTTL: 300000,
    cleanupInterval: 300000,
  },
});

const result1 = await translator.query("Show me all users"); // Hits the database
const result2 = await translator.query("Show me all users"); // Returns from cache

console.log("From cache:", result2.fromCache); // true
console.log("Execution time:", result2.executionTime); // Significantly faster
```

### Cache Management

```typescript
// Retrieve cache performance statistics
const stats = translator.getCacheStats();
console.log("Hit rate:", stats.hitRate);
console.log("Entries:", stats.totalEntries);

// Clear all cached entries
translator.clearCache();

// Toggle cache at runtime
translator.disableCache();
translator.enableCache();
console.log("Cache active:", translator.isCacheEnabled());
```

### Best Practices for API Integration

Use a shared global instance to maximize cache effectiveness across requests:

```typescript
// api-instance.ts
import { CyberMySQLOpenAI } from "cyber-mysql-openai";

export const translator = new CyberMySQLOpenAI({
  // ... configuration
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

> **Note:** The cache is shared across all requests and users. For user-specific data, implement appropriate cache invalidation strategies.

For additional examples, see [docs/cache-examples.md](docs/cache-examples.md).

---

## Multi-Language Support

The library supports English and Spanish for all responses, error messages, and OpenAI prompts. The language can be configured at initialization or changed dynamically at runtime.

### Configuration

```typescript
// Set during initialization
const translator = new CyberMySQLOpenAI({
  // ... other configuration
  language: "en", // 'en' for English, 'es' for Spanish
});

// Change at runtime
translator.setLanguage("es");
console.log("Current language:", translator.getLanguage());
```

### What Gets Localized

- Error messages
- Prompts sent to OpenAI
- Natural language explanations
- Interface labels and status text

### Example: Dynamic Switching

```typescript
translator.setLanguage("en");
const english = await translator.query("What are the top 5 products?");
console.log(english.naturalResponse); // Response in English

translator.setLanguage("es");
const spanish = await translator.query(
  "¿Cuáles son los 5 productos principales?",
);
console.log(spanish.naturalResponse); // Response in Spanish
```

---

## API Reference

### CyberMySQLOpenAI

| Method                      | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| `constructor(config)`       | Creates a new instance with the provided configuration                           |
| `query(prompt, options?)`   | Translates a natural language prompt to SQL, executes it, and returns the result |
| `executeSQL(sql, options?)` | Executes a raw SQL query directly (no translation)                               |
| `close()`                   | Closes all database connections                                                  |
| `setLanguage(lang)`         | Sets the response language (`'en'` or `'es'`)                                    |
| `getLanguage()`             | Returns the current language setting                                             |

### Cache Methods

| Method                              | Description                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| `getCacheStats()`                   | Returns cache statistics (hit rate, memory usage, entry count) |
| `clearCache()`                      | Removes all cached entries                                     |
| `enableCache()`                     | Enables the cache system                                       |
| `disableCache()`                    | Disables the cache system                                      |
| `isCacheEnabled()`                  | Returns whether the cache is currently active                  |
| `invalidateCacheByTable(tableName)` | Removes cached entries related to a specific table             |

### Query Options

```typescript
const result = await translator.query(
  "What was the month with highest sales?",
  {
    detailed: true, // Request a detailed analytical response
    bypassCache: true, // Skip cache and force a fresh query
  },
);

console.log("Simple response:", result.naturalResponse);
console.log("Detailed response:", result.detailedResponse);
```

### Response Types

**TranslationResult** (returned by `query`):

| Field              | Type           | Description                                                   |
| ------------------ | -------------- | ------------------------------------------------------------- |
| `sql`              | `string`       | The generated SQL query                                       |
| `results`          | `any[]`        | Query results from the database                               |
| `reflections`      | `Reflection[]` | Error correction history (if any)                             |
| `attempts`         | `number`       | Total execution attempts                                      |
| `success`          | `boolean`      | Whether the query succeeded                                   |
| `confidence`       | `number?`      | Confidence score (0–1), available when using function calling |
| `naturalResponse`  | `string`       | Human-readable explanation                                    |
| `detailedResponse` | `string`       | Detailed analysis (when `detailed: true`)                     |
| `executionTime`    | `number`       | Total execution time in milliseconds                          |
| `fromCache`        | `boolean`      | Whether the result was served from cache                      |

---

## Troubleshooting

### Nodemon Restarts

If Nodemon restarts constantly due to log file generation, add this to your `package.json` or `nodemon.json`:

```json
{
  "nodemonConfig": {
    "ignore": ["*.log", "tmp/*", "logs/*"]
  }
}
```

### Detailed Response Issues

1. Update to the latest version: `npm update cyber-mysql-openai`
2. Verify your OpenAI API key has sufficient credits
3. Reduce log verbosity with `logLevel: 'warn'` or `logLevel: 'error'`

### Log Configuration

```typescript
// Disable all logging
const translator = new CyberMySQLOpenAI({
  logEnabled: false,
});

// Log only errors
const translator = new CyberMySQLOpenAI({
  logLevel: "error",
});
```

---

## Project Status

This project is in **stable release** and under active development. Contributions and feedback are welcome.

### Current Limitations

- Very complex queries may require multiple correction iterations
- Some advanced SQL constructs may not be interpreted correctly
- Performance depends on database schema complexity and OpenAI model latency

### Roadmap

- ~~Business context and schema metadata~~ (shipped in v0.2.0)
- ~~Foreign key relationship detection~~ (shipped in v0.2.0)
- ~~Function calling with structured output~~ (shipped in v0.2.0)
- ~~Few-shot example support~~ (shipped in v0.2.0)
- Performance optimization for large database schemas
- Support for additional SQL dialects
- Expanded documentation and usage examples

---

## License

MIT
