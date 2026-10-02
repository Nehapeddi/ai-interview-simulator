const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const seed = {
  users: [
    {
      id: "candidate-001",
      name: "Alex Morgan",
      email: "alex@example.com",
      role: "Software Developer",
      experience: "Fresher",
      skills: ["JavaScript", "HTML", "CSS", "Node.js", "MongoDB"],
      avatar: "AM"
    }
  ],
  questionBank: [
    { id: "q1", type: "intro", difficulty: "Easy", text: "Tell me about yourself and the kind of software development work you enjoy.", tags: ["communication", "introduction"] },
    { id: "q2", type: "technical", difficulty: "Easy", text: "What is the difference between let, const, and var in JavaScript?", tags: ["javascript", "fundamentals"] },
    { id: "q3", type: "technical", difficulty: "Medium", text: "Explain what an API is and how a frontend application can communicate with a backend.", tags: ["api", "web"] },
    { id: "q4", type: "technical", difficulty: "Medium", text: "What is the purpose of asynchronous programming in JavaScript? Give an example.", tags: ["javascript", "async"] },
    { id: "q5", type: "problem-solving", difficulty: "Medium", text: "A web page is loading slowly. How would you investigate the problem and improve its performance?", tags: ["performance", "debugging"] },
    { id: "q6", type: "behavioral", difficulty: "Medium", text: "Tell me about a time you faced a difficult bug or project problem. How did you solve it?", tags: ["problem-solving", "ownership"] },
    { id: "q7", type: "behavioral", difficulty: "Medium", text: "How do you handle feedback when someone suggests a major change to your work?", tags: ["communication", "teamwork"] },
    { id: "q8", type: "technical", difficulty: "Hard", text: "Explain the difference between SQL and NoSQL databases and when you might choose each.", tags: ["database", "architecture"] },
    { id: "q9", type: "technical", difficulty: "Hard", text: "How would you design a simple authentication flow for a web application?", tags: ["security", "backend"] },
    { id: "q10", type: "closing", difficulty: "Easy", text: "Why are you interested in this role, and what would you like to learn next?", tags: ["motivation", "growth"] }
  ],
  interviews: []
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
  }
}
ensureStore();

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function analyzeAnswer(answer, question) {
  const text = String(answer || "").trim();
  const words = text ? text.split(/\s+/).filter(Boolean) : [];
  const lower = text.toLowerCase();
  const fillers = ["um", "uh", "like", "basically", "actually", "you know", "maybe"];
  let fillerCount = 0;
  for (const filler of fillers) {
    const matches = lower.match(new RegExp(`\\b${filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"));
    fillerCount += matches ? matches.length : 0;
  }

  const lengthScore = clamp(words.length * 1.4, 0, 45);
  const structureWords = ["first", "second", "because", "therefore", "for example", "however", "finally", "result"];
  const structureCount = structureWords.reduce((sum, w) => sum + (lower.includes(w) ? 1 : 0), 0);
  const structureScore = clamp(structureCount * 7, 0, 28);
  const fillerPenalty = Math.min(fillerCount * 4, 16);
  const relevanceScore = question.tags.some(tag => lower.includes(tag.replace("-", " "))) ? 12 : 5;
  const score = Math.round(clamp(35 + lengthScore + structureScore + relevanceScore - fillerPenalty, 0, 100));

  const professionalism = Math.round(clamp(score + (structureCount * 2) - fillerCount, 35, 100));
  const clarity = Math.round(clamp(45 + Math.min(words.length, 80) * 0.55 - fillerCount * 3, 35, 100));
  const confidence = Math.round(clamp(42 + Math.min(words.length, 90) * 0.48 - fillerCount * 4, 30, 100));

  let feedback;
  if (!text) {
    feedback = "No answer was detected. Try giving a concise answer with one example.";
  } else if (words.length < 20) {
    feedback = "Your answer is quite short. Add context, your reasoning, and a concrete example.";
  } else if (score >= 80) {
    feedback = "Strong response. Your answer has useful detail and a clear structure. Keep connecting your examples to measurable outcomes.";
  } else if (score >= 65) {
    feedback = "Good foundation. Make the answer more specific by explaining your reasoning and adding a concrete example or result.";
  } else {
    feedback = "Add more detail and structure. A simple approach is: situation, action, technology/reasoning, and result.";
  }

  return {
    score,
    professionalism,
    clarity,
    confidence,
    fillerCount,
    wordCount: words.length,
    feedback,
    generatedAt: new Date().toISOString()
  };
}

function getQuestion(store, id) {
  return store.questionBank.find(q => q.id === id);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "AI Interview Simulator backend is running." });
});

app.get("/api/dashboard", (req, res) => {
  const store = readStore();
  const user = store.users[0];
  const interviews = store.interviews.filter(i => i.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const completed = interviews.filter(i => i.status === "completed");
  const average = completed.length
    ? Math.round(completed.reduce((sum, i) => sum + (i.overallScore || 0), 0) / completed.length)
    : 0;

  const categoryScores = { technical: [], behavioral: [], "problem-solving": [], intro: [], closing: [] };
  completed.forEach(interview => {
    interview.answers.forEach(a => {
      const q = getQuestion(store, a.questionId);
      if (q && categoryScores[q.type]) categoryScores[q.type].push(a.analysis.score);
    });
  });

  const breakdown = Object.fromEntries(
    Object.entries(categoryScores).map(([key, values]) => [
      key,
      values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0
    ])
  );

  res.json({
    user,
    stats: {
      interviews: interviews.length,
      completed: completed.length,
      averageScore: average,
      bestScore: completed.length ? Math.max(...completed.map(i => i.overallScore || 0)) : 0
    },
    breakdown,
    recent: interviews.slice(0, 6).map(i => ({
      id: i.id,
      role: i.role,
      difficulty: i.difficulty,
      status: i.status,
      score: i.overallScore || 0,
      date: i.createdAt,
      answered: i.answers.length,
      total: i.questionIds.length
    }))
  });
});

app.get("/api/questions", (req, res) => {
  const store = readStore();
  res.json(store.questionBank);
});

app.get("/api/interviews", (req, res) => {
  const store = readStore();
  res.json(store.interviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get("/api/interviews/:id", (req, res) => {
  const store = readStore();
  const interview = store.interviews.find(i => i.id === req.params.id);
  if (!interview) return res.status(404).json({ error: "Interview not found." });

  const enriched = {
    ...interview,
    questions: interview.questionIds.map(id => getQuestion(store, id)).filter(Boolean)
  };
  res.json(enriched);
});

app.post("/api/interviews/start", (req, res) => {
  const store = readStore();
  const user = store.users[0];
  const role = String(req.body.role || "Software Developer").trim();
  const difficulty = String(req.body.difficulty || "Mixed").trim();
  const count = clamp(Number(req.body.count) || 7, 5, 10);

  let questions = [...store.questionBank];

  if (difficulty !== "Mixed") {
    const filtered = questions.filter(q => q.difficulty === difficulty);
    if (filtered.length >= count) questions = filtered;
  }

  // Always start with introduction, then mix technical/behavioral/problem-solving questions.
  const intro = questions.find(q => q.type === "intro");
  const closing = questions.find(q => q.type === "closing");
  const middle = questions.filter(q => q.id !== intro?.id && q.id !== closing?.id);

  for (let i = middle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middle[i], middle[j]] = [middle[j], middle[i]];
  }

  const selected = [intro, ...middle.slice(0, Math.max(0, count - 2)), closing].filter(Boolean).slice(0, count);
  const interview = {
    id: makeId("int"),
    userId: user.id,
    role,
    difficulty,
    status: "in-progress",
    questionIds: selected.map(q => q.id),
    currentIndex: 0,
    answers: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
    overallScore: 0,
    metrics: { communication: 0, technical: 0, problemSolving: 0, confidence: 0 }
  };

  store.interviews.push(interview);
  writeStore(store);
  res.status(201).json({
    interviewId: interview.id,
    question: selected[0],
    questionNumber: 1,
    total: selected.length
  });
});

app.post("/api/interviews/:id/answer", (req, res) => {
  const store = readStore();
  const interview = store.interviews.find(i => i.id === req.params.id);
  if (!interview) return res.status(404).json({ error: "Interview not found." });
  if (interview.status === "completed") return res.status(400).json({ error: "Interview is already completed." });

  const questionId = String(req.body.questionId || "");
  const answer = String(req.body.answer || "").trim();
  const question = getQuestion(store, questionId);
  if (!question) return res.status(400).json({ error: "Invalid question." });

  const analysis = analyzeAnswer(answer, question);
  const existingIndex = interview.answers.findIndex(a => a.questionId === questionId);
  const record = { questionId, answer, analysis, answeredAt: new Date().toISOString() };

  if (existingIndex >= 0) interview.answers[existingIndex] = record;
  else interview.answers.push(record);

  interview.currentIndex = Math.min(interview.questionIds.length - 1, interview.currentIndex + 1);
  writeStore(store);

  res.json({
    analysis,
    nextQuestion: interview.currentIndex < interview.questionIds.length
      ? getQuestion(store, interview.questionIds[interview.currentIndex])
      : null,
    questionNumber: interview.currentIndex + 1,
    total: interview.questionIds.length
  });
});

app.post("/api/interviews/:id/complete", (req, res) => {
  const store = readStore();
  const interview = store.interviews.find(i => i.id === req.params.id);
  if (!interview) return res.status(404).json({ error: "Interview not found." });

  const answered = interview.answers;
  const scores = answered.map(a => a.analysis.score);
  const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const communication = answered.length
    ? Math.round(answered.reduce((s, a) => s + a.analysis.clarity, 0) / answered.length) : 0;
  const confidence = answered.length
    ? Math.round(answered.reduce((s, a) => s + a.analysis.confidence, 0) / answered.length) : 0;

  const technicalAnswers = answered.filter(a => ["q2", "q3", "q4", "q8", "q9"].includes(a.questionId));
  const problemAnswers = answered.filter(a => ["q5", "q6"].includes(a.questionId));
  const technical = technicalAnswers.length
    ? Math.round(technicalAnswers.reduce((s, a) => s + a.analysis.score, 0) / technicalAnswers.length) : overall;
  const problemSolving = problemAnswers.length
    ? Math.round(problemAnswers.reduce((s, a) => s + a.analysis.score, 0) / problemAnswers.length) : overall;

  interview.status = "completed";
  interview.completedAt = new Date().toISOString();
  interview.overallScore = overall;
  interview.metrics = { communication, technical, problemSolving, confidence };
  writeStore(store);

  res.json({
    message: "Interview completed.",
    interviewId: interview.id,
    score: overall,
    metrics: interview.metrics,
    answered: answered.length,
    total: interview.questionIds.length
  });
});

app.post("/api/reset", (req, res) => {
  const store = readStore();
  store.interviews = [];
  writeStore(store);
  res.json({ message: "Demo interview history reset." });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`AI Interview Simulator running at http://localhost:${PORT}`);
});
