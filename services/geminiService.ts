import { GoogleGenAI, Modality } from "@google/genai";
import { GroundingSource, PdfSelection } from "../types";

// Lazy initialization to prevent top-level errors with process.env
const getAiClient = () => {
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  return new GoogleGenAI({ apiKey: API_KEY });
};

const longSummaryPrompt = `
**Brief Summary:**
[A concise, one-paragraph summary of the content's main point.]

**Key Topics Discussed:**
- **[Topic 1]:** [A brief explanation of the first key topic.]
- **[Topic 2]:** [A brief explanation of the second key topic.]
- **[And so on for major topics...]**

**Key Takeaways:**
- [The most important conclusion or takeaway from the content.]
- [Another significant insight or actionable point.]
- [And so on for key takeaways...]

Return only this structured analysis, without any added commentary.
`;

export async function fetchArticleContent(url: string, readMode: 'full' | 'short' | 'long'): Promise<{ text: string; sources: GroundingSource[] }> {
  try {
    const ai = getAiClient();
    let contentPrompt: string;
    let systemInstruction: string;

    switch (readMode) {
      case 'short':
        contentPrompt = `Please find the web page at the URL "${url}". First, extract the main article text. Then, create a concise, single-paragraph summary of that article. Return only the summary text, without any added commentary or conversation.`;
        systemInstruction = `You are an expert article summarizer. Your task is to take a URL, find the main article content, summarize it into a single concise paragraph, and return only the summary text. If you cannot access the URL or extract the content for any reason, respond with the single phrase: "ERROR: Unable to extract content."`;
        break;
      case 'long':
        contentPrompt = `Please find the web page at the URL "${url}". First, extract the main article text. Then, create an in-depth summary of that article. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}`;
        systemInstruction = `You are an expert article analyst. Your task is to take a URL, find the main article content, and generate a structured, in-depth summary in the requested format. If you cannot access the URL or extract the content for any reason, respond with the single phrase: "ERROR: Unable to extract content."`;
        break;
      default: // 'full'
        contentPrompt = `Please find the web page at the URL "${url}". Extract the main article text from it. Return only the clean text of the article, without any headers, footers, ads, or navigation menus.`;
        systemInstruction = `You are an expert article extractor. Your task is to take a URL, find the main article content, and return only that text, without any added commentary or conversation. Exclude all extraneous material like advertisements, navigation menus, sidebars, headers, footers, and comment sections. The output should be clean, plain text suitable for text-to-speech conversion. If you cannot access the URL or extract the content for any reason, respond with the single phrase: "ERROR: Unable to extract content."`;
        break;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentPrompt,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text?.trim();

    if (!text || text.startsWith("ERROR:") || text === "") {
      throw new Error("The AI could not extract content from the URL. It might be behind a paywall, require a login, or be inaccessible.");
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
        .map((chunk: any) => ({
            uri: chunk.web?.uri || '',
            title: chunk.web?.title || 'Unknown Source',
        }))
        .filter((source: GroundingSource) => source.uri);
    
    const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

    return { text, sources: uniqueSources };
  } catch (error) {
    console.error("Error fetching article content:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to fetch article content: ${error.message}`);
    }
    throw new Error("Failed to fetch article content. The service may be temporarily unavailable.");
  }
}

// Extracts the video ID from various YouTube URL formats
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetches the YouTube transcript via the serverless backend endpoint to avoid CORS restrictions
async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`/api/transcript?videoId=${videoId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const data = await res.json();
    return data.transcript && data.transcript.length > 100 ? data.transcript : null;
  } catch {
    // Request timed out or endpoint unavailable - fall through to search fallback
    return null;
  }
}

export async function analyzeVideo(url: string): Promise<{ text: string; sources: GroundingSource[]; videoSource?: GroundingSource }> {
  try {
    const ai = getAiClient();
    const videoId = extractYouTubeVideoId(url);

    if (!videoId) {
      throw new Error("The provided URL does not appear to be a valid YouTube link.");
    }

    const transcript = await fetchYouTubeTranscript(videoId);

    let analysisPrompt: string;
    let useSearchFallback = false;

    if (transcript) {
      // Transcript found - analyze directly from the video's spoken content
      analysisPrompt = `You have the full transcript of a YouTube video (ID: ${videoId}, URL: ${url}).

TRANSCRIPT:
"""
${transcript.slice(0, 30000)}
"""

Based on this transcript, generate a comprehensive analysis in this exact format:

**Summary:**
[A concise summary of the video's main points (3-4 sentences).]

**Key Topics:**
- **[Topic 1]:** [Brief explanation of the first key topic discussed.]
- **[Topic 2]:** [Brief explanation of the second key topic discussed.]
- **[Topic 3]:** [Brief explanation of the third key topic discussed.]

**Key Takeaways:**
- [Actionable insight or key takeaway 1.]
- [Actionable insight or key takeaway 2.]
- [Actionable insight or key takeaway 3.]

Base your analysis ONLY on the transcript provided above.`;
    } else {
      // No transcript available - fall back to Google Search grounding
      useSearchFallback = true;
      analysisPrompt = `Search for information about the YouTube video at this exact URL: "${url}" (Video ID: ${videoId}).

Find the video title, description, and any available transcript or summary from the web.
Analyze ONLY this specific video.

Your output must strictly follow this format:
VIDEO_TITLE: [The exact title of the video]
---
**Summary:**
[A concise summary of the video's main points (3-4 sentences).]

**Key Topics:**
- **[Topic 1]:** [Brief explanation.]
- **[Topic 2]:** [Brief explanation.]
- **[Topic 3]:** [Brief explanation.]

**Key Takeaways:**
- [Key takeaway 1.]
- [Key takeaway 2.]
- [Key takeaway 3.]`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: analysisPrompt,
      config: useSearchFallback
        ? { tools: [{ googleSearch: {} }] }
        : undefined,
    });

    const fullResponseText = response.text?.trim();

    if (!fullResponseText || fullResponseText.startsWith("ERROR:") || fullResponseText === "") {
      throw new Error("The AI was unable to analyze this video. It may be private, age-restricted, or lack sufficient public information.");
    }

    // Extract the title from the response when using the search fallback
    let videoTitle = `YouTube Video (${videoId})`;
    let analysisText = fullResponseText;

    if (useSearchFallback) {
      const titleMatch = fullResponseText.match(/^VIDEO_TITLE: (.*)$/m);
      if (titleMatch) videoTitle = titleMatch[1].trim();

      const separatorIndex = fullResponseText.indexOf('---');
      if (separatorIndex !== -1) {
        analysisText = fullResponseText.substring(separatorIndex + 3).trim();
      } else {
        analysisText = analysisText.replace(/^VIDEO_TITLE:.*$/m, '').trim();
      }
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: GroundingSource[] = groundingChunks
      .map((chunk: any) => ({ uri: chunk.web?.uri || '', title: chunk.web?.title || 'Unknown Source' }))
      .filter((s: GroundingSource) => s.uri);
    const uniqueSources = Array.from(new Map(sources.map(item => [item.uri, item])).values());

    return {
      text: analysisText,
      sources: uniqueSources,
      videoSource: { title: videoTitle, uri: url },
    };
  } catch (error) {
    console.error("Error analyzing video:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to analyze video: ${error.message}`);
    }
    throw new Error("Failed to analyze the video. The service may be temporarily unavailable.");
  }
}

export async function summarizeText(text: string, readMode: 'short' | 'long'): Promise<string> {
  try {
    const ai = getAiClient();
    let contentPrompt: string;
    let systemInstruction: string;

    if (readMode === 'long') {
      contentPrompt = `Please provide an in-depth summary of the following text. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}\n\nText:\n${text}`;
      systemInstruction = `You are an expert text analyst. Your task is to take a piece of text, create a structured, in-depth summary in the requested format, and return only that summary.`;
    } else { // 'short'
      contentPrompt = `Please summarize the following text into a single, concise paragraph. Return only the summary text, without any added commentary or conversation.\n\nText:\n${text}`;
      systemInstruction = `You are an expert text summarizer. Your task is to take a piece of text, create a concise, single-paragraph summary, and return only the summary text.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contentPrompt,
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const summary = response.text?.trim();

    if (!summary || summary === "") {
      throw new Error("The AI could not generate a summary from the provided text.");
    }
    
    return summary;
  } catch (error) {
    console.error("Error summarizing text:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to summarize text: ${error.message}`);
    }
    throw new Error("Failed to summarize the text. The service may be temporarily unavailable.");
  }
}

export async function extractPdfContent(
  fileData: string, 
  readMode: 'full' | 'short' | 'long',
  selection: PdfSelection = { mode: 'all' }
): Promise<{ text: string }> {
  try {
    const ai = getAiClient();
    let selectionInstruction = '';
    if (selection.mode === 'pages' && selection.start && selection.end) {
        selectionInstruction = ` from pages ${selection.start} to ${selection.end}`;
    } else if (selection.mode === 'chapters' && selection.start && selection.end) {
        selectionInstruction = ` from chapters ${selection.start} to ${selection.end}`;
    }

    let prompt: string;
    let systemInstruction: string;

    switch (readMode) {
      case 'short':
        prompt = `Please provide a concise, single-paragraph summary of the attached PDF document${selectionInstruction}. Return only the summary text, without any added commentary or conversation.`;
        systemInstruction = `You are an expert document summarizer. Your task is to take a PDF, summarize it concisely into a single paragraph${selectionInstruction}, and return only the summary text. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
        break;
      case 'long':
        prompt = `Please create an in-depth summary of the attached PDF document${selectionInstruction}. The output must strictly follow this format, using Markdown:\n\n${longSummaryPrompt}`;
        systemInstruction = `You are an expert document analyst. Your task is to take a PDF, create a structured, in-depth summary in the requested format${selectionInstruction}, and return only that summary. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
        break;
      default: // 'full'
        prompt = `Please extract all the text content${selectionInstruction} from the attached PDF document. Return only the clean text, formatted for readability, without any added commentary or conversation.`;
        systemInstruction = `You are an expert text extractor. Your task is to take a PDF and return only its text content${selectionInstruction}, clean and ready for text-to-speech. If you cannot process the PDF for any reason, respond with the single phrase: 'ERROR: Unable to process PDF.'`;
        break;
    }
    
    const pdfPart = {
      inlineData: {
        mimeType: 'application/pdf',
        data: fileData
      }
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [pdfPart, textPart] },
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const text = response.text?.trim();

    if (!text || text.startsWith("ERROR:") || text === "") {
      throw new Error("The AI could not extract content from the PDF. The file might be corrupted, password-protected, or contain only images without OCR data.");
    }

    return { text };
  } catch (error) {
    console.error("Error processing PDF content:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to process PDF content: ${error.message}`);
    }
    throw new Error("Failed to process PDF content. The service may be temporarily unavailable.");
  }
}

export async function generateSpeech(text: string, voiceName: string): Promise<string> {
  try {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("No audio data received from API.");
    }
    return base64Audio;
  } catch (error) {
    console.error("Error generating speech:", error);
    throw new Error("Failed to generate audio for the article.");
  }
}