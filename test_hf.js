import { HfInference } from '@huggingface/inference';
const hf = new HfInference(process.env.HF_TOKEN);
hf.imageToImage({
  model: 'timbrooks/instruct-pix2pix',
  inputs: new Blob([new Uint8Array(10)]),
  parameters: { prompt: "test" }
}).then(() => console.log("Success")).catch(e => console.error("Error:", e.message));
