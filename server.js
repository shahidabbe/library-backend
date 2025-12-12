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
  issueDate: Date, returnDate: Date, status: String
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

// DELETE (NEW!) - This allows you to remove books/members
app.delete('/api/books/:id', async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  res.json({message: "Deleted"});
});

app.delete('/api/members/:id', async (req, res) => {
  await Member.findByIdAndDelete(req.params.id);
  res.json({message: "Deleted"});
});

// ISSUE/RETURN
app.post('/api/transactions/issue', async (req, res) => {
  const { bookId, memberId } = req.body;
  const book = await Book.findById(bookId);
  if (!book || book.copies < 1) return res.status(400).json({error: "Unavailable"});
  
  const txn = new Transaction({
    bookId, memberId, bookTitle: book.title, issueDate: new Date(), status: 'Issued'
  });
  await txn.save();
  
  book.copies -= 1;
  await book.save();
  res.json(txn);
});

// 6. RETURN BOOK (New Version: Only needs Book ID)
app.post('/api/transactions/return', async (req, res) => {
  const { bookId } = req.body;
  // Find any transaction for this book that is still 'Issued'
  const txn = await Transaction.findOne({ bookId: bookId, status: 'Issued' });
  
  if(!txn) return res.status(400).json({error: "Book is not currently issued"});

  txn.returnDate = new Date();
  txn.status = 'Returned';
  await txn.save();

  const book = await Book.findById(bookId);
  if(book) {
      book.copies += 1;
      await book.save();
  }
  
  res.json({ message: "Returned Successfully" });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
