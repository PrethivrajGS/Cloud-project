const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs'); // Use bcryptjs for Docker compatibility
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;


const users = {}; // { username: { id, username, passwordHash } }

// Example quiz questions
const quizQuestions = [
  { id: 1, q: "Which piece moves in an L-shape in chess?", options: ["Bishop", "Knight", "Rook", "Queen"], answerIndex: 1 },
  { id: 2, q: "How many squares are on a chessboard?", options: ["64", "72", "56", "48"], answerIndex: 0 },
  { id: 3, q: "Which piece can castle with the king?", options: ["Queen", "Rook", "Bishop", "Knight"], answerIndex: 1 }
];

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 } // 1 hour
}));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper: require login
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

// ------------------- AUTH ROUTES -------------------

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (users[username]) return res.status(409).json({ error: 'User already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  users[username] = { id, username, passwordHash };

  // create session and reset quiz score
  req.session.userId = id;
  req.session.username = username;
  req.session.score = 0;

  res.json({ message: 'Registered and logged in', username });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users[username];
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.score = 0; // reset score on login

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

// ------------------- QUIZ -------------------

// Get questions (without answerIndex)
app.get('/api/quiz/questions', requireLogin, (req, res) => {
  const qnoAnswers = quizQuestions.map(({ id, q, options }) => ({ id, q, options }));
  res.json({ questions: qnoAnswers });
});

// Submit answers
app.post('/api/quiz/submit', requireLogin, (req, res) => {
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'answers required' });

  let score = 0;
  quizQuestions.forEach(q => {
    const sel = answers[q.id];
    if (typeof sel === 'number' && sel === q.answerIndex) score++;
  });

  // store score in session
  req.session.score = score;

  res.json({ score, total: quizQuestions.length, message: `You scored ${score}/${quizQuestions.length}` });
});

// Fallback - serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
