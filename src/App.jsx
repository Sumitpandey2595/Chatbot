import { useState, useEffect, useRef } from 'react'
import api from './services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'

function App() {
  const [health, setHealth] = useState('Checking backend health...')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState(null)
  
  // Conversation state
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  
  // Document state
  const [documents, setDocuments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [playingAudioIndex, setPlayingAudioIndex] = useState(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const currentAudioRef = useRef(null)
  
  // Web Search State
  const [useWebSearch, setUseWebSearch] = useState(false)
  
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Initial load
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await api.get('/api/health')
        setHealth(res.data.status === 'ok' ? 'Connected 🟢' : 'Failed 🔴')
      } catch (error) {
        setHealth('Disconnected 🔴')
      }
    }
    
    const loadConversations = async () => {
      try {
        const res = await api.get('/api/conversations')
        setConversations(res.data)
      } catch (error) {
        console.error("Failed to load conversations", error)
      }
    }
    
    const loadDocuments = async () => {
      try {
        const res = await api.get('/api/documents')
        setDocuments(res.data)
      } catch (error) {
        console.error("Failed to load documents", error)
      }
    }
    
    checkHealth()
    loadConversations()
    loadDocuments()
  }, [])

  // Load specific conversation
  const loadConversation = async (id) => {
    try {
      const res = await api.get(`/api/conversations/${id}`)
      setActiveConversationId(id)
      setMessages(res.data.messages || [])
    } catch (error) {
      console.error("Failed to load conversation", error)
    }
  }

  const handleNewChat = () => {
    setActiveConversationId(null)
    setMessages([])
  }

  const handleDeleteChat = async (id, e) => {
    e.stopPropagation() 
    try {
      await api.delete(`/api/conversations/${id}`)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeConversationId === id) {
        handleNewChat()
      }
    } catch (error) {
      console.error("Failed to delete chat", error)
    }
  }
  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setIsUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    
    try {
      const res = await api.post('/api/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      setDocuments(prev => [res.data, ...prev])
    } catch (error) {
      console.error("Upload failed", error)
      alert("Failed to upload document. See console for details.")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  
  const handleDeleteDocument = async (id) => {
    try {
      await api.delete(`/api/documents/${id}`)
      setDocuments(prev => prev.filter(d => d.id !== id))
    } catch (error) {
      console.error("Failed to delete document", error)
    }
  }

  // Audio Recording (STT)
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
          }
        }

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          
          setIsTranscribing(true)
          const formData = new FormData()
          formData.append('file', audioBlob, 'recording.webm')
          
          try {
            const res = await api.post('/api/audio/transcribe', formData)
            setMessage(prev => (prev ? prev + ' ' : '') + res.data.text)
          } catch (error) {
            console.error("Transcription failed", error)
            alert("Transcription failed. OpenAI key may not be set.")
          } finally {
            setIsTranscribing(false)
            stream.getTracks().forEach(track => track.stop())
          }
        }

        mediaRecorder.start()
        setIsRecording(true)
      } catch (err) {
        console.error("Microphone access denied or error:", err)
        alert("Could not access microphone.")
      }
    }
  }

  // Browser SpeechSynthesis fallback
  const fallbackBrowserTTS = (text, idx) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const cleanText = text.replace(/[*_#`[\]()]/g, '').trim()
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.onend = () => setPlayingAudioIndex(null)
      utterance.onerror = () => setPlayingAudioIndex(null)
      setPlayingAudioIndex(idx)
      window.speechSynthesis.speak(utterance)
    } else {
      setPlayingAudioIndex(null)
    }
  }

  // Text to Speech
  const playAudio = async (text, idx) => {
    if (playingAudioIndex === idx) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current = null
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      setPlayingAudioIndex(null)
      return
    }
    
    // Stop any existing playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    const cleanText = text.replace(/[*_#`[\]()]/g, '').trim()
    if (!cleanText) return

    setPlayingAudioIndex(idx)

    try {
      const res = await api.post('/api/audio/synthesize', { text: cleanText })
      const audioUrl = res.data.audio_url
      
      const audio = new Audio(api.defaults.baseURL ? api.defaults.baseURL + audioUrl : audioUrl)
      currentAudioRef.current = audio
      audio.onended = () => { 
        currentAudioRef.current = null
        setPlayingAudioIndex(null)
      }
      audio.onerror = () => {
        fallbackBrowserTTS(text, idx)
      }
      await audio.play()
    } catch (error) {
      console.warn("Backend TTS unavailable, falling back to browser SpeechSynthesis", error)
      fallbackBrowserTTS(text, idx)
    }
  }

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleSendMessage = async (e, customMsg = null) => {
    if (e) e.preventDefault()
    const textToSend = customMsg || message
    if (!textToSend.trim() || isLoading) return

    const userMessage = { role: 'user', content: textToSend }
    setMessages(prev => [...prev, userMessage])
    setMessage('')
    setIsLoading(true)

    try {
      const payload = { 
        message: userMessage.content,
        attachments: documents.map(doc => doc.id),
        use_web_search: useWebSearch
      }
      if (activeConversationId) {
        payload.conversation_id = activeConversationId
      }
      
      const res = await api.post('/api/chat', payload)
      const aiMessage = { 
        role: 'ai', 
        content: res.data.answer,
        sources: res.data.sources 
      }
      setMessages(prev => [...prev, aiMessage])
      
      if (res.data.new_documents && res.data.new_documents.length > 0) {
        setDocuments(prev => [...res.data.new_documents, ...prev])
      }
      
      if (!activeConversationId) {
        setActiveConversationId(res.data.conversation_id)
        const convRes = await api.get('/api/conversations')
        setConversations(convRes.data)
      }
    } catch (error) {
      const errorMessage = { role: 'ai', content: '⚠️ Error communicating with backend. Please make sure backend is running.' }
      setMessages(prev => [...prev, errorMessage])
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const getDocIcon = (type) => {
    if (['png', 'jpg', 'jpeg', 'webp'].includes(type?.toLowerCase())) return '🖼️'
    if (type?.toLowerCase() === 'pdf') return '📕'
    if (type?.toLowerCase() === 'docx') return '📘'
    return '📄'
  }

  return (
    <div className="App">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-logo">✨</span>
            <h2>Multimodal AI</h2>
          </div>
          <span className="health-badge" title="Backend Status">{health}</span>
        </div>
        
        <button className="new-chat-btn" onClick={handleNewChat}>
          <span>+</span> New Chat
        </button>
        
        <div className="sidebar-section-title">Conversations ({conversations.length})</div>
        <div className="conversation-list">
          {conversations.length === 0 && (
            <div className="empty-sidebar">No saved chats yet</div>
          )}
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
              onClick={() => loadConversation(conv.id)}
            >
              <span className="conv-icon">💬</span>
              <span className="conv-title">{conv.title}</span>
              <button 
                className="delete-btn"
                onClick={(e) => handleDeleteChat(conv.id, e)}
                title="Delete Chat"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>
      
      <main className="chat-container">
        <header className="chat-header">
          <div className="header-info">
            <h1>Multimodal AI Assistant</h1>
            <span className="header-subtitle">RAG • Vision • Voice • DuckDuckGo Search • Document Generation</span>
          </div>
          <div className="header-actions">
            <span className={`search-status ${useWebSearch ? 'active' : ''}`}>
              {useWebSearch ? '🌐 Web Search ON' : '🌐 Web Search OFF'}
            </span>
          </div>
        </header>
        
        <div className="messages-area">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-hero">
                <span className="hero-emoji">🤖</span>
                <h2>How can I help you today?</h2>
                <p>Attach documents, analyze images, use voice, or toggle live web search.</p>
              </div>
              <div className="starter-grid">
                <div className="starter-card" onClick={() => handleSendMessage(null, "Summarize the key takeaways from my uploaded documents.")}>
                  <div className="card-icon">📚</div>
                  <div className="card-title">Document Intelligence</div>
                  <div className="card-desc">Ask questions about uploaded PDFs, Word docs, or notes</div>
                </div>
                <div className="starter-card" onClick={() => { setUseWebSearch(true); handleSendMessage(null, "What are the latest breakthroughs in AI and robotics this week?"); }}>
                  <div className="card-icon">🌐</div>
                  <div className="card-title">Live Web Search</div>
                  <div className="card-desc">Find up-to-the-minute real-world information</div>
                </div>
                <div className="starter-card" onClick={() => handleSendMessage(null, "Write a structured project report and save it as project_summary.md")}>
                  <div className="card-icon">📝</div>
                  <div className="card-title">Document Generator</div>
                  <div className="card-desc">Auto-create and save markdown files directly to your workspace</div>
                </div>
                <div className="starter-card" onClick={() => handleSendMessage(null, "Tell me an inspiring story about perseverance.")}>
                  <div className="card-icon">💡</div>
                  <div className="card-title">Creative & Empathetic</div>
                  <div className="card-desc">Engage in rich, supportive and thoughtful dialogue</div>
                </div>
              </div>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}-message`}>
              <div className="message-header">
                <span className="message-avatar">{msg.role === 'user' ? '👤 You' : '✨ Assistant'}</span>
                {msg.role === 'ai' && (
                  <div className="message-actions">
                    <button 
                      className={`tts-btn ${playingAudioIndex === idx ? 'playing' : ''}`} 
                      onClick={() => playAudio(msg.content, idx)}
                      title={playingAudioIndex === idx ? "Stop Audio" : "Listen to Audio"}
                    >
                      {playingAudioIndex === idx ? '⏹️ Playing...' : '🔊 Listen'}
                    </button>
                    <button 
                      className="copy-btn" 
                      onClick={() => handleCopy(msg.content, idx)}
                      title="Copy response"
                    >
                      {copiedIndex === idx ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                )}
              </div>

              <div className="message-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              {msg.sources && msg.sources.length > 0 && (
                <div className="message-sources">
                  <strong>References & Sources:</strong>
                  <ul>
                    {msg.sources.map((src, i) => (
                      <li key={i}>
                        {src.type === 'web' ? '🌐 ' : '📄 '}
                        {src.url ? (
                          <a href={src.url} target="_blank" rel="noreferrer">{src.name}</a>
                        ) : (
                          <span>{src.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="message ai-message loading">
              <div className="loading-dots">
                <span></span><span></span><span></span>
              </div>
              <span className="loading-text">Thinking & synthesizing response...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="input-container">
          {/* Document Tray */}
          {documents.length > 0 && (
            <div className="document-tray">
              <div className="tray-header">
                <span className="tray-title">Active Document Tray ({documents.length})</span>
                <span className="tray-hint">Included automatically in RAG & Multimodal Context</span>
              </div>
              <div className="document-chips">
                {documents.map(doc => (
                  <div key={doc.id} className="document-chip">
                    <span className="chip-icon">{getDocIcon(doc.file_type)}</span>
                    <span className="chip-name">{doc.filename}</span>
                    <button onClick={() => handleDeleteDocument(doc.id)} className="chip-delete" title="Remove Document">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <form onSubmit={handleSendMessage} className="input-area">
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFileUpload}
              accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
            />
            <button 
              type="button" 
              className={`icon-btn ${isUploading ? 'loading-spin' : ''}`} 
              title="Attach Document or Image (PDF, DOCX, TXT, PNG, JPG, WEBP)"
              onClick={() => fileInputRef.current.click()}
              disabled={isUploading}
            >
              📎
            </button>
            
            <button 
              type="button" 
              className={`icon-btn ${isRecording ? 'recording' : ''}`} 
              title={isRecording ? "Click to finish voice recording" : "Voice Input (Speech-to-Text)"}
              onClick={toggleRecording}
            >
              🎤
            </button>
            
            <button 
              type="button" 
              className={`icon-btn ${useWebSearch ? 'active-web' : ''}`} 
              title={useWebSearch ? "Web Search Enabled (DuckDuckGo)" : "Toggle Live Web Search"}
              onClick={() => setUseWebSearch(!useWebSearch)}
            >
              🌐
            </button>
            
            <input 
              type="text" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                isTranscribing 
                  ? "Transcribing voice with Whisper..." 
                  : (isRecording ? "Recording your voice... Click 🎤 to finish" : (useWebSearch ? "Ask with real-time web search..." : "Type your message or prompt..."))
              } 
              disabled={isLoading || isUploading || isRecording || isTranscribing}
            />
            <button 
              type="submit" 
              className="send-btn" 
              disabled={isLoading || isUploading || isRecording || isTranscribing || !message.trim()}
            >
              Send 🚀
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}

export default App

