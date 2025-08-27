// script.js

// --- DOM Elements ---
const mainAppContainer = document.getElementById('main-app-container');
const bookViewerPanel = document.getElementById('book-viewer-panel');
const chatPanel = document.getElementById('chat-panel');
const toggleFullscreenBtn = document.getElementById('toggle-fullscreen-btn');
const maximizeIcon = document.getElementById('maximize-icon');
const minimizeIcon = document.getElementById('minimize-icon');

const statusMessageDiv = document.getElementById('status-message');
const chatContainer = document.getElementById('chat-container');
const initialChatMessage = document.getElementById('initial-chat-message');
const chatInputSection = document.getElementById('chat-input-section');
const userInputField = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const voiceButton = document.getElementById('voice-button');
const micIconStatic = document.getElementById('mic-icon-static');
const micIconPulse = document.getElementById('mic-icon-pulse');
const voiceButtonText = document.getElementById('voice-button-text');
const bookTitleElement = document.getElementById('book-title');
const bookContentDisplay = document.getElementById('book-content-display');

const voiceControlsContainer = document.getElementById('voice-controls-container');
const pauseVoiceButton = document.getElementById('pause-voice-button');
const stopVoiceButton = document.getElementById('stop-voice-button');

const voiceVisualizerContainer = document.getElementById('voice-visualizer-container');
const voiceVisualizerText = document.getElementById('voice-visualizer-text');

// --- Theme Management ---
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');

// Initialize theme
const initializeTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);
};

const updateThemeIcons = (theme) => {
    if (theme === 'light') {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    } else {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    }
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
};

// --- Reading Progress Tracking ---
const updateReadingProgress = () => {
    const bookContent = document.getElementById('book-content-display');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    
    if (!bookContent || !progressContainer) return;
    
    const scrollTop = bookContent.scrollTop;
    const scrollHeight = bookContent.scrollHeight;
    const clientHeight = bookContent.clientHeight;
    
    if (scrollHeight <= clientHeight) {
        progressContainer.classList.add('hidden');
        return;
    }
    
    progressContainer.classList.remove('hidden');
    
    const maxScroll = scrollHeight - clientHeight;
    const scrollPercentage = Math.min((scrollTop / maxScroll) * 100, 100);
    
    progressFill.style.width = `${scrollPercentage}%`;
    progressText.textContent = `${Math.round(scrollPercentage)}% read`;
    
    // Save progress to localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const currentBookId = urlParams.get('bookId');
    if (currentBookId) {
        localStorage.setItem(`reading-progress-${currentBookId}`, scrollPercentage.toString());
    }
};

// --- Book Annotations System ---
let annotations = [];
let selectedText = '';
let selectedRange = null;

const annotationToolbar = document.getElementById('annotation-toolbar');
const highlightBtn = document.getElementById('highlight-btn');
const removeHighlightBtn = document.getElementById('remove-highlight-btn');
const annotationsPanel = document.getElementById('annotations-panel');
const annotationsToggle = document.getElementById('annotations-toggle');
const closeAnnotations = document.getElementById('close-annotations');
const annotationsList = document.getElementById('annotations-list');

const loadAnnotations = async (bookId) => {
    try {
        console.log('Loading annotations for book:', bookId);
        const response = await fetch(`/api/annotations/${bookId}`);
        if (response.ok) {
            annotations = await response.json();
            console.log('Loaded annotations:', annotations.length);
        } else {
            console.error('Failed to load annotations:', response.statusText);
            annotations = [];
        }
    } catch (error) {
        console.error('Error loading annotations:', error);
        annotations = [];
    }
    renderAnnotations();
    // Don't apply highlights here - let the caller handle timing
};

const saveAnnotation = async (bookId, text, startOffset, endOffset) => {
    try {
        const response = await fetch('/api/annotations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookId: bookId,
                text: text,
                startOffset: startOffset,
                endOffset: endOffset
            })
        });
        
        if (response.ok) {
            const newAnnotation = await response.json();
            return newAnnotation;
        } else {
            console.error('Failed to save annotation:', response.statusText);
            return null;
        }
    } catch (error) {
        console.error('Error saving annotation:', error);
        return null;
    }
};

const getTextOffset = (container, node, offset) => {
    let textOffset = 0;
    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (currentNode === node) {
            return textOffset + offset;
        }
        textOffset += currentNode.textContent.length;
    }
    return textOffset;
};

const deleteAnnotation = async (annotationId) => {
    try {
        const response = await fetch(`/api/annotations/${annotationId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Remove highlight from DOM
            const highlightElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
            if (highlightElement) {
                const textNode = document.createTextNode(highlightElement.textContent);
                highlightElement.parentNode.replaceChild(textNode, highlightElement);
            }
            
            // Remove from annotations array
            annotations = annotations.filter(ann => ann._id !== annotationId);
            renderAnnotations();
        } else {
            console.error('Failed to delete annotation:', response.statusText);
        }
    } catch (error) {
        console.error('Error deleting annotation:', error);
    }
};

const showAnnotationToolbar = (x, y) => {
    annotationToolbar.style.left = `${x}px`;
    annotationToolbar.style.top = `${y}px`;
    annotationToolbar.classList.add('show');
};

const hideAnnotationToolbar = () => {
    annotationToolbar.classList.remove('show');
    selectedText = '';
    selectedRange = null;
};

const handleTextSelection = () => {
    const selection = window.getSelection();
    const bookContent = document.getElementById('book-content-display');
    
    if (selection.rangeCount === 0 || selection.isCollapsed) {
        hideAnnotationToolbar();
        return;
    }
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Check if selection is within book content
    if (!bookContent.contains(container)) {
        hideAnnotationToolbar();
        return;
    }
    
    selectedText = selection.toString().trim();
    selectedRange = range.cloneRange();
    
    if (selectedText.length > 0) {
        const rect = range.getBoundingClientRect();
        const x = rect.left + (rect.width / 2) - 100;
        const y = rect.top - 60;
        showAnnotationToolbar(x, y);
    }
};

const createHighlight = async () => {
    if (!selectedRange || !selectedText) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('bookId');
    if (!bookId) return;
    
    // Calculate text offsets for better persistence
    const bookContent = document.getElementById('book-content-display');
    const startOffset = getTextOffset(bookContent, selectedRange.startContainer, selectedRange.startOffset);
    const endOffset = getTextOffset(bookContent, selectedRange.endContainer, selectedRange.endOffset);
    
    // Save to database
    const savedAnnotation = await saveAnnotation(bookId, selectedText, startOffset, endOffset);
    if (!savedAnnotation) {
        console.error('Failed to save annotation');
        return;
    }
    
    // Create highlight span
    const highlightSpan = document.createElement('span');
    highlightSpan.className = 'highlight';
    highlightSpan.setAttribute('data-annotation-id', savedAnnotation._id);
    highlightSpan.innerHTML = `${selectedText}<div class="highlight-tooltip">Click to view note</div>`;
    
    try {
        selectedRange.deleteContents();
        selectedRange.insertNode(highlightSpan);
        
        annotations.push(savedAnnotation);
        renderAnnotations();
        
        // Clear selection
        window.getSelection().removeAllRanges();
        hideAnnotationToolbar();
        
    } catch (error) {
        console.error('Error creating highlight:', error);
    }
};

const removeHighlight = () => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    let highlightElement = null;
    
    // Find the highlight element
    if (container.nodeType === Node.TEXT_NODE) {
        highlightElement = container.parentElement;
    } else {
        highlightElement = container;
    }
    
    if (highlightElement && highlightElement.classList.contains('highlight')) {
        const annotationId = highlightElement.getAttribute('data-annotation-id');
        
        // Replace highlight with plain text
        const textNode = document.createTextNode(highlightElement.textContent);
        highlightElement.parentNode.replaceChild(textNode, highlightElement);
        
        // Remove from annotations array
        annotations = annotations.filter(ann => ann.id !== annotationId);
        
        const urlParams = new URLSearchParams(window.location.search);
        const bookId = urlParams.get('bookId');
        if (bookId) {
            saveAnnotations(bookId);
            renderAnnotations();
        }
        
        window.getSelection().removeAllRanges();
        hideAnnotationToolbar();
    }
};

const applyHighlights = () => {
    const bookContent = document.getElementById('book-content-display');
    if (!bookContent || annotations.length === 0) {
        console.log('No book content or annotations to apply');
        return;
    }
    
    console.log('Applying highlights for', annotations.length, 'annotations');
    
    // Get the current text content
    let content = bookContent.innerHTML;
    
    // Sort annotations by text length (longest first) to avoid conflicts
    const sortedAnnotations = [...annotations].sort((a, b) => b.text.length - a.text.length);
    
    // Apply highlights to each annotation
    sortedAnnotations.forEach(annotation => {
        const highlightSpan = `<span class="highlight" data-annotation-id="${annotation._id}">${annotation.text}<div class="highlight-tooltip">Click to view note</div></span>`;
        
        // Use a more specific regex to match the exact text
        const escapedText = annotation.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Only replace if the text isn't already highlighted
        if (!content.includes(`data-annotation-id="${annotation._id}"`)) {
            // Simple text replacement for better reliability
            const textToReplace = annotation.text;
            if (content.includes(textToReplace)) {
                content = content.replace(textToReplace, highlightSpan);
                console.log('Applied highlight for:', annotation.text.substring(0, 50) + '...');
            } else {
                console.log('Text not found for highlight:', annotation.text.substring(0, 50) + '...');
            }
        }
    });
    
    bookContent.innerHTML = content;
    console.log('Highlights applied successfully');
};

const renderAnnotations = () => {
    if (!annotationsList) return;
    
    annotationsList.innerHTML = '';
    
    if (annotations.length === 0) {
        annotationsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted);">No highlights yet</div>';
        return;
    }
    
    annotations.forEach(annotation => {
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.innerHTML = `
            <div class="annotation-text">"${annotation.text}"</div>
            <div class="annotation-meta">
                <span>${new Date(annotation.timestamp).toLocaleDateString()}</span>
                <div class="annotation-actions">
                    <button class="annotation-action delete" onclick="deleteAnnotation('${annotation._id}')">Delete</button>
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => {
            scrollToHighlight(annotation._id);
        });
        
        annotationsList.appendChild(item);
    });
};

// This function is now handled by the async deleteAnnotation above

const scrollToHighlight = (annotationId) => {
    const highlightElement = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (highlightElement) {
        highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightElement.style.boxShadow = '0 0 10px rgba(251, 191, 36, 0.8)';
        setTimeout(() => {
            highlightElement.style.boxShadow = '';
        }, 2000);
    }
};

const toggleAnnotationsPanel = () => {
    annotationsPanel.classList.toggle('open');
};

const loadReadingProgress = (bookId) => {
    const savedProgress = localStorage.getItem(`reading-progress-${bookId}`);
    if (savedProgress) {
        const bookContent = document.getElementById('book-content-display');
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        const percentage = parseFloat(savedProgress);
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${Math.round(percentage)}% read`;
        
        // Restore scroll position
        setTimeout(() => {
            if (bookContent) {
                const maxScroll = bookContent.scrollHeight - bookContent.clientHeight;
                bookContent.scrollTop = (percentage / 100) * maxScroll;
            }
        }, 100);
    }
};




// --- State ---
let conversation = [];
let isLoading = false;

let isListening = false;
let recognition = null;

// Web Audio playback state
let audioContext = null;
let audioSource = null;      // current BufferSource
let audioBuffer = null;      // current decoded buffer
let startTime = 0;           // when current playback started
let resumePosition = 0;      // seconds offset for resume
let isPlaying = false;
let isPaused = false;        // <— NEW: distinguishes pause from natural end
let currentAudioUrl = null;  // blob URL to revoke later

// book
let currentBookText = '';
let currentBookId = null;
let isBookViewerFullscreen = false;

// Add this state variable
let isFullscreen = false;

// --- Helpers ---
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
};

const pcmToWav = (pcmData, sampleRate) => {
  const pcm16 = new Int16Array(pcmData);
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataLength = pcm16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true); view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, 'data'); view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < pcm16.length; i++) { view.setInt16(offset, pcm16[i], true); offset += bytesPerSample; }
  return new Blob([buffer], { type: 'audio/wav' });
};

const base64ToArrayBuffer = (base64) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
};

const displayStatusMessage = (text, type = 'info') => {
  if (type === 'error') {
    statusMessageDiv.textContent = text;
    statusMessageDiv.classList.remove('hidden');
    statusMessageDiv.classList.add('block', 'bg-red-50', 'border-red-200', 'text-red-800');
  } else if (type === 'success') {
    statusMessageDiv.textContent = text;
    statusMessageDiv.classList.remove('hidden');
    statusMessageDiv.classList.add('block', 'bg-green-50', 'border-green-200', 'text-green-800');
  } else {
    statusMessageDiv.textContent = '';
    statusMessageDiv.classList.add('hidden');
    statusMessageDiv.classList.remove('block', 'bg-red-50', 'border-red-200', 'text-red-800');
    statusMessageDiv.classList.remove('bg-green-50', 'border-green-200', 'text-green-800');
  }
};

const appendMessageToChat = (sender, text) => {
  if (initialChatMessage) initialChatMessage.classList.add('hidden');
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('mb-3', 'chat-bubble', sender);
  messageDiv.innerHTML = `
    <p class="sender-label">${sender === 'user' ? 'You' : 'AI'}</p>
    <p class="text-base">${text}</p>
  `;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
};

const setLoadingState = (loading) => {
  isLoading = loading;
  sendButton.disabled = loading || !userInputField.value.trim();
  voiceButton.disabled = loading;
  userInputField.disabled = loading;

  // Disable pause/stop if nothing to control
  const canControlAudio = isPlaying || isPaused;
  pauseVoiceButton.disabled = loading || !canControlAudio;
  stopVoiceButton.disabled  = loading || !canControlAudio;

  if (loading) {
    const thinkingDiv = document.createElement('div');
    thinkingDiv.id = 'ai-thinking-indicator';
    thinkingDiv.classList.add('mb-3', 'chat-bubble', 'ai', 'ai-thinking-indicator');
    thinkingDiv.innerHTML = `<p class="sender-label">AI</p><p class="text-base">Thinking...</p>`;
    chatContainer.appendChild(thinkingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else {
    const thinkingIndicator = document.getElementById('ai-thinking-indicator');
    if (thinkingIndicator) thinkingIndicator.remove();
  }
};

// --- Voice Visualizer ---
const showVoiceVisualizer = (text) => {
  voiceVisualizerContainer.classList.remove('hidden');
  voiceVisualizerContainer.style.display = 'flex';
  voiceVisualizerText.textContent = text;
};

const hideVoiceVisualizer = () => {
  voiceVisualizerContainer.classList.add('hidden');
  voiceVisualizerContainer.style.display = 'none';
};

// --- Voice Control (fixed pause/resume) ---
const playAudio = async (audioUrl = null, buffer = null) => {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();

    // Stop any current source (without treating as "natural end")
    if (audioSource) {
      try { audioSource.onended = null; audioSource.stop(); audioSource.disconnect(); } catch (e) {}
      audioSource = null;
    }

    // Decode or reuse buffer
    let newBuffer = null;
    if (buffer) {
      newBuffer = buffer;
    } else if (audioUrl) {
      // Keep URL so we can revoke later
      currentAudioUrl = audioUrl;
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Audio fetch failed: HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      newBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } else {
      throw new Error('No audio data provided');
    }

    audioBuffer = newBuffer;

    // Create source and start at resumePosition
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);

    // IMPORTANT: don't reset on pause-triggered stop
    audioSource.onended = () => {
      if (isPaused) return; // paused via user; keep resumePosition & UI
      // Natural end or explicit stop
      isPlaying = false;
      resumePosition = 0;
      hideVoiceVisualizer();
      voiceControlsContainer.classList.add('hidden');
      pauseVoiceButton.disabled = true;
      stopVoiceButton.disabled = true;
      try { audioSource && audioSource.disconnect(); } catch (e) {}
      audioSource = null;
      if (currentAudioUrl) {
        try { URL.revokeObjectURL(currentAudioUrl); } catch (e) {}
        currentAudioUrl = null;
      }
      updatePauseButtonUI(false);
    };

    startTime = audioContext.currentTime;
    audioSource.start(0, resumePosition);
    isPlaying = true;
    isPaused = false;

    // UI state
    voiceControlsContainer.classList.remove('hidden');
    showVoiceVisualizer('AI is speaking...');
    pauseVoiceButton.disabled = false;
    stopVoiceButton.disabled = false;
    updatePauseButtonUI(false);

  } catch (error) {
    console.error('Error playing audio:', error);
    displayStatusMessage('Error playing audio. Please try again.', 'error');
    hideVoiceVisualizer();
    // Clean up partially-initialized nodes
    try { audioSource && audioSource.disconnect(); } catch (e) {}
    audioSource = null;
    isPlaying = false;
  }
};

const pauseResumeVoice = async () => {
  if (!audioContext || !audioBuffer) return;

  if (isPlaying && !isPaused) {
    // === PAUSE ===
    try {
      isPaused = true; // mark before stopping so onended knows
      if (audioSource) {
        try { audioSource.stop(); } catch (e) {}
        const elapsed = audioContext.currentTime - startTime;
        resumePosition += elapsed; // remember where we paused
        try { audioSource.disconnect(); } catch (e) {}
        audioSource = null;
      }
      isPlaying = false;

      updatePauseButtonUI(true);
      showVoiceVisualizer('AI speech paused...');
      pauseVoiceButton.disabled = false;
      stopVoiceButton.disabled = false;

    } catch (err) {
      console.error('Error while pausing:', err);
      displayStatusMessage('Could not pause audio.', 'error');
    }

  } else if (isPaused) {
    // === RESUME ===
    try {
      await playAudio(null, audioBuffer); // reuse same decoded buffer
      // playAudio sets visualizer to "speaking" and button UI
    } catch (err) {
      console.error('Error while resuming:', err);
      displayStatusMessage('Could not resume audio.', 'error');
    }
  }
};

const stopVoice = async () => {
  try {
    // treat as full stop (not pause)
    isPaused = false;

    if (audioSource) {
      try { audioSource.onended = null; audioSource.stop(); } catch (e) {}
      try { audioSource.disconnect(); } catch (e) {}
      audioSource = null;
    }
    if (audioContext && audioContext.state !== 'suspended') {
      try { await audioContext.suspend(); } catch (e) {}
    }

    isPlaying = false;
    resumePosition = 0;
    hideVoiceVisualizer();
    voiceControlsContainer.classList.add('hidden');
    updatePauseButtonUI(false);
    pauseVoiceButton.disabled = true;
    stopVoiceButton.disabled = true;

    if (currentAudioUrl) {
      try { URL.revokeObjectURL(currentAudioUrl); } catch (e) {}
      currentAudioUrl = null;
    }

  } catch (error) {
    console.error('Error stopping audio:', error);
    displayStatusMessage('Error stopping audio playback.', 'error');
  }
};

// Update pause button icon/text
const updatePauseButtonUI = (isPausedNow) => {
  if (!pauseVoiceButton) return;
  if (isPausedNow) {
    pauseVoiceButton.innerHTML = `
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Resume
    `;
  } else {
    pauseVoiceButton.innerHTML = `
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Pause
    `;
  }
  pauseVoiceButton.setAttribute('data-paused', isPausedNow);
};


const renderBookContent = () => {
  if (!currentBookText) {
    bookContentDisplay.innerHTML = '<p class="text-gray-400 text-center">No book content available. Please upload a .txt or .pdf file.</p>';
    return;
  }

  const paragraphs = currentBookText.split('\n').filter(p => p.trim() !== '').map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
  bookContentDisplay.innerHTML = paragraphs;
  
  // Apply highlights after content is rendered
  const urlParams = new URLSearchParams(window.location.search);
  const bookId = urlParams.get('bookId');
  if (bookId) {
    setTimeout(async () => {
      await loadAnnotations(bookId);
      setTimeout(() => applyHighlights(), 200);
    }, 300);
  }
};

const escapeHtml = (unsafe) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};





// --- Chat / Book bootstrapping ---
const fetchBookInfoAndGreeting = async () => {
  setLoadingState(true);
  showVoiceVisualizer('Loading book...');
  try {
    const urlParams = new URLSearchParams(window.location.search);
    currentBookId = urlParams.get('bookId');

    if (!currentBookId) {
      displayStatusMessage('Error: No book selected. Redirecting to upload page.', 'error');
      setTimeout(() => { window.location.href = '/upload?error=no_book_selected'; }, 1500);
      hideVoiceVisualizer();
      setLoadingState(false);
      return;
    }

    // Book content
    const bookResponse = await fetch(`/get-book-content/${currentBookId}`);
    if (!bookResponse.ok) {
      const err = await bookResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch book info and greeting.');
    }
    const bookData = await bookResponse.json();
    const initialGreeting = bookData.initialGreeting;
    const bookTitle = bookData.bookTitle;
    currentBookText = bookData.bookText || '';

    bookTitleElement.textContent = bookTitle;
    document.getElementById('book-viewer-title').textContent = bookTitle;

    // Chat history
    const chatHistoryResponse = await fetch(`/get-chat-history/${currentBookId}`);
    if (!chatHistoryResponse.ok) {
      const err = await chatHistoryResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch chat history.');
    }
    const chatHistoryData = await chatHistoryResponse.json();

    if (chatHistoryData.chatHistory.length > 0) {
      initialChatMessage && initialChatMessage.classList.add('hidden');
      chatContainer.innerHTML = '';
    }

    conversation = [];
    chatHistoryData.chatHistory.forEach(m => {
      conversation.push({ sender: m.sender, text: m.text });
      appendMessageToChat(m.sender, m.text);
    });

    if (chatHistoryData.chatHistory.length === 0) {
      conversation.push({ sender: 'ai', text: initialGreeting });
      appendMessageToChat('ai', initialGreeting );
      // here 
      speakText(initialGreeting);
    } else {
      const last = conversation[conversation.length - 1];
      if (last && last.sender === 'ai') speakText(last.text); else hideVoiceVisualizer();
    }

    chatInputSection.classList.remove('hidden');
    voiceControlsContainer.classList.remove('hidden');

    renderBookContent();

  } catch (error) {
    displayStatusMessage(`Error: ${error.message}. Please ensure a book is uploaded.`, 'error');
    console.error('Error fetching book info and greeting:', error);
    bookTitleElement.textContent = 'AI Book Chat';
    document.getElementById('book-viewer-title').textContent = 'Book Content';
    bookContentDisplay.innerHTML = '<p class="text-gray-400 text-center">Failed to load book content. Please try uploading again.</p>';
    appendMessageToChat('ai', "It seems there was an issue loading the book or starting the conversation. Please go back to the upload page to try again.");
    hideVoiceVisualizer();
  } finally {
    setLoadingState(false);
    if (!isPlaying) hideVoiceVisualizer();
  }
};

const handleSendMessage = async (messageToSend = userInputField.value) => {
  if (!messageToSend.trim()) return displayStatusMessage('Please enter a message or use voice input.', 'error');
  if (isLoading) return;

  stopVoice();

  // Optional highlighted text context
  let highlightedText = '';
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (bookContentDisplay.contains(range.commonAncestorContainer)) highlightedText = selection.toString().trim();
  }

  appendMessageToChat('user', messageToSend);
  userInputField.value = '';
  sendButton.disabled = true;

  setLoadingState(true);
  showVoiceVisualizer('AI is thinking...');

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: messageToSend,
        conversationHistory: conversation.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        })),
        highlightedText,
        bookId: currentBookId
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get AI response.');
    }

    const data = await response.json();
    const aiResponseText = data.aiResponse;

    conversation.push({ sender: 'user', text: messageToSend });
    conversation.push({ sender: 'ai', text: aiResponseText });
    appendMessageToChat('ai', aiResponseText);
    speakText(aiResponseText);

  } catch (error) {
    displayStatusMessage(`Error getting AI response: ${error.message}`, 'error');
    console.error('Error getting AI response:', error);
    hideVoiceVisualizer();
  } finally {
    setLoadingState(false);
    sendButton.disabled = !userInputField.value.trim();
  }
};

// input listeners
userInputField.addEventListener('keypress', (event) => {
  if (event.key === 'Enter' && !isLoading) handleSendMessage();
});
userInputField.addEventListener('input', () => {
  sendButton.disabled = !userInputField.value.trim() || isLoading;
});
sendButton.addEventListener('click', () => handleSendMessage());

// --- Speech Recognition (mic input) ---
const setupSpeechRecognition = () => {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isListening = true;
      micIconStatic.classList.add('hidden');
      micIconPulse.classList.remove('hidden');
      voiceButtonText.textContent = 'Stop Talking';
      voiceButton.classList.remove('bg-purple-600', 'hover:bg-purple-700');
      voiceButton.classList.add('bg-red-500', 'hover:bg-red-600');
      stopVoice();
      showVoiceVisualizer('Listening...');
      userInputField.value = '';
      sendButton.disabled = true;
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .filter(result => result.isFinal)
        .map(result => result[0].transcript)
        .join('');

      if (transcript.trim()) {
        hideVoiceVisualizer();
        // Send immediately for snappier UX
        handleSendMessage(transcript.trim());
      } else {
        hideVoiceVisualizer();
        setLoadingState(false);
        sendButton.disabled = !userInputField.value.trim();
      }
    };

    recognition.onerror = (event) => {
      isListening = false;
      micIconStatic.classList.remove('hidden');
      micIconPulse.classList.add('hidden');
      voiceButtonText.textContent = 'Talk';
      voiceButton.classList.remove('bg-red-500', 'hover:bg-red-600');
      voiceButton.classList.add('bg-purple-600', 'hover:bg-purple-700');
      displayStatusMessage(`Speech recognition error: ${event.error}. Please try again.`, 'error');
      console.error('Speech recognition error:', event.error);
      hideVoiceVisualizer();
    };

    recognition.onend = () => {
      isListening = false;
      micIconStatic.classList.remove('hidden');
      micIconPulse.classList.add('hidden');
      voiceButtonText.textContent = 'Talk';
      voiceButton.classList.remove('bg-red-500', 'hover:bg-red-600');
      voiceButton.classList.add('bg-purple-600', 'hover:bg-purple-700');
      if (!isLoading) displayStatusMessage('');
    };

  } else {
    voiceButton.disabled = true;
    voiceButton.textContent = 'Voice Not Supported';
    displayStatusMessage('Web Speech API is not supported by this browser. Voice input will not be available.', 'error');
  }
};

const toggleVoiceInput = () => {
  if (!recognition) return displayStatusMessage('Speech recognition not initialized', 'error');
  if (!isListening) {
    try { recognition.start(); } catch (error) {
      console.error('Error starting recognition:', error);
      displayStatusMessage('Error starting voice input. Please try again.', 'error');
    }
  } else {
    try { recognition.stop(); } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }
};

// --- Fullscreen Toggle ---
const toggleFullscreen = () => {
    isFullscreen = !isFullscreen;
    
    if (isFullscreen) {
        // Maximize - enter fullscreen
        bookViewerPanel.classList.add('book-viewer-fullscreen');
        chatPanel.classList.add('chat-panel-hidden');
        maximizeIcon.classList.add('hidden');
        minimizeIcon.classList.remove('hidden');
        
        // Show theme toggle in fullscreen
        if (themeToggle) {
            themeToggle.classList.add('show-in-fullscreen');
        }
        
        // Prevent body scrolling when in fullscreen
        document.body.style.overflow = 'hidden';
        
        // Scroll to top of book content
        const bookContent = document.getElementById('book-content-display');
        if (bookContent) {
            bookContent.scrollTop = 0;
        }
    } else {
        // Minimize - exit fullscreen
        chatPanel.classList.remove('chat-panel-hidden');
        bookViewerPanel.classList.remove('book-viewer-fullscreen');
        maximizeIcon.classList.remove('hidden');
        minimizeIcon.classList.add('hidden');
        
        // Hide theme toggle when exiting fullscreen
        if (themeToggle) {
            themeToggle.classList.remove('show-in-fullscreen');
        }
        
        // Restore body scrolling
        document.body.style.overflow = '';
    }
};



// --- Boot ---
window.addEventListener('load', () => {
  setupSpeechRecognition();
  fetchBookInfoAndGreeting();

  if (voiceButton) voiceButton.addEventListener('click', toggleVoiceInput);
  if (pauseVoiceButton) pauseVoiceButton.addEventListener('click', pauseResumeVoice);
  if (stopVoiceButton) stopVoiceButton.addEventListener('click', stopVoice);

  // Add fullscreen toggle button listener
  if (toggleFullscreenBtn) {
    toggleFullscreenBtn.addEventListener('click', toggleFullscreen);
  }



  setLoadingState(isLoading);
});

// Add escape key handler to exit fullscreen
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isFullscreen) {
      toggleFullscreen();
  }
});

// --- TTS bridge ---
const speakText = async (text) => {
  if (!text) return;

  try {
    const response = await fetch('/synthesize-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to get speech audio from server.');
    }

    const data = await response.json();
    const audioData = data.audioData;
    const mimeType = data.mimeType;

    const sampleRateMatch = mimeType && mimeType.match(/rate=(\d+)/);
    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1], 10) : 16000;

    if (audioData) {
      const pcmBuffer = base64ToArrayBuffer(audioData);
      const wavBlob = pcmToWav(pcmBuffer, sampleRate);
      const audioUrl = URL.createObjectURL(wavBlob);
      // will be revoked on stop or natural end
      resumePosition = 0; // start fresh for this clip
      await playAudio(audioUrl);
    } else {
      displayStatusMessage('No audio data received from AI for speaking.', 'error');
      hideVoiceVisualizer();
    }
  } catch (error) {
    displayStatusMessage(`Error playing AI voice: ${error.message}`, 'error');
    console.error('Error synthesizing speech:', error);
    hideVoiceVisualizer();
  }
};

// --- Event Listeners & Initialization ---

// Theme toggle event listener
if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  
  const bookContent = document.getElementById('book-content-display');
  if (bookContent) {
    bookContent.addEventListener('scroll', updateReadingProgress);
    
    // Add text selection event listeners for annotations
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('keyup', handleTextSelection);
    
    // Load progress when book content is loaded
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('bookId');
    if (bookId) {
      setTimeout(async () => {
        loadReadingProgress(bookId);
        await loadAnnotations(bookId);
        // Apply highlights after content and annotations are loaded
        setTimeout(() => {
          applyHighlights();
        }, 500);
      }, 1000);
    }
  }

  // Annotation event listeners
  if (highlightBtn) {
    highlightBtn.addEventListener('click', createHighlight);
  }
  
  if (removeHighlightBtn) {
    removeHighlightBtn.addEventListener('click', removeHighlight);
  }
  
  if (annotationsToggle) {
    annotationsToggle.addEventListener('click', toggleAnnotationsPanel);
  }
  
  if (closeAnnotations) {
    closeAnnotations.addEventListener('click', () => {
      annotationsPanel.classList.remove('open');
    });
  }

  // Hide annotation toolbar when clicking outside
  document.addEventListener('click', (e) => {
    if (!annotationToolbar.contains(e.target) && !e.target.closest('.highlight')) {
      hideAnnotationToolbar();
    }
  });

  // Close annotations panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!annotationsPanel.contains(e.target) && !annotationsToggle.contains(e.target)) {
      annotationsPanel.classList.remove('open');
    }
  });
});
