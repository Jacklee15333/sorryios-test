# Sorryios AI Admin Dashboard - Installation Guide

## Overview

This update adds:
- **SQLite Database** - Persistent storage for users, tasks, and files
- **Admin Dashboard** - Beautiful web UI for management
- **User System** - Multi-user support ready for the future
- **Logging** - System activity tracking

## Installation Steps

### Step 1: Install new dependency

Open PowerShell in your backend folder and run:

```powershell
cd D:\sorryios-test\backend
npm install better-sqlite3
```

> Note: `better-sqlite3` may need compilation. If it fails, try:
> ```powershell
> npm install better-sqlite3 --build-from-source
> ```
> Or use the pure JS alternative:
> ```powershell
> npm install sql.js
> ```

### Step 2: Copy new files

Copy the following files to your backend folder:

```
backend-files/
├── server.js              → D:\sorryios-test\backend\server.js (REPLACE)
├── services/
│   └── database.js        → D:\sorryios-test\backend\services\database.js (NEW)
├── routes/
│   └── admin.js           → D:\sorryios-test\backend\routes\admin.js (NEW)
└── public/
    └── admin.html         → D:\sorryios-test\backend\public\admin.html (NEW)
```

Create the `public` folder if it doesn't exist:
```powershell
mkdir D:\sorryios-test\backend\public
```

### Step 3: Restart the server

```powershell
cd D:\sorryios-test\backend
npm run dev
```

### Step 4: Access the Admin Dashboard

Open your browser and go to:
```
http://localhost:3000/admin
```

Default login:
- **Username:** admin
- **Password:** admin123

## File Structure After Installation

```
D:\sorryios-test\backend\
├── server.js              # Updated main entry
├── package.json
├── data/                  # NEW - Database storage
│   └── sorryios.db        # SQLite database (auto-created)
├── public/                # NEW - Admin static files
│   └── admin.html         # Admin dashboard
├── routes/
│   ├── upload.js
│   ├── task.js
│   ├── report.js
│   └── admin.js           # NEW - Admin API
├── services/
│   ├── taskQueue.js
│   ├── aiProcessor.js
│   └── database.js        # NEW - Database module
├── lib/
│   ├── text-splitter.js
│   ├── sorryios-automation.js
│   └── report-generator.js
├── uploads/
└── outputs/
```

## Admin Dashboard Features

### Dashboard
- Total users, tasks, files statistics
- Recent tasks overview
- Quick status at a glance

### User Management
- View all users
- Add new users
- Edit user roles (admin/user)
- Delete users (except admin)

### Task Management
- View all task history
- See task status and progress
- Delete old tasks

### File Management
- View all uploaded files
- Track file types and sizes

### System Logs
- Activity tracking
- Error logging
- User login history

## API Endpoints (New)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/dashboard` | GET | Dashboard statistics |
| `/api/admin/users` | GET | List all users |
| `/api/admin/users` | POST | Create new user |
| `/api/admin/users/:id` | PUT | Update user |
| `/api/admin/users/:id` | DELETE | Delete user |
| `/api/admin/tasks` | GET | List all tasks |
| `/api/admin/tasks/:id` | DELETE | Delete task |
| `/api/admin/files` | GET | List all files |
| `/api/admin/logs` | GET | View system logs |

## Database Tables

### users
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| username | TEXT | Unique username |
| password | TEXT | Password (plain for now) |
| email | TEXT | Email address |
| role | TEXT | 'admin' or 'user' |
| status | TEXT | 'active' or 'inactive' |
| created_at | DATETIME | Creation time |
| total_tasks | INTEGER | Task count |
| total_files | INTEGER | File count |

### tasks
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Task UUID |
| user_id | INTEGER | Owner user ID |
| title | TEXT | Task title |
| status | TEXT | pending/processing/completed/failed |
| progress | INTEGER | 0-100 |
| file_name | TEXT | Original filename |
| created_at | DATETIME | Creation time |

### files
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| user_id | INTEGER | Owner user ID |
| task_id | TEXT | Related task |
| original_name | TEXT | Original filename |
| file_size | INTEGER | Size in bytes |
| file_type | TEXT | File extension |

### logs
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| level | TEXT | info/warn/error |
| action | TEXT | Action type |
| message | TEXT | Log message |
| created_at | DATETIME | Log time |

## Security Notes

⚠️ **For production use, you should:**
1. Hash passwords (use bcrypt)
2. Implement proper JWT authentication
3. Add rate limiting
4. Enable HTTPS
5. Change default admin password!

## Troubleshooting

### "Cannot find module 'better-sqlite3'"
```powershell
npm install better-sqlite3
```

### "Error: SQLITE_CANTOPEN"
Make sure the `data` folder can be created:
```powershell
mkdir D:\sorryios-test\backend\data
```

### Admin page shows "Loading..."
Check if the backend is running and open browser console for errors.

---

Enjoy your new Admin Dashboard! 🎉
