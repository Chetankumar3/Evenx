# EvenX - Event Booking System

[Demo Video](https://drive.google.com/file/d/1IMVy1LF5n59b03dVn6e63ZSByNmyXLDL/view?usp=sharing) | [Sequence Diagram](https://mermaid.ai/d/a2b0be97-8a8a-430a-a111-16531251cebc) | [Deployed Link](http://16.112.64.12/evenx/)

---

## 🏗️ Architecture Decisions

* **Consistency**: The usage of a Lua script for atomic "check-and-write" execution and the overall design ensures complete consistency against false positives on lock state (locked or booked but shown as unlocked = overselling).
* Although, stale unlock read (i.e. false negative) is possible in case of a Redis pod crash or if the keyspace listener service (unlocker) crashes.
* **Usage of Redis for state tracking** helps in:
    1. Avoiding the DB for state management, which is expensive due to the lack of bit-level writes and is generally a high latency method.
    2. Redis also acts as a low latency cache for state reads and offloaded reservation expirations.
* **Go stack** to handle WS (WebSocket) connections using vertical scaling of cores with high concurrency. Also, bunching helps in reducing the active event goroutines. Basically, if there were two Python apps on two cores instead of one Go app on two cores, the async active event tasks required would be nearly double in the scenario of Python.
* **Use of BitMap Strings** in Redis for single seat minute updates in O(1).
* **Use of Redis PubSub** for event-based delta updates rather than polling state reads.
* **Small decisions that help**: Using query parameters on search instead of the request body to enable caching.

### Future Scope
* **Eliminate False negatives**: False negatives can happen in 2 cases:
    * *Case 1: Redis Pod crashes.* This results in the clearance of all locked seats. Of course, booked seats do not get affected from this.
    - This can be acceptable. Or can be handled using redis replicas and query mirroring.
    * *Case 2: Unlocker service lost.* If the unlocker service crashes, then due to the fire-and-forget nature of keyspace notifications, notifications are lost.
    - This can be eliminated or heavily narrowed by a distributed fleet of unlocker pods and using leader consensus to keep a single listener.
    - Also, a cron job may run every few hours to read the entire Redis data and restore the state in the `seat_map` model.

### Assumptions
* False positive of lock state is strictly avoided. But, false negatives are assumed to be acceptable, at least for some time until the state is refreshed.
* On some rare but possible case of a crash of the Redis server, the locking data gets lost. So, I assume it's ok, although this can be solved by keeping replicas and mirroring queries.

---

## 🚀 Project Overview

- **Full-stack event booking platform** — React frontend, an Express.js + Sequelize main API, and two Go microservices (`statesync`, `restorer`) coordinating through Redis for real-time seat/capacity state.
- **Two booking models per event** (`events.model`):
  - `general` — count-based seat booking (pick a number of seats, no individual seat identity). Covers the assessment's core requirement.
  - `seat_map` — interactive, multi-user seat map with live per-seat locking over WebSocket. Built as an enhancement beyond the brief.
- **Auth** — JWT register/login/logout. Logout is server-enforced via a Redis token-denylist (`jti`-keyed), not just deleting the token client-side.
- **No-oversell guarantee by construction** — every seat/count hold is acquired through a single atomic Redis Lua script at lock time (check + decrement in one round trip, no read-then-write race). Checkout never re-checks availability; it only converts an already-held lock into a permanent booking — so overselling isn't just validated against, it's structurally impossible.
- **Real-time sync** — `statesync` (Go) fans out live seat/availability deltas to every connected client over WebSocket via Redis Pub/Sub. `restorer` (Go) reclaims abandoned locks automatically via Redis keyspace-expiry notifications — no polling, no manual cleanup.
- **Checkout** — one synchronous endpoint backed by a fake, always-succeeding payment gateway. No webhook, no async confirmation step (deliberate scope cut, documented in Assumptions).
- **Self-healing state** — if Redis is ever lost or evicted, `avlbl`/`book`/the seat bitmap are exactly rehydrated from Postgres on next access; no in-flight locks need to survive (they're recomputed correctly without them).
- **Containerized** — each of the three backend services has its own self-contained Dockerfile (no shared build context); one script builds and pushes all three.
- **Frontend** — location-aware event feed, trending/upcoming sliders, debounced search with filters, and the live seat-map UI for `seat_map` events.


## 💻 Tech Stack

* **Frontend**: React
* **Core Backend**: Node.js / Express
* **Real-time Streaming & Sync Backend**: Go
* **Primary Database**: Postgres
* **In-Memory Store / Concurrency Guard**: Redis
* **Infrastructure / Provisioning**: Docker, Terraform

## 🌐 Deployment Note

The frontend application is fully deployed on an **AWS EC2 server**, utilizing the **Nginx** static server already running on the machine to reliably serve the client build.
