# Changelog

All notable changes to this project will be documented in this file.

## [0.1.10] - 2025-07-09

### Added
- **Intelligent Memory Cache System**: New optional high-performance in-memory cache
  - Intelligent query normalization for maximum cache hits
  - Variable TTL based on query complexity and result size
  - Automatic cleanup of expired entries
  - Real-time statistics and monitoring
  - Memory optimization with configurable limits
  - Methods for dynamic cache control (enable/disable/clear)

### Enhanced
- **Multi-language Support**: Complete bilingual documentation
  - English README.md for international users
  - Spanish README.es.md for Spanish-speaking users
  - Dynamic language switching capabilities
  - Localized error messages and responses

- **NPM Discoverability**: Expanded keywords for better visibility
  - Added relevant tags for MySQL, AI, SQL, OpenAI, etc.
  - Improved package description

- **API Enhancements**: New methods for cache management
  - `getCacheStats()`: Get cache performance metrics
  - `clearCache()`: Clear all cache entries
  - `enableCache()` / `disableCache()`: Dynamic cache control
  - `isCacheEnabled()`: Check cache status

### Documentation
- **Comprehensive Cache Documentation**: 
  - Basic usage examples in both READMEs
  - Advanced usage guide in `docs/cache-examples.md`
  - API integration best practices
  - Performance optimization recommendations
  
- **Technical Guide Updates**: Updated `docs/guia-tecnica.md`
  - Cache system architecture
  - Integration recommendations for APIs
  - Memory management guidelines

### Examples
- **Cache Usage Example**: New `examples/cache-usage.ts`
  - Demonstrates basic cache functionality
  - Shows cache management methods
  - Performance comparison examples

### Infrastructure
- **NestJS Compatibility**: Guidance for NestJS integration
  - Module and service examples
  - Dependency injection patterns
  - Global instance recommendations for cache persistence

### Performance
- **Query Optimization**: Intelligent query normalization
  - SQL query standardization for better cache hits
  - Whitespace and case normalization
  - Parameter extraction and normalization

### Best Practices
- **API Integration Guidelines**: 
  - Global instance patterns for cache persistence
  - Memory management recommendations
  - Cache invalidation strategies
  - Multi-user considerations

## [0.1.8] - Previous version
- Initial multi-language support
- Basic query translation functionality
- Error correction system
- Logging system

---

### Migration Guide

#### From 0.1.8 to 0.1.9

The cache system is completely optional and backward compatible. Existing code will continue to work without any changes.

To enable the cache system, simply add the `cache` configuration:

```typescript
const translator = new CyberMySQLOpenAI({
  // ... existing configuration
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTTL: 300000
  }
});
```

### Upgrade Recommendations

1. **Enable Cache for APIs**: If you're using the library in an API, enable the cache system for better performance
2. **Use Global Instance**: For APIs, use a global instance to maintain cache across requests
3. **Monitor Cache Performance**: Use `getCacheStats()` to monitor cache hit rates and optimize TTL settings
4. **Consider Memory Usage**: Set appropriate `maxSize` based on your server's memory capacity

### Breaking Changes

None. This release is fully backward compatible.
