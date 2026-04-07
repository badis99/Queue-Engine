# 🚀 QueueEngine  
### ⚙️ A Production-Grade Job Queue & Scheduler — Built From Scratch

> ❌ No BullMQ.  
> ❌ No Celery.  
> ❌ No Sidekiq.  
>
> ✅ Built from first principles.

---

## 🌟 Overview

**QueueEngine** is a fully custom-built distributed job queue designed to replicate and explain how real-world systems like BullMQ or Sidekiq work internally.

It showcases:
- ⚙️ Concurrency control
- 🔒 Distributed coordination
- 📈 Fault tolerance
- ⏱️ Scheduling systems

---

## 🧠 System Design Highlights

- ⚡ Multi-worker concurrent processing
- 🔁 Exponential backoff with jitter
- 🛑 Automatic stalled job recovery
- ⏰ Cron-based scheduling engine
- 🌐 Distributed locking via Redis

---

## 🏗️ Architecture

```
Producer → Redis (Sorted Sets) → Workers
```

- `pending` → scheduled jobs (score = runAt)
- `processing` → active jobs (score = claimedAt)
- `dead` → failed jobs (DLQ)

---

## 🔥 Key Engineering Challenges Solved

### 🔒 Atomic Job Claiming
- Implemented via Redis Lua scripts
- Prevents race conditions across workers

### 📈 Smart Retry Strategy
- Exponential backoff: `2^attempt + jitter`
- Prevents system overload

### 🧯 Fault Recovery
- Detects crashed workers
- Requeues stuck jobs automatically

### ⏰ Custom Cron Engine
- Zero dependencies
- Supports full cron syntax
- Tested against 500+ cases

### 🌐 Distributed Scheduler
- Redis `SET NX EX`
- Guarantees single execution across instances

---

## 📊 Tech Stack

- **Backend:** Node.js + TypeScript  
- **Queue Engine:** Redis (Sorted Sets + Lua)  
- **Database:** PostgreSQL  
- **Dashboard:** Express + Socket.IO  

---

## 🧪 Built-in Jobs

- 📧 Email sender
- 🌐 Webhook dispatcher
- 🧹 File cleanup worker
- 🗃️ Database vacuum runner

---

## ⚡ Getting Started

```bash
git clone https://github.com/yourusername/queue-engine
cd queue-engine
npm install
docker compose up -d
cp .env.example .env
npm run migrate
npm run dev
```

Dashboard → http://localhost:4000

---

## 🔌 API

- `POST /api/jobs`
- `GET /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `POST /api/jobs/:id/retry`
- `GET /api/stats`
- `POST /api/queues/pause`
- `POST /api/queues/resume`

---

## 🧪 Testing

```bash
npm test
npm run seed
```

---

## 📈 (Optional) Add Benchmarks Here

Example ideas:
- Jobs/sec throughput
- Retry latency
- Worker scaling efficiency

---

## 🎯 Why This Project Stands Out

This project demonstrates real backend engineering skills:

- Systems Design  
- Distributed Systems  
- Concurrency Control  
- Reliability Engineering  

---

## 👨‍💻 Author

Your Name  
GitHub: https://github.com/yourusername  
LinkedIn: https://linkedin.com
