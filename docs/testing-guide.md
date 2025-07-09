# Guía de Pruebas Locales para cyber-mysql-openai

Este documento explica cómo probar la librería localmente antes de publicarla en npm.

## Preparación

1. Asegúrate de que la librería esté correctamente compilada:
   ```bash
   npm run build
   ```

2. Crea un enlace simbólico global a tu paquete:
   ```bash
   npm link
   ```
   Esto hace que tu paquete esté disponible globalmente en tu sistema como si estuviera instalado desde npm.

## Crear un Proyecto de Prueba

1. Crea un nuevo directorio para tu proyecto de prueba:
   ```bash
   mkdir ~/test-cyber-mysql-openai
   cd ~/test-cyber-mysql-openai
   ```

2. Inicializa un nuevo proyecto:
   ```bash
   npm init -y
   ```

3. Enlaza tu paquete local:
   ```bash
   npm link cyber-mysql-openai
   ```

4. Crea un archivo `.env` con tus credenciales:
   ```bash
   cp /ruta/a/cybersql-lib/.env.example .env
   ```
   Edita el archivo `.env` con tus credenciales reales.

5. Crea un archivo de prueba `test.js`:
   ```javascript
   const { CyberMySQLOpenAI } = require('cyber-mysql-openai');
   require('dotenv').config();

   async function test() {
     const translator = new CyberMySQLOpenAI({
       database: {
         host: process.env.DB_HOST,
         port: parseInt(process.env.DB_PORT || '3306', 10),
         user: process.env.DB_USER,
         password: process.env.DB_PASSWORD,
         database: process.env.DB_DATABASE,
         ssl: process.env.DB_SSL === 'true'
       },
       openai: {
         apiKey: process.env.OPENAI_API_KEY,
         model: process.env.OPENAI_MODEL || 'gpt-4'
       },
       logLevel: 'debug'
     });

     try {
       const result = await translator.query('muéstrame los primeros 5 registros de todas las tablas');
       console.log('Resultado:', JSON.stringify(result, null, 2));
     } catch (error) {
       console.error('Error:', error);
     } finally {
       await translator.close();
     }
   }

   test();
   ```

6. Instala dotenv:
   ```bash
   npm install dotenv
   ```

7. Ejecuta el script de prueba:
   ```bash
   node test.js
   ```

## Pruebas avanzadas

Para pruebas más completas, considera probar:

1. **Diferentes tipos de consultas:**
   - Consultas de selección simples
   - Consultas con joins
   - Consultas con condiciones complejas
   - Consultas que incluyan funciones de agregación

2. **Manejo de errores:**
   - Consultas con sintaxis incorrecta
   - Referencias a tablas o columnas inexistentes
   - Problemas de conexión a la base de datos

3. **Configuraciones diferentes:**
   - Diferentes modelos de OpenAI
   - Diferentes niveles de logging
   - Opciones de formato de respuesta natural

## Limpieza

Cuando hayas terminado de probar, puedes eliminar el enlace:

```bash
# En tu proyecto de prueba
npm unlink cyber-mysql-openai

# En el directorio de tu librería
npm unlink
```
