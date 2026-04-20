/**
 * server.js — VaultSync Bank Management Server
 * Express + Session Auth + MySQL
 * Role-based access: Manager & Customer
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDatabase, getPool } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: 'vaultsync-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

// --- Auth Middleware ---
function requireAuth(req, res, next) {
  if (!req.session.user) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireManager(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'manager') {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'customer') {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Customer access required' });
    }
    return res.redirect('/login');
  }
  next();
}

// Helper: get first row from MySQL result
function firstRow(result) {
  const [rows] = result;
  return rows[0] || null;
}

function allRows(result) {
  const [rows] = result;
  return rows;
}

// ============================================================
// PAGE ROUTES
// ============================================================

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role === 'manager') return res.redirect('/manager');
  return res.redirect('/customer');
});

app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'manager' ? '/manager' : '/customer');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/manager', requireManager, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'manager.html'));
});

app.get('/customer', requireCustomer, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'customer.html'));
});

// ============================================================
// AUTH API
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = getPool();

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = firstRow(await db.execute('SELECT * FROM users WHERE username = ?', [username]));

    if (!user || password !== user.password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    await db.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Store in session
    req.session.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: parseFloat(user.balance),
      accountType: user.account_type,
      lastLogin: user.last_login,
    };

    res.json({
      success: true,
      role: user.role,
      redirect: user.role === 'manager' ? '/manager' : '/customer',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true, redirect: '/login' });
  });
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const user = firstRow(
      await db.execute(
        'SELECT id, username, name, email, role, balance, account_type, last_login, created_at FROM users WHERE id = ?',
        [req.session.user.id]
      )
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    req.session.user.balance = parseFloat(user.balance);

    res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: parseFloat(user.balance),
      accountType: user.account_type,
      lastLogin: user.last_login,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const db = getPool();
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }

    const user = firstRow(
      await db.execute('SELECT password FROM users WHERE id = ?', [req.session.user.id])
    );

    if (currentPassword !== user.password) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await db.execute('UPDATE users SET password = ? WHERE id = ?', [newPassword, req.session.user.id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// CUSTOMER API
// ============================================================

// POST /api/customer/deposit
app.post('/api/customer/deposit', requireCustomer, async (req, res) => {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    const { amount, description } = req.body;
    const userId = req.session.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }

    await conn.beginTransaction();

    const user = firstRow(await conn.execute('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]));
    const oldBalance = parseFloat(user.balance);
    const newBalance = oldBalance + amount;

    await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);
    await conn.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after) VALUES (?, ?, ?, ?, ?)',
      [userId, 'deposit', amount, description || `Deposit — $${amount.toFixed(2)}`, newBalance]
    );

    await conn.commit();
    req.session.user.balance = newBalance;

    res.json({ success: true, newBalance, oldBalance });
  } catch (err) {
    await conn.rollback();
    console.error('Deposit error:', err);
    res.status(500).json({ error: 'Deposit failed' });
  } finally {
    conn.release();
  }
});

// POST /api/customer/withdraw
app.post('/api/customer/withdraw', requireCustomer, async (req, res) => {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    const { amount, description } = req.body;
    const userId = req.session.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    await conn.beginTransaction();

    const user = firstRow(await conn.execute('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]));
    const oldBalance = parseFloat(user.balance);

    if (amount > oldBalance) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient funds. Your balance is $${oldBalance.toFixed(2)}`,
      });
    }

    const newBalance = oldBalance - amount;

    await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);
    await conn.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after) VALUES (?, ?, ?, ?, ?)',
      [userId, 'withdraw', amount, description || `Withdrawal — $${amount.toFixed(2)}`, newBalance]
    );

    await conn.commit();
    req.session.user.balance = newBalance;

    res.json({ success: true, newBalance, oldBalance });
  } catch (err) {
    await conn.rollback();
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Withdrawal failed' });
  } finally {
    conn.release();
  }
});

// POST /api/customer/transfer
app.post('/api/customer/transfer', requireCustomer, async (req, res) => {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    const { toUsername, amount, description } = req.body;
    const fromId = req.session.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid transfer amount' });
    }
    if (!toUsername) {
      return res.status(400).json({ error: 'Recipient username is required' });
    }

    await conn.beginTransaction();

    const fromUser = firstRow(await conn.execute('SELECT * FROM users WHERE id = ? FOR UPDATE', [fromId]));
    const toUser = firstRow(await conn.execute('SELECT * FROM users WHERE username = ? AND role = ? FOR UPDATE', [toUsername, 'customer']));

    if (!toUser) {
      await conn.rollback();
      return res.status(404).json({ error: 'Recipient account not found' });
    }
    if (toUser.id === fromId) {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    const fromBalance = parseFloat(fromUser.balance);
    if (amount > fromBalance) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient funds. Your balance is $${fromBalance.toFixed(2)}`,
      });
    }

    const fromNewBalance = fromBalance - amount;
    const toNewBalance = parseFloat(toUser.balance) + amount;
    const desc = description || `Transfer to ${toUser.name}`;

    await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [fromNewBalance, fromId]);
    await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [toNewBalance, toUser.id]);
    await conn.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, related_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [fromId, 'transfer_out', amount, desc, fromNewBalance, toUser.id]
    );
    await conn.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after, related_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [toUser.id, 'transfer_in', amount, `Transfer from ${fromUser.name}`, toNewBalance, fromId]
    );

    await conn.commit();
    req.session.user.balance = fromNewBalance;

    res.json({ success: true, newBalance: fromNewBalance, oldBalance: fromBalance, recipientName: toUser.name });
  } catch (err) {
    await conn.rollback();
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Transfer failed' });
  } finally {
    conn.release();
  }
});

// GET /api/customer/transactions
app.get('/api/customer/transactions', requireCustomer, async (req, res) => {
  try {
    const db = getPool();
    const transactions = allRows(
      await db.execute(
        `SELECT t.*, u.name as related_user_name
         FROM transactions t
         LEFT JOIN users u ON t.related_user_id = u.id
         WHERE t.user_id = ?
         ORDER BY t.created_at DESC
         LIMIT 50`,
        [req.session.user.id]
      )
    );

    // Convert DECIMAL fields to numbers
    transactions.forEach(t => {
      t.amount = parseFloat(t.amount);
      t.balance_after = t.balance_after != null ? parseFloat(t.balance_after) : null;
    });

    res.json({ transactions });
  } catch (err) {
    console.error('Customer transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/customer/recipients
app.get('/api/customer/recipients', requireCustomer, async (req, res) => {
  try {
    const db = getPool();
    const recipients = allRows(
      await db.execute('SELECT id, username, name FROM users WHERE role = ? AND id != ?', ['customer', req.session.user.id])
    );
    res.json({ recipients });
  } catch (err) {
    console.error('Recipients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// MANAGER API
// ============================================================

// GET /api/manager/stats
app.get('/api/manager/stats', requireManager, async (req, res) => {
  try {
    const db = getPool();

    const totalCustomers = firstRow(await db.execute("SELECT COUNT(*) as count FROM users WHERE role = 'customer'")).count;
    const totalBalance = parseFloat(firstRow(await db.execute("SELECT COALESCE(SUM(balance), 0) as total FROM users WHERE role = 'customer'")).total);
    const totalDeposits = parseFloat(firstRow(await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'deposit'")).total);
    const totalWithdrawals = parseFloat(firstRow(await db.execute("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'withdraw'")).total);
    const totalTransactions = firstRow(await db.execute('SELECT COUNT(*) as count FROM transactions')).count;

    const recentTransactions = allRows(
      await db.execute(
        `SELECT t.*, u.name as user_name, u.username as user_username
         FROM transactions t
         JOIN users u ON t.user_id = u.id
         ORDER BY t.created_at DESC
         LIMIT 10`
      )
    );

    recentTransactions.forEach(t => {
      t.amount = parseFloat(t.amount);
      t.balance_after = t.balance_after != null ? parseFloat(t.balance_after) : null;
    });

    res.json({ totalCustomers, totalBalance, totalDeposits, totalWithdrawals, totalTransactions, recentTransactions });
  } catch (err) {
    console.error('Manager stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/manager/customers
app.get('/api/manager/customers', requireManager, async (req, res) => {
  try {
    const db = getPool();
    const customers = allRows(
      await db.execute(
        "SELECT id, username, name, email, balance, account_type, last_login, created_at FROM users WHERE role = 'customer' ORDER BY name"
      )
    );
    customers.forEach(c => { c.balance = parseFloat(c.balance); });
    res.json({ customers });
  } catch (err) {
    console.error('Customers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/manager/customers — add customer
app.post('/api/manager/customers', requireManager, async (req, res) => {
  try {
    const db = getPool();
    const { username, password, name, email, balance, accountType } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Username, password, and name are required' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const existing = firstRow(await db.execute('SELECT id FROM users WHERE username = ?', [username]));
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const [result] = await db.execute(
      'INSERT INTO users (username, password, name, email, role, balance, account_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [username, password, name, email || '', 'customer', balance || 0, accountType || 'Savings']
    );

    const newCustomer = firstRow(
      await db.execute('SELECT id, username, name, email, balance, account_type, created_at FROM users WHERE id = ?', [result.insertId])
    );
    newCustomer.balance = parseFloat(newCustomer.balance);

    res.json({ success: true, customer: newCustomer });
  } catch (err) {
    console.error('Add customer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/manager/customers/:id
app.delete('/api/manager/customers/:id', requireManager, async (req, res) => {
  try {
    const db = getPool();
    const id = parseInt(req.params.id);
    const user = firstRow(await db.execute('SELECT * FROM users WHERE id = ? AND role = ?', [id, 'customer']));

    if (!user) return res.status(404).json({ error: 'Customer not found' });

    await db.execute('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/manager/customers/:id/balance
app.put('/api/manager/customers/:id/balance', requireManager, async (req, res) => {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    const id = parseInt(req.params.id);
    const { newBalance, reason } = req.body;

    if (newBalance === undefined || newBalance < 0) {
      return res.status(400).json({ error: 'Invalid balance amount' });
    }

    await conn.beginTransaction();

    const user = firstRow(await conn.execute('SELECT * FROM users WHERE id = ? AND role = ? FOR UPDATE', [id, 'customer']));
    if (!user) {
      await conn.rollback();
      return res.status(404).json({ error: 'Customer not found' });
    }

    const oldBalance = parseFloat(user.balance);
    const diff = newBalance - oldBalance;
    const type = diff >= 0 ? 'deposit' : 'withdraw';

    await conn.execute('UPDATE users SET balance = ? WHERE id = ?', [newBalance, id]);
    await conn.execute(
      'INSERT INTO transactions (user_id, type, amount, description, balance_after) VALUES (?, ?, ?, ?, ?)',
      [id, type, Math.abs(diff), reason || 'Balance adjustment by manager', newBalance]
    );

    await conn.commit();

    res.json({ success: true, oldBalance, newBalance });
  } catch (err) {
    await conn.rollback();
    console.error('Adjust balance error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

// GET /api/manager/transactions
app.get('/api/manager/transactions', requireManager, async (req, res) => {
  try {
    const db = getPool();
    const transactions = allRows(
      await db.execute(
        `SELECT t.*, u.name as user_name, u.username as user_username,
                r.name as related_user_name
         FROM transactions t
         JOIN users u ON t.user_id = u.id
         LEFT JOIN users r ON t.related_user_id = r.id
         ORDER BY t.created_at DESC
         LIMIT 100`
      )
    );

    transactions.forEach(t => {
      t.amount = parseFloat(t.amount);
      t.balance_after = t.balance_after != null ? parseFloat(t.balance_after) : null;
    });

    res.json({ transactions });
  } catch (err) {
    console.error('Manager transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/manager/transactions/:id
app.delete('/api/manager/transactions/:id', requireManager, async (req, res) => {
  try {
    const db = getPool();
    const id = parseInt(req.params.id);
    const tx = firstRow(await db.execute('SELECT * FROM transactions WHERE id = ?', [id]));
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    await db.execute('DELETE FROM transactions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
  try {
    await initDatabase();
    console.log('  ✓ MySQL database connected');

    app.listen(PORT, () => {
      console.log(`\n  🏦 VaultSync Bank Management System`);
      console.log(`  ────────────────────────────────────`);
      console.log(`  ✓ Server running at http://localhost:${PORT}`);
      console.log(`  ✓ Login at http://localhost:${PORT}/login`);
      console.log('');
    });
  } catch (err) {
    console.error('\n  ✕ Failed to start server:', err.message);
    console.error('  → Make sure MySQL is running on localhost:3306');
    console.error('  → Default config: user=root, password=(empty), database=vaultsync\n');
    process.exit(1);
  }
}

startServer();
