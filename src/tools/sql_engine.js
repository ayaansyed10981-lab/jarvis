import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { gemini } from '../gemini.js';
import { logger } from '../logger.js';

class SqlEngine {
  constructor() {
    this.dbPath = config.paths.database;
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = null;
    this.initDatabase();
  }

  initDatabase() {
    try {
      this.db = new DatabaseSync(this.dbPath);
      logger.info(`Connected to SQLite database at: ${this.dbPath}`);
      this.seedSampleData();
    } catch (err) {
      logger.error('Failed to initialize SQLite database', err);
    }
  }

  seedSampleData() {
    try {
      // Check if tables already exist
      const tables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='employees'"
      ).all();

      if (tables.length > 0) return; // Already seeded

      logger.info('Seeding initial tables (departments, employees, products, customers, orders)...');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS departments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          budget REAL,
          location TEXT
        );

        CREATE TABLE IF NOT EXISTS employees (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          salary REAL NOT NULL,
          dept_id INTEGER,
          hire_date TEXT,
          FOREIGN KEY (dept_id) REFERENCES departments(id)
        );

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          stock INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          city TEXT,
          signup_date TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER,
          product_id INTEGER,
          quantity INTEGER NOT NULL,
          total_amount REAL NOT NULL,
          order_date TEXT,
          status TEXT DEFAULT 'Completed',
          FOREIGN KEY (customer_id) REFERENCES customers(id),
          FOREIGN KEY (product_id) REFERENCES products(id)
        );

        -- Insert Departments
        INSERT INTO departments (name, budget, location) VALUES
        ('Engineering', 500000.0, 'Floor 4 - Tech Wing'),
        ('Product Design', 180000.0, 'Floor 3 - Creative Studio'),
        ('Cybersecurity & QA', 220000.0, 'Floor 4 - Operations Hub'),
        ('Sales & Marketing', 350000.0, 'Floor 2 - Commercial');

        -- Insert Employees
        INSERT INTO employees (name, role, salary, dept_id, hire_date) VALUES
        ('Tony Stark', 'Chief Systems Architect', 250000, 1, '2020-03-15'),
        ('Bruce Banner', 'Senior Data Scientist', 185000, 1, '2021-06-01'),
        ('Natasha Romanoff', 'Security Director', 195000, 3, '2020-01-10'),
        ('Peter Parker', 'Junior Software Engineer', 95000, 1, '2023-08-20'),
        ('Pepper Potts', 'VP Commercial Sales', 210000, 4, '2019-11-05'),
        ('Stephen Strange', 'Principal Algorithm Architect', 220000, 1, '2022-02-14'),
        ('Wanda Maximoff', 'Lead UI/UX Designer', 160000, 2, '2022-09-18');

        -- Insert Products
        INSERT INTO products (name, category, price, stock) VALUES
        ('Mark LXXXV Arc Reactor Core', 'Hardware', 1499.99, 25),
        ('Ultron Neural Processor v2', 'Compute', 899.50, 40),
        ('Jarvis Voice Optical Sensor', 'Peripherals', 199.00, 120),
        ('Quantum Encrypted Drive 10TB', 'Storage', 450.00, 60),
        ('Holographic HUD Projector', 'Display', 1200.00, 15);

        -- Insert Customers
        INSERT INTO customers (name, email, city, signup_date) VALUES
        ('Reed Richards', 'reed@baxter.org', 'New York', '2024-01-15'),
        ('Sue Storm', 'sue@baxter.org', 'New York', '2024-01-20'),
        ('Matt Murdock', 'murdock@nelsonmurdock.law', 'Hell''s Kitchen', '2024-03-02'),
        ('Jessica Jones', 'jj@aliasinvestigations.nyc', 'New York', '2024-04-12');

        -- Insert Orders
        INSERT INTO orders (customer_id, product_id, quantity, total_amount, order_date, status) VALUES
        (1, 2, 4, 3598.00, '2024-02-10', 'Completed'),
        (1, 4, 2, 900.00, '2024-02-11', 'Completed'),
        (2, 5, 1, 1200.00, '2024-02-25', 'Completed'),
        (3, 3, 1, 199.00, '2024-03-15', 'Completed'),
        (4, 1, 1, 1499.99, '2024-04-20', 'Processing');
      `);

      logger.success('Database seeded with sample records successfully.');
    } catch (err) {
      logger.error('Failed to seed sample database data', err);
    }
  }

  runQuery(sql) {
    if (!this.db) {
      return { success: false, error: 'Database is not initialized' };
    }

    const cleanSql = sql.trim().replace(/;+$/, '');
    const isSelect = /^\s*(?:SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(cleanSql);
    const startTime = Date.now();

    try {
      if (isSelect) {
        const stmt = this.db.prepare(cleanSql);
        const rows = stmt.all();
        const durationMs = Date.now() - startTime;
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        return {
          success: true,
          type: 'SELECT',
          columns,
          rows,
          rowCount: rows.length,
          durationMs,
          tableText: this.formatAsciiTable(columns, rows)
        };
      } else {
        const result = this.db.exec(cleanSql);
        const durationMs = Date.now() - startTime;
        return {
          success: true,
          type: 'EXEC',
          durationMs,
          message: 'Query executed successfully'
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
        sql: cleanSql
      };
    }
  }

  getSchema() {
    try {
      const tables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all();

      const schema = {};
      for (const t of tables) {
        const cols = this.db.prepare(`PRAGMA table_info("${t.name}")`).all();
        schema[t.name] = cols.map(c => ({
          column: c.name,
          type: c.type,
          nullable: c.notnull === 0,
          primaryKey: c.pk === 1
        }));
      }
      return schema;
    } catch (err) {
      return {};
    }
  }

  async solveQuery(naturalQuery) {
    const schema = this.getSchema();
    const schemaStr = Object.entries(schema)
      .map(([table, cols]) => `${table} (${cols.map(c => `${c.column} ${c.type}`).join(', ')})`)
      .join('\n');

    logger.info(`Solving SQL query: "${naturalQuery}"`);

    const rawSolution = await gemini.solveSql(naturalQuery, schemaStr);

    let parsed = null;
    try {
      const jsonMatch = rawSolution.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {}

    const sql = parsed?.sql || rawSolution.replace(/```(?:sql)?/g, '').trim();
    const explanation = parsed?.explanation || 'Query generated by Jarvis';

    // Execute the generated SQL to verify it
    const execution = this.runQuery(sql);

    return {
      naturalQuery,
      sql,
      explanation,
      execution
    };
  }

  formatAsciiTable(columns, rows) {
    if (!columns || columns.length === 0 || !rows || rows.length === 0) {
      return '(No records returned)';
    }

    const colWidths = {};
    columns.forEach(col => {
      colWidths[col] = Math.max(col.length, ...rows.map(r => String(r[col] ?? 'NULL').length));
    });

    const header = columns.map(c => c.padEnd(colWidths[c])).join(' | ');
    const divider = columns.map(c => '-'.repeat(colWidths[c])).join('-+-');
    const dataLines = rows.map(r =>
      columns.map(c => String(r[c] ?? 'NULL').padEnd(colWidths[c])).join(' | ')
    );

    return `${header}\n${divider}\n${dataLines.join('\n')}`;
  }
}

export const sqlEngine = new SqlEngine();
