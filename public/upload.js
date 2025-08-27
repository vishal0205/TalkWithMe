// public/upload.js

// DOM Elements
const bookUploadInput = document.getElementById('book-upload');
const selectedFileNameSpan = document.getElementById('selected-file-name');
const uploadButton = document.getElementById('upload-button');
const buttonText = document.getElementById('button-text');
const loadingSpinner = document.getElementById('loading-spinner');
const statusMessageDiv = document.getElementById('status-message');
const userBooksList = document.getElementById('user-books-list');
const noBooksMessage = document.getElementById('no-books-message');
const bookLimitMessage = document.getElementById('book-limit-message');

// Popup elements
const deletePopup = document.getElementById('delete-popup');
const popupYesBtn = document.getElementById('popup-yes-btn');
const popupNoBtn = document.getElementById('popup-no-btn');

// State variables
let selectedFile = null;
let isLoading = false;
const MAX_BOOKS = 5;
let pendingDeleteBookId = null;

// --- Helper Functions ---

const displayStatusMessage = (message, type) => {
    statusMessageDiv.textContent = message;
    statusMessageDiv.classList.remove('hidden', 'error-message', 'success-message', 'info-message');
    if (type === 'error') {
        statusMessageDiv.classList.add('error-message');
    } else if (type === 'success') {
        statusMessageDiv.classList.add('success-message');
    } else if (type === 'info') {
        statusMessageDiv.classList.add('info-message');
    }
    statusMessageDiv.classList.add('block');
};

const setLoadingState = (loading) => {
    isLoading = loading;
    uploadButton.disabled = loading || !selectedFile;
    if (loading) {
        buttonText.textContent = 'Analyzing...';
        loadingSpinner.classList.remove('hidden');
    } else {
        buttonText.textContent = 'Analyze & Upload';
        loadingSpinner.classList.add('hidden');
    }
};

// --- Book Management Functions ---

const fetchUserBooks = async () => {
    console.log('fetchUserBooks called');
    try {
        console.log('Making request to /user-books');
        const response = await fetch('/user-books');
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            if (response.status === 401) {
                console.log('User not authenticated, redirecting to login');
                window.location.href = '/login?error=not_logged_in';
                return;
            }
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch your books.');
        }
        
        const data = await response.json();
        console.log('Frontend received books:', data.books);
        console.log('Number of books:', data.books ? data.books.length : 0);
        
        if (!data.books) {
            console.error('No books array in response');
            displayStatusMessage('Error: Invalid response from server.', 'error');
            return;
        }
        
        renderUserBooks(data.books);
    } catch (error) {
        console.error('Error fetching user books:', error);
        displayStatusMessage(`Error loading your books: ${error.message}. Please try refreshing.`, 'error');
    }
};

const renderUserBooks = (books) => {
    userBooksList.innerHTML = ''; // Clear existing list
    if (books.length === 0) {
        noBooksMessage.classList.remove('hidden');
    } else {
        noBooksMessage.classList.add('hidden');
        books.forEach(book => {
            console.log('Rendering book:', book);
            const bookItem = document.createElement('div');
            bookItem.classList.add('book-list-item');
            
            const bookTitle = document.createElement('span');
            bookTitle.classList.add('book-title');
            bookTitle.textContent = book.title;
            
            const actionsDiv = document.createElement('div');
            actionsDiv.classList.add('actions');
            
            const chatBtn = document.createElement('button');
            chatBtn.classList.add('chat-btn');
            chatBtn.textContent = 'Chat';
            chatBtn.setAttribute('data-book-id', book._id);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('delete-btn');
            deleteBtn.textContent = 'Delete';
            deleteBtn.setAttribute('data-book-id', book._id);
            
            actionsDiv.appendChild(chatBtn);
            actionsDiv.appendChild(deleteBtn);
            bookItem.appendChild(bookTitle);
            bookItem.appendChild(actionsDiv);
            
            console.log('Delete button bookId:', deleteBtn.getAttribute('data-book-id'));
            
            // Add direct event listeners to each button
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const bookId = book._id; // Use the book ID directly from the loop
                console.log('Direct delete button clicked, bookId:', bookId);
                
                if (!bookId) {
                    console.error('BookId is null/undefined!');
                    displayStatusMessage('Error: Could not get book ID.', 'error');
                    return;
                }
                showDeleteConfirmation(bookId);
            });
            
            chatBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const bookId = book._id; // Use the book ID directly from the loop
                console.log('Direct chat button clicked, bookId:', bookId);
                window.location.href = `/chat-app?bookId=${bookId}`;
            });
            
            userBooksList.appendChild(bookItem);
        });
    }
    bookLimitMessage.textContent = `You have uploaded ${books.length} of ${MAX_BOOKS} books.`;
    bookLimitMessage.classList.remove('hidden');

    if (books.length >= MAX_BOOKS) {
        uploadButton.disabled = true;
        displayStatusMessage(`You have reached the maximum limit of ${MAX_BOOKS} books. Please delete one to upload a new book.`, 'info');
    } else {
        uploadButton.disabled = false;
        displayStatusMessage('', 'info');
    }
};

const deleteBook = async (bookId) => {
    console.log('deleteBook called with bookId:', bookId);
    console.log('deleteBook bookId type:', typeof bookId);
    console.log('deleteBook bookId stringified:', JSON.stringify(bookId));
    
    if (!bookId) {
        console.error('deleteBook: No bookId provided');
        displayStatusMessage('Error: No book ID provided for deletion.', 'error');
        return;
    }
    
    // Convert ObjectId to string if needed
    const bookIdString = bookId.toString();
    console.log('Sending bookId to server:', bookIdString);
    
    setLoadingState(true);
    displayStatusMessage('Deleting book...', 'info');
    try {
        const response = await fetch('/delete-book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId: bookIdString })
        });

        const data = await response.json();
        if (response.ok) {
            displayStatusMessage(data.message, 'success');
            fetchUserBooks();
        } else {
            throw new Error(data.error || 'Failed to delete book.');
        }
    } catch (error) {
        console.error('Error deleting book:', error);
        displayStatusMessage(`Error deleting book: ${error.message}`, 'error');
    } finally {
        setLoadingState(false);
    }
};

// --- Custom Popup Functions ---

const showDeleteConfirmation = (bookId) => {
    console.log('showDeleteConfirmation called with bookId:', bookId);
    console.log('bookId type:', typeof bookId);
    console.log('bookId value:', JSON.stringify(bookId));
    
    if (!bookId) {
        console.error('showDeleteConfirmation received null/undefined bookId');
        displayStatusMessage('Error: Invalid book ID for deletion.', 'error');
        return;
    }
    
    pendingDeleteBookId = bookId;
    console.log('pendingDeleteBookId set to:', pendingDeleteBookId);
    deletePopup.classList.add('show');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
};

const hideDeleteConfirmation = () => {
    deletePopup.classList.remove('show');
    document.body.style.overflow = '';
    pendingDeleteBookId = null;
};

// --- Event Listeners ---

// Use event delegation for handling clicks on dynamically created book list items
userBooksList.addEventListener('click', (e) => {
    const chatButton = e.target.closest('.chat-btn');
    const deleteButton = e.target.closest('.delete-btn');
    
    if (chatButton) {
        const bookId = chatButton.getAttribute('data-book-id');
        console.log('Chat button clicked, bookId:', bookId);
        window.location.href = `/chat-app?bookId=${bookId}`;
    }
    
    if (deleteButton) {
        e.preventDefault();
        e.stopPropagation();
        const bookId = deleteButton.getAttribute('data-book-id');
        console.log('Delete button clicked, bookId:', bookId);
        
        if (!bookId) {
            console.error('BookId is null/undefined!');
            displayStatusMessage('Error: Could not get book ID from button.', 'error');
            return;
        }
        showDeleteConfirmation(bookId);
    }
});

bookUploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        selectedFile = file;
        selectedFileNameSpan.textContent = `Selected file: ${file.name}`;
        uploadButton.disabled = false;
    } else {
        selectedFile = null;
        selectedFileNameSpan.textContent = '';
        uploadButton.disabled = true;
    }
});

uploadButton.addEventListener('click', async () => {
    if (!selectedFile) {
        displayStatusMessage('Please select a book file to upload.', 'error');
        return;
    }

    setLoadingState(true);
    displayStatusMessage('Uploading and analyzing book...', 'info');

    const formData = new FormData();
    formData.append('book', selectedFile);

    try {
        const response = await fetch('/upload-book', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (response.ok) {
            displayStatusMessage(data.message, 'success');
            selectedFile = null;
            selectedFileNameSpan.textContent = '';
            fetchUserBooks(); // Refresh book list

            // Server now sends redirectTo and bookId for both supported/unsupported
            if (data.redirectTo) {
                displayStatusMessage('Book uploaded and analyzed! Redirecting to chat...', 'success');
                setTimeout(() => {
                    window.location.href = data.redirectTo; // Use the redirectTo URL from server
                }, 1500);
            } else {
                // Fallback, though server should always provide redirectTo now
                displayStatusMessage('Book uploaded and analyzed! Please select it from your list.', 'success');
            }
        } else {
            throw new Error(data.error || 'Failed to upload and analyze book.');
        }

    } catch (error) {
        console.error('Error uploading book:', error);
        displayStatusMessage(`Error uploading book: ${error.message}`, 'error');
    } finally {
        setLoadingState(false);
    }
});

// Popup event listeners
popupYesBtn.addEventListener('click', async () => {
    console.log('Yes button clicked, pendingDeleteBookId:', pendingDeleteBookId);
    if (pendingDeleteBookId) {
        const bookIdToDelete = pendingDeleteBookId; // Store it before hiding popup
        hideDeleteConfirmation();
        await deleteBook(bookIdToDelete);
    } else {
        console.log('No pendingDeleteBookId found!');
        displayStatusMessage('Error: No book selected for deletion.', 'error');
    }
});

popupNoBtn.addEventListener('click', () => {
    hideDeleteConfirmation();
});

// Close popup when clicking outside
deletePopup.addEventListener('click', (e) => {
    if (e.target === deletePopup) {
        hideDeleteConfirmation();
    }
});

// Close popup with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && deletePopup.classList.contains('show')) {
        hideDeleteConfirmation();
    }
});

// --- Initial Load ---
window.addEventListener('load', () => {
    console.log('Page loaded, calling fetchUserBooks...');
    setTimeout(() => {
        fetchUserBooks(); // Load user's books on page load
    }, 100);

    // Check for error parameter in URL (e.g., redirected from chat-app without book)
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    if (error === 'no_book_selected') {
        displayStatusMessage('Please select a book from your library or upload a new one to start chatting.', 'error');
    } else if (error === 'book_not_found' || error === 'invalid_book_id') {
        displayStatusMessage('The selected book could not be found or you do not have permission to access it. Please choose another book.', 'error');
    }
});

// Also call fetchUserBooks when DOM is ready (backup)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, calling fetchUserBooks as backup...');
    setTimeout(() => {
        fetchUserBooks();
    }, 200);
});

// Canvas background animation (copied from home.html)
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const stars = [];
const meteoroids = [];
const numStars = 200;

class Star {
    constructor() {
        this.x = Math.random() * canvas.width; this.y = Math.random() * canvas.height;
        this.radius = Math.random() * 1.5 + 0.5; this.alpha = Math.random() * 0.5 + 0.5;
        this.alphaChange = Math.random() * 0.05 + 0.02; this.vx = (Math.random() - 0.5) * 0.5; this.vy = (Math.random() - 0.5) * 0.5;
        const colors = ['255, 255, 255', '200, 200, 255', '255, 245, 200']; this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    draw() {
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2);
        gradient.addColorStop(0, `rgba(${this.color}, ${this.alpha})`); gradient.addColorStop(1, `rgba(${this.color}, 0)`);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient; ctx.fill();
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0) this.x += canvas.width; if (this.x > canvas.width) this.x -= canvas.width;
        if (this.y < 0) this.y += canvas.height; if (this.y > canvas.height) this.y -= canvas.height;
        this.alpha += this.alphaChange;
        if (this.alpha <= 0.5 || this.alpha >= 1) { this.alphaChange = -this.alphaChange; }
        this.draw();
    }
}

class Meteoroid {
    constructor() {
        this.length = Math.random() * 40 + 20; this.x = Math.random() * canvas.width; this.y = -this.length;
        this.speed = Math.random() * 3 + 2; this.angle = Math.PI / 4 + (Math.random() * 0.2 - 0.1); this.alpha = 1;
        const colors = ['255, 255, 255', '200, 200, 255', '255, 245, 200']; this.color = colors[Math.floor(Math.random() * colors.length)];
    }
    draw() {
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x + this.length * Math.cos(this.angle), this.y + this.length * Math.sin(this.angle));
        gradient.addColorStop(0, `rgba(${this.color}, ${this.alpha})`); gradient.addColorStop(1, `rgba(${this.color}, 0)`);
        ctx.beginPath(); ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.length * Math.cos(this.angle), this.y - this.length * Math.sin(this.angle));
        ctx.strokeStyle = gradient; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
    }
    update() {
        this.x += this.speed * Math.sin(this.angle); this.y += this.speed * Math.cos(this.angle);
        this.alpha -= 0.005; this.draw();
    }
    isOffScreen() {
        return this.y > canvas.height + this.length || this.x < -this.length || this.x > canvas.width + this.length || this.alpha <= 0;
    }
}

for (let i = 0; i < numStars; i++) { stars.push(new Star()); }

function spawnMeteoroid() {
    const numToSpawn = [1, 2, 3, 5][Math.floor(Math.random() * 4)];
    for (let i = 0; i < numToSpawn; i++) {
        if (meteoroids.length < 15) { meteoroids.push(new Meteoroid()); }
    }
    setTimeout(spawnMeteoroid, Math.random() * 4000 + 2000);
}

function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(star => star.update());
    for (let i = meteoroids.length - 1; i >= 0; i--) {
        const meteoroid = meteoroids[i]; meteoroid.update();
        if (meteoroid.isOffScreen()) { meteoroids.splice(i, 1); }
    }
    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    stars.length = 0; for (let i = 0; i < numStars; i++) { stars.push(new Star()); }
});

window.addEventListener('load', () => {
    spawnMeteoroid();
    animate();
});
