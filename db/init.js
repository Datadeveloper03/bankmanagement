/**
 * db/init.js — MySQL Database initialization and seed data
 */

const mysql = require('mysql2/promise');

// MySQL Connection Config — change these to match your setup
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vaultsync',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool = null;

async function initDatabase() {
  // First connect without database to create it if needed
  const tempConn = await mysql.createConnection({
    host: DB_CONFIG.host,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
  });

  await tempConn.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
  await tempConn.end();

  // Now create the pool with the database
  pool = mysql.createPool(DB_CONFIG);

  // --- Create Tables ---
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) DEFAULT '',
      role ENUM('manager', 'customer') NOT NULL DEFAULT 'customer',
      balance DECIMAL(15,2) DEFAULT 0.00,
      account_type VARCHAR(20) DEFAULT 'Savings',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP NULL DEFAULT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('deposit', 'withdraw', 'transfer_in', 'transfer_out') NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      description VARCHAR(255) DEFAULT '',
      related_user_id INT DEFAULT NULL,
      balance_after DECIMAL(15,2) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (related_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // --- Seed default data if empty ---
  const [rows] = await pool.execute('SELECT COUNT(*) as count FROM users');

  if (rows[0].count === 0) {
    console.log('  ⚙ Seeding default data...');

    // Manager
    await pool.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['admin', 'admin123', 'Bank Manager', 'admin@vaultsync.com', 'manager', 0, 'N/A']
    );

    // Customers
    await pool.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['john', 'john123', 'John Doe', 'john@email.com', 'customer', 5000.00, 'Savings']
    );
    await pool.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['jane', 'jane123', 'Jane Smith', 'jane@email.com', 'customer', 12500.00, 'Checking']
    );
    await pool.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['bob', 'bob123', 'Bob Wilson', 'bob@email.com', 'customer', 3200.00, 'Savings']
    );
    await pool.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['alice', 'alice123', 'Alice Brown', 'alice@email.com', 'customer', 8750.00, 'Business']
    );

    // Seed transactions
    await pool.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [2, 'deposit', 2500, 'Salary credit', 5000.00, '2026-04-19 10:30:00']
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [2, 'withdraw', 150, 'ATM Withdrawal', 4850.00, '2026-04-19 14:15:00']
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [3, 'deposit', 1000, 'Freelance payment', 12500.00, '2026-04-18 09:00:00']
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [4, 'deposit', 500, 'Birthday gift', 3200.00, '2026-04-17 16:45:00']
    );
    await pool.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [5, 'withdraw', 250, 'Online purchase', 8750.00, '2026-04-17 11:20:00']
    );

    console.log('  ✓ Default data seeded');
    console.log('  ┌─────────────────────────────────────┐');
    console.log('  │  Default Login Credentials           │');
    console.log('  ├─────────────────────────────────────┤');
    console.log('  │  Manager:  admin / admin123          │');
    console.log('  │  Customer: john  / john123           │');
    console.log('  │  Customer: jane  / jane123           │');
    console.log('  │  Customer: bob   / bob123            │');
    console.log('  │  Customer: alice / alice123          │');
    console.log('  └─────────────────────────────────────┘');
  }

  return pool;
}

function getPool() {
  return pool;
}

module.exports = { initDatabase, getPool };
