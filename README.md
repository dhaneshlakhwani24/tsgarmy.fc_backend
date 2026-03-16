# TSG Army Backend API

A production-grade REST API built with **Node.js + Express.js** powering the entire TSG Army esports platform. Handles authentication, player management, tournament scheduling, achievement tracking, and community feedback with real-time updates.

## Features

👥 **Player Management**
- Complete CRUD operations for player profiles
- Image upload with Sharp optimization (WebP, responsive variants)
- Live status tracking for streaming players
- Social link integration (Instagram, YouTube, custom streams)

🗓️ **Tournament & Schedule Management**
- Full tournament/event CRUD
- Event lifecycle tracking
- Real-time broadcast updates to all admins

🏆 **Achievement System**
- Achievement definition and player linking
- Rarity tiers (Common, Rare, Epic, Legendary)
- Icon/badge management


🔄 **Real-Time Updates**
- Server-Sent Events (SSE) for instant data synchronization
- Up to 20,000 concurrent client connections
- Auto-broadcast on schedule/player/achievement changes

📁 **File Management**
- Player profile images
- Admin profile photos
- Feedback attachments
- Automatic image optimization using Sharp

## Tech Stack

- **Node.js + Express.js**: REST API framework
- **MongoDB**: NoSQL database
- **JWT**: Token-based authentication
- **bcryptjs**: Password hashing
- **Sharp**: Image optimization
- **Multer**: File upload handling
- **CORS**: Cross-origin resource sharing

## Architecture Highlights

- Modular route structure (auth, players, schedules, achievements, feedback)
- Middleware-based request validation and error handling
- Environment-based configuration
- Session validity checks on every authenticated request
- Comprehensive error logging


Built as part of the TSG Army Esports Platform by **Dhanesh Lakhwani** in collaboration with **[@tsgarmy.fc](https://instagram.com/tsgarmy.fc)**.
