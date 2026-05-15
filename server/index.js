import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { projectRole, requireAuth, requireProjectRole, signToken } from './auth.js';
import { requireString, validateDate, validateEmail, validateRole, validateStatus } from './validators.js';

const app = express();
const defaultPort = process.env.RAILWAY_ENVIRONMENT ? 5173 : 4000;
const port = Number(process.env.PORT || defaultPort);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../dist');

app.use(cors());
app.use(express.json());

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/signup', async (req, res) => {
  const nameError = requireString(req.body.name, 'Name', 2, 80);
  const emailError = validateEmail(req.body.email);
  const passwordError =
    typeof req.body.password !== 'string' || req.body.password.length < 8
      ? 'Password must be at least 8 characters.'
      : null;

  const error = nameError || emailError || passwordError;
  if (error) return res.status(400).json({ error });

  const passwordHash = await bcrypt.hash(req.body.password, 12);

  try {
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(req.body.name.trim(), req.body.email.trim().toLowerCase(), passwordHash);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ user: publicUser(user), token: signToken(user) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const emailError = validateEmail(req.body.email);
  if (emailError || typeof req.body.password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db
    .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
    .get(req.body.email.trim().toLowerCase());
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ user: publicUser(user), token: signToken(user) });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/users', requireAuth, (_req, res) => {
  const users = db.prepare('SELECT id, name, email FROM users ORDER BY name ASC').all();
  res.json({ users });
});

app.get('/api/projects', requireAuth, (req, res) => {
  const projects = db
    .prepare(
      `
      SELECT p.*, pm.role,
        COUNT(DISTINCT t.id) AS taskCount,
        SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS doneCount
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE pm.user_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `
    )
    .all(req.user.id);
  res.json({ projects });
});

app.post('/api/projects', requireAuth, (req, res) => {
  const nameError = requireString(req.body.name, 'Project name', 2, 100);
  if (nameError) return res.status(400).json({ error: nameError })
  });
