// src/utils/responseFormatter.ts
import { OpenAI } from "openai";
import { v4 as uuidv4 } from "uuid";
import Logger from "./index";
import { NaturalResponseOptions } from "../types";
import { I18n, SupportedLanguage } from "./i18n";

/**
 * Clase ResponseFormatter que maneja la generación de respuestas naturales
 * a partir de resultados SQL
 */
export class ResponseFormatter {
  private openai: OpenAI;
  private logger: Logger;
  private model: string;
  private i18n: I18n;

  constructor(
    apiKey: string,
    model: string = "gpt-4",
    language: SupportedLanguage = "en",
    logger?: Logger,
  ) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    this.model = model;
    this.logger = logger || new Logger();
    this.i18n = new I18n(language);
  }

  /**
   * Cambia el idioma del formateador
   */
  setLanguage(language: SupportedLanguage): void {
    this.i18n.setLanguage(language);
  }

  /**
   * Genera una explicación elaborada en lenguaje natural de los resultados SQL
   * @param sql - Consulta SQL ejecutada
   * @param results - Resultados de la consulta SQL
   * @param options - Opciones de configuración
   * @returns Explicación en lenguaje natural con formato markdown
   */
  async generateNaturalResponse(
    sql: string,
    results: any[] | Record<string, any>,
    options: NaturalResponseOptions = {},
  ): Promise<string> {
    const requestId = uuidv4();
    const detailed = options.detailed || false;

    try {
      // Si no hay resultados, proporcionar una respuesta adecuada
      if (!results || (Array.isArray(results) && results.length === 0)) {
        return this.i18n.getMessage("responses", "noResultsFound");
      }

      // Preparar el contexto para el modelo
      const resultData =
        typeof results === "string"
          ? results
          : JSON.stringify(results, null, 2);

      // Detectar características de los resultados para contextualizar mejor
      const isMultipleRows = Array.isArray(results) && results.length > 1;
      const numberOfRows = Array.isArray(results) ? results.length : 1;
      const fields =
        Array.isArray(results) && results.length > 0
          ? Object.keys(results[0]).join(", ")
          : results && typeof results === "object"
            ? Object.keys(results).join(", ")
            : "";

      // Seleccionar el prompt según el nivel de detalle solicitado
      const prompt = detailed
        ? this.generateDetailedPrompt(
            sql,
            resultData,
            isMultipleRows,
            numberOfRows,
            fields,
          )
        : this.generateSimplePrompt(sql, resultData);

      this.logger.debug("Generating natural response", {
        sql,
        detailed,
        language: this.i18n.getLanguage(),
      });

      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
        });

        const explanation =
          response.choices[0]?.message?.content?.trim() ||
          this.i18n.getMessage("responses", "queryCompleted");

        // Registrar uso de tokens
        if (response.usage && this.logger) {
          this.logger.logTokenUsage(
            requestId,
            "format-response",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            this.model,
          );
        }

        // Registrar prompt y respuesta
        if (this.logger) {
          this.logger.logPromptAndResponse(
            requestId,
            "format-response",
            prompt,
            explanation,
            true,
            detailed ? 2 : 1, // Nivel de complejidad
            this.model,
          );
        }

        return explanation;
      } catch (error: any) {
        this.logger.error(
          "Error calling OpenAI to generate natural response:",
          error,
        );
        return detailed
          ? this.i18n.getMessage("errors", "openaiError")
          : this.i18n.getMessage("responses", "queryCompleted");
      }
    } catch (error: any) {
      this.logger.error("General error generating natural response:", error);
      // En caso de error, devolver una respuesta genérica
      return this.i18n.getMessage("responses", "queryCompleted");
    }
  }

  /**
   * Genera un prompt para respuestas simples y directas
   */
  private generateSimplePrompt(sql: string, resultData: string): string {
    const template = this.i18n.getMessage("prompts", "generateNaturalResponse");
    return template.replace("{sql}", sql).replace("{results}", resultData);
  }

  /**
   * Genera un prompt para respuestas elaboradas y analíticas
   */
  private generateDetailedPrompt(
    sql: string,
    resultData: string,
    _isMultipleRows: boolean,
    _numberOfRows: number,
    _fields: string,
  ): string {
    const template = this.i18n.getMessage(
      "prompts",
      "generateDetailedResponse",
    );
    return template.replace("{sql}", sql).replace("{results}", resultData);
  }

  /**
   * Genera respuestas simples para casos comunes sin usar el modelo
   */
  generateSimpleResponse(
    sql: string,
    results: any[] | Record<string, any>,
  ): string | null {
    // Asegurar que results es un array
    const resultsArray = Array.isArray(results) ? results : [results];
    if (!resultsArray.length) return null;

    const firstResult = resultsArray[0];

    // Caso: consulta de precio
    if (sql.toLowerCase().includes("price") && firstResult.price_public) {
      const product =
        firstResult.product_name ||
        firstResult.name ||
        this.i18n.getMessage("labels", "sqlGenerated");
      return `${product} tiene un precio de **$${firstResult.price_public}**.`;
    }

    // Caso: consulta de stock/inventario
    if (
      sql.toLowerCase().includes("stock") &&
      firstResult.stock !== undefined
    ) {
      const product =
        firstResult.product_name ||
        firstResult.name ||
        this.i18n.getMessage("labels", "sqlGenerated");
      return `${product} tiene **${firstResult.stock}** unidades disponibles.`;
    }

    // Caso: consulta de beneficios/ingresos
    if (
      (sql.toLowerCase().includes("profit") ||
        sql.toLowerCase().includes("income") ||
        sql.toLowerCase().includes("revenue")) &&
      firstResult
    ) {
      const month = firstResult.month || firstResult.fecha || firstResult.date;
      const profit =
        firstResult.profit || firstResult.benefits || firstResult.beneficios;
      const revenue =
        firstResult.revenue ||
        firstResult.income ||
        firstResult.ingresos ||
        firstResult.ingresos_totales;

      if (month && profit && revenue) {
        return `El periodo ${month} tuvo **$${profit}** en beneficios y **$${revenue}** en ingresos totales.`;
      } else if (profit && revenue) {
        return `Se registraron **$${profit}** en beneficios y **$${revenue}** en ingresos totales.`;
      }
    }

    // Para otros casos, usaremos el modelo
    return null;
  }
}

export default ResponseFormatter;
