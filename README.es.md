# Cyber-MySQL-OpenAI: Traductor de lenguaje natural a SQL para Node.js

Cyber-MySQL-OpenAI es una potente librería para Node.js que traduce consultas en lenguaje natural a SQL válido, ejecuta las consultas en MySQL, y proporciona resultados con explicaciones en lenguaje natural utilizando la tecnología de OpenAI.

## 🚀 Características

- **Traducción de lenguaje natural a SQL**: Convierte peticiones en lenguaje natural a consultas SQL válidas
- **Ejecución automática**: Ejecuta las consultas generadas directamente en tu base de datos MySQL
- **Corrección autónoma de errores**: Detecta y corrige errores en las consultas generadas
- **Explicaciones en lenguaje natural**: Traduce los resultados técnicos a explicaciones amigables
- **Soporte multiidioma**: Disponible en español e inglés con cambio dinámico de idioma
- **Cache inteligente en memoria**: Sistema de cache opcional de alto rendimiento para optimización de consultas
- **Soporte para TypeScript**: Tipos completos para una mejor experiencia de desarrollo
- **Altamente configurable**: Adapta la librería a tus necesidades específicas
- **Logging avanzado**: Sistema de logging detallado para diagnóstico y auditoría

## 📦 Instalación

```bash
npm install cyber-mysql-openai
```

## 🔧 Requisitos del sistema

- **Node.js**: Desarrollado y probado con Node.js v22.15.0
- **Compatibilidad**: Compatible con Node.js v16.x o superior. Algunas dependencias pueden requerir características de ES2021
- **Base de datos**: MySQL/MariaDB
- **Credenciales de API**: Se requiere una clave API de OpenAI

## 🔧 Uso básico

```typescript
import { CyberMySQLOpenAI } from 'cyber-mysql-openai';
import 'dotenv/config';

// Inicializar con configuración
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
  language: 'es'
});

// Realizar una consulta en lenguaje natural
async function main() {
  try {
    const result = await translator.query('¿Cuál fue el producto más vendido el mes pasado?');
    
    console.log('SQL generado:', result.sql);
    console.log('Resultados:', result.results);
    console.log('Explicación:', result.naturalResponse);
    
    // Cerrar la conexión
    await translator.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## ⚙️ Opciones de configuración

```typescript
const translator = new CyberMySQLOpenAI({
  // Configuración de la base de datos
  database: {
    host: 'localhost',
    port: 3306,
    user: 'username',
    password: 'password',
    database: 'my_database',
    ssl: false,
    socketPath: '/path/to/mysql.sock' // Opcional
  },
  
  // Configuración de OpenAI
  openai: {
    apiKey: 'tu_clave_api',
    model: 'gpt-4' // o 'gpt-3.5-turbo', etc.
  },
  
  // Configuración del cache (opcional)
  cache: {
    enabled: true,        // Habilitar/deshabilitar cache
    maxSize: 1000,        // Máximo de entradas en cache
    defaultTTL: 300000,   // TTL por defecto en milisegundos (5 minutos)
    cleanupInterval: 300000 // Intervalo de limpieza en milisegundos
  },
  
  // Configuración adicional
  maxReflections: 3, // Número máximo de intentos de corrección
  logLevel: 'info', // 'error', 'warn', 'info', 'debug' o 'none' para desactivar
  logDirectory: './logs', // Directorio para logs
  logEnabled: true, // Establecer en false para desactivar completamente los logs
  language: 'es' // Idioma de respuestas: 'es' (Español) o 'en' (Inglés)
});
```

## 🚀 Sistema de Cache Inteligente

Cyber-MySQL-OpenAI incluye un sistema de cache en memoria opcional de alto rendimiento que mejora significativamente los tiempos de respuesta para consultas repetidas.

### Características del Cache

- **Normalización inteligente de consultas**: Normaliza automáticamente las consultas SQL para maximizar los aciertos de cache
- **TTL variable**: Tiempo de vida dinámico basado en la complejidad de la consulta y el tamaño del resultado
- **Limpieza automática**: Eliminación periódica de entradas expiradas
- **Estadísticas y monitoreo**: Métricas de rendimiento del cache en tiempo real
- **Optimización de memoria**: Uso eficiente de memoria con límites configurables

### Uso Básico del Cache

```typescript
// Habilitar cache durante la inicialización
const translator = new CyberMySQLOpenAI({
  // ... configuración de base de datos y OpenAI
  cache: {
    enabled: true,
    maxSize: 1000,
    defaultTTL: 300000, // 5 minutos
    cleanupInterval: 300000
  }
});

// Las consultas usarán automáticamente el cache
const result1 = await translator.query('Muéstrame todos los usuarios'); // Consulta a base de datos
const result2 = await translator.query('Muéstrame todos los usuarios'); // ¡Cache hit!

console.log('Desde cache:', result2.fromCache); // true
console.log('Tiempo de ejecución:', result2.executionTime); // Mucho más rápido
```

### Gestión del Cache

```typescript
// Obtener estadísticas del cache
const stats = translator.getCacheStats();
console.log('Tasa de aciertos del cache:', stats.hitRate);
console.log('Total de entradas:', stats.totalEntries);

// Limpiar cache
translator.clearCache();

// Deshabilitar/habilitar cache dinámicamente
translator.disableCache();
translator.enableCache();

// Obtener estado del cache
const isEnabled = translator.isCacheEnabled();
```

### Mejores Prácticas para Integración en APIs

Para un rendimiento óptimo del cache en APIs, usa una instancia global:

```typescript
// api-instance.ts
import { CyberMySQLOpenAI } from 'cyber-mysql-openai';

export const translator = new CyberMySQLOpenAI({
  // ... configuración
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

⚠️ **Importante**: El cache persiste entre diferentes requests y usuarios. Asegúrate de que este comportamiento sea apropiado para tu caso de uso. Para datos específicos de usuario, considera implementar estrategias de invalidación de cache.

Para más ejemplos de cache y uso avanzado, ver [docs/cache-examples.md](docs/cache-examples.md).

## 🌐 Soporte Multiidioma

La librería soporta múltiples idiomas para respuestas y mensajes de error. Actualmente disponible:

- **Español (`es`)**: Idioma por defecto para usuarios hispanohablantes
- **Inglés (`en`)**: Soporte completo con mensajes localizados

### Configuración de Idioma

```typescript
// Establecer idioma durante la inicialización
const translator = new CyberMySQLOpenAI({
  // ... otra configuración
  language: 'es' // 'es' para Español, 'en' para Inglés
});

// Cambiar idioma dinámicamente
translator.setLanguage('en');
console.log('Idioma actual:', translator.getLanguage());
```

### Características Específicas por Idioma

- **Mensajes de error**: Todos los mensajes de error están localizados
- **Prompts de OpenAI**: Los prompts enviados a OpenAI están en el idioma seleccionado
- **Respuestas naturales**: Las explicaciones se generan en el idioma configurado
- **Etiquetas de interfaz**: Todo el texto de la interfaz está traducido

### Ejemplo: Cambio Dinámico de Idioma

```typescript
// Consulta en español
translator.setLanguage('es');
const resultadoEspanol = await translator.query('¿Cuáles son los 5 productos principales?');
console.log(resultadoEspanol.naturalResponse); // Respuesta en español

// Cambiar a inglés
translator.setLanguage('en');
const englishResult = await translator.query('What are the top 5 products?');
console.log(englishResult.naturalResponse); // Respuesta en inglés
```

## 📋 API

### CyberMySQLOpenAI

#### `constructor(config: CyberMySQLOpenAIConfig)`
Inicializa una nueva instancia de CyberMySQLOpenAI con la configuración proporcionada.

#### `async query(prompt: string, options?: NaturalResponseOptions): Promise<TranslationResult>`
Procesa una consulta en lenguaje natural, la traduce a SQL, y ejecuta la consulta.

#### `async executeSQL(sql: string, options?: NaturalResponseOptions): Promise<SQLResult>`
Ejecuta una consulta SQL directamente sin traducción.

#### `async close(): Promise<void>`
Cierra las conexiones a la base de datos.

#### `setLanguage(language: 'es' | 'en'): void`
Cambia el idioma de respuesta dinámicamente.

#### `getLanguage(): 'es' | 'en'`
Devuelve la configuración de idioma actual.

### Métodos del Cache

#### `getCacheStats(): CacheStats`
Devuelve estadísticas de rendimiento del cache incluyendo tasa de aciertos, uso de memoria y conteo de entradas.

#### `clearCache(): void`
Elimina todas las entradas del cache.

#### `enableCache(): void`
Habilita el sistema de cache.

#### `disableCache(): void`
Deshabilita el sistema de cache.

#### `isCacheEnabled(): boolean`
Devuelve si el cache está actualmente habilitado.

### Opciones de respuesta natural

```typescript
// Para obtener una respuesta detallada
const detailedResult = await translator.query('¿Cuál fue el mes con más ventas?', { detailed: true });

console.log('Respuesta simple:', detailedResult.naturalResponse);
console.log('Respuesta detallada:', detailedResult.detailedResponse);
```

## 🧪 Estado del proyecto

Este proyecto se encuentra actualmente en **versión estable** y en desarrollo activo. Continuamos mejorando y añadiendo nuevas características basadas en feedback de la comunidad.

### Limitaciones actuales
- El manejo de consultas muy complejas puede requerir múltiples iteraciones
- Algunas construcciones SQL avanzadas pueden no ser interpretadas correctamente
- El rendimiento puede variar dependiendo de la complejidad de la base de datos

### Próximas mejoras
- Optimización del rendimiento en bases de datos grandes
- Soporte para más dialectos SQL
- Mejoras en la interpretación de consultas complejas
- Ampliación de la documentación y ejemplos de uso

## 🔍 Solución de problemas comunes

### Configuración con Nodemon

Si estás utilizando Nodemon en tu proyecto y experimentas reinicios constantes debido a los archivos de logs que genera esta librería, añade la siguiente configuración a tu `package.json` o crea un archivo `nodemon.json`:

```json
{
  "nodemonConfig": {
    "ignore": ["*.log", "tmp/*", "logs/*"]
  }
}
```

Esta configuración evitará que Nodemon reinicie tu aplicación cuando se generen o actualicen archivos de logs.

### Problemas con respuestas detalladas

Si experimentas problemas al usar `detailed: true` en tus consultas:

1. Asegúrate de tener una versión reciente de la librería: `npm update cyber-mysql-openai`
2. Verifica que tu API key de OpenAI tenga suficientes créditos y permisos
3. Considera usar un nivel de log menos detallado configurando `logLevel: 'warn'` o `logLevel: 'error'`
4. Si los problemas persisten, puedes desactivar temporalmente los logs detallados

### Configuración de logs

Para mejorar el rendimiento y evitar problemas con los logs, puedes configurar diferentes niveles de logging:

```typescript
// Desactivar completamente los logs
const translator = new CyberMySQLOpenAI({
  // ... otras configuraciones
  logEnabled: false
});

// Mostrar solo errores críticos
const translator = new CyberMySQLOpenAI({
  // ... otras configuraciones
  logLevel: 'error'
});

// Registrar solo en consola sin archivos
const translator = new CyberMySQLOpenAI({
  // ... otras configuraciones
  logLevel: 'none',  // No crear archivos de log
  // o utilizar logEnabled: false para desactivar completamente
});
```

Esta configuración es especialmente útil en entornos donde se utiliza nodemon u otras herramientas de recarga automática, ya que la generación constante de archivos de log puede causar reinicios innecesarios.

## 📄 Licencia

MIT
