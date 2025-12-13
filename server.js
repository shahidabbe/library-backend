const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const XLSX = require('xlsx'); 
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

// --- NEW: NOTICE BOARD SCHEMA ---
const settingSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: String
});
const Setting = mongoose.model('Setting', settingSchema);


// --- ROUTES ---

app.get('/', (req, res) => res.send('Backend Running'));

// GET BOOKS & MEMBERS
app.get('/api/books', async (req, res) => res.json(await Book.find()));
app.get('/api/members', async (req, res) => res.json(await Member.find()));

// --- NEW ROUTE: GET ALL TRANSACTIONS (HISTORY) ---
app.get('/api/transactions', async (req, res) => {
try {
const txns = await Transaction.find().sort({ issueDate: -1 });
res.json(txns);
} catch (e) { res.status(500).json({error: "Failed to fetch transactions"}); }
});

// --- NEW: EXPORT TO EXCEL ---
app.get('/api/export-excel', async (req, res) => {
try {
const books = await Book.find();
const members = await Member.find();
const transactions = await Transaction.find();

const workbook = XLSX.utils.book_new();

// SHEET 1: BOOKS
const booksData = books.map(b => ({
ID: b._id.toString(), Title: b.title, Author: b.author, Language: b.language, Category: b.category,
'Shelf Number': b.shelfNumber, 'Total Copies': b.copies, 'Available': b.available, 'QR Code Data': b._id.toString()
}));
const booksSheet = XLSX.utils.json_to_sheet(booksData);
XLSX.utils.book_append_sheet(workbook, booksSheet, 'Books');

// SHEET 2: MEMBERS
const membersData = members.map(m => ({
ID: m._id.toString(), Name: m.name, 'Father Name': m.fatherName, Phone: m.phone, Email: m.email, Address: m.address, 'QR Code Data': m._id.toString()
}));
const membersSheet = XLSX.utils.json_to_sheet(membersData);
XLSX.utils.book_append_sheet(workbook, membersSheet, 'Members');

// SHEET 3: TRANSACTIONS
const issuedData = transactions.map(t => ({
'Book Title': t.bookTitle, 'Member ID': t.memberId, Status: t.status,
'Issue Date': t.issueDate ? t.issueDate.toLocaleDateString() : '',
'Due Date': t.dueDate ? t.dueDate.toLocaleDateString() : '',
'Return Date': t.returnDate ? t.returnDate.toLocaleDateString() : '',
'Fine Amount': t.fine || 0
}));
const issuedSheet = XLSX.utils.json_to_sheet(issuedData);
XLSX.utils.book_append_sheet(workbook, issuedSheet, 'Transactions');

res.setHeader('Content-Type', 'application/octet-stream');
res.setHeader('Content-Disposition', 'attachment; filename="Library_Data.xlsx"');

const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
res.send(buffer);

} catch (e) {
console.error("Export Error:", e);
res.status(500).json({ error: "Failed to export Excel file" });
}
});

// --- NEW: NOTICE BOARD ROUTES ---
app.get('/api/notice', async (req, res) => {
  try {
    const noticeSetting = await Setting.findOne({ key: 'notice' });
    res.json({ notice: noticeSetting ? noticeSetting.value : "" });
  } catch (e) { res.status(500).json({ error: "Failed to get notice" }); }
});

app.post('/api/notice', async (req, res) => {
  try {
    const { notice } = req.body;
    await Setting.findOneAndUpdate(
      { key: 'notice' },
      { value: notice },
      { upsert: true } // Creates the notice if it doesn't exist
    );
    res.json({ message: "Notice updated!" });
  } catch (e) { res.status(500).json({ error: "Failed to update notice" }); }
});


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

// UPDATE (EDIT)
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

res.json({ message: "Returned Successfully", fine: txn.fine });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
