const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors()); // Allows Frontend to connect

// --- DATABASE CONNECTION ---
const MONGO_URI = "mongodb+srv://libraryadmin:librarypassword123@cluster0.jntmcep.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- DATA MODELS ---
const bookSchema = new mongoose.Schema({
  title: String, author: String, language: String, 
  volume: String, section: String, category: String, 
  shelfNumber: String, copies: Number, 
  available: Number, qrCode: String
});
const Book = mongoose.model('Book', bookSchema);

const memberSchema = new mongoose.Schema({
  name: String, fatherName: String, address: String, 
  email: String, phone: String, 
  qrCode: String, joinDate: { type: Date, default: Date.now }
});
const Member = mongoose.model('Member', memberSchema);

const txnSchema = new mongoose.Schema({
  bookId: String, memberId: String, bookTitle: String,
  issueDate: Date, returnDate: Date,
  status: String // 'Issued' or 'Returned'
});
const Transaction = mongoose.model('Transaction', txnSchema);

// --- API ROUTES ---

app.get('/', (req, res) => res.send('Library Backend is Running!'));

// 1. GET ALL BOOKS (This was missing!)
app.get('/api/books', async (req, res) => {
  try {
    const books = await Book.find();
    res.json(books);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 2. GET ALL MEMBERS (This was missing!)
app.get('/api/members', async (req, res) => {
  try {
    const members = await Member.find();
    res.json(members);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 3. ADD BOOK
app.post('/api/books', async (req, res) => {
  try {
    const book = new Book(req.body);
    book.available = book.copies; // Set initial availability
    await book.save();
    res.json(book);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 4. ADD MEMBER
app.post('/api/members', async (req, res) => {
  try {
    const member = new Member(req.body);
    await member.save();
    res.json(member);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 5. ISSUE BOOK (Updated path to match Frontend)
app.post('/api/transactions/issue', async (req, res) => {
  const { bookId, memberId } = req.body;
  
  const book = await Book.findById(bookId);
  if (!book || book.copies < 1) return res.status(400).json({error: "Book unavailable"});

  const txn = new Transaction({
    bookId, memberId, bookTitle: book.title,
    issueDate: new Date(), status: 'Issued'
  });
  await txn.save();

  // Decrease copies
  book.copies -= 1;
  await book.save();
  
  res.json(txn);
});

// 6. RETURN BOOK (Updated path to match Frontend)
app.post('/api/transactions/return', async (req, res) => {
  const { bookId, memberId } = req.body;
  
  // Find active transaction
  const txn = await Transaction.findOne({ bookId, memberId, status: 'Issued' });
  if(!txn) return res.status(400).json({error: "No active issue found"});

  txn.returnDate = new Date();
  txn.status = 'Returned';
  await txn.save();

  // Increase copies back
  const book = await Book.findById(bookId);
  book.copies += 1;
  await book.save();
  
  res.json({ message: "Returned Successfully" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
