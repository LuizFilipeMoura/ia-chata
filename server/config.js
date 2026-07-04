// Environment-derived configuration. This module is the only reader of
// process.env — every other server module imports these constants.
export const MODEL = process.env.MODEL || "hf.co/mradermacher/gemma-4-12B-it-heretic_decensored-GGUF:Q4_K_M";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const NUM_CTX = Number(process.env.NUM_CTX || 32768);
export const RULEBOOK_MD = process.env.RULEBOOK_MD || "rules.md";
export const PORT = Number(process.env.PORT || 8000);
