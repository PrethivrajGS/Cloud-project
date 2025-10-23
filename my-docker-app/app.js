const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000;

// ------------------ DATABASE CONNECTION ------------------
mongoose.connect('mongodb://host.docker.internal:27017/quizapp')
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ------------------ DEFINE SCHEMAS ------------------
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  score: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);

// ------------------ QUIZ QUESTIONS ------------------
const quizQuestions = [
  { id: 1, q: "Which piece moves in an L-shape in chess?", options: ["Bishop", "Knight", "Rook", "Queen"], answerIndex: 1 },
  { id: 2, q: "How many squares are on a chessboard?", options: ["64", "72", "56", "48"], answerIndex: 0 },
  { id: 3, q: "Which piece can castle with the king?", options: ["Queen", "Rook", "Bishop", "Knight"], answerIndex: 1 }
];

// ------------------ MIDDLEWARE ------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 } // 1 hour
}));

app.use(express.static(path.join(__dirname, 'public')));

// ------------------ AUTH HELPERS ------------------
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// ------------------ AUTH ROUTES ------------------

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const existingUser = await User.findOne({ username });
  if (existingUser)
    return res.status(409).json({ error: 'User already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const newUser = await User.create({ username, passwordHash });

  req.session.userId = newUser._id;
  req.session.username = newUser.username;
  req.session.score = 0;

  res.json({ message: 'Registered and logged in', username: newUser.username });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });

  req.session.userId = user._id;
  req.session.username = user.username;
  req.session.score = user.score;

  res.json({ message: 'Logged in', username: user.username });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('sid');
    res.json({ message: 'Logged out' });
  });
});

// Current user
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  res.json({ authenticated: true, username: req.session.username });
});

// ------------------ QUIZ ROUTES ------------------

// Get questions (no answers)
app.get('/api/quiz/questions', requireLogin, (req, res) => {
  const withoutAnswers = quizQuestions.map(({ id, q, options }) => ({ id, q, options }));
  res.json({ questions: withoutAnswers });
});

// Submit answers
app.post('/api/quiz/submit', requireLogin, async (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object')
    return res.status(400).json({ error: 'Answers required' });

  let score = 0;
  quizQuestions.forEach(q => {
    const sel = answers[q.id];
    if (typeof sel === 'number' && sel === q.answerIndex) score++;
  });

  // update user score in DB
  await User.updateOne({ _id: req.session.userId }, { score });
  req.session.score = score;

  res.json({ score, total: quizQuestions.length, message: `You scored ${score}/${quizQuestions.length}` });
});

// ------------------ FRONTEND FALLBACK ------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------ SERVER START ------------------
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});

