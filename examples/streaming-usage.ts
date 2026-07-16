// examples/streaming-usage.ts
import { CyberMySQLOpenAI } from "../src";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("Error: OPENAI_API_KEY no está definida en el archivo .env");
  process.exit(1);
}

if (!process.env.DB_USER || !process.env.DB_HOST) {
  console.error("Error: Variables de base de datos no están definidas en el archivo .env");
  process.exit(1);
}

// Configurar CyberMySQLOpenAI en modo agéntico
const translatorAgent = new CyberMySQLOpenAI({
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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini", // Usando modelo ligero y rápido
  },
  mode: "agentic", // Activación del modo multi-step agéntico (estilo MCP)
  maxReflections: 3,
  logLevel: "debug",
  language: "es",
});

// Configurar CyberMySQLOpenAI en modo directo (One-shot)
const translatorDirect = new CyberMySQLOpenAI({
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
    model: process.env.OPENAI_MODEL || "gpt-4o",
  },
  mode: "direct",
  maxReflections: 3,
  logLevel: "info",
  language: "es",
});

/**
 * Ejemplo A: Streaming mediante Callback (onChunk) en Modo Directo (backward-compatible)
 */
async function demoCallbackStreaming() {
  console.log("\n======= DEMO A: STREAMING POR CALLBACK (onChunk) =======");
  console.log("Pregunta: ¿Cuál es el producto más caro y cuál es su stock?\n");
  
  process.stdout.write("Respuesta natural: ");
  const result = await translatorDirect.query(
    "¿Cuál es el producto más caro y cuál es su stock?",
    {
      onChunk: (chunk) => {
        process.stdout.write(chunk);
      },
    }
  );

  console.log("\n\n--- Metadatos finales ---");
  console.log("SQL Generado:", result.sql);
  console.log("Éxito:", result.success);
  console.log("Tiempo total:", result.executionTime + "ms");
}

/**
 * Ejemplo B: Streaming mediante Async Generator (queryStream) en Modo Directo
 */
async function demoGeneratorStreaming() {
  console.log("\n======= DEMO B: STREAMING POR ASYNC GENERATOR (queryStream) =======");
  console.log("Pregunta: ¿Cuántos productos tenemos en total?\n");

  const stream = translatorDirect.queryStream("¿Cuántos productos tenemos en total?");

  for await (const chunk of stream) {
    if (chunk.type === "sql") {
      console.log(`[SQL Generado]: ${chunk.sql}`);
    } else if (chunk.type === "results") {
      console.log(`[Resultados DB]:`, chunk.results);
      process.stdout.write("[Explicación]: ");
    } else if (chunk.type === "chunk" && chunk.content) {
      process.stdout.write(chunk.content);
    } else if (chunk.type === "done" && chunk.metadata) {
      console.log(`\n\n[Fin] Tiempo: ${chunk.metadata.executionTime}ms. Costo Estimado: $${chunk.metadata.tokenUsage?.estimatedCost || 0}`);
    }
  }
}

/**
 * Ejemplo C: Modo Agéntico Exploratorio (Multi-Step / Estilo MCP) con queryStream
 */
async function demoAgenticMode() {
  console.log("\n======= DEMO C: MODO AGÉNTICO MULTI-PASO (Exploración Dinámica) =======");
  console.log("Pregunta: ¿Qué mes tuvo mayores beneficios totales?\n");

  const stream = translatorAgent.queryStream("¿Qué mes tuvo mayores beneficios totales?");

  for await (const chunk of stream) {
    if (chunk.type === "sql") {
      console.log(`\n🤖 [Agente SQL]: Ejecutando -> ${chunk.sql}`);
    } else if (chunk.type === "results") {
      console.log(`🤖 [Agente Resultados]: ${chunk.results?.length} filas obtenidas.`);
    } else if (chunk.type === "chunk" && chunk.content) {
      process.stdout.write(chunk.content);
    } else if (chunk.type === "done" && chunk.metadata) {
      console.log(`\n\n🤖 [Agente Completado] Éxito: ${chunk.metadata.success}`);
    }
  }
}

async function main() {
  try {
    await demoCallbackStreaming();
    await demoGeneratorStreaming();
    await demoAgenticMode();
  } catch (error) {
    console.error("Error en demos:", error);
  } finally {
    await translatorDirect.close();
    await translatorAgent.close();
  }
}

main().catch(console.error);
