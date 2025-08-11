import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'


export interface TelemetryData {
    deviceId: string;
    timestamp: string | Date;
    temperature: number;
    voltage: number;
    current: number;
    gas: number;
    CURRENT_THRESHOLD: number
}



const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function analyzeHighCurrent(data: TelemetryData) {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
    You are an AI assistant for Smartweld IoT.
    You just received this telemetry:
    Device ID: ${data.deviceId}
    Current: ${data.current} A
    Voltage: ${data.voltage} V
    Temperature: ${data.temperature} °C
    Gas: ${data.gas} ppm
    
    Please:
    1. Detect if the current is above the threshold of ${data.CURRENT_THRESHOLD} A.
    2. If it is, provide a detailed analysis of the potential causes and implications.
    3. Suggest any immediate actions that should be taken to mitigate risks.
    
    Respond in JSON with: 
    {
        "severity": "CRITICAL" | "WARNING" | "NORMAL",
        "possibleCause": "...",
        "recommendation": "..."
    }`;

    const result = await model.generateContent(prompt)
    try {
        return JSON.parse(result.response.text());
    } catch (error) {
        return { severity: "UNKNOWN", possibleCause: "Parse error", recommendation: "Check AI output" };
    }
}

