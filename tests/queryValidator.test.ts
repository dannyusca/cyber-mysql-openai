// tests/queryValidator.test.ts
import { checkQuerySafety, validateQuery } from "../src/utils/queryValidator";
import { DBManager } from "../src/db";
import Logger from "../src/utils";

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const schema = {
  users: {
    columns: [{ COLUMN_NAME: "id" }, { COLUMN_NAME: "name" }],
    foreignKeys: [],
  },
};

describe("checkQuerySafety", () => {
  test.each([
    ["SELECT * FROM users INTO OUTFILE '/tmp/users.csv'", "INTO OUTFILE"],
    ["SELECT name FROM users INTO DUMPFILE '/tmp/x'", "INTO OUTFILE/DUMPFILE"],
    ["SELECT LOAD_FILE('/etc/passwd')", "LOAD_FILE"],
    ["SELECT SLEEP(99999)", "SLEEP"],
    ["SELECT BENCHMARK(100000000, MD5('a'))", "BENCHMARK"],
    ["SELECT * FROM users WHERE id = 1 FOR UPDATE", "FOR UPDATE"],
    ["SELECT * FROM users LOCK IN SHARE MODE", "LOCK IN SHARE MODE"],
    ["SELECT user, authentication_string FROM mysql.user", "mysql"],
    ["SELECT * FROM `mysql`.`user`", "mysql"],
    ["SELECT * FROM performance_schema.threads", "performance_schema"],
    ["SELECT 1; DROP TABLE users", "Solo se permite una sentencia"],
    ["SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */", "Comentarios ejecutables"],
    ["EXPLAIN ANALYZE DELETE FROM users", "DELETE"],
  ])("bloquea: %s", (sql, expected) => {
    const errors = checkQuerySafety(sql);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain(expected.split(" ")[0]);
  });

  test.each([
    "SELECT * FROM users LIMIT 10;",
    "SELECT id FROM users WHERE status = 'DELETE' OR note = 'drop; update'",
    "SELECT `delete`, `update` FROM users",
    "SELECT INSERT(name, 1, 2, 'xx'), TRUNCATE(3.14159, 2) FROM users",
    "SELECT REPLACE(name, 'a', 'b') FROM users",
    "SELECT EXTRACT(YEAR FROM created_at) AS y FROM users",
    "SELECT u.name, u.last_update, u.created_at FROM users u",
    "SELECT * FROM information_schema.tables WHERE table_schema = DATABASE()",
    "SELECT name FROM users -- comentario; con punto y coma\nLIMIT 5",
    "SHOW CREATE TABLE users",
    "DESCRIBE users",
    "EXPLAIN SELECT * FROM users",
  ])("permite: %s", (sql) => {
    expect(checkQuerySafety(sql)).toEqual([]);
  });
});

describe("validateQuery", () => {
  test("marca como inválida una consulta peligrosa", () => {
    const result = validateQuery("SELECT LOAD_FILE('/etc/passwd')", schema);
    expect(result.valid).toBe(false);
  });

  test("acepta una consulta válida", () => {
    const result = validateQuery("SELECT id, name FROM users LIMIT 5", schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("DBManager.executeReadOnlyQuery", () => {
  const dbConfig = {
    host: "localhost",
    port: 3306,
    user: "test",
    password: "",
    database: "test",
  };

  test("bloquea consultas peligrosas sin tocar la base de datos", async () => {
    const db = new DBManager(dbConfig, mockLogger);
    const getPool = jest.spyOn(db, "getPool");

    await expect(
      db.executeReadOnlyQuery("SELECT * FROM users INTO OUTFILE '/tmp/x'"),
    ).rejects.toThrow("Query blocked by read-only safety check");
    expect(getPool).not.toHaveBeenCalled();
  });

  test("aplica el timeout por defecto y el configurado", async () => {
    const query = jest.fn().mockResolvedValue([[{ id: 1 }]]);

    const db = new DBManager(dbConfig, mockLogger);
    jest.spyOn(db, "getPool").mockResolvedValue({ query } as any);
    await expect(db.executeReadOnlyQuery("SELECT 1")).resolves.toEqual([
      { id: 1 },
    ]);
    expect(query).toHaveBeenLastCalledWith(
      { sql: "SELECT 1", timeout: 30000 },
      [],
    );

    const noTimeout = new DBManager({ ...dbConfig, queryTimeout: 0 }, mockLogger);
    jest.spyOn(noTimeout, "getPool").mockResolvedValue({ query } as any);
    await noTimeout.executeReadOnlyQuery("SELECT 1");
    expect(query).toHaveBeenLastCalledWith(
      { sql: "SELECT 1", timeout: undefined },
      [],
    );
  });
});
