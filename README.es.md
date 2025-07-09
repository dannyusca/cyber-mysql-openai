# Cyber-MySQL-OpenAI: Traductor de lenguaje natural a SQL para Node.js

Cyber-MySQL-OpenAI es una potente librería para Node.js que traduce consultas en lenguaje natural a SQL válido, ejecuta las consultas en MySQL, y proporciona resultados con explicaciones en lenguaje natural utilizando la tecnología de OpenAI.

## 🚀 Características

- **Traducción de lenguaje natural a SQL**: Convierte peticiones en lenguaje natural a consultas SQL válidas
- **Ejecución automática**: Ejecuta las consultas generadas directamente en tu base de datos MySQL
- **Corrección autónoma de errores**: Detecta y corrige errores en las consultas generadas
- **Explicaciones en lenguaje natural**: Traduce los resultados técnicos a explicaciones amigables
- **Soporte multiidioma**: Disponible en español e inglés con cambio dinámico de idioma
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
  
  // Configuración adicional
  maxReflections: 3, // Número máximo de intentos de corrección
  logLevel: 'info', // 'error', 'warn', 'info', 'debug' o 'none' para desactivar
  logDirectory: './logs', // Directorio para logs
  logEnabled: true, // Establecer en false para desactivar completamente los logs
  language: 'es' // Idioma de respuestas: 'es' (Español) o 'en' (Inglés)
});
```

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

### Opciones de respuesta natural

```typescript
// Para obtener una respuesta detallada
const detailedResult = await translator.query('¿Cuál fue el mes con más ventas?', { detailed: true });

console.log('Respuesta simple:', detailedResult.naturalResponse);
console.log('Respuesta detallada:', detailedResult.detailedResponse);
```

## 🧪 Estado del proyecto

Este proyecto se encuentra actualmente en **fase beta** de desarrollo. Estamos trabajando activamente para mejorar su funcionalidad y estabilidad.

### Limitaciones actuales
- El manejo de consultas muy complejas puede requerir múltiples iteraciones
- Algunas construcciones SQL avanzadas pueden no ser interpretadas correctamente
- El rendimiento puede variar dependiendo de la complejidad de la base de datos

### Próximas mejoras
- Optimización del rendimiento en bases de datos grandes
- Soporte para más dialectos SQL
- Ampliación del soporte multiidioma (más idiomas)
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
