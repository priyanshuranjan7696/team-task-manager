import bcrypt from 'bcryptjs';
import db from './db.js';

const password = await bcrypt.hash('password123', 12);

const seed = db.transaction(() => {
  db.exec('DELETE FROM tasks; DELETE FROM project_members; DELETE FROM projects; DELETE FROM users;');

  const adminId = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Avery Admin', 'admin@example.com', password).lastInsertRowid;
  const memberId = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run('Mina Member', 'member@example.com', password).lastInsertRowid;

  const projectId = db
    .prepare('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)')
    .run('Website Relaunch', 'Coordinate design, build, and release readiness.', adminId).lastInsertRowid;

  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, adminId, 'Admin');
  db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, memberId, 'Member');

  db.prepare(
    'INSERT INTO tasks (project_id, title, description, assignee_id, status, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, 'Finalize homepage copy', 'Tighten message hierarchy and CTA labels.', memberId, 'In Progress', '2026-05-20', adminId);
  db.prepare(
    'INSERT INTO tasks (project_id, title, description, assignee_id, status, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, 'QA auth flows', 'Validate signup, login, and session persistence.', adminId, 'Todo', '2026-05-18', adminId);
  db.prepare(
    'INSERT INTO tasks (project_id, title, description, assignee_id, status, due_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, 'Publish kickoff notes', 'Share project scope with the team.', memberId, 'Done', '2026-05-12', memberId);
});

seed();
console.log('Seed complete. Login with admin@example.com or member@example.com, password password123.');
