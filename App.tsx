import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PlaybackState, GroundingSource, PdfSelection } from './types';
import { fetchArticleContent, generateSpeech, summarizeText, analyzeVideo, extractPdfContent } from './services/geminiService';
import { decode, decodeAudioData } from './utils/audioUtils';

// Available pre-built voices for TTS
const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

type ReadMode = 'full' | 'short' | 'long';

const LogoIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 md:w-14 md:h-14" viewBox="0 0 24 24" fill="none">
        <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
        </defs>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9.5 14a.5.5 0 0 1 0 1" stroke="url(#logoGradient)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 13a2.5 2.5 0 0 1 0 3" stroke="url(#logoGradient)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M14.5 12a4 4 0 0 1 0 5" stroke="url(#logoGradient)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

// SVG Icons as separate components
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.647c1.295.742 1.295 2.545 0 3.286L7.279 20.99c-1.25.717-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
  </svg>
);

const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
  </svg>
);

const StopIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
      <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
    </svg>
);

const RewindIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
        <path fillRule="evenodd" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
    </svg>
);


const LoaderIcon = () => (
    <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const ReadModeSelector: React.FC<{ readMode: ReadMode; setReadMode: (mode: ReadMode) => void; disabled: boolean }> = ({ readMode, setReadMode, disabled }) => (
    <div className="flex items-center justify-center space-x-2 p-1 bg-gray-700 rounded-lg">
        {(['full', 'short', 'long'] as ReadMode[]).map(mode => (
            <button
                key={mode}
                onClick={() => setReadMode(mode)}
                disabled={disabled}
                className={`px-3 py-1.5 text-sm sm:text-base font-semibold rounded-md transition-colors duration-300 w-32 ${
                    readMode === mode
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-transparent text-gray-300 hover:bg-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                {mode === 'full' ? 'Full Text' : mode === 'short' ? 'Short Summary' : 'Long Summary'}
            </button>
        ))}
    </div>
);

export default function App() {
  const [inputMode, setInputMode] = useState<'url' | 'text' | 'pdf' | 'video_analysis'>('url');
  const [url, setUrl] = useState<string>('');
  const [readMode, setReadMode] = useState<ReadMode>('full');
  const [pastedText, setPastedText] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfSelectionMode, setPdfSelectionMode] = useState<PdfSelection['mode']>('all');
  const [pdfRangeStart, setPdfRangeStart] = useState<string>('');
  const [pdfRangeEnd, setPdfRangeEnd] = useState<string>('');
  const [articleText, setArticleText] = useState<string>('');
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [resolvedVideoSource, setResolvedVideoSource] = useState<GroundingSource | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Idle);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isFetchingContent, setIsFetchingContent] = useState<boolean>(false);
  
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICES[0]);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [playbackId, setPlaybackId] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const lastVoiceUsedRef = useRef<string>(selectedVoice);

  const stopAudio = useCallback((reset: boolean) => {
    if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
        sourceNodeRef.current = null;
    }
    cancelAnimationFrame(animationFrameRef.current);
    if (reset) {
        pausedTimeRef.current = 0;
        setCurrentTime(0);
        setPlaybackState(PlaybackState.Idle);
    }
  }, []);

  const resetOutputState = useCallback((keepInput = false) => {
    setArticleText('');
    setSources([]);
    setResolvedVideoSource(null);
    setPlaybackState(PlaybackState.Idle);
    setStatusMessage('');
    setErrorMessage('');
    setCurrentTime(0);
    setDuration(0);
    stopAudio(true);
    if (!keepInput) {
      setUrl('');
      setPastedText('');
      setSelectedFile(null);
      setPdfSelectionMode('all');
      setPdfRangeStart('');
      setPdfRangeEnd('');
    }
  }, [stopAudio]);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setPlaybackState(PlaybackState.Error);
    setStatusMessage('');
    setIsFetchingContent(false);
  }, []);

  const playAudio = useCallback((offset: number = pausedTimeRef.current) => {
    if (!audioBufferRef.current || !audioContextRef.current || !gainNodeRef.current) return;

    if (sourceNodeRef.current) {
      stopAudio(false);
    }
    
    if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
    }
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(gainNodeRef.current);
    source.playbackRate.value = playbackSpeed;
    source.start(0, offset);

    sourceNodeRef.current = source;
    startTimeRef.current = audioContextRef.current.currentTime;
    pausedTimeRef.current = offset;

    setPlaybackId(id => id + 1);
    setPlaybackState(PlaybackState.Playing);
    setStatusMessage('');
  }, [playbackSpeed, stopAudio]);

  const generateAndPlayAudio = useCallback(async (text: string, startTime: number) => {
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }

        const base64Audio = await generateSpeech(text, selectedVoice);
        const audioData = decode(base64Audio);
        const audioBuffer = await decodeAudioData(audioData, audioContextRef.current, 24000, 1);
        
        audioBufferRef.current = audioBuffer;
        setDuration(audioBuffer.duration);
        lastVoiceUsedRef.current = selectedVoice;

        if (startTime >= 0) {
            playAudio(startTime);
        } else {
             // If startTime is negative, it means we just changed voice, don't auto-play
            setPlaybackState(PlaybackState.Paused);
            setCurrentTime(Math.abs(startTime));
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred during audio generation.';
        handleError(message);
    }
  }, [selectedVoice, playAudio, handleError]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',', 2)[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const fetchContent = useCallback(async () => {
    resetOutputState(true);
    
    if ((inputMode === 'url' || inputMode === 'video_analysis') && !url.trim()) {
      handleError("Please enter a URL.");
      return;
    }
    if (inputMode === 'text' && !pastedText.trim()) {
        handleError("Please paste some text.");
        return;
    }
    if (inputMode === 'pdf' && !selectedFile) {
      handleError("Please select a PDF file.");
      return;
    }
    if (inputMode === 'pdf') {
        if (pdfSelectionMode === 'pages' || pdfSelectionMode === 'chapters') {
            const start = parseInt(pdfRangeStart, 10);
            const end = parseInt(pdfRangeEnd, 10);
            if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
                handleError(`Please enter a valid ${pdfSelectionMode === 'pages' ? 'page' : 'chapter'} range.`);
                return;
            }
        }
    }

    setIsFetchingContent(true);
    setPlaybackState(PlaybackState.Buffering);
    
    let currentStatus = '';
    const modeToAction = {
      full: "Processing",
      short: "Summarizing",
      long: "Creating in-depth summary for"
    };

    if (inputMode === 'url') {
      currentStatus = `${modeToAction[readMode]} article...`;
    } else if (inputMode === 'video_analysis') {
        currentStatus = 'Analyzing video...';
    } else if (inputMode === 'pdf') {
      currentStatus = `${modeToAction[readMode]} PDF...`;
    } else {
      currentStatus = `${readMode === 'full' ? 'Preparing' : modeToAction[readMode]} text...`;
    }
    setStatusMessage(currentStatus);

    try {
      let content: string;
      let fetchedSources: GroundingSource[] = [];

      if (inputMode === 'url') {
        const result = await fetchArticleContent(url, readMode);
        content = result.text;
        fetchedSources = result.sources;
      } else if (inputMode === 'video_analysis') {
        const result = await analyzeVideo(url);
        content = result.text;
        fetchedSources = result.sources;
        setResolvedVideoSource(result.videoSource || null);
      } else if (inputMode === 'pdf') {
        const selection: PdfSelection = { mode: pdfSelectionMode };
        if (pdfSelectionMode === 'pages' || pdfSelectionMode === 'chapters') {
            selection.start = parseInt(pdfRangeStart, 10);
            selection.end = parseInt(pdfRangeEnd, 10);
        }
        const base64Data = await fileToBase64(selectedFile!);
        const result = await extractPdfContent(base64Data, readMode, selection);
        content = result.text;
      } else { // inputMode === 'text'
        if (readMode !== 'full') {
            content = await summarizeText(pastedText, readMode);
        } else {
            content = pastedText;
        }
      }
      
      if (!content.trim()) {
        throw new Error("The extracted content is empty.");
      }
      
      setArticleText(content);
      setSources(fetchedSources);
      setIsFetchingContent(false);
      setStatusMessage('Generating audio...');
      await generateAndPlayAudio(content, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      handleError(message);
    }
  }, [url, pastedText, selectedFile, inputMode, readMode, resetOutputState, handleError, generateAndPlayAudio, pdfSelectionMode, pdfRangeStart, pdfRangeEnd]);

  useEffect(() => {
    // This effect handles changing the voice on-the-fly
    if (lastVoiceUsedRef.current !== selectedVoice && audioBufferRef.current && articleText) {
        if (playbackState === PlaybackState.Playing || playbackState === PlaybackState.Paused) {
            stopAudio(false);
            setStatusMessage('Changing voice...');
            setPlaybackState(PlaybackState.Buffering);
            generateAndPlayAudio(articleText, -pausedTimeRef.current);
        }
    }
  }, [selectedVoice, articleText, playbackState, generateAndPlayAudio, stopAudio]);

  const updateCurrentTime = useCallback(() => {
    if (playbackState === PlaybackState.Playing && audioContextRef.current && duration > 0 && !isSeeking) {
        const elapsedTime = audioContextRef.current.currentTime - startTimeRef.current;
        const newTime = pausedTimeRef.current + elapsedTime;
        setCurrentTime(newTime);

        if (newTime >= duration) {
            stopAudio(true);
        } else {
            animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
        }
    }
  }, [playbackState, duration, stopAudio, isSeeking]);

  useEffect(() => {
    if (playbackState === PlaybackState.Playing) {
      animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
    }
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [playbackState, playbackId, updateCurrentTime]);

  const pauseAudio = useCallback(() => {
    if (playbackState !== PlaybackState.Playing || !audioContextRef.current) return;
    
    const elapsedTime = audioContextRef.current.currentTime - startTimeRef.current;
    pausedTimeRef.current += elapsedTime;
    
    stopAudio(false);
    setPlaybackState(PlaybackState.Paused);
  }, [playbackState, stopAudio]);

  const rewindAudio = () => {
    if (duration > 0) {
        const newTime = Math.max(0, currentTime - 10);
        setCurrentTime(newTime);
        pausedTimeRef.current = newTime;
        if (playbackState === PlaybackState.Playing) {
            playAudio(newTime);
        }
    }
  };

  useEffect(() => {
    if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = 1;
    }
    if (sourceNodeRef.current) {
        sourceNodeRef.current.playbackRate.value = playbackSpeed;
    }
  }, [playbackSpeed]);


  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioBufferRef.current) return;
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
  };
  
  const handleSeekStart = () => {
    if (duration > 0) {
        setIsSeeking(true);
    }
  };

  const handleSeekEnd = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (!duration) return;
    setIsSeeking(false);
    const newTime = parseFloat((e.target as HTMLInputElement).value);
    setCurrentTime(newTime);
    pausedTimeRef.current = newTime;
    if (playbackState === PlaybackState.Playing) {
        playAudio(newTime);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        fetchContent();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const canControlPlayback = audioBufferRef.current !== null && playbackState !== PlaybackState.Buffering && !isFetchingContent;

  const renderContentTitle = () => {
    switch (inputMode) {
      case 'video_analysis':
        return "Video Analysis";
      case 'pdf':
        if (readMode === 'short') return "PDF Summary";
        if (readMode === 'long') return "PDF In-Depth Summary";
        return "PDF Content";
      default:
        if (readMode === 'short') return "Summary";
        if (readMode === 'long') return "In-Depth Summary";
        return "Article";
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white font-sans flex flex-col items-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl">
        <header className="mb-8">
            <div className="flex items-start gap-4">
                <LogoIcon />
                <div>
                    <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        EchoRead
                    </h1>
                    <p className="text-xl text-gray-400 mt-1">
                        Your personal AI-powered article reader.
                    </p>
                </div>
            </div>
        </header>

        <main className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
            <div className="flex justify-center border-b border-gray-700 mb-6 flex-wrap">
                <button 
                    onClick={() => setInputMode('url')} 
                    className={`px-4 py-3 text-md sm:text-lg font-semibold transition-colors duration-300 ${inputMode === 'url' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    URL
                </button>
                <button 
                    onClick={() => setInputMode('text')} 
                    className={`px-4 py-3 text-md sm:text-lg font-semibold transition-colors duration-300 ${inputMode === 'text' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Text
                </button>
                <button 
                    onClick={() => setInputMode('pdf')} 
                    className={`px-4 py-3 text-md sm:text-lg font-semibold transition-colors duration-300 ${inputMode === 'pdf' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    PDF
                </button>
                <button 
                    onClick={() => setInputMode('video_analysis')} 
                    className={`px-4 py-3 text-md sm:text-lg font-semibold transition-colors duration-300 ${inputMode === 'video_analysis' ? 'border-b-4 border-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}
                >
                    Analyze Video
                </button>
            </div>
            {inputMode === 'url' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={handleUrlKeyDown}
                            placeholder="https://example.com/article"
                            className="flex-grow w-full text-lg p-4 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            disabled={isFetchingContent}
                        />
                        <button
                            onClick={fetchContent}
                            className="w-full sm:w-auto flex justify-center items-center text-lg font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-4 px-8 rounded-lg transition-transform duration-200 transform hover:scale-105"
                            disabled={isFetchingContent || !url.trim()}
                        >
                           {isFetchingContent ? <><LoaderIcon /><span className="ml-2">Fetching...</span></> : 'Read Aloud'}
                        </button>
                    </div>
                    <div className="pt-2">
                      <ReadModeSelector readMode={readMode} setReadMode={setReadMode} disabled={isFetchingContent} />
                    </div>
                </div>
            )}
            {inputMode === 'text' && (
                <div className="space-y-4">
                    <textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste your article text here..."
                        className="w-full text-lg p-4 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition min-h-[150px]"
                        rows={6}
                        disabled={isFetchingContent}
                    />
                     <div className="pt-2">
                      <ReadModeSelector readMode={readMode} setReadMode={setReadMode} disabled={isFetchingContent} />
                    </div>
                    <button
                        onClick={fetchContent}
                        className="w-full flex justify-center items-center text-lg font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-4 px-8 rounded-lg transition-transform duration-200 transform hover:scale-105"
                        disabled={isFetchingContent || !pastedText.trim()}
                    >
                         {isFetchingContent ? <><LoaderIcon /><span className="ml-2">Processing...</span></> : 'Read Aloud'}
                    </button>
                </div>
            )}
            {inputMode === 'pdf' && (
                <div className="space-y-4">
                    <div className="flex flex-col items-center space-y-4">
                        <label htmlFor="pdf-upload" className="w-full sm:w-2/3 flex justify-center items-center text-lg font-bold bg-gray-600 hover:bg-gray-500 text-white py-4 px-8 rounded-lg transition-colors duration-200 cursor-pointer">
                            {selectedFile ? 'Change PDF' : 'Select PDF File'}
                        </label>
                        <input
                            id="pdf-upload"
                            type="file"
                            accept=".pdf,application/pdf"
                            onChange={handleFileChange}
                            className="hidden"
                            disabled={isFetchingContent}
                        />
                        {selectedFile && <p className="text-gray-300 text-center truncate w-full px-4">Selected: {selectedFile.name}</p>}
                        
                        <div className="w-full bg-gray-700/50 p-4 rounded-lg">
                            <h3 className="text-lg font-semibold mb-3 text-center">Advanced Selection</h3>
                            <div className="flex justify-center space-x-2 sm:space-x-4 mb-4">
                                {(['all', 'pages', 'chapters'] as PdfSelection['mode'][]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setPdfSelectionMode(mode)}
                                        disabled={isFetchingContent}
                                        className={`px-3 py-1.5 text-sm sm:text-base font-semibold rounded-md transition-colors duration-300 w-36 ${
                                            pdfSelectionMode === mode
                                                ? 'bg-blue-600 text-white shadow'
                                                : 'bg-transparent text-gray-300 hover:bg-gray-600'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {mode === 'all' ? 'Entire Document' : mode === 'pages' ? 'Page Range' : 'Chapter Range'}
                                    </button>
                                ))}
                            </div>
                            {(pdfSelectionMode === 'pages' || pdfSelectionMode === 'chapters') && (
                                <div className="flex items-center justify-center space-x-4 animate-fade-in">
                                    <input
                                        type="number"
                                        value={pdfRangeStart}
                                        onChange={(e) => setPdfRangeStart(e.target.value)}
                                        placeholder="From"
                                        min="1"
                                        className="w-24 text-center p-2 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                        disabled={isFetchingContent}
                                    />
                                    <span className="text-gray-400">-</span>
                                    <input
                                        type="number"
                                        value={pdfRangeEnd}
                                        onChange={(e) => setPdfRangeEnd(e.target.value)}
                                        placeholder="To"
                                        min={pdfRangeStart || "1"}
                                        className="w-24 text-center p-2 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                        disabled={isFetchingContent}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="pt-2">
                            <ReadModeSelector readMode={readMode} setReadMode={setReadMode} disabled={isFetchingContent} />
                        </div>
                        <button
                            onClick={fetchContent}
                            className="w-full flex justify-center items-center text-lg font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-4 px-8 rounded-lg transition-transform duration-200 transform hover:scale-105"
                            disabled={isFetchingContent || !selectedFile}
                        >
                           {isFetchingContent ? <><LoaderIcon /><span className="ml-2">Process & Read</span></> : 'Process & Read'}
                        </button>
                    </div>
                </div>
            )}
            {inputMode === 'video_analysis' && (
                <div className="space-y-4">
                     <p className="text-gray-300 text-lg">
                        Paste a YouTube video URL below to generate a detailed AI summary, key topics, and takeaways of the video's content using Google Search grounding.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={handleUrlKeyDown}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="flex-grow w-full text-lg p-4 bg-gray-700 border-2 border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            disabled={isFetchingContent}
                        />
                        <button
                            onClick={fetchContent}
                            className="w-full sm:w-auto flex justify-center items-center text-lg font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-4 px-8 rounded-lg transition-transform duration-200 transform hover:scale-105"
                            disabled={isFetchingContent || !url.trim()}
                        >
                           {isFetchingContent ? <><LoaderIcon /><span className="ml-2">Analyzing...</span></> : 'Analyze & Read'}
                        </button>
                    </div>
                </div>
            )}
        </main>

        <div className="w-full max-w-4xl text-center my-4 min-h-[3rem]">
            {errorMessage && <p className="text-red-400 text-xl font-semibold p-4 bg-red-900/50 rounded-lg">{errorMessage}</p>}
            {statusMessage && (
              <div className="flex items-center justify-center text-blue-300 text-xl font-semibold">
                { (playbackState === PlaybackState.Buffering || isFetchingContent) && <LoaderIcon /> }
                <span className="ml-3">{statusMessage}</span>
              </div>
            )}
        </div>

        {articleText && (
          <div className="bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-2xl mb-8">
              {resolvedVideoSource && (
                <div className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <h3 className="text-xl font-semibold text-gray-200 mb-1">
                    Analyzing Video:
                  </h3>
                  <a href={resolvedVideoSource.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition break-all">
                    {resolvedVideoSource.title || resolvedVideoSource.uri}
                  </a>
                </div>
              )}
              <h2 className="text-3xl font-bold mb-4 text-gray-100 border-b border-gray-700 pb-2">
                {renderContentTitle()}
              </h2>
              <p className="text-gray-300 text-xl leading-relaxed whitespace-pre-wrap">{articleText}</p>
              {sources.length > 0 && (
                  <div className="mt-6">
                      <h3 className="text-xl font-semibold text-gray-200 mb-2">Sources:</h3>
                      <ul className="list-disc list-inside space-y-1">
                          {sources.map((source, index) => (
                              <li key={index} className="text-lg">
                                  <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline transition">
                                      {source.title || source.uri}
                                  </a>
                              </li>
                          ))}
                      </ul>
                  </div>
              )}
          </div>
        )}
        
        {/* Player Controls */}
        {audioBufferRef.current && (
            <div className={`sticky bottom-4 w-full max-w-4xl bg-gray-800/80 backdrop-blur-sm p-5 rounded-2xl shadow-2xl transition-opacity duration-500 ${!canControlPlayback && playbackState !== PlaybackState.Idle ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex items-center justify-center space-x-6 mb-4">
                    <button onClick={rewindAudio} className="text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600" disabled={!canControlPlayback}>
                        <RewindIcon />
                    </button>
                    <button
                        onClick={() => playbackState === PlaybackState.Playing ? pauseAudio() : playAudio()}
                        className="bg-blue-600 text-white rounded-full p-4 hover:bg-blue-500 transition-transform transform hover:scale-110 disabled:bg-gray-600 disabled:cursor-not-allowed"
                        disabled={!canControlPlayback}
                        aria-label={playbackState === PlaybackState.Playing ? 'Pause' : 'Play'}
                    >
                        {playbackState === PlaybackState.Playing ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button onClick={() => stopAudio(true)} className="text-gray-300 hover:text-white transition-transform transform hover:scale-110 disabled:text-gray-600" disabled={!canControlPlayback}>
                        <StopIcon />
                    </button>
                </div>
                <div className="flex items-center space-x-4">
                    <span className="text-lg">{formatTime(currentTime)}</span>
                    <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.1"
                        value={currentTime}
                        onMouseDown={handleSeekStart}
                        onMouseUp={handleSeekEnd}
                        onChange={handleSeek}
                        onTouchStart={handleSeekStart}
                        onTouchEnd={handleSeekEnd}
                        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:cursor-not-allowed"
                        disabled={!canControlPlayback}
                    />
                    <span className="text-lg">{formatTime(duration)}</span>
                </div>
                <div className="flex justify-center items-center space-x-6 mt-4">
                    <div>
                        <label htmlFor="voice-select" className="mr-2 text-lg">Voice:</label>
                        <select 
                            id="voice-select"
                            value={selectedVoice}
                            onChange={(e) => setSelectedVoice(e.target.value)}
                            className="bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="speed-control" className="mr-2 text-lg">Speed:</label>
                        <select
                            id="speed-control"
                            value={playbackSpeed}
                            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                            className="bg-gray-700 text-white p-2 rounded-md border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}x</option>)}
                        </select>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}