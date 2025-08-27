import mongoose from 'mongoose';

const BookSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: { // Store the text content of the book
        type: String,
        required: true
    },
    user: { // Reference to the User who uploaded this book
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Refers to the 'User' model
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

const Book = mongoose.model('Book', BookSchema);

export default Book;
