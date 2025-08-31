# TalkWithMe - AI Book Chat Application

An intelligent book reading companion that allows you to chat with AI about your books, create highlights, and track reading progress.

## Features

- 📚 **Book Upload**: Support for PDF and TXT files
- 🤖 **AI Chat**: Interactive conversations about book content using Google Gemini AI
- 🎯 **Smart Annotations**: Highlight and save important passages with MongoDB persistence
- 📊 **Reading Progress**: Track your reading progress across sessions
- 🌓 **Dark/Light Theme**: Toggle between themes with preference saving
- 📱 **Mobile Responsive**: Optimized for all devices
- 🔊 **Text-to-Speech**: AI-generated voice responses
- 🎨 **Interactive Home**: Creative alien spaceship landing page

## Deployment on Render

### Prerequisites
- MongoDB Atlas account (for database)
- Google AI Studio API key (for Gemini AI)

### Environment Variables Required
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/talkwithme
GEMINI_API_KEY=your_gemini_api_key_here
SESSION_SECRET=your_secure_session_secret_here
NODE_ENV=production
CORS_ORIGIN= empty
```

### Deploy Steps
1. Push code to GitHub repository
2. Connect repository to Render
3. Set environment variables in Render dashboard
4. Deploy!

## Local Development

1. Clone the repository
2. Install dependencies: `cd backend && npm install`
3. Create `.env` file with required variables
4. Start server: `npm run dev`
5. Visit `http://localhost:3001`

## Tech Stack

- **Backend**: Node.js, Express.js, MongoDB, Passport.js
- **Frontend**: Vanilla JavaScript, Tailwind CSS, Canvas API
- **AI**: Google Gemini API for chat and TTS
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js with local strategy

## Project Structure

```
TalkWithMe/
├── backend/
│   ├── models/          # MongoDB schemas
│   ├── uploads/         # User uploaded files
│   ├── server.js        # Main server file
│   └── package.json     # Backend dependencies
├── public/              # Static assets
├── *.html              # Frontend pages
└── README.md           # This file
```
