import { exec } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { promises as fs } from 'fs';
import { randomBytes } from 'crypto';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

export async function toOpus(buffer) {
  const tmpFile = join(tmpdir(), `${randomBytes(8).toString('hex')}.wav`);
  const outFile = join(tmpdir(), `${randomBytes(8).toString('hex')}.opus`);
  
  await fs.writeFile(tmpFile, buffer);

  return new Promise((resolve, reject) => {
    // using opus encoding
    const cmd = `${ffmpegPath.path} -i ${tmpFile} -c:a libopus -b:a 128k -vbr on -compression_level 10 -frame_duration 20 -application voip ${outFile} -y`;
    exec(cmd, async (error) => {
      try {
        if (error) {
          // fallback to mp3 or basic opus if libopus not available
          const cmd2 = `${ffmpegPath.path} -i ${tmpFile} -c:a libmp3lame -b:a 128k ${outFile.replace('.opus', '.mp3')} -y`;
          exec(cmd2, async (error2) => {
             if (error2) {
               await fs.unlink(tmpFile).catch(()=>null);
               return reject(error2);
             }
             const mp3Buf = await fs.readFile(outFile.replace('.opus', '.mp3'));
             await fs.unlink(tmpFile).catch(()=>null);
             await fs.unlink(outFile.replace('.opus', '.mp3')).catch(()=>null);
             resolve({ buffer: mp3Buf, mimetype: 'audio/mpeg' });
          });
          return;
        }
        const opusBuf = await fs.readFile(outFile);
        await fs.unlink(tmpFile).catch(()=>null);
        await fs.unlink(outFile).catch(()=>null);
        resolve({ buffer: opusBuf, mimetype: 'audio/ogg; codecs=opus' });
      } catch (e) {
        await fs.unlink(tmpFile).catch(()=>null);
        reject(e);
      }
    });
  });
}
