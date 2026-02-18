// examples/basic-usage.ts
import { CyberMySQLOpenAI } from "../src";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

// Validar que existan las variables de entorno necesarias
if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY no está definida en el archivo .env");
  process.exit(1);
}

if (!process.env.DB_USER || !process.env.DB_HOST) {
  console.error(
    "Error: Variables de base de datos no están definidas en el archivo .env",
  );
  process.exit(1);
}

// Configurar CyberMySQLOpenAI con soporte multiidioma
const translator = new CyberMySQLOpenAI({
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_DATABASE || "",
    ssl: process.env.DB_SSL === "true",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4",
  },
  // Configuración opcional
  maxReflections: 5,
  logLevel: "info",
  logDirectory: "./logs",
  language: "es", // Nuevo: Configurar idioma (español por defecto)
});

/**
 * Ejemplo 1: Consulta en lenguaje natural simple
 */
async function ejemploConsultaSimple() {
  try {
    console.log("\n======= EJEMPLO 1: CONSULTA SIMPLE =======");
    const result = await translator.query(
      "¿Cuál es el nombre y cantidad del producto más vendido?",
    );

    console.log("SQL generado:", result.sql);
    console.log("Confianza:", result.confidence ?? "N/A (modo texto)");
    console.log("Resultados:", JSON.stringify(result.results, null, 2));
    console.log("Respuesta natural:", result.naturalResponse);

    return result;
  } catch (error) {
    console.error("Error en consulta simple:", (error as Error).message);
    throw error;
  }
}

/**
 * Ejemplo 2: Consulta en lenguaje natural con respuesta detallada
 */
async function ejemploConsultaDetallada() {
  try {
    console.log(
      "\n======= EJEMPLO 2: CONSULTA CON RESPUESTA DETALLADA =======",
    );
    const result = await translator.query(
      "¿Cuál fue el mes con más beneficios?",
      { detailed: true },
    );

    console.log("SQL generado:", result.sql);
    console.log("Resultados:", JSON.stringify(result.results, null, 2));
    console.log("Respuesta simple:", result.naturalResponse);
    console.log("Respuesta detallada:", result.detailedResponse);

    return result;
  } catch (error) {
    console.error("Error en consulta detallada:", (error as Error).message);
    throw error;
  }
}

/**
 * Ejemplo 3: Ejecutar SQL directamente
 */
async function ejemploEjecutarSQL() {
  try {
    console.log("\n======= EJEMPLO 3: EJECUTAR SQL DIRECTAMENTE =======");
    const result = await translator.executeSQL(
      "SELECT * FROM products LIMIT 5",
    );

    console.log("Resultados:", JSON.stringify(result.results, null, 2));
    console.log("Respuesta natural:", result.naturalResponse);

    return result;
  } catch (error) {
    console.error("Error ejecutando SQL:", (error as Error).message);
    throw error;
  }
}

/**
 * Función de utilidad para mostrar resultados formateados
 */
function mostrarResultados(resultado: any, titulo: string) {
  console.log(`\n📊 ${titulo}`);
  console.log("─".repeat(50));

  if (resultado.sql) {
    console.log("🔍 SQL generado:", resultado.sql);
  }

  if (resultado.confidence !== undefined) {
    console.log("🎯 Confianza:", resultado.confidence);
  }

  if (resultado.results) {
    console.log("📋 Resultados:");
    console.log(JSON.stringify(resultado.results, null, 2));
  }

  if (resultado.naturalResponse) {
    console.log("💬 Respuesta natural:", resultado.naturalResponse);
  }

  if (resultado.detailedResponse) {
    console.log("📝 Respuesta detallada:", resultado.detailedResponse);
  }

  console.log("─".repeat(50));
}

/**
 * Ejemplo adicional: Múltiples consultas en secuencia
 */
async function ejemploMultiplesConsultas() {
  try {
    console.log("\n======= EJEMPLO ADICIONAL: MÚLTIPLES CONSULTAS =======");

    const consultas = [
      "Muestra los 3 productos más caros",
      "Lista todos los clientes activos",
      "Cuenta cuántos pedidos hay en total",
    ];

    for (let i = 0; i < consultas.length; i++) {
      console.log(`\n🔄 Ejecutando consulta ${i + 1}/${consultas.length}:`);
      console.log(`❓ "${consultas[i]}"`);

      const resultado = await translator.query(consultas[i]);
      mostrarResultados(resultado, `Resultado ${i + 1}`);
    }
  } catch (error) {
    console.error("Error en múltiples consultas:", (error as Error).message);
    throw error;
  }
}

/**
 * Ejemplo de manejo de errores
 */
async function ejemploManejoErrores() {
  try {
    console.log("\n======= EJEMPLO: MANEJO DE ERRORES =======");

    // Intentar una consulta que puede fallar
    const resultado = await translator.query(
      "Consulta imposible con tabla inexistente xyz123",
    );
    mostrarResultados(resultado, "Resultado inesperado");
  } catch (error) {
    console.log("⚠️  Error capturado correctamente:");
    console.log("📝 Mensaje:", (error as Error).message);
    console.log("✅ El sistema de manejo de errores funciona correctamente");
  }
}

/**
 * Ejemplo adicional: Cambio de idioma dinámico
 */
async function ejemploCambioIdioma() {
  try {
    console.log("\n======= EJEMPLO: CAMBIO DE IDIOMA DINÁMICO =======");

    // Consulta en español
    console.log("🇪🇸 Consulta en español:");
    const resultadoEspanol = await translator.query(
      "¿Cuál es el producto más caro?",
    );
    mostrarResultados(resultadoEspanol, "Resultado en Español");

    // Cambiar a inglés
    translator.setLanguage("en");
    console.log("\n🇺🇸 Cambiando a inglés...");
    console.log("Idioma actual:", translator.getLanguage());

    // Misma consulta en inglés
    const resultadoIngles = await translator.query(
      "What is the most expensive product?",
    );
    mostrarResultados(resultadoIngles, "Result in English");

    // Volver a español
    translator.setLanguage("es");
    console.log("\n🇪🇸 Volviendo a español...");
    console.log("Idioma actual:", translator.getLanguage());
  } catch (error) {
    console.error("Error en cambio de idioma:", (error as Error).message);
    throw error;
  }
}

/**
 * Función principal que ejecuta todos los ejemplos
 */
async function main() {
  try {
    console.log("🚀 Iniciando ejemplos de Cyber-MySQL-OpenAI...\n");

    // Ejecutar ejemplo 1: Consulta simple
    await ejemploConsultaSimple();

    // Ejecutar ejemplo 2: Consulta detallada
    await ejemploConsultaDetallada();

    // Ejecutar ejemplo 3: SQL directo
    await ejemploEjecutarSQL();

    // Ejecutar ejemplo adicional: Múltiples consultas
    await ejemploMultiplesConsultas();

    // Ejecutar ejemplo de manejo de errores
    await ejemploManejoErrores();

    // Ejecutar ejemplo de cambio de idioma
    await ejemploCambioIdioma();

    console.log("\n✅ Todos los ejemplos se ejecutaron correctamente");
  } catch (error) {
    console.error(
      "❌ Error en la ejecución de ejemplos:",
      (error as Error).message,
    );
  } finally {
    // Cerrar la conexión
    console.log("\n🔒 Cerrando conexión...");
    await translator.close();
    console.log("✅ Conexión cerrada correctamente");
  }
}

/**
 * Función para ejecutar un ejemplo específico
 * Útil para pruebas individuales
 *
 * Uso: Cambiar la línea final por: ejecutarEjemploEspecifico(2).catch(console.error);
 */
async function ejecutarEjemploEspecifico(numeroEjemplo: number) {
  try {
    console.log(`🎯 Ejecutando ejemplo específico: ${numeroEjemplo}\n`);

    switch (numeroEjemplo) {
      case 1:
        await ejemploConsultaSimple();
        break;
      case 2:
        await ejemploConsultaDetallada();
        break;
      case 3:
        await ejemploEjecutarSQL();
        break;
      case 4:
        await ejemploMultiplesConsultas();
        break;
      case 5:
        await ejemploManejoErrores();
        break;
      case 6:
        await ejemploCambioIdioma();
        break;
      default:
        console.error("❌ Número de ejemplo no válido. Usa 1-6");
        return;
    }

    console.log(`\n✅ Ejemplo ${numeroEjemplo} completado`);
  } catch (error) {
    console.error(
      `❌ Error en ejemplo ${numeroEjemplo}:`,
      (error as Error).message,
    );
  } finally {
    await translator.close();
  }
}

// Ejecutar todos los ejemplos
//main().catch(console.error);

// Descomentar la línea siguiente y comentar la anterior para ejecutar un ejemplo específico:
ejecutarEjemploEspecifico(1).catch(console.error);
