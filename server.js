const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors());

const MONGO_URI = "mongodb+srv://libraryadmin:librarypassword123@cluster0.jntmcep.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Error:", err));

// --- SCHEMAS ---
const bookSchema = new mongoose.Schema({
  title: String, author: String, language: String, 
  volume: String, section: String, category: String, 
  shelfNumber: String, copies: Number, available: Number
});
const Book = mongoose.model('Book', bookSchema);

const memberSchema = new mongoose.Schema({
  name: String, fatherName: String, address: String, 
  email: String, phone: String
});
const Member = mongoose.model('Member', memberSchema);

const txnSchema = new mongoose.Schema({
  bookId: String, memberId: String, bookTitle: String,
  issueDate: Date, dueDate: Date, returnDate: Date, 
  status: String, fine: { type: Number, default: 0 }
});
const Transaction = mongoose.model('Transaction', txnSchema);

// --- ROUTES ---

app.get('/', (req, res) => res.send('Backend Running'));

// GET
app.get('/api/books', async (req, res) => res.json(await Book.find()));
app.get('/api/members', async (req, res) => res.json(await Member.find()));

// POST (Add)
app.post('/api/books', async (req, res) => {
  const book = new Book(req.body);
  book.available = book.copies;
  await book.save();
  res.json(book);
});

app.post('/api/members', async (req, res) => {
  const member = new Member(req.body);
  await member.save();
  res.json(member);
});

// DELETE
app.delete('/api/books/:id', async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  res.json({message: "Deleted"});
});

app.delete('/api/members/:id', async (req, res) => {
  await Member.findByIdAndDelete(req.params.id);
  res.json({message: "Deleted"});
});

// UPDATE (EDIT) - NEW ROUTES ADDED HERE
app.put('/api/books/:id', async (req, res) => {
  try {
      await Book.findByIdAndUpdate(req.params.id, req.body);
      res.json({message: "Updated"});
  } catch (e) { res.status(500).json({error: "Update Failed"}); }
});

app.put('/api/members/:id', async (req, res) => {
  try {
      await Member.findByIdAndUpdate(req.params.id, req.body);
      res.json({message: "Updated"});
  } catch (e) { res.status(500).json({error: "Update Failed"}); }
});

// ISSUE BOOK (With Due Date)
app.post('/api/transactions/issue', async (req, res) => {
  const { bookId, memberId } = req.body;
  const book = await Book.findById(bookId);
  if (!book || book.copies < 1) return res.status(400).json({error: "Unavailable"});
  
  // 1. SET DUE DATE (15 Days from now)
  const issueDate = new Date();
  const dueDate = new Date();
  dueDate.setDate(issueDate.getDate() + 15); 

  const txn = new Transaction({
    bookId, memberId, bookTitle: book.title, 
    issueDate, dueDate, status: 'Issued'
  });
  await txn.save();
  
  book.copies -= 1;
  await book.save();
  res.json(txn);
});

// RETURN BOOK (With Fine Calculation)
app.post('/api/transactions/return', async (req, res) => {
  const { bookId } = req.body;
  const txn = await Transaction.findOne({ bookId: bookId, status: 'Issued' });
  
  if(!txn) return res.status(400).json({error: "Book is not currently issued"});

  const returnDate = new Date();
  txn.returnDate = returnDate;
  txn.status = 'Returned';

  // 2. CALCULATE FINE (5 Rupees per day late)
  // Check if returnDate is AFTER dueDate
  if (returnDate > txn.dueDate) {
      const diffTime = Math.abs(returnDate - txn.dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      txn.fine = diffDays * 5; 
  } else {
      txn.fine = 0;
  }

  await txn.save();

  const book = await Book.findById(bookId);
  if(book) {
      book.copies += 1;
      await book.save();
  }
  
  // Send back the fine amount so frontend can show it
  res.json({ message: "Returned Successfully", fine: txn.fine });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
