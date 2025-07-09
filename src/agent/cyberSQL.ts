// src/agent/cyberSQL.ts
// Este archivo existe solo para mantener compatibilidad con código existente que pudiera estar usándolo.
// Se recomienda usar cyberMySQLOpenAI.ts directamente.

import { CyberMySQLOpenAI } from './cyberMySQLOpenAI';
import { CyberMySQLOpenAIConfig } from '../types';

/**
 * @deprecated Utiliza CyberMySQLOpenAI en su lugar
 */
export class CyberSQL extends CyberMySQLOpenAI {
  constructor(config: Partial<CyberMySQLOpenAIConfig> = {}) {
    super(config);
    console.warn('DEPRECATED: La clase CyberSQL está obsoleta. Utiliza CyberMySQLOpenAI en su lugar.');
  }
}

export default CyberSQL;
