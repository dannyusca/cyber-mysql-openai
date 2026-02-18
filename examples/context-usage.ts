// examples/context-usage.ts
// Ejemplo basado en la base de datos real: Mama Blanca Liquor Store (repcf4_crm_mb_db)
import { CyberMySQLOpenAI, SchemaContext } from "../src";
import dotenv from "dotenv";

dotenv.config();

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

// ============================================================
// Contexto de negocio adaptado a Mama Blanca Liquor Store
// ============================================================
const context: SchemaContext = {
  businessDescription:
    'Sistema CRM/ERP para licorería y tienda de conveniencia "Mama Blanca Liquor Store". ' +
    "Gestiona productos (bebidas, confitería, snacks, varios), ventas diarias, " +
    "proveedores, categorías jerárquicas y usuarios operadores. " +
    "Cada venta registra el total, el beneficio (ganancia) y un número de factura (number_sale). " +
    "Los detalles de cada venta se desglosan en sales_details con cantidad, precio unitario y beneficio por producto.",

  tables: {
    products: {
      description:
        "Catálogo de productos disponibles para la venta en la tienda",
      columns: {
        stock: "Cantidad disponible actualmente en inventario",
        name: "Nombre completo del producto con presentación",
        unit_value:
          "Valor numérico de la unidad de medida (ej: 1000 para 1000ml)",
        unit_id:
          "Referencia al tipo de unidad en type_transactions (ml, litro, unidad, cm3, gr)",
        price_provider: "Precio de compra al proveedor en USD",
        price_public: "Precio de venta al público en USD",
        disabled: "Producto deshabilitado: 0=activo, 1=inactivo",
        is_bundled_product:
          "Indica si es un combo/paquete: 0=producto individual, 1=combo",
        subcategory_id:
          "Referencia a la subcategoría del producto en categories",
        provider_id: "Referencia al proveedor del producto en providers",
        sku: "Código de barras o identificador SKU",
        minimum_order: "Cantidad mínima de pedido al proveedor",
      },
    },
    sales: {
      description: "Registro de ventas/facturas realizadas en la tienda",
      columns: {
        number_sale: "Número de factura secuencial (formato: MBLS-001-XXXX)",
        total_amount: "Monto total de la venta en USD",
        benefit:
          "Ganancia/beneficio total de la venta en USD (total_amount - costo)",
        status_id:
          "Estado de la venta (referencia a type_transactions, ej: FACTURADO)",
        user_id: "Operador/vendedor que realizó la venta",
        client_id: 'Nombre del cliente (usualmente "Consumidor final")',
        created_at: "Fecha en que se realizó la venta",
      },
    },
    sales_details: {
      description:
        "Detalle línea por línea de cada venta, un registro por producto vendido",
      columns: {
        sales_id: "Referencia a la venta padre en tabla sales",
        product_id: "Referencia al producto vendido en tabla products",
        number_sale: "Número de factura (duplicado para consultas rápidas)",
        quantity: "Cantidad vendida del producto",
        product_name: "Nombre del producto al momento de la venta (snapshot)",
        unit_price: "Precio unitario de venta al público en USD",
        total_price: "Precio total de la línea (quantity × unit_price)",
        provider_price: "Costo unitario del proveedor en USD",
        benefit:
          "Ganancia de esta línea (total_price - provider_price × quantity)",
      },
    },
    categories: {
      description:
        "Categorías jerárquicas: las raíz (father_id=NULL) son Bebidas, Confitería, Snacks, Varios, Condimento. Las subcategorías apuntan a su padre.",
      columns: {
        father_id: "ID de la categoría padre (NULL si es categoría raíz)",
        name: "Nombre de la categoría (ej: Cerveza, Cigarrillo, Vodka, Chocolate)",
        disabled: "Categoría deshabilitada: 0=activa, 1=inactiva",
      },
    },
    providers: {
      description: "Proveedores de productos de la tienda",
      columns: {
        company: "Nombre de la empresa proveedora",
        name: "Nombre del contacto o representante",
        cellphone: "Teléfono celular del proveedor",
        disabled: "Proveedor deshabilitado: 0=activo, 1=inactivo",
      },
    },
    type_transactions: {
      description: "Tipos de transacciones y unidades de medida",
      columns: {
        name: "Nombre del tipo (ej: FACTURADO, ml, litro, unidad, cm3, gr)",
        type: "Clasificación: 'unit' para unidades de medida, 'sales' para estados de venta",
      },
    },
  },

  // Ejemplos few-shot basados en consultas reales del negocio
  examples: [
    {
      question: "¿Cuál es el total de ventas de este mes?",
      sql: "SELECT SUM(total_amount) as total_ventas, SUM(benefit) as total_ganancia FROM sales WHERE MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())",
    },
    {
      question: "¿Cuáles son los 10 productos más vendidos?",
      sql: "SELECT sd.product_name, SUM(sd.quantity) as total_vendido, SUM(sd.total_price) as ingresos FROM sales_details sd GROUP BY sd.product_name ORDER BY total_vendido DESC LIMIT 10",
    },
    {
      question: "¿Qué productos tienen poco stock?",
      sql: "SELECT name, stock, price_public FROM products WHERE disabled = 0 AND stock < 10 ORDER BY stock ASC",
    },
    {
      question: "¿Cuáles son las ventas por categoría?",
      sql: "SELECT c.name as categoria, SUM(sd.total_price) as total FROM sales_details sd INNER JOIN products p ON sd.product_id = p.id INNER JOIN categories c ON p.subcategory_id = c.id GROUP BY c.name ORDER BY total DESC",
    },
  ],
};

// ============================================================
// Inicializar con contexto de negocio
// ============================================================
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
  context, // <-- Contexto de negocio inyectado
  language: "es",
  logLevel: "info",
});

/**
 * Ejemplo 1: Consulta de ventas con contexto de negocio
 * El modelo entiende que "benefit" es la ganancia y "total_amount" es el total
 */
async function ejemploVentasMensuales() {
  console.log("\n======= EJEMPLO 1: VENTAS MENSUALES CON CONTEXTO =======");

  const result = await translator.query(
    "¿Cuánto vendimos este mes y cuánto fue la ganancia?",
  );

  console.log("SQL generado:", result.sql);
  console.log("Confianza:", result.confidence ?? "N/A (modo texto)");
  console.log("Resultados:", JSON.stringify(result.results, null, 2));
  console.log("Respuesta:", result.naturalResponse);
}

/**
 * Ejemplo 2: Consulta que requiere JOINs
 * Las FK detectadas automáticamente (products → categories, sales_details → products)
 * permiten que el modelo construya JOINs correctos
 */
async function ejemploProductosPorCategoria() {
  console.log(
    "\n======= EJEMPLO 2: PRODUCTOS POR CATEGORÍA (FK AUTO-DETECTADAS) =======",
  );

  const result = await translator.query(
    "¿Cuáles son las 5 categorías con más ingresos este año?",
  );

  console.log("SQL generado:", result.sql);
  console.log("Confianza:", result.confidence ?? "N/A (modo texto)");
  console.log("Resultados:", JSON.stringify(result.results, null, 2));
  console.log("Respuesta:", result.naturalResponse);
}

/**
 * Ejemplo 3: Consulta guiada por los ejemplos few-shot
 * Similar a "productos con poco stock" definido en los examples
 */
async function ejemploStockBajo() {
  console.log("\n======= EJEMPLO 3: STOCK BAJO (GUIADO POR FEW-SHOT) =======");

  const result = await translator.query(
    "¿Qué cervezas tienen menos de 5 unidades en stock?",
  );

  console.log("SQL generado:", result.sql);
  console.log("Confianza:", result.confidence ?? "N/A (modo texto)");
  console.log("Resultados:", JSON.stringify(result.results, null, 2));
  console.log("Respuesta:", result.naturalResponse);
}

/**
 * Ejemplo 4: Uso del score de confianza para lógica condicional
 */
async function ejemploConfianza() {
  console.log("\n======= EJEMPLO 4: LÓGICA BASADA EN CONFIANZA =======");

  const result = await translator.query(
    "¿Cuál es el margen de ganancia promedio por proveedor en los últimos 3 meses?",
  );

  console.log("SQL generado:", result.sql);
  console.log("Confianza:", result.confidence ?? "N/A (modo texto)");

  if (result.confidence !== undefined) {
    if (result.confidence >= 0.8) {
      console.log("✅ Alta confianza — Resultado confiable");
    } else if (result.confidence >= 0.5) {
      console.log("⚠️ Confianza media — Revisar resultado manualmente");
    } else {
      console.log("❌ Baja confianza — Considerar reformular la pregunta");
    }
  }

  console.log("Respuesta:", result.naturalResponse);
}

/**
 * Ejemplo 5: Consulta compleja con múltiples tablas
 */
async function ejemploProductosMasRentables() {
  console.log("\n======= EJEMPLO 5: PRODUCTOS MÁS RENTABLES =======");

  const result = await translator.query(
    "¿Cuáles son los 10 productos que generan más ganancia?",
  );

  console.log("SQL generado:", result.sql);
  console.log("Confianza:", result.confidence ?? "N/A (modo texto)");
  console.log("Resultados:", JSON.stringify(result.results, null, 2));
  console.log("Respuesta:", result.naturalResponse);
}

/**
 * Función principal
 */
async function main() {
  try {
    console.log(
      "🏪 Mama Blanca Liquor Store — Ejemplos con contexto de negocio\n",
    );

    await ejemploVentasMensuales();
    await ejemploProductosPorCategoria();
    await ejemploStockBajo();
    await ejemploConfianza();
    await ejemploProductosMasRentables();

    console.log("\n✅ Todos los ejemplos completados.");
  } catch (error) {
    console.error("Error en la ejecución:", (error as Error).message);
  } finally {
    await translator.close();
    console.log("Conexión cerrada.");
  }
}

// Ejecutar
main().catch(console.error);
