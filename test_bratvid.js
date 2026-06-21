import { bratVid } from 'brat-canvas/video';
import { writeFile } from 'fs/promises';
(async () => {
  try {
    console.log("Starting...");
    const buf = await bratVid("test", { outputFormat: 'mp4' });
    await writeFile("test.mp4", buf);
    console.log("Success");
  } catch (err) {
    console.error("Original Error:", err.message);
  }
})();
