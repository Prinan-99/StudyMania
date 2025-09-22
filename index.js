/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type } from "@google/genai";

// --- DOM Element References ---
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const statusEl = document.getElementById('status');
const questionInput = document.getElementById('question');
const askBtn = document.getElementById('askBtn');
const answerEl = document.getElementById('answer');
const fileInputLabel = document.querySelector('.file-input-label');

// Sections
const appContainer = document.querySelector('.app-container');
const qaSection = document.getElementById('qa-section');
const answerSection = document.getElementById('answer-section');
const quizSection = document.getElementById('quiz-section');
const resultsSection = document.getElementById('results-section');
const gameSection = document.getElementById('game-section');

// Quiz Elements
const startQuizBtn = document.getElementById('startQuizBtn');
const quizLoadingContainer = document.getElementById('quiz-loading-container');
const quizLoadingStatus = document.getElementById('quiz-loading-status');
const quizContentContainer = document.getElementById('quiz-content-container');
const questionProgressEl = document.getElementById('question-progress');
const scoreDisplayEl = document.getElementById('score-display');
const quizQuestionEl = document.getElementById('quiz-question');
const quizOptionsEl = document.getElementById('quiz-options');
const quizFeedbackEl = document.getElementById('quiz-feedback');
const nextQuestionBtn = document.getElementById('nextQuestionBtn');

// Results Elements
const finalScoreEl = document.getElementById('final-score');
const reviewMistakesBtn = document.getElementById('reviewMistakesBtn');
const restartQuizBtn = document.getElementById('restartQuizBtn');
const exitQuizBtn = document.getElementById('exitQuizBtn');

// Game Elements
const startGameBtn = document.getElementById('startGameBtn');
const gameLoadingContainer = document.getElementById('game-loading-container');
const gameLoadingStatus = document.getElementById('game-loading-status');
const exitGameLoadingBtn = document.getElementById('exitGameLoadingBtn');
const gameContainer = document.getElementById('game-container');
const cardProgressEl = document.getElementById('card-progress');
const flashcardContainer = document.getElementById('flashcard-container');
const flashcardEl = document.getElementById('flashcard');
const flashcardTermEl = document.getElementById('flashcard-term');
const flashcardDefinitionEl = document.getElementById('flashcard-definition');
const gameControls = document.getElementById('game-controls');
const knewItBtn = document.getElementById('knewItBtn');
const didntKnowBtn = document.getElementById('didntKnowBtn');
const gameResultsSection = document.getElementById('game-results-section');
const gameResultsHeadingEl = document.getElementById('game-results-heading');
const restartGameBtn = document.getElementById('restartGameBtn');
const exitGameBtn = document.getElementById('exitGameBtn');

// History & Menu Elements
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const menuToggleBtn = document.getElementById('menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');


// --- State ---
let activeFile = null;
let history = [];
let quizQuestions = [];
let incorrectAnswers = [];
let currentQuestionIndex = 0;
let score = 0;
let isReviewingMistakes = false;

let flashcards = [];
let currentCardIndex = 0;
let knownCardsCount = 0;


// --- Gemini AI Setup ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- Utility Functions ---
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// --- IndexedDB History Logic ---
const DB_NAME = 'StudyHelperDB';
const STORE_NAME = 'history';
const DB_VERSION = 1;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve();
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const dbInstance = request.result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => {
            db = request.result;
            resolve();
        };

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject('Error opening local study history database.');
        };
    });
}


async function saveHistoryItem(item) {
    await initDB(); // Ensure DB is open
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(item);

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            console.error('Transaction error:', transaction.error);
            if (transaction.error?.name === 'QuotaExceededError') {
                reject('Local storage quota exceeded. Please clear some history or use smaller files.');
            } else {
                reject('Error saving history item.');
            }
        };
    });
}

async function loadHistoryFromDB() {
    await initDB(); // Ensure DB is open
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const sortedHistory = request.result.sort((a, b) => 
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            resolve(sortedHistory);
        };

        request.onerror = () => {
            console.error('Error loading history:', request.error);
            reject('Error loading history from database.');
        };
    });
}

async function clearHistoryDB() {
    await initDB(); // Ensure DB is open
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            console.error('Error clearing history:', transaction.error);
            reject('Error clearing history from database.');
        };
    });
}


function renderHistory() {
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">No history yet.</li>';
    return;
  }
  history.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item.name;
    li.dataset.id = item.id;
    li.title = `Load ${item.name}`;
    if (activeFile && activeFile.id === item.id) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => loadHistoryItem(item.id));
    historyList.appendChild(li);
  });
}

function loadHistoryItem(id) {
  const item = history.find(h => h.id === id);
  if (item) {
    activeFile = item;
    statusEl.textContent = `Active material: "${item.name}"`;
    statusEl.style.color = 'green';

    // Reset UI state
    questionInput.value = '';
    answerSection.classList.add('hidden');
    quizSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    gameSection.classList.add('hidden');
    qaSection.classList.remove('hidden');

    askBtn.disabled = false;
    startQuizBtn.disabled = false;
    startGameBtn.disabled = false;
    renderHistory(); // Re-render to show active state
    closeSidebar(); // Close sidebar after selection
  }
}

async function clearHistory() {
  if (confirm('Are you sure you want to clear all study history?')) {
    try {
        await clearHistoryDB();
        history = [];
        activeFile = null;
        renderHistory();
        statusEl.textContent = 'History cleared.';
        statusEl.style.color = 'inherit';
        askBtn.disabled = true;
        startQuizBtn.disabled = true;
        startGameBtn.disabled = true;
    } catch (e) {
        statusEl.textContent = 'Error clearing history.';
        statusEl.style.color = 'red';
        console.error(e);
    }
  }
}


// --- Sidebar Logic ---
function toggleSidebar() {
  const isOpen = appContainer.classList.toggle('sidebar-open');
  menuToggleBtn.setAttribute('aria-expanded', String(isOpen));
}

function closeSidebar() {
  if (appContainer.classList.contains('sidebar-open')) {
    appContainer.classList.remove('sidebar-open');
    menuToggleBtn.setAttribute('aria-expanded', 'false');
  }
}


// --- Event Listeners ---
fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
        const fileName = fileInput.files[0].name;
        fileInputLabel.textContent = fileName;
    } else {
        fileInputLabel.textContent = 'Choose a file (.txt, .pdf, .docx)';
    }
});

processBtn.addEventListener("click", async () => {
  if (!fileInput.files || fileInput.files.length === 0) {
    statusEl.textContent = "Please select a file first!";
    statusEl.style.color = 'red';
    return;
  }
  
  const file = fileInput.files[0];
  statusEl.textContent = "Processing file...";
  statusEl.style.color = 'inherit';

  try {
    const fileContent = await fileToBase64(file);
    const newHistoryItem = {
      id: Date.now().toString(),
      name: file.name,
      content: fileContent,
      mimeType: file.type || 'application/octet-stream', // Fallback MIME type
      timestamp: new Date().toISOString()
    };
    
    // Add to top of memory history
    history.unshift(newHistoryItem);
    await saveHistoryItem(newHistoryItem); // Save to IndexedDB
    
    activeFile = newHistoryItem;
    
    statusEl.textContent = `File "${file.name}" processed successfully!`;
    statusEl.style.color = 'green';
    askBtn.disabled = false;
    startQuizBtn.disabled = false;
    startGameBtn.disabled = false;
    
    renderHistory();
    // Clear the file input for the next upload
    fileInput.value = '';
    fileInputLabel.textContent = 'Choose a file (.txt, .pdf, .docx)';

  } catch (err) {
    activeFile = null;
    let errorMessage = "Error reading or saving file.";
    if (typeof err === 'string') {
        errorMessage = err;
    } else if (err instanceof Error) {
        errorMessage = err.message;
    }
    statusEl.textContent = errorMessage;
    statusEl.style.color = 'red';
    askBtn.disabled = true;
    startQuizBtn.disabled = true;
    startGameBtn.disabled = true;
    console.error(err);
  }
});

askBtn.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (!activeFile) {
    alert("Please upload and process your study material first!");
    return;
  }
  if (!question) {
    alert("Please enter a question!");
    return;
  }
  
  answerSection.classList.remove('hidden');
  answerSection.classList.add('thinking');
  answerEl.textContent = "";

  const fileDataPart = {
    inlineData: {
      data: activeFile.content.split(",")[1],
      mimeType: activeFile.mimeType,
    },
  };

  const textPart = {
    text: `Based on the provided study material, please answer the following question concisely:\n\nQuestion: ${question}`
  };

  askBtn.disabled = true;
  questionInput.disabled = true;
  startQuizBtn.disabled = true;
  startGameBtn.disabled = true;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: { parts: [fileDataPart, textPart] },
      config: {
        systemInstruction: "You are a helpful and detailed study assistant. Your goal is to provide clear and comprehensive answers based on the provided text."
      }
    });

    for await (const chunk of responseStream) {
      answerEl.textContent += chunk.text;
    }
  } catch (err) {
    answerEl.textContent = "An error occurred while fetching the answer. Please try again. \n" + (err instanceof Error ? err.message : String(err));
  } finally {
    askBtn.disabled = false;
    questionInput.disabled = false;
    startQuizBtn.disabled = false;
    startGameBtn.disabled = false;
    answerSection.classList.remove('thinking');
  }
});

// --- Quiz Logic ---
const quizSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description: "An array of 5 multiple-choice quiz questions.",
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "The text of the question."
          },
          options: {
            type: Type.ARRAY,
            description: "An array of 4 possible answers.",
            items: { type: Type.STRING }
          },
          correctAnswer: {
            type: Type.STRING,
            description: "The correct answer from the 'options' array."
          }
        },
        required: ["question", "options", "correctAnswer"]
      }
    }
  },
  required: ["questions"]
};

startQuizBtn.addEventListener('click', async () => {
    if (!activeFile) {
        alert("Please upload and process your study material first!");
        return;
    }

    qaSection.classList.add('hidden');
    answerSection.classList.add('hidden');
    quizSection.classList.remove('hidden');
    quizContentContainer.classList.add('hidden');
    quizLoadingContainer.classList.remove('hidden');
    quizLoadingStatus.textContent = 'Generating quiz...';

    askBtn.disabled = true;
    startQuizBtn.disabled = true;
    startGameBtn.disabled = true;

    const fileDataPart = {
      inlineData: {
        data: activeFile.content.split(",")[1],
        mimeType: activeFile.mimeType,
      },
    };

    const textPart = {
      text: "Based on the provided study material, generate 5 multiple-choice questions to test understanding. For each question, provide 4 options and indicate the correct answer."
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [fileDataPart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: quizSchema,
            }
        });
        
        const quizData = JSON.parse(response.text);
        if (quizData && quizData.questions && quizData.questions.length > 0) {
            quizQuestions = quizData.questions;
            quizLoadingContainer.classList.add('hidden');
            quizContentContainer.classList.remove('hidden');
            startQuiz();
        } else {
            throw new Error("Invalid quiz format received from AI.");
        }
    } catch (err) {
        quizLoadingStatus.textContent = "Could not generate a quiz. The material might be too short or unsupported. Please try again with a different file.";
        console.error(err);
        // Add a button to go back
        setTimeout(() => {
            quizSection.classList.add('hidden');
            qaSection.classList.remove('hidden');
        }, 3000);
    } finally {
        askBtn.disabled = false;
        startQuizBtn.disabled = false;
        startGameBtn.disabled = false;
    }
});

function startQuiz() {
    currentQuestionIndex = 0;
    score = 0;
    incorrectAnswers = [];
    isReviewingMistakes = false;
    resultsSection.classList.add('hidden');
    reviewMistakesBtn.classList.add('hidden');
    quizSection.classList.remove('hidden');
    quizContentContainer.classList.remove('hidden'); // Ensure content is visible
    quizLoadingContainer.classList.add('hidden'); // Ensure loader is hidden
    displayCurrentQuestion();
}

function displayCurrentQuestion() {
    if (!quizQuestions || quizQuestions.length === 0) return;
    const question = quizQuestions[currentQuestionIndex];

    quizFeedbackEl.textContent = '';
    quizOptionsEl.innerHTML = '';
    nextQuestionBtn.classList.add('hidden');
    scoreDisplayEl.classList.remove('hidden');

    questionProgressEl.textContent = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
    scoreDisplayEl.textContent = `Score: ${score}`;
    quizQuestionEl.textContent = question.question;

    question.options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.classList.add('button', 'quiz-option-btn');
        button.addEventListener('click', () => handleOptionClick(option, question.correctAnswer, button));
        quizOptionsEl.appendChild(button);
    });
}

function handleOptionClick(selectedAnswer, correctAnswer, button) {
    const optionButtons = quizOptionsEl.querySelectorAll('.quiz-option-btn');
    let isCorrect = selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    if (isCorrect) {
        score++;
        quizFeedbackEl.textContent = "Correct!";
        quizFeedbackEl.style.color = 'var(--correct-color)';
        button.classList.add('correct');
    } else {
        quizFeedbackEl.textContent = `Incorrect! The correct answer was: ${correctAnswer}`;
        quizFeedbackEl.style.color = 'var(--incorrect-color)';
        button.classList.add('incorrect');
        incorrectAnswers.push({ question: quizQuestions[currentQuestionIndex], selected: selectedAnswer });
    }

    optionButtons.forEach(btn => {
        const btnEl = btn;
        btnEl.disabled = true;
        if(btnEl.textContent?.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {
            btnEl.classList.add('correct');
        }
    });

    scoreDisplayEl.textContent = `Score: ${score}`;
    nextQuestionBtn.classList.remove('hidden');
}

nextQuestionBtn.addEventListener('click', () => {
    currentQuestionIndex++;
    if (isReviewingMistakes) {
        if (currentQuestionIndex < incorrectAnswers.length) {
            displayMistake();
        } else {
            // Finished reviewing, show results again
            isReviewingMistakes = false;
            showResults();
        }
    } else {
        if (currentQuestionIndex < quizQuestions.length) {
            displayCurrentQuestion();
        } else {
            showResults();
        }
    }
});

function showResults() {
    quizSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    finalScoreEl.textContent = `Your final score is ${score} out of ${quizQuestions.length}.`;
    
    const scorePercentage = score / quizQuestions.length;
    if (scorePercentage < 0.6 && incorrectAnswers.length > 0) {
        reviewMistakesBtn.classList.remove('hidden');
    } else {
        reviewMistakesBtn.classList.add('hidden');
    }
}

reviewMistakesBtn.addEventListener('click', () => {
    isReviewingMistakes = true;
    currentQuestionIndex = 0;
    resultsSection.classList.add('hidden');
    quizSection.classList.remove('hidden');
    quizContentContainer.classList.remove('hidden');
    displayMistake();
});

function displayMistake() {
    const mistake = incorrectAnswers[currentQuestionIndex];
    quizFeedbackEl.textContent = '';
    quizOptionsEl.innerHTML = '';
    nextQuestionBtn.classList.remove('hidden');
    scoreDisplayEl.classList.add('hidden');

    questionProgressEl.textContent = `Reviewing Mistake ${currentQuestionIndex + 1} of ${incorrectAnswers.length}`;
    quizQuestionEl.textContent = mistake.question.question;

    mistake.question.options.forEach(option => {
        const button = document.createElement('button');
        button.textContent = option;
        button.classList.add('button', 'quiz-option-btn');
        button.disabled = true; // All buttons disabled in review mode

        if (option.trim().toLowerCase() === mistake.question.correctAnswer.trim().toLowerCase()) {
            button.classList.add('correct');
        }
        if (option.trim().toLowerCase() === mistake.selected.trim().toLowerCase()) {
            button.classList.add('incorrect');
        }

        quizOptionsEl.appendChild(button);
    });
}

restartQuizBtn.addEventListener('click', startQuiz);

exitQuizBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    qaSection.classList.remove('hidden');
    
    quizQuestions = [];
    incorrectAnswers = [];
    currentQuestionIndex = 0;
    score = 0;
    isReviewingMistakes = false;
});

// --- Flashcard Game Logic ---
const flashcardSchema = {
    type: Type.OBJECT,
    properties: {
      flashcards: {
        type: Type.ARRAY,
        description: "An array of 10 flashcards based on the key terms and concepts in the text.",
        items: {
          type: Type.OBJECT,
          properties: {
            term: {
              type: Type.STRING,
              description: "A key term, concept, or name from the material."
            },
            definition: {
              type: Type.STRING,
              description: "A concise definition or explanation of the term, suitable for a flashcard."
            }
          },
          required: ["term", "definition"]
        }
      }
    },
    required: ["flashcards"]
};

startGameBtn.addEventListener('click', async () => {
    if (!activeFile) {
        alert("Please upload and process your study material first!");
        return;
    }

    // --- UI Setup for Loading ---
    qaSection.classList.add('hidden');
    answerSection.classList.add('hidden');
    gameSection.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    gameResultsSection.classList.add('hidden');
    gameLoadingContainer.classList.remove('hidden');
    
    askBtn.disabled = true;
    startQuizBtn.disabled = true;
    startGameBtn.disabled = true;

    // Reset button text from previous runs
    exitGameLoadingBtn.textContent = 'Cancel';

    // --- Loading Messages ---
    const loadingMessages = [
        'Analyzing your document...',
        'Identifying key concepts...',
        'Crafting flashcard definitions...',
        'Building the flashcard deck...',
        'Just a moment more...'
    ];
    let messageIndex = 0;
    gameLoadingStatus.textContent = loadingMessages[0];
    const loadingInterval = setInterval(() => {
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        gameLoadingStatus.textContent = loadingMessages[messageIndex];
    }, 3000);

    // --- Cancellation Logic ---
    const controller = new AbortController();
    const abortHandler = () => {
        controller.abort("User cancelled flashcard generation.");
        clearInterval(loadingInterval);
        gameLoadingContainer.classList.add('hidden');
        qaSection.classList.remove('hidden');
        gameSection.classList.add('hidden');
        askBtn.disabled = false;
        startQuizBtn.disabled = false;
        startGameBtn.disabled = false;
    };
    exitGameLoadingBtn.addEventListener('click', abortHandler, { once: true });

    const fileDataPart = {
        inlineData: { data: activeFile.content.split(",")[1], mimeType: activeFile.mimeType, },
    };
    const textPart = { text: "Based on the provided study material, generate 10 flashcards. Each flashcard should have a key 'term' and a concise 'definition'." };
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [fileDataPart, textPart] },
            config: { responseMimeType: 'application/json', responseSchema: flashcardSchema, }
        });

        if (controller.signal.aborted) return; // Exit if cancelled during await

        clearInterval(loadingInterval);
        exitGameLoadingBtn.removeEventListener('click', abortHandler); 

        const gameData = JSON.parse(response.text);
        if (gameData && gameData.flashcards && gameData.flashcards.length > 0) {
            flashcards = gameData.flashcards;
            gameLoadingContainer.classList.add('hidden');
            gameContainer.classList.remove('hidden');
            startGame();
        } else {
            throw new Error("No flashcards were generated. The material might be too short or unsuitable.");
        }
    } catch (err) {
        if (controller.signal.aborted) return;

        clearInterval(loadingInterval);
        console.error(err);
        gameLoadingStatus.textContent = err instanceof Error ? err.message : "Could not generate flashcards. Please try again or cancel.";
        exitGameLoadingBtn.textContent = 'Exit';
        // The abortHandler is still attached and will now function as an "Exit" button.
    }
});

function startGame() {
    currentCardIndex = 0;
    knownCardsCount = 0;
    gameContainer.classList.remove('hidden');
    gameResultsSection.classList.add('hidden');
    displayCurrentCard();
}

function displayCurrentCard() {
    if (currentCardIndex >= flashcards.length) {
        showGameResults();
        return;
    }
    flashcardEl.classList.remove('is-flipped');
    gameControls.classList.add('hidden');

    const card = flashcards[currentCardIndex];
    cardProgressEl.textContent = `Card ${currentCardIndex + 1} of ${flashcards.length}`;
    flashcardTermEl.textContent = card.term;
    flashcardDefinitionEl.textContent = card.definition;
}

function advanceCard() {
    currentCardIndex++;
    displayCurrentCard();
}

function showGameResults() {
    gameContainer.classList.add('hidden');
    gameResultsSection.classList.remove('hidden');
    gameResultsHeadingEl.textContent = `Game Over! You knew ${knownCardsCount} out of ${flashcards.length} cards.`;
}

flashcardContainer.addEventListener('click', () => {
    flashcardEl.classList.toggle('is-flipped');
    if (flashcardEl.classList.contains('is-flipped')) {
        gameControls.classList.remove('hidden');
    } else {
        gameControls.classList.add('hidden');
    }
});

knewItBtn.addEventListener('click', () => {
    knownCardsCount++;
    advanceCard();
});

didntKnowBtn.addEventListener('click', () => {
    advanceCard();
});

restartGameBtn.addEventListener('click', startGame);

exitGameBtn.addEventListener('click', () => {
    gameSection.classList.add('hidden');
    qaSection.classList.remove('hidden');
    flashcards = [];
    askBtn.disabled = false;
    startQuizBtn.disabled = false;
    startGameBtn.disabled = false;
});

// --- Initialization ---
clearHistoryBtn.addEventListener('click', clearHistory);
menuToggleBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    history = await loadHistoryFromDB();
    renderHistory();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Could not load study history from the local database.";
    statusEl.style.color = 'red';
  }
});