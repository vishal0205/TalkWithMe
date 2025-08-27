import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import User from './models/User.js';
import Book from './models/Book.js';
import Chat from './models/Chat.js';
import Annotation from './models/Annotation.js';

import { GoogleGenerativeAI } from '@google/generative-ai';
import fileUpload from 'express-fileupload';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.js');

// const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
// pdfjsLib.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.js');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/aibookchat';
mongoose.connect(MONGO_URI)
    .then(() => {})
    .catch(err => console.error('MongoDB connection error:', err));


const API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);
const textModels = [
    "gemini-2.5-flash-preview-05-20",
    "gemini-1.5-flash-latest"
];
const getTextModelInstance = (modelName) => genAI.getGenerativeModel({ model: modelName });
const ttsModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });


app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(fileUpload({
    limits: { fileSize: 100 * 1024 * 1024 },
    useTempFiles: true,
    tempFileDir: path.join(__dirname, 'tmp_uploads')
}));
app.use(express.static(path.join(__dirname, '..', 'public')));


app.use(session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGO_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax'
    }
}));


app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return done(null, false, { message: 'Incorrect email or password.' });
        }
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return done(null, false, { message: 'Incorrect email or password.' });
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
    }
});

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    
    // Check if this is an AJAX request
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    res.redirect('/login?error=not_logged_in');
};

// Helper for exponential backoff retry logic for API calls
const retry = async (fn, retries = 5, delay = 1000, modelsToTry = []) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const errorBody = await error.response.json().catch(() => ({}));

                if (status === 429) {
                    console.warn(`Rate limit hit for current model (${status}). Retrying in ${delay / 1000}s...`);
                    if (modelsToTry.length > 0 && i < retries - 1) {
                        const currentModelName = fn.modelName;
                        const nextModelIndex = modelsToTry.indexOf(currentModelName) + 1;
                        if (nextModelIndex < modelsToTry.length) {
                            console.log(`Switching to fallback model: ${modelsToTry[nextModelIndex]}`);
                            await new Promise(res => setTimeout(res, delay));
                            delay *= 2;
                            continue;
                        }
                    }
                    await new Promise(res => setTimeout(res, delay));
                    delay *= 2;
                    continue;
                } else if (status === 403) {
                    throw new Error("Authentication Error: Invalid API Key or insufficient permissions. Please check your Gemini API Key.");
                } else if (status === 400 && errorBody.error?.message?.includes('safety_settings')) {
                    throw new Error("API Configuration Error: Safety settings are too permissive. Please contact support.");
                } else {
                    throw new Error(`API Error: ${status} ${error.response.statusText} - ${errorBody.error?.message || JSON.stringify(errorBody)}`);
                }
            }
            throw error;
        }
    }
    throw new Error("Max retries and model fallbacks exhausted for API request.");
};


app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Username or Email already exists.' });
        }
        const newUser = new User({ username, email, password });
        await newUser.save();
        res.status(200).json({ message: 'Signup successful! Please log in.', redirectTo: '/login' });
    } catch (error) {
        console.error('Signup error:', error);
        const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred during signup.' : `Signup failed: ${error.message}`;
        res.status(500).json({ error: message });
    }
});

app.post('/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Server error during login.' });
        }
        if (!user) {
            return res.status(401).json({ error: info.message || 'Invalid credentials.' });
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login session error:', err);
                return res.status(500).json({ error: 'Could not log in user.' });
            }
            res.status(200).json({ message: 'Login successful!', redirectTo: '/upload' });
        });
    })(req, res, next);
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy((err) => {
            if (err) { console.error('Session destroy error:', err); return next(err); }
            res.clearCookie('connect.sid');
            res.redirect('/');
        });
    });
});


app.get('/check-auth', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ isAuthenticated: true, user: { id: req.user.id, username: req.user.username, email: req.user.email } });
    } else {
        res.json({ isAuthenticated: false });
    }
});



app.post('/upload-book', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        const userBooksCount = await Book.countDocuments({ user: userId });
        if (userBooksCount >= 5) {
            return res.status(400).json({ error: 'You have reached the limit of 5 books. Please delete an existing book to upload a new one.' });
        }

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const bookFile = req.files.book;
        const tempUploadDir = path.join(__dirname, 'tmp_uploads');
        const filePath = bookFile.tempFilePath;

        await fs.mkdir(tempUploadDir, { recursive: true });

        let bookText = '';
        let extractedTitle = bookFile.name.replace(/\.(pdf|txt|docx|doc|epub|rtf|odt|md|pptx|ppt|xlsx|xls)$/i, '').trim();
        if (extractedTitle === '') {
            extractedTitle = path.basename(bookFile.name);
        }


        if (bookFile.mimetype === 'application/pdf') {
            try {
                const dataBuffer = await fs.readFile(filePath);
                const data = new Uint8Array(dataBuffer);

                const loadingTask = pdfjsLib.getDocument({ data });
                const pdf = await loadingTask.promise;
                
                // Try to get title from metadata
                const metadata = await pdf.getMetadata().catch(() => ({ info: {} }));
                if (metadata.info.Title) {
                    extractedTitle = metadata.info.Title;
                }

                // Extract text from all pages
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += pageText + '\n';
                }
                bookText = fullText.trim();

                if (!bookText) {
                    throw new Error('No text could be extracted from the PDF');
                }

            } catch (pdfError) {
                console.error('Error parsing PDF:', pdfError);
                // Clean up the uploaded file
                await fs.unlink(filePath);
                return res.status(500).json({ 
                    error: `Failed to parse PDF file: ${pdfError.message}. Please ensure the file is not corrupted, password-protected, or a scanned image.` 
                });
            }
        } else if (bookFile.mimetype === 'text/plain') {
            bookText = await fs.readFile(filePath, 'utf8');
        } else {
            await fs.unlink(filePath);
            const newBook = new Book({
                title: extractedTitle,
                content: '',
                user: userId
            });
            await newBook.save();
            // For unsupported files, redirect to chat-app with bookId and a message
            return res.status(200).json({ message: `File "${extractedTitle}" uploaded, but its format is unsupported for analysis. Please upload a .txt or .pdf file.`, bookId: newBook._id, redirectTo: `/chat-app?bookId=${newBook._id}` });
        }

        await fs.unlink(filePath);

        const newBook = new Book({
            title: extractedTitle,
            content: bookText,
            user: userId
        });
        console.log('Creating book with userId:', userId);
        await newBook.save();
        console.log('Book saved with user field:', newBook.user);

        const prompt = `You are an AI assistant specialized in analyzing books. The user has just uploaded a book titled "${extractedTitle}". Briefly acknowledge the book upload and ask a general question to start a conversation about it, like "What aspect of the book would you like to explore first?" or "How can I help you understand this book better?". Keep your greeting concise and encouraging. \n\nBook Content Excerpt (first 1000 characters for context): ${bookText.substring(0, 1000)}...`;

        let result;
        let currentModelIndex = 0;
        while (currentModelIndex < textModels.length) {
            try {
                const modelInstance = getTextModelInstance(textModels[currentModelIndex]);
                const fnToRetry = async () => {
                    const { response } = await modelInstance.generateContent({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    });
                    return response;
                };
                fnToRetry.modelName = textModels[currentModelIndex];

                result = await retry(fnToRetry, 5, 1000, textModels);
                break;
            } catch (error) {
                if (error.message.includes("Quota exceeded") && currentModelIndex < textModels.length - 1) {
                    console.warn(`Quota exceeded for ${textModels[currentModelIndex]}. Trying next model...`);
                    currentModelIndex++;
                } else {
                    throw error;
                }
            }
        }

        if (!result) {
            throw new Error("Failed to get AI response from all available models due to quota limits or other API errors.");
        }

        const initialGreeting = result.text();
        await Book.findByIdAndUpdate(newBook._id, { initialGreeting: initialGreeting });

        res.status(200).json({ message: 'Book uploaded and analyzed successfully!', bookId: newBook._id, redirectTo: `/chat-app?bookId=${newBook._id}` });

    } catch (error) {
        console.error('Error in /upload-book:', error);
        const message = process.env.NODE_ENV === 'production' ? 'An unexpected server error occurred.' : `Server error during book upload or analysis: ${error.message}`;
        res.status(500).json({ error: message });
    }
});

app.get('/user-books', ensureAuthenticated, async (req, res) => {
    try {
        const userId = req.user.id;
        const booksWithoutUser = await Book.find({ user: { $exists: false } });
        if (booksWithoutUser.length > 0) {
            await Book.updateMany({ user: { $exists: false } }, { user: userId });
        }
        const books = await Book.find({ user: userId }).select('_id title uploadedAt user').sort({ uploadedAt: -1 });
        res.json({ books });
    } catch (error) {
        console.error('Error fetching user books:', error);
        res.status(500).json({ error: 'Failed to fetch user books.' });
    }
});

app.post('/delete-book', ensureAuthenticated, async (req, res) => {
    const { bookId } = req.body;
    const userId = req.user.id;
    
    try {
        const book = await Book.findOne({ _id: bookId, user: userId });
        
        if (!book) {
            return res.status(404).json({ error: 'Book not found or you do not have permission to delete it.' });
        }
        
        await Annotation.deleteMany({ bookId: bookId, userId: userId });
        await Chat.deleteMany({ book: bookId, user: userId });
        const result = await Book.deleteOne({ _id: bookId, user: userId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Book not found or you do not have permission to delete it.' });
        }
        
        res.json({ message: 'Book deleted successfully.' });
    } catch (error) {
        console.error('Error deleting book:', error);
        const message = process.env.NODE_ENV === 'production' ? 'Failed to delete book.' : `Failed to delete book: ${error.message}`;
        res.status(500).json({ error: message });
    }
});

app.get('/get-chat-history/:bookId', ensureAuthenticated, async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.user.id;

        // Ensure user has access to the book
        const book = await Book.findOne({ _id: bookId, user: userId });
        if (!book) {
            return res.status(404).json({ error: 'Book not found or unauthorized.' });
        }

        const chatHistory = await Chat.find({ book: bookId, user: userId }).sort({ timestamp: 1 });
        res.json({ chatHistory });
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: 'Failed to fetch chat history.' });
    }
});

// Update the get-book-content/:bookId route
app.get('/get-book-content/:bookId', ensureAuthenticated, async (req, res) => {
    try {
        const { bookId } = req.params;
        const userId = req.user.id;
        
        const book = await Book.findOne({ _id: bookId, user: userId });

        if (!book) {
            return res.status(404).json({ error: 'Book not found or unauthorized access' });
        }

        res.json({
            bookTitle: book.title,
            bookText: book.content,
            initialGreeting: book.initialGreeting || `Hello! I've analyzed "${book.title}". What would you like to discuss?`
        });
    } catch (error) {
        console.error('Error fetching book content:', error);
        const message = process.env.NODE_ENV === 'production' ? 'Failed to load book content.' : `Failed to load book content: ${error.message}`;
        res.status(500).json({ error: message });
    }
});


app.post('/chat', ensureAuthenticated, async (req, res) => {
    try {
        const { userMessage, conversationHistory, highlightedText, bookId } = req.body;

        if (!bookId) {
            return res.status(400).json({ error: 'No book selected for chat. Please select a book from your library.' });
        }

        const userId = req.user.id;
        const book = await Book.findOne({ _id: bookId, user: userId });

        if (!book) {
            return res.status(404).json({ error: 'Selected book not found or you do not have permission to access it.' });
        }

        // Save user message
        const userChatMessage = new Chat({
            book: bookId,
            user: userId,
            sender: 'user',
            text: userMessage
        });
        await userChatMessage.save();

        let chatHistoryForGemini = [];

        let contextMessage = '';
        if (highlightedText) {
            contextMessage = `The user highlighted this text from the book: "${highlightedText}". `;
        }

        chatHistoryForGemini.push({
            role: 'user',
            parts: [{ text: `${contextMessage}The following text is from the book titled "${book.title}" you are discussing. Please use this as context for our conversation. Book excerpt (first 10000 characters): ${book.content.substring(0, Math.min(book.content.length, 10000))}` }]
        });
        chatHistoryForGemini.push({
            role: 'model',
            parts: [{ text: `Understood. I will use the book "${book.title}" as the primary context for our discussion.` }]
        });


        conversationHistory.forEach(msg => {
            chatHistoryForGemini.push(msg);
        });

        chatHistoryForGemini.push({ role: 'user', parts: [{ text: userMessage }] });

        let result;
        let currentModelIndex = 0;
        while (currentModelIndex < textModels.length) {
            try {
                const modelInstance = getTextModelInstance(textModels[currentModelIndex]);
                const chat = modelInstance.startChat({
                    history: chatHistoryForGemini.slice(0, -1),
                });
                const fnToRetry = async () => {
                    const { response } = await chat.sendMessage(userMessage);
                    return response;
                };
                fnToRetry.modelName = textModels[currentModelIndex];

                result = await retry(fnToRetry, 5, 1000, textModels);
                break;
            } catch (error) {
                if (error.message.includes("Quota exceeded") && currentModelIndex < textModels.length - 1) {
                    console.warn(`Quota exceeded for ${textModels[currentModelIndex]}. Trying next model...`);
                    currentModelIndex++;
                } else {
                    throw error;
                }
            }
        }

        if (!result) {
            throw new Error("Failed to get AI response from all available models due to quota limits or other API errors.");
        }

        const aiResponseText = result.text();

        // Save AI response
        const aiChatMessage = new Chat({
            book: bookId,
            user: userId,
            sender: 'ai',
            text: aiResponseText
        });
        await aiChatMessage.save();

        res.json({ aiResponse: aiResponseText });

    } catch (error) {
        console.error('Error in /chat:', error);
        const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred with the AI chat.' : `Server error during AI chat: ${error.message}`;
        res.status(500).json({ error: message });
    }
});

app.post('/synthesize-speech', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text is required for speech synthesis.' });
        }

        const payload = {
            contents: [{
                parts: [{ text: text }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: "Kore" }
                    }
                }
            },
            model: "gemini-2.5-flash-preview-tts"
        };

        const response = await retry(async () => {
            const ttsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!ttsRes.ok) {
                const errorBody = await ttsRes.json();
                if (ttsRes.status === 429 && errorBody.error && errorBody.error.details && errorBody.error.details[0] && errorBody.error.details[0].quotaMetric) {
                    throw new Error(`TTS Quota Exceeded: ${errorBody.error.message}. Please try again later.`);
                } else if (ttsRes.status === 403) {
                    throw new Error("TTS Authentication Error: Invalid API Key or insufficient permissions.");
                }
                throw new Error(`TTS API error: ${ttsRes.status} ${ttsRes.statusText} - ${JSON.stringify(errorBody)}`);
            }
            return ttsRes.json();
        });

        const audioData = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        const mimeType = response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType;

        if (audioData && mimeType) {
            res.json({ audioData: audioData, mimeType: mimeType });
        } else {
            console.error('No audio data or mime type in TTS response:', response);
            res.status(500).json({ error: 'Failed to synthesize speech: No audio data returned.' });
        }

    } catch (error) {
        console.error('Error in /synthesize-speech:', error);
        const message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred during speech synthesis.' : `Server error during speech synthesis: ${error.message}`;
        res.status(500).json({ error: message });
    }
});

// Annotation API Routes
app.get('/api/annotations/:bookId', ensureAuthenticated, async (req, res) => {
    try {
        const { bookId } = req.params;
        const annotations = await Annotation.find({ 
            userId: req.user.id, 
            bookId: bookId 
        }).sort({ timestamp: -1 });
        res.json(annotations);
    } catch (error) {
        console.error('Error fetching annotations:', error);
        res.status(500).json({ error: 'Failed to fetch annotations' });
    }
});

app.post('/api/annotations', ensureAuthenticated, async (req, res) => {
    try {
        const { bookId, text, startOffset, endOffset } = req.body;
        
        const annotation = new Annotation({
            userId: req.user.id,
            bookId: bookId,
            text: text,
            startOffset: startOffset,
            endOffset: endOffset
        });
        
        await annotation.save();
        res.json(annotation);
    } catch (error) {
        console.error('Error creating annotation:', error);
        res.status(500).json({ error: 'Failed to create annotation' });
    }
});

app.delete('/api/annotations/:annotationId', ensureAuthenticated, async (req, res) => {
    try {
        const { annotationId } = req.params;
        const annotation = await Annotation.findOneAndDelete({ 
            _id: annotationId, 
            userId: req.user.id 
        });
        
        if (!annotation) {
            return res.status(404).json({ error: 'Annotation not found' });
        }
        
        res.json({ message: 'Annotation deleted successfully' });
    } catch (error) {
        console.error('Error deleting annotation:', error);
        res.status(500).json({ error: 'Failed to delete annotation' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'home.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});


app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'signup.html'));
});


app.get('/upload', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'upload.html'));
});

app.get('/chat-app', ensureAuthenticated, async (req, res) => {
    const { bookId } = req.query;
    if (!bookId) {
        return res.redirect('/upload?error=no_book_selected');
    }
    try {
        const book = await Book.findOne({ _id: bookId, user: req.user.id });
        if (!book) {
            return res.redirect('/upload?error=book_not_found');
        }
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    } catch (error) {
        console.error('Error verifying book for chat-app:', error);
        res.redirect('/upload?error=invalid_book_id');
    }
});


app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
