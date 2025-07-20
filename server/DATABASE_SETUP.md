# Database Setup Guide

This guide will help you set up PostgreSQL for the AI Screenwriting Tool.

## Prerequisites

- PostgreSQL installed on your system
- Node.js and npm installed

## Quick Setup

### 1. Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)

### 2. Create Database and User

Connect to PostgreSQL:
```bash
psql -U postgres
```

Run these SQL commands:
```sql
-- Create a new database
CREATE DATABASE screenwriting_tool;

-- Create a new user (optional, or use 'postgres' user)
CREATE USER screenwriter WITH PASSWORD 'your_secure_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE screenwriting_tool TO screenwriter;

-- Exit
\q
```

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=screenwriter  # or 'postgres' if using default user
DB_PASSWORD=your_secure_password
DB_NAME=screenwriting_tool
NODE_ENV=development
PORT=5001
```

### 4. Run the Server

The database tables will be created automatically when you start the server:
```bash
npm run dev:server
```

## Troubleshooting

### Connection refused error
- Make sure PostgreSQL is running: `brew services list` (macOS) or `sudo systemctl status postgresql` (Linux)
- Check if PostgreSQL is listening on the correct port: `sudo lsof -i :5432`

### Authentication failed
- Verify your username and password in `.env`
- Check PostgreSQL authentication settings in `pg_hba.conf`

### Database does not exist
- Make sure you created the database: `psql -U postgres -c "CREATE DATABASE screenwriting_tool;"`

## Production Considerations

For production deployment:
1. Set `NODE_ENV=production` in your environment
2. Use strong passwords
3. Consider using connection pooling
4. Set up regular backups
5. Use SSL connections for remote databases

## Migration Management

Currently, the app uses TypeORM's `synchronize` feature in development. For production, you should:

1. Set `synchronize: false` in the data source configuration
2. Generate migrations: `npm run typeorm migration:generate -- -n MigrationName`
3. Run migrations: `npm run typeorm migration:run`