# Cyber-MySQL-OpenAI: Natural Language to SQL Translator for Node.js

Cyber-MySQL-OpenAI is a powerful Node.js library that translates natural language queries to valid SQL, executes queries on MySQL, and provides results with natural language explanations using OpenAI technology.

## 🚀 Features

- **Natural language to SQL translation**: Converts natural language requests to valid SQL queries
- **Automatic execution**: Executes generated queries directly on your MySQL database
- **Autonomous error correction**: Detects and corrects errors in generated queries
- **Natural language explanations**: Translates technical results to user-friendly explanations
- **Multi-language support**: Available in English and Spanish with dynamic language switching
- **Intelligent memory cache**: Optional high-performance in-memory cache system for query optimization
- **TypeScript support**: Complete types for better development experience
- **Highly configurable**: Adapt the library to your specific needs
- **Advanced logging**: Detailed logging system for diagnostics and auditing

## 📦 Installation

```bash
npm install cyber-mysql-openai
```

## 🔧 System Requirements

- **Node.js**: Developed and tested with Node.js v22.15.0
- **Compatibility**: Compatible with Node.js v16.x or higher. Some dependencies may require ES2021 features
- **Database**: MySQL/MariaDB
- **API Credentials**: OpenAI API key required

## 🔧 Basic Usage

```typescript
import { CyberMySQLOpenAI } from 'cyber-mysql-openai';
import 'dotenv/config';

// Initialize with configuration
const translator = new CyberMySQLOpenAI({
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: 3306,
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || '',
    ssl: false
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'gpt-4'
  },
  language: 'en'
});

// Execute a natural language query
async function main() {
  try {
    const result = await translator.query('What was the best-selling product last month?');
    
    console.log('Generated SQL:', result.sql);
    console.log('Results:', result.results);
    console.log('Explanation:', result.naturalResponse);
    
    // Close connection
    await translator.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## ⚙️ Configuration Options

```typescript
const translator = new CyberMySQLOpenAI({
  // Database configuration
  database: {
    host: 'localhost',
    port: 3306,
    user: 'username',
    password: 'password',
    database: 'my_database',
    ssl: false,
    socketPath: '/path/to/mysql.sock' // Optional
  },
  
  // OpenAI configuration
  openai: {
    apiKey: 'your_api_key',
    model: 'gpt-4' // or 'gpt-3.5-turbo', etc.
  },
  
  // Cache configuration (optional)
  cache: {
    enabled: true,        // Enable/disable cache
    maxSize: 1000,        // Maximum cache entries
    defaultTTL: 300000,   // Default TTL in milliseconds (5 minutes)
    cleanupInterval: 300000 // Cleanup interval in milliseconds
  },
  
  // Additional configuration
  maxReflections: 3, // Maximum number of correction attempts
  logLevel: 'info', // 'error', 'warn', 'info', 'debug' or 'none' to disable
  logDirectory: './logs', // Directory for logs
  logEnabled: true, // Set to false to completely disable logs
  language: 'en' // Response language: 'en' (English) or 'es' (Spanish)
});
```

## � Intelligent Cache System

Cyber-MySQL-OpenAI includes an optional high-performance in-memory cache system that significantly improves response times for repeated queries.

### Cache Features

- **Intelligent query normalization**: Automatically normalizes SQL queries to maximize cache hits
- **Variable TTL**: Dynamic time-to-live based on query complexity and result size
- **Automatic cleanup**: Periodic removal of expired entries
- **Statistics and monitoring**: Real-time cache performance metrics
- **Memory optimization**: Efficient memory usage with configurable limits

### Basic Cache Usage

```typescript
// Enable cache during initialization
const translator = new CyberMySQLOpenAI({
  // ... database and OpenAI config
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTTL: 300000, // 5 minutes
    cleanupInterval: 300000
  }
});

// Queries will automatically use cache
const result1 = await translator.query('Show me all users'); // Database query
const result2 = await translator.query('Show me all users'); // Cache hit!

console.log('From cache:', result2.fromCache); // true
console.log('Execution time:', result2.executionTime); // Much faster
```

### Cache Management

```typescript
// Get cache statistics
const stats = translator.getCacheStats();
console.log('Cache hit rate:', stats.hitRate);
console.log('Total entries:', stats.totalEntries);

// Clear cache
translator.clearCache();

// Disable/enable cache dynamically
translator.disableCache();
translator.enableCache();

// Get cache status
const isEnabled = translator.isCacheEnabled();
```

### API Integration Best Practices

For optimal cache performance in APIs, use a global instance:

```typescript
// api-instance.ts
import { CyberMySQLOpenAI } from 'cyber-mysql-openai';

export const translator = new CyberMySQLOpenAI({
  // ... configuration
  cache: { enabled: true, maxSize: 2000 }
});

// api-routes.ts
import { translator } from './api-instance';

app.get('/query', async (req, res) => {
  const result = await translator.query(req.body.question);
  res.json({
    ...result,
    cached: result.fromCache,
    responseTime: result.executionTime
  });
});
```

⚠️ **Important**: The cache persists across different requests and users. Ensure this behavior is appropriate for your use case. For user-specific data, consider implementing cache invalidation strategies.

For more cache examples and advanced usage, see [docs/cache-examples.md](docs/cache-examples.md).

## �📋 API

### CyberMySQLOpenAI

#### `constructor(config: CyberMySQLOpenAIConfig)`
Initializes a new instance of CyberMySQLOpenAI with the provided configuration.

#### `async query(prompt: string, options?: NaturalResponseOptions): Promise<TranslationResult>`
Processes a natural language query, translates it to SQL, and executes the query.

#### `async executeSQL(sql: string, options?: NaturalResponseOptions): Promise<SQLResult>`
Executes a SQL query directly without translation.

#### `async close(): Promise<void>`
Closes database connections.

#### `setLanguage(language: 'en' | 'es'): void`
Changes the response language dynamically.

#### `getLanguage(): 'en' | 'es'`
Returns the current language setting.

### Cache Methods

#### `getCacheStats(): CacheStats`
Returns cache performance statistics including hit rate, memory usage, and entry counts.

#### `clearCache(): void`
Removes all entries from the cache.

#### `enableCache(): void`
Enables the cache system.

#### `disableCache(): void`
Disables the cache system.

#### `isCacheEnabled(): boolean`
Returns whether the cache is currently enabled.

### Natural Response Options

```typescript
// To get a detailed response
const detailedResult = await translator.query('What was the month with the highest sales?', { detailed: true });

console.log('Simple response:', detailedResult.naturalResponse);
console.log('Detailed response:', detailedResult.detailedResponse);
```

## 🌐 Multi-Language Support

The library supports multiple languages for responses and error messages. Currently available:

- **English (`en`)**: Default for international users
- **Spanish (`es`)**: Complete support with localized messages

### Language Configuration

```typescript
// Set language during initialization
const translator = new CyberMySQLOpenAI({
  // ... other configuration
  language: 'en' // 'en' for English, 'es' for Spanish
});

// Change language dynamically
translator.setLanguage('es');
console.log('Current language:', translator.getLanguage());
```

### Language-Specific Features

- **Error messages**: All error messages are localized
- **OpenAI prompts**: Prompts sent to OpenAI are in the selected language
- **Natural responses**: Explanations are generated in the configured language
- **Interface labels**: All interface text is translated

### Example: Dynamic Language Switching

```typescript
// Query in English
translator.setLanguage('en');
const englishResult = await translator.query('What are the top 5 products?');
console.log(englishResult.naturalResponse); // Response in English

// Switch to Spanish
translator.setLanguage('es');
const spanishResult = await translator.query('¿Cuáles son los 5 productos principales?');
console.log(spanishResult.naturalResponse); // Response in Spanish
```

## 🧪 Project Status

This project is currently in **stable version** and under active development. We continue improving and adding new features based on community feedback.

### Current Limitations
- Handling very complex queries may require multiple iterations
- Some advanced SQL constructs may not be interpreted correctly
- Performance may vary depending on database complexity

### Upcoming Improvements
- Performance optimization for large databases
- Support for more SQL dialects
- Improvements in complex query interpretation
- Expanded documentation and usage examples

## 🔍 Common Troubleshooting

### Nodemon Configuration

If you're using Nodemon in your project and experiencing constant restarts due to log files generated by this library, add the following configuration to your `package.json` or create a `nodemon.json` file:

```json
{
  "nodemonConfig": {
    "ignore": ["*.log", "tmp/*", "logs/*"]
  }
}
```

This configuration will prevent Nodemon from restarting your application when log files are generated or updated.

### Issues with Detailed Responses

If you experience issues when using `detailed: true` in your queries:

1. Make sure you have a recent version of the library: `npm update cyber-mysql-openai`
2. Verify that your OpenAI API key has sufficient credits and permissions
3. Consider using a less detailed log level by configuring `logLevel: 'warn'` or `logLevel: 'error'`
4. If problems persist, you can temporarily disable detailed logs

### Log Configuration

To improve performance and avoid log-related issues, you can configure different logging levels:

```typescript
// Completely disable logs
const translator = new CyberMySQLOpenAI({
  // ... other configurations
  logEnabled: false
});

// Show only critical errors
const translator = new CyberMySQLOpenAI({
  // ... other configurations
  logLevel: 'error'
});

// Log only to console without files
const translator = new CyberMySQLOpenAI({
  // ... other configurations
  logLevel: 'none',  // Don't create log files
  // or use logEnabled: false to completely disable
});
```

This configuration is especially useful in environments using nodemon or other auto-reload tools, as constant log file generation can cause unnecessary restarts.

## 📄 License

MIT