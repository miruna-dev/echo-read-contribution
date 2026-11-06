import { YoutubeTranscript } from 'youtube-transcript';

// Vercel serverless function - runs on the server, no CORS restrictions
export default async function handler(req: any, res: any) {
  const { videoId } = req.query;

  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'Missing videoId parameter.' });
  }

  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      return res.status(404).json({ error: 'No transcript available for this video.' });
    }

    // Join all transcript segments into a single clean string
    const transcript = transcriptItems
      .map(item => item.text.trim())
      .filter(Boolean)
      .join(' ');

    return res.status(200).json({ transcript });
  } catch (error) {
    // Video may be private, age-restricted, or have no captions
    return res.status(500).json({ error: 'Could not fetch transcript for this video.' });
  }
}