# Cache System Example

## Basic Usage with Cache

```typescript
import { CyberMySQLOpenAI } from 'cyber-mysql-openai';

// Initialize with cache enabled (default)
const translator = new CyberMySQLOpenAI({
  database: {
    host: 'localhost',
    user: 'username',
    password: 'password',
    database: 'mydb'
  },
  openai: {
    apiKey: 'your-openai-key'
  },
  cache: {
    enabled: true,        // Enable cache (default: true)
    maxSize: 1000,       // Max cache entries (default: 1000)
    cleanupIntervalMs: 300000 // Cleanup interval (default: 5min)
  }
});

// First query - will hit OpenAI + MySQL (~1500ms)
const result1 = await translator.query('Show me total sales');
console.log(result1.fromCache); // false
console.log(result1.executionTime); // ~1500ms

// Second identical query - will hit cache (~50ms)
const result2 = await translator.query('Show me total sales');
console.log(result2.fromCache); // true
console.log(result2.executionTime); // ~50ms

// 95% performance improvement!
```

## Advanced Cache Features

```typescript
// Get cache statistics
const stats = translator.getCacheStats();
console.log(`Hit rate: ${stats.hitRate.toFixed(1)}%`);
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Memory usage: ${(stats.memoryUsage / 1024).toFixed(1)} KB`);

// Clear cache
translator.clearCache();

// Invalidate cache for specific table
translator.invalidateCacheByTable('products');

// Disable cache temporarily
translator.setCacheEnabled(false);

// Bypass cache for specific query
const freshResult = await translator.query(
  'Show me latest data', 
  { bypassCache: true }
);
```

## API Scenario with Shared Cache

```typescript
// Express.js example with shared cache
const translator = new CyberMySQLOpenAI({
  // ... config
  cache: { enabled: true }
});

app.post('/api/query', async (req, res) => {
  const result = await translator.query(req.body.prompt);
  res.json({
    data: result.results,
    sql: result.sql,
    cached: result.fromCache,
    executionTime: result.executionTime
  });
});

// Cache statistics endpoint
app.get('/api/cache/stats', (req, res) => {
  res.json(translator.getCacheStats());
});
```

## Performance Benefits

- **90-95% latency reduction** for repeated queries
- **Cost savings** on OpenAI API calls
- **Better scalability** for APIs
- **Improved user experience** with instant responses

## Cache TTL by Query Type

- **Schema queries** (SHOW TABLES, DESCRIBE): 1 hour
- **Aggregate queries** (COUNT, SUM, AVG): 15 minutes
- **Regular queries**: 5 minutes

The cache automatically adjusts TTL based on query type for optimal performance.
