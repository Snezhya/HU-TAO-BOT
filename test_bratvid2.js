import { bratVid } from 'brat-canvas/video';
import { writeFile } from 'fs/promises';
(async () => {
  try {
    console.log("Starting...");
    const buf = await bratVid("halosemua", { 
      outputFormat: 'mp4',
      fast_progress: true,
      lyric: {
        maxWordPerLayer: 5,
        frameDuration: 0.7,
        lastFrameDuration: 1.5
      },
      brat: { BLUR: 0 }
    });
    console.log("Success");
  } catch (err) {
    console.error("Original Error:", err.message);
  }
})();
