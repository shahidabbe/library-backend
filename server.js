const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

// --- YOUR DATABASE CONNECTION ---
// I added your string here. Make sure <librarypassword123> is the REAL password!
// If your password is just 'librarypassword123', remove the < and > symbols.
const MONGO_URI = "mongodb+srv://libraryadmin:librarypassword123@cluster0.jntmcep.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- DATA MODELS ---
const bookSchema = new mongoose.Schema({
  title: String, author: String, edition: String,
  language: String, volume: String, shelfNumber: String,
  copies: Number, available: Number, qrCode: String,
  status: { type: String, default: 'Available' }
});
const Book = mongoose.model('Book', bookSchema);

const memberSchema = new mongoose.Schema({
  name: String, fatherName: String, address: String, 
  email: String, phone: String, memberId: String,
  qrCode: String, joinDate: { type: Date, default: Date.now },
  history: Array
});
const Member = mongoose.model('Member', memberSchema);

const txnSchema = new mongoose.Schema({
  bookId: String, memberId: String, bookTitle: String,
  issueDate: Date, dueDate: Date, returnDate: Date,
  status: String, fine: { type: Number, default: 0 }
});
const Transaction = mongoose.model('Transaction', txnSchema);

// --- API ROUTES ---
app.get('/', (req, res) => res.send('Library Backend is Running!'));

// 1. Add Book
app.post('/api/books', async (req, res) => {
  try {
    const book = new Book(req.body);
    book.available = book.copies;
    book.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${book._id}`;
    await book.save();
    res.json(book);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 2. Add Member
app.post('/api/members', async (req, res) => {
  try {
    const member = new Member(req.body);
    member.memberId = `MEM-${Date.now().toString().slice(-6)}`;
    member.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${member.memberId}`;
    await member.save();
    res.json(member);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// 3. Issue Book
app.post('/api/issue', async (req, res) => {
  const { bookId, memberId, days } = req.body;
  const book = await Book.findById(bookId);
  if (!book || book.available < 1) return res.status(400).json({error: "Book unavailable"});

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + parseInt(days));

  const txn = new Transaction({
    bookId, memberId, bookTitle: book.title,
    issueDate: new Date(), dueDate, status: 'Issued'
  });
  await txn.save();

  book.available -= 1;
  await book.save();
  res.json(txn);
});

// 4. Return Book
app.post('/api/return', async (req, res) => {
  const { bookId, memberId } = req.body;
  const txn = await Transaction.findOne({ bookId, memberId, status: 'Issued' });
  if(!txn) return res.status(400).json({error: "No active issue found"});

  txn.returnDate = new Date();
  txn.status = 'Returned';
  
  const diffTime = txn.returnDate - txn.dueDate;
  if(diffTime > 0) {
    const daysOver = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    txn.fine = daysOver * 10;
  }
  await txn.save();

  const book = await Book.findById(bookId);
  book.available += 1;
  await book.save();
  res.json({ message: "Returned", fine: txn.fine });
});

// 5. Search Books
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  const books = await Book.find({
    $or: [{ title: { $regex: q, $options: 'i' }}, { author: { $regex: q, $options: 'i' }}]
  });
  res.json(books);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
