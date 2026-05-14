import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { projectRole, requireAuth, requireProjectRole, signToken } from './auth.js';
import { requireString, validateDate, validateEmail, validateRole, validateStatus } from './validators.js';

const app = express();
const port = Number(process.env.PORT || 4000);

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
  if (nameError) return res.status(400).json({ error: nameError });

  const createProject = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)')
      .run(req.body.name.trim(), String(req.body.description || '').trim(), req.user.id);
    db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
      .run(info.lastInsertRowid, req.user.id, 'Admin');
    return info.lastInsertRowid;
  });

  const projectId = createProject();
  const project = db
    .prepare('SELECT p.*, pm.role FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.id = ?')
    .get(projectId);
  res.status(201).json({ project });
});

app.get('/api/projects/:projectId', requireAuth, requireProjectRole(['Admin', 'Member']), (req, res) => {
  const project = db
    .prepare('SELECT p.*, pm.role FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.id = ? AND pm.user_id = ?')
    .get(req.projectId, req.user.id);
  const members = db
    .prepare(
      `
      SELECT u.id, u.name, u.email, pm.role
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.role ASC, u.name ASC
    `
    )
    .all(req.projectId);
  const tasks = db
    .prepare(
      `
      SELECT t.*, u.name AS assigneeName, c.name AS creatorName
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      JOIN users c ON c.id = t.created_by
      WHERE t.project_id = ?
      ORDER BY COALESCE(t.due_date, '9999-12-31') ASC, t.created_at DESC
    `
    )
    .all(req.projectId);

  res.json({ project, members, tasks });
});

app.post('/api/projects/:projectId/members', requireAuth, requireProjectRole(['Admin']), (req, res) => {
  const userId = Number(req.body.userId);
  const roleError = validateRole(req.body.role);
  if (!Number.isInteger(userId) || roleError) {
    return res.status(400).json({ error: roleError || 'Valid userId is required.' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  db.prepare(
    `
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role
  `
  ).run(req.projectId, userId, req.body.role);

  res.status(201).json({ ok: true });
});

app.delete('/api/projects/:projectId/members/:userId', requireAuth, requireProjectRole(['Admin']), (req, res) => {
  const userId = Number(req.params.userId);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Admins cannot remove themselves.' });
  }
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.projectId, userId);
  db.prepare('UPDATE tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?').run(req.projectId, userId);
  res.json({ ok: true });
});

app.post('/api/projects/:projectId/tasks', requireAuth, requireProjectRole(['Admin', 'Member']), (req, res) => {
  const titleError = requireString(req.body.title, 'Task title', 2, 120);
  const dateError = validateDate(req.body.dueDate);
  const statusError = req.body.status ? validateStatus(req.body.status) : null;
  if (titleError || dateError || statusError) {
    return res.status(400).json({ error: titleError || dateError || statusError });
  }

  const assigneeId = req.body.assigneeId ? Number(req.body.assigneeId) : null;
  if (assigneeId && !projectRole(req.projectId, assigneeId)) {
    return res.status(400).json({ error: 'Assignee must be a project member.' });
  }

  const info = db
    .prepare(
      `
      INSERT INTO tasks (project_id, title, description, assignee_id, status, due_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      req.projectId,
      req.body.title.trim(),
      String(req.body.description || '').trim(),
      assigneeId,
      req.body.status || 'Todo',
      req.body.dueDate || null,
      req.user.id
    );

  res.status(201).json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) });
});

app.patch('/api/projects/:projectId/tasks/:taskId', requireAuth, requireProjectRole(['Admin', 'Member']), (req, res) => {
  const taskId = Number(req.params.taskId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?').get(taskId, req.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  if (req.projectRole !== 'Admin' && task.assignee_id !== req.user.id && task.created_by !== req.user.id) {
    return res.status(403).json({ error: 'Members can update tasks they created or are assigned to.' });
  }

  const next = {
    title: req.body.title === undefined ? task.title : String(req.body.title).trim(),
    description: req.body.description === undefined ? task.description : String(req.body.description).trim(),
    assignee_id: req.body.assigneeId === undefined ? task.assignee_id : req.body.assigneeId ? Number(req.body.assigneeId) : null,
    status: req.body.status === undefined ? task.status : req.body.status,
    due_date: req.body.dueDate === undefined ? task.due_date : req.body.dueDate || null
  };

  const titleError = requireString(next.title, 'Task title', 2, 120);
  const statusError = validateStatus(next.status);
  const dateError = validateDate(next.due_date);
  if (titleError || statusError || dateError) {
    return res.status(400).json({ error: titleError || statusError || dateError });
  }
  if (next.assignee_id && !projectRole(req.projectId, next.assignee_id)) {
    return res.status(400).json({ error: 'Assignee must be a project member.' });
  }

  db.prepare(
    `
    UPDATE tasks
    SET title = ?, description = ?, assignee_id = ?, status = ?, due_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ?
  `
  ).run(next.title, next.description, next.assignee_id, next.status, next.due_date, taskId, req.projectId);

  res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) });
});

app.delete('/api/projects/:projectId/tasks/:taskId', requireAuth, requireProjectRole(['Admin']), (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND project_id = ?').run(Number(req.params.taskId), req.projectId);
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(t.id) AS total,
        SUM(CASE WHEN t.status = 'Todo' THEN 1 ELSE 0 END) AS todo,
        SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN t.status != 'Done' AND t.due_date < date('now') THEN 1 ELSE 0 END) AS overdue
      FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE pm.user_id = ?
        AND (pm.role = 'Admin' OR t.assignee_id = ? OR t.created_by = ?)
    `
    )
    .get(req.user.id, req.user.id, req.user.id);

  const tasks = db
    .prepare(
      `
      SELECT t.*, p.name AS projectName, u.name AS assigneeName
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE pm.user_id = ?
        AND (pm.role = 'Admin' OR t.assignee_id = ? OR t.created_by = ?)
      ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC, t.created_at DESC
      LIMIT 20
    `
    )
    .all(req.user.id, req.user.id, req.user.id);

  res.json({ stats, tasks });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`ProjectFlow API running on http://127.0.0.1:${port}`);
});
