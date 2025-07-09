// tests/utils.test.ts
import { cleanSqlResponse } from '../src/utils/sqlCleaner';
import Logger from '../src/utils';

// Mock para el logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  logTokenUsage: jest.fn(),
};

describe('SQL Cleaner Utility', () => {
  test('should remove backticks from SQL input', () => {
    const sqlWithBackticks = '```sql\nSELECT * FROM users;\n```';
    const expected = 'SELECT * FROM users;';
    const result = cleanSqlResponse(sqlWithBackticks, 'generate', mockLogger as unknown as Logger);
    expect(result).toBe(expected);
  });

  test('should handle SQL without backticks', () => {
    const sql = 'SELECT * FROM users;';
    const result = cleanSqlResponse(sql, 'generate', mockLogger as unknown as Logger);
    expect(result).toBe(sql);
  });

  test('should trim whitespace', () => {
    const sql = '  SELECT * FROM users;  ';
    const expected = 'SELECT * FROM users;';
    const result = cleanSqlResponse(sql, 'generate', mockLogger as unknown as Logger);
    expect(result).toBe(expected);
  });
});
