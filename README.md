# ProjectFlow

A full-stack project and task tracking app with authentication, team membership, role-based access, REST APIs, and SQLite persistence.

## Features

- Signup and login with hashed passwords and JWT sessions
- Project creation with automatic Admin ownership
- Project team membership with `Admin` and `Member` roles
- Task creation, assignment, status tracking, due dates, and deletion
- Dashboard totals for total, in-progress, done, and overdue work
- Server-side validation and relationship checks
- Role-based access control:
  - Admins can manage project members and delete tasks
  - Members can view their projects and update tasks they created or are assigned to

## Stack

- React + Vite frontend
- Express REST API
- SQLite via `better-sqlite3`
- JWT authentication
- bcrypt password hashing

## Run Locally

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

Open `http://127.0.0.1:5173`.

Seeded accounts:

- `admin@example.com` / `password123`
- `member@example.com` / `password123`

## API Overview

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members`
- `DELETE /api/projects/:projectId/members/:userId`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/projects/:projectId/tasks/:taskId`
- `DELETE /api/projects/:projectId/tasks/:taskId`
- `GET /api/dashboard`
