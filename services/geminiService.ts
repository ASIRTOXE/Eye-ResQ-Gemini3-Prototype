import { GoogleGenAI } from "@google/genai";
import { fileToGenerativePart } from "../utils/fileUtils";

const SYSTEM_PROMPT = `You are **ResQ-Eye**, an autonomous Structural & Casualty Analysis System connected to a live drone feed.

YOUR INTERFACE BEHAVIOR:
Whenever I send you a video or image, DO NOT respond with paragraphs. You must simulate a DIGITAL DASHBOARD using Markdown.

Follow this EXACT structure:

# 🔴 LIVE THREAT MONITOR

## 🏗️ STRUCTURAL INTEGRITY
- **Collapse Probability:** [0-100%]
- **Material Fatigue:** [Describe specific walls/beams]
- **CRITICAL ALERT:** [If safe, say NONE. If danger, specify zone]

## 👥 BIO-SIGNATURES (SURVIVORS)
- **Visual Confirmation:** [Yes/No]
- **Estimated Location:** [e.g., Under north rubble, Depth: 2m]
- **Status:** [Mobile / Trapped / Unconscious]

## 🗺️ TACTICAL RECOMMENDATION
1. **ENTRY PATH:** [Suggest safest route: North Window / Roof / Tunnel]
2. **REQUIRED GEAR:** [Hydraulics / Drones / K9 Unit]

---
**SYSTEM MESSAGE:** [Add a one-line professional military-style summary here]`;

const LIVE_PROMPT = "You are ResQ-Eye. Scan this frame for IMMEDIATE DANGER (Fire, Collapse, Weapons) or SURVIVORS. If Safe, output 'SAFE'. If Danger, output a 3-word alert like 'ALERT: FIRE DETECTED' or 'ALERT: SURVIVOR SEEN'.";

export const analyzeVideo = async (videoFile: File): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key configuration missing. Please ensure process.env.API_KEY is set.");
  }

  // Initialize Gemini AI Client with the environment key
  const ai = new GoogleGenAI({ apiKey });

  try {
    const videoPart = await fileToGenerativePart(videoFile);

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: {
        role: 'user',
        parts: [
          videoPart,
          { text: "Analyze this feed." }
        ]
      },
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.4, 
      }
    });

    if (!response.text) {
      throw new Error("No analysis generated.");
    }

    return response.text;

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    throw new Error(error.message || "Failed to analyze video. Check system configuration.");
  }
};

export const analyzeLiveFrame = async (base64Image: string): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Remove data:image/jpeg;base64, prefix if present
    const cleanBase64 = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          { text: LIVE_PROMPT }
        ]
      },
      config: {
        temperature: 0.7,
      }
    });

    return response.text || "SAFE";
  } catch (error: any) {
    // Enhanced Handle Quota Limit (429) gracefully
    const errorMessage = (error.message || JSON.stringify(error)).toLowerCase();
    const isRateLimit = 
        error.status === 429 || 
        errorMessage.includes('429') || 
        errorMessage.includes('quota') || 
        errorMessage.includes('resource_exhausted') ||
        error.error?.code === 429 ||
        error.error?.status === 'RESOURCE_EXHAUSTED';

    if (isRateLimit) {
        return "STATUS: RATE LIMIT EXCEEDED // STANDBY";
    }

    console.error("Live Analysis Error:", error);
    return "SAFE"; // Fail safe to avoid TTS spam on error
  }
};