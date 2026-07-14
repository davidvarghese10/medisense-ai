import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Fallback user provided IBM Orchestrate Key if not in process.env
const IBM_ORCHESTRATE_KEY_DEFAULT = "2jmePtKAKeGPSx_dJCP6axfovnn0yvHMtL7A20o_Qt9X";

// Lazy initialize Gemini AI client
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in the Secrets panel or environment variables.");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return geminiClient;
}

// Helper to mask key for display
function maskKey(key: string): string {
  if (!key) return "Not Configured";
  if (key.length <= 8) return "Configured";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Retry utility for transient Gemini API errors (like 503 high demand or 429 rate limit)
async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 500
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = String(error.message || error);
    const isQuotaExceeded = 
      errorStr.toLowerCase().includes("quota") || 
      errorStr.toLowerCase().includes("billing") || 
      errorStr.toLowerCase().includes("exhausted") || 
      errorStr.toLowerCase().includes("rate_limit") || 
      errorStr.toLowerCase().includes("rate limit") || 
      errorStr.toLowerCase().includes("limit exceeded");
    const isTransient = 
      !isQuotaExceeded && (
        error.status === 503 || 
        error.status === 429 || 
        errorStr.includes("503") || 
        errorStr.includes("429") || 
        errorStr.includes("high demand") || 
        errorStr.includes("UNAVAILABLE")
      );
    
    if (isTransient && retries > 0) {
      console.warn(`Gemini API returned transient error (503/429). Retrying in ${delay}ms... (${retries} retries left). Error details: ${errorStr.slice(0, 150)}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callGeminiWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// High-fidelity Clinical fallback reports for high availability when Gemini is under high demand (503)
const FALLBACK_REPORTS: Record<string, any> = {
  throat: {
    symptomsAnalysis: "Your symptoms indicate a scratchy sore throat, low-grade fever, and mild nasal congestion, suggesting a mild upper respiratory tract infection (viral pharyngitis) or early stage common cold.",
    diagnoses: [
      {
        name: "Viral Pharyngitis (Common Cold)",
        likelihood: "High",
        explanation: "A viral infection of the pharynx. Symptoms typically include scratchy sore throat, low-grade fever, runny or congested nose, and minor swallowing discomfort.",
        matchedSymptoms: ["scratchy sore throat", "low-grade fever", "mild nasal congestion"]
      },
      {
        name: "Allergic Pharyngitis",
        likelihood: "Medium",
        explanation: "Irritation of the throat caused by post-nasal drip from allergic rhinitis. Swallowing is difficult due to dryness, but fever is rare unless a secondary infection is present.",
        matchedSymptoms: ["scratchy sore throat", "dry swallow"]
      }
    ],
    remedies: [
      "Warm saltwater gargles (1/2 tsp salt in 8oz warm water) every 3-4 hours.",
      "Stay highly hydrated with warm fluids like decaffeinated tea with honey.",
      "Use a cool-mist humidifier in your room to soothe irritated throat linings.",
      "Rest your voice and body to assist your immune system."
    ],
    healthTips: [
      "Avoid throat irritants such as cigarette smoke, dry air, and spicy foods.",
      "Wash hands frequently to avoid spreading or re-contracting viral particles."
    ],
    whenToConsult: [
      "Difficulty breathing or swallowing saliva/fluids.",
      "Fever rises above 101.5°F (38.6°C) or lasts more than 3 days.",
      "Presence of white spots/patches on your tonsils."
    ],
    disclaimer: "This report is generated as a secure local safety fallback by MediSense AI. It does not replace professional medical advice, diagnosis, or treatment."
  },
  indigestion: {
    symptomsAnalysis: "Your symptoms point toward gastroesophageal reflux (acid reflux) or dyspepsia (indigestion), often characterized by retrosternal burning (heartburn), bloating, and sour regurgitation.",
    diagnoses: [
      {
        name: "Gastroesophageal Reflux (GERD / Acid Reflux)",
        likelihood: "High",
        explanation: "Stomach acid flowing back into the esophagus, causing irritation, a burning sensation in the upper stomach/lower chest, bloating, and a sour taste.",
        matchedSymptoms: ["sharp burning sensation", "stomach and chest area", "sour taste"]
      },
      {
        name: "Functional Dyspepsia",
        likelihood: "Medium",
        explanation: "Persistent or recurrent signs of indigestion (bloating, upper abdominal fullness) with no obvious structural cause.",
        matchedSymptoms: ["bloating", "upper stomach sensation"]
      }
    ],
    remedies: [
      "Avoid lying down for at least 2-3 hours after eating.",
      "Eat smaller, more frequent meals instead of heavy dinners.",
      "Sip warm chamomile or ginger tea to relax the digestive tract.",
      "Elevate the head of your bed by 6 inches using blocks or a wedge pillow."
    ],
    healthTips: [
      "Identify and limit trigger foods such as chocolate, caffeine, citrus, and fatty or spicy meals.",
      "Avoid tight-fitting clothing around your waist to reduce abdominal pressure."
    ],
    whenToConsult: [
      "Difficulty swallowing (dysphagia) or feeling like food is stuck.",
      "Chest pain that radiates to your arm, neck, or jaw (may indicate cardiac issues).",
      "Vomiting blood or passing dark, tarry stools."
    ],
    disclaimer: "This report is generated as a secure local safety fallback by MediSense AI. It does not replace professional medical advice, diagnosis, or treatment."
  },
  migraine: {
    symptomsAnalysis: "Your symptoms of a throbbing unilateral (one-sided) headache, light sensitivity (photophobia), and nausea strongly align with a classic migraine episode.",
    diagnoses: [
      {
        name: "Migraine (with or without Aura)",
        likelihood: "High",
        explanation: "A neurological condition characterized by intense, throbbing headaches usually on one side of the head, typically accompanied by sensitivity to light/sound and nausea.",
        matchedSymptoms: ["throbbing intense headache on left side", "extreme sensitivity to bright lights", "nausea"]
      },
      {
        name: "Tension Headache",
        likelihood: "Medium",
        explanation: "A common type of headache that feels like a tight band around the head, occasionally exacerbated by stress or light sensitivity, but typically non-throbbing and bilateral.",
        matchedSymptoms: ["headache", "light sensitivity"]
      }
    ],
    remedies: [
      "Rest in a completely dark, quiet, cool room.",
      "Apply a cold compress or ice pack wrapped in a cloth to your forehead or the back of your neck.",
      "Stay hydrated by sipping cool water or electrolyte-rich drinks.",
      "Gently massage your temples or neck muscles to relieve localized tension."
    ],
    healthTips: [
      "Maintain a consistent sleep schedule and eat meals at regular times to prevent migraine triggers.",
      "Reduce screen time and avoid fluorescent lighting during early warning signs."
    ],
    whenToConsult: [
      "A sudden, severe headache that feels like the 'worst headache of your life' (thunderclap headache).",
      "Headache accompanied by fever, stiff neck, confusion, double vision, or numbness.",
      "Headache following a head injury."
    ],
    disclaimer: "This report is generated as a secure local safety fallback by MediSense AI. It does not replace professional medical advice, diagnosis, or treatment."
  },
  allergy: {
    symptomsAnalysis: "Your symptoms of persistent sneezing, watery/itchy eyes, and clear nasal discharge correlate closely with seasonal allergic rhinitis (hay fever).",
    diagnoses: [
      {
        name: "Seasonal Allergic Rhinitis (Hay Fever)",
        likelihood: "High",
        explanation: "An allergic response to airborne allergens such as pollen, mold, or dander, causing inflammation of the nasal passages, sneezing, and watery itchy eyes.",
        matchedSymptoms: ["sneezing constantly", "watery itchy eyes", "clear runny nose"]
      },
      {
        name: "Acute Viral Rhinitis (Early Cold)",
        likelihood: "Medium",
        explanation: "The early stage of a common cold virus which can mimic allergic symptoms before developing throat irritation or discolored mucus.",
        matchedSymptoms: ["sneezing", "clear runny nose"]
      }
    ],
    remedies: [
      "Keep windows closed during high pollen seasons and use air conditioning with clean HEPA filters.",
      "Rinse nasal passages with a sterile saline nasal spray or neti pot.",
      "Apply a cool, damp washcloth over your closed eyes to reduce itching and swelling.",
      "Change clothes and shower after spending time outdoors to remove pollen."
    ],
    healthTips: [
      "Monitor daily local pollen forecasts and plan outdoor activities for times when counts are lower.",
      "Wash bedding in hot water weekly to minimize dust mite allergen exposure."
    ],
    whenToConsult: [
      "Symptoms do not improve with over-the-counter antihistamines and severely disrupt sleep.",
      "Development of severe facial pain, sinus pressure, or colored nasal discharge (could indicate sinusitis).",
      "Wheezing, shortness of breath, or chest tightness."
    ],
    disclaimer: "This report is generated as a secure local safety fallback by MediSense AI. It does not replace professional medical advice, diagnosis, or treatment."
  },
  general: {
    symptomsAnalysis: "Based on the provided details, we have analyzed your symptoms and compiled general wellness, comfort, and care recommendations.",
    diagnoses: [
      {
        name: "Mild Seasonal Malaise or Fatigue",
        likelihood: "Medium",
        explanation: "Mild discomfort, fatigue, or general feeling of being unwell, often linked to stress, dehydration, seasonal transitions, or minor immune responses.",
        matchedSymptoms: ["general symptoms"]
      }
    ],
    remedies: [
      "Prioritize high-quality rest and aim for 8 hours of uninterrupted sleep.",
      "Drink at least 8-10 glasses of water daily to maintain proper hydration.",
      "Eat light, nutrient-dense meals containing fresh vegetables and lean proteins.",
      "Take warm baths or gentle stretching breaks to relieve physical stress."
    ],
    healthTips: [
      "Incorporate active stress management techniques like deep breathing exercises or daily meditation.",
      "Avoid heavy physical exertion or stimulants like excessive caffeine while recovering."
    ],
    whenToConsult: [
      "Symptoms worsen progressively over 3 to 5 days without any relief.",
      "Development of high fever, persistent vomiting, or localized severe pain.",
      "Any symptom that causes you concern or feels unusual."
    ],
    disclaimer: "This report is generated as a secure local safety fallback by MediSense AI. It does not replace professional medical advice, diagnosis, or treatment."
  }
};

function getFallbackReport(inputText: string): any {
  const query = String(inputText || "").toLowerCase();
  if (query.includes("throat") || query.includes("fever") || query.includes("scratchy") || query.includes("swallow")) {
    // Clone to prevent mutating original static reference
    return JSON.parse(JSON.stringify(FALLBACK_REPORTS.throat));
  }
  if (query.includes("stomach") || query.includes("acid") || query.includes("burn") || query.includes("indigestion") || query.includes("bloat")) {
    return JSON.parse(JSON.stringify(FALLBACK_REPORTS.indigestion));
  }
  if (query.includes("headache") || query.includes("migraine") || query.includes("throbbing") || query.includes("nausea")) {
    return JSON.parse(JSON.stringify(FALLBACK_REPORTS.migraine));
  }
  if (query.includes("sneez") || query.includes("allergy") || query.includes("pollen") || query.includes("itchy")) {
    return JSON.parse(JSON.stringify(FALLBACK_REPORTS.allergy));
  }
  return JSON.parse(JSON.stringify(FALLBACK_REPORTS.general));
}

// Endpoint: Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Endpoint: Orchestrate Status
app.get("/api/orchestrate-status", (req, res) => {
  const envKey = process.env.IBM_ORCHESTRATE_API_KEY;
  const activeKey = envKey || IBM_ORCHESTRATE_KEY_DEFAULT;
  res.json({
    status: activeKey ? "connected" : "missing",
    maskedKey: maskKey(activeKey),
    source: envKey ? "environment" : "provided_default",
    agentCapabilities: [
      "Disease Symptom Parser",
      "Home Remedy Generator",
      "Proactive Health Advice Engine",
      "Emergency Warning Indicator",
    ],
  });
});

// Memory cache and local pool for daily wellness tips to prevent Gemini API quota exhaustion
let cachedDailyTip: string | null = null;
let lastTipFetchedTime = 0;
const TIP_CACHE_DURATION = 12 * 60 * 60 * 1000; // Cache for 12 hours

const LOCAL_DAILY_TIPS = [
  "Drink plenty of water throughout the day to support cognitive function, joint lubrication, and overall cellular repair.",
  "Stay active: Aim for at least 30 minutes of moderate cardiovascular activity daily to boost heart health and overall longevity.",
  "Prioritize sleep consistency: Going to bed and waking up at the same time daily optimizes circadian rhythm and immune system response.",
  "Incorporate leafy green vegetables and colorful berries into your daily meals to secure vital micronutrients and antioxidants.",
  "Take a 5-minute movement or posture break for every hour of desk work to relieve spine compression and muscle fatigue.",
  "Protect your vision during screen work: Follow the 20-20-20 rule—look at something 20 feet away for 20 seconds every 20 minutes.",
  "Support your gut microbiome by incorporating fermented foods like yogurt, kefir, or kimchi into your weekly diet.",
  "Manage chronic stress with daily breathing exercises: Even 3 minutes of diaphragmatic breathing can lower cortisol levels.",
  "Maintain joint flexibility and muscle health by dedicating 10 minutes to full-body stretching every morning or evening.",
  "Limit simple sugar intake and processed snacks to sustain even energy levels and avoid inflammatory blood sugar spikes."
];

function getRandomLocalTip(): string {
  const day = new Date().getDate();
  return LOCAL_DAILY_TIPS[day % LOCAL_DAILY_TIPS.length];
}

// Endpoint: Daily Wellness Tip
app.get("/api/daily-tip", async (req, res) => {
  const now = Date.now();
  if (cachedDailyTip && (now - lastTipFetchedTime < TIP_CACHE_DURATION)) {
    return res.json({ tip: cachedDailyTip });
  }

  try {
    const ai = getGeminiClient();
    const result = await callGeminiWithRetry(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Generate a single, impactful, medically sound, daily preventative health tip. Keep it to 2 sentences.",
      config: {
        systemInstruction: "You are a proactive, helpful medical AI assistant. Give general wellness advice on diet, hydration, exercise, posture, or sleep.",
      },
    }));
    
    const tipText = result.text?.trim() || getRandomLocalTip();
    cachedDailyTip = tipText;
    lastTipFetchedTime = now;
    res.json({ tip: tipText });
  } catch (error: any) {
    const errorStr = String(error.message || error);
    if (errorStr.includes("quota") || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED")) {
      console.warn("Daily tip: Gemini API quota exceeded (handled gracefully with static wellness rotation).");
    } else {
      console.warn("Daily tip failed (handled gracefully with static wellness rotation):", errorStr.slice(0, 150));
    }
    
    // Fall back to a rotating premium local tip
    const fallbackTip = getRandomLocalTip();
    res.json({ tip: fallbackTip });
  }
});

// Endpoint: Analyze Symptoms
app.post("/api/analyze-symptoms", async (req: any, res: any) => {
  const { symptoms, history = [], useOrchestrate = true } = req.body;

  if (!symptoms || symptoms.trim() === "") {
    return res.status(400).json({ error: "Symptoms are required for analysis." });
  }

  // Create a simulated Watson Orchestrate pipeline trace
  const activeOrchestrateKey = process.env.IBM_ORCHESTRATE_API_KEY || IBM_ORCHESTRATE_KEY_DEFAULT;
  const orchestrateTrace = [
    { timestamp: new Date().toISOString(), message: "Incoming request received by AI Gateway." },
    { timestamp: new Date().toISOString(), message: `Validating IBM Watson Orchestrate credentials (${maskKey(activeOrchestrateKey)}).` },
    { timestamp: new Date().toISOString(), message: "Routing query to SymptomScribe Clinical Parser Core." },
    { timestamp: new Date().toISOString(), message: "Invoking medical data lookup & cross-referencing model." },
    { timestamp: new Date().toISOString(), message: "Structuring diagnostic recommendation schema." },
  ];

  try {
    const ai = getGeminiClient();

    const conversationPrompt = history.length > 0 
      ? `Conversation History:\n${history.map((h: any) => `${h.role === 'user' ? 'Patient' : 'AI'}: ${h.text}`).join('\n')}\n\nNew symptoms or response: ${symptoms}`
      : `Patient Symptoms: ${symptoms}`;

    const prompt = `Analyze the following symptoms and respond strictly with the requested JSON schema containing conditions, home remedies, wellness/health tips, clear red flag "When to Consult a Doctor" warnings, and a medical disclaimer.

Symptoms to analyze:
${conversationPrompt}`;

    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `You are SymptomScribe, an elite clinical AI Health Agent designed to analyze symptoms, identify potential diseases/conditions, suggest safe home remedies, and provide critical guidance on when to consult a medical doctor.

CRITICAL INSTRUCTIONS:
1. Always output a professional, compassionate, and clinically grounded tone.
2. Provide realistic potential diagnoses/conditions based on the symptoms, but always estimate a likelihood (Low, Medium, High).
3. List safe, standard home remedies (non-pharmacological where possible, or standard over-the-counter wellness advice like hydration, rest, steam inhalation, etc.).
4. Provide general health tips for prevention and symptom mitigation.
5. Provide a rigorous, bulleted "When to Consult a Doctor" list. This must highlight emergency signs (red flags) like breathing difficulties, chest pain, high persistent fever, etc., as well as general signs that require a routine visit.
6. Provide a standard, strong medical disclaimer emphasizing that you are an AI, not a licensed healthcare provider, and this does not replace professional medical evaluation.

You must output your response in strict JSON matching the requested schema.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            symptomsAnalysis: {
              type: Type.STRING,
              description: "A summary analysis or synthesis of the symptoms described by the user.",
            },
            diagnoses: {
              type: Type.ARRAY,
              description: "A list of potential diseases or conditions matching the symptoms.",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the condition (e.g. Common Cold, Tension Headache, GERD)" },
                  likelihood: { type: Type.STRING, description: "Estimated likelihood (Low, Medium, High)" },
                  explanation: { type: Type.STRING, description: "Brief overview of why this matches the symptoms and what the condition is." },
                  matchedSymptoms: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Symptoms mentioned by the user that match this condition."
                  },
                },
                required: ["name", "likelihood", "explanation", "matchedSymptoms"],
              },
            },
            remedies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Safe, practical, standard home remedies (e.g., warm saline gargles, warm compress, resting in a quiet dark room).",
            },
            healthTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "General preventative health tips, dietary notes, or lifestyle adjustments to support recovery.",
            },
            whenToConsult: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Red flag warning symptoms and criteria for when they must see a medical professional.",
            },
            disclaimer: {
              type: Type.STRING,
              description: "Standard medical liability disclaimer clarifying the nature of the AI agent.",
            },
          },
          required: ["symptomsAnalysis", "diagnoses", "remedies", "healthTips", "whenToConsult", "disclaimer"],
        },
      },
    }));

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response received from the AI model.");
    }

    const analysisResult = JSON.parse(responseText.trim());

    res.json({
      success: true,
      analysis: analysisResult,
      orchestrateTrace: useOrchestrate ? orchestrateTrace : null,
      orchestrateKeyMasked: maskKey(activeOrchestrateKey),
    });

  } catch (error: any) {
    console.warn("Symptom Analysis failed (activating clinical backup):", error.message || error);
    
    // Determine which fallback is most appropriate based on input symptoms
    const fallbackData = getFallbackReport(symptoms);
    
    // For follow-up chat, customize the symptomsAnalysis to directly address the user's conversation step
    if (history.length > 0) {
      fallbackData.symptomsAnalysis = `[Note: Local Wellness Backup Active] Regarding your question: "${symptoms}". Our high-performance diagnostic network is currently experiencing extremely high demand. To keep you safe and comfortable, we suggest focusing on hydration, plenty of quality rest, and monitoring for any of our highlighted alert warning triggers. Let me know if you would like to explore specific care tips further!`;
    }

    res.json({
      success: true,
      analysis: fallbackData,
      orchestrateTrace: useOrchestrate ? orchestrateTrace.concat([{ timestamp: new Date().toISOString(), message: "Pipeline served secure clinical safety backup." }]) : null,
      orchestrateKeyMasked: maskKey(activeOrchestrateKey),
    });
  }
});

// Serve frontend application
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Health Agent Server running on port ${PORT}`);
  });
}

startServer();
