# Building Node.js Applications - Part 1

<div align="center">
  <img src="https://shubh-books.s3.ap-south-1.amazonaws.com/Book-cover-2.png" alt="Book Cover" width="300" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
  
  <h1>🚀 Supporting Repository</h1>
  <p><em>Complete source code and examples for "Building Node.js Applications - Part 1"</em></p>
  
  <div style="display: flex; justify-content: center; gap: 20px; margin: 20px 0;">
    <a href="#getting-started" style="background: #007acc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">📖 Get Started</a>
    <a href="#lessons" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">📚 View Lessons</a>
  </div>
</div>

---

## 📋 Overview

This repository contains the complete source code and working examples for **"Building Node.js Applications - Part 1"** by Shubhankar Borade. Each folder represents a lesson from the book, providing hands-on examples and production-ready applications.

Whether you're following along with the book, need to reference specific code, or want to explore the implementations, this repository has you covered!

## 🎯 What You'll Find

- **Complete working applications** for each lesson
- **Production-ready code** with best practices
- **Step-by-step implementations** that match the book content
- **Real-world examples** you can use in your own projects

## 📚 Lessons Overview

| Lesson | Project | Description |
|--------|---------|-------------|
| **01** | Personal API Dashboard | RESTful API with dashboard interface |
| **02** | Task Management API | Full-stack task management system |
| **03** | Real-time Chat App | WebSocket-based chat application |
| **04** | File Upload Service | File processing and storage system |
| **05** | Auth & Authorization | Enterprise-grade authentication system |

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **PostgreSQL** (for database-dependent projects)
- **Git**

### Quick Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd books_project_test_temp
   ```

2. **Navigate to any lesson folder**
   ```bash
   cd 01.personal-api-dashboard
   # or
   cd 02.task-management-api
   # etc.
   ```

3. **Install dependencies** ⚠️ **Important!**
   ```bash
   npm install
   ```
   > **Note:** You need to run `npm install` in **each folder** separately, as each lesson is a complete, independent project.

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Start the application**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## 📁 Project Structure

```
books_project_test_temp/
├── 01.personal-api-dashboard/     # Lesson 1: API Dashboard
├── 02.task-management-api/        # Lesson 2: Task Management
├── 03.realtime-chat-app/          # Lesson 3: Real-time Chat
├── 04.file-upload-service/        # Lesson 4: File Processing
└── 05.auth-authorization-system/  # Lesson 5: Authentication
```

## 🔧 Individual Project Setup

Each lesson folder contains a complete, standalone application. Here's what you'll typically find in each:

- **`package.json`** - Dependencies and scripts
- **`src/`** - Source code
- **`public/`** - Static files (if applicable)
- **`migrations/`** - Database migrations (if applicable)
- **`.env.example`** - Environment variables template

### Common Commands

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Start in production mode
npm start

# Run tests
npm test

# Run linting
npm run lint
```

## ⚠️ Important Notes

### 🔄 Repository Updates

This repository is **constantly updating** due to:
- **Dependency updates** for security and performance
- **Bug fixes** and improvements
- **Code enhancements** and optimizations
- **New features** and examples

> **Recommendation:** Regularly pull the latest changes to stay up-to-date with improvements and fixes.

### 📦 Dependencies Installation

**Each folder requires separate dependency installation:**

```bash
# You must run this in EACH lesson folder
cd 01.personal-api-dashboard && npm install
cd ../02.task-management-api && npm install
cd ../03.realtime-chat-app && npm install
cd ../04.file-upload-service && npm install
cd ../05.auth-authorization-system && npm install
```

> **Why?** Each lesson is designed as a complete, independent project to avoid conflicts and ensure you can work on any lesson without affecting others.

## 🛠️ Troubleshooting

### Common Issues

1. **"Module not found" errors**
   - Ensure you've run `npm install` in the specific lesson folder
   - Check that you're in the correct directory

2. **Database connection errors**
   - Verify PostgreSQL is running
   - Check your `.env` configuration
   - Ensure database exists and credentials are correct

3. **Port already in use**
   - Change the port in `.env` or `package.json`
   - Kill existing processes using the port

### Getting Help

If you encounter issues:
1. Check the lesson-specific README in each folder
2. Review the book content for detailed explanations
3. Ensure all prerequisites are installed
4. Verify environment variables are set correctly

## 📖 How to Use with the Book

1. **Follow along** - Use this repo while reading the book
2. **Reference code** - Copy specific implementations to your projects
3. **Debug issues** - Compare your code with the working examples
4. **Explore variations** - Experiment with the provided code

## 🤝 Contributing

Found a bug or have an improvement? Feel free to:
- Open an issue
- Submit a pull request
- Suggest enhancements

## 📄 License

This repository is provided as supporting material for "Building Node.js Applications - Part 1" by Shubhankar Borade.

---

<div align="center">
  <p><strong>Happy Coding! 🎉</strong></p>
  <p>Build amazing Node.js applications with confidence!</p>
</div>
