import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { DeviceTelemetry } from '../models/deviceTelemetry';


export interface TelemetryData {
    deviceId: string;
    timestamp: string | Date;
    temperature: number;
    voltage: number;
    current: number;
    gas: number;
    CURRENT_THRESHOLD: number
}

export interface AnalysisResult {
    severity: "CRITICAL" | "WARNING" | "NORMAL" | "UNKNOWN" | undefined;
    possibleCause: string | undefined;
    recommendation: string | undefined;
    isCurrentExceeded: boolean;
    analysisTimestamp: string | undefined;
}


const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}


const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function analyzeHighCurrent(data: TelemetryData): Promise<AnalysisResult> {

    let isApiBlocked = false;
    let blockUntil = 0;

    if (isApiBlocked && Date.now() < blockUntil) {
        console.log("API is currently blocked due to rate limits. Skipping cycle.");
        return {
            severity: "UNKNOWN",
            possibleCause: `API blocked due to rate limits of using model ${LLM_Model}`,
            recommendation: "Wait until API is available",
            isCurrentExceeded: data.current > data.CURRENT_THRESHOLD,
            analysisTimestamp: new Date().toISOString()
        };
    }

    try {
        const model = genAI.getGenerativeModel({ model: LLM_Model });

        const isCurrentExceeded = data.current > data.CURRENT_THRESHOLD ? true : false;
        const currentStatus = isCurrentExceeded ? "EXCEEDED" : "NORMAL";



        const prompt = `
                    You are an AI assistant for Smartweld IoT analyzing welding equipment telemetry.
                    
                    TELEMETRY DATA:
                    - Device ID: ${data.deviceId}
                    - Current: ${data.current} A (Threshold: ${data.CURRENT_THRESHOLD} A)
                    - Status: Current is ${currentStatus}
                    - Voltage: ${data.voltage} V
                    - Temperature: ${data.temperature} °C
                    - Gas: ${data.gas} ppm
                    - Timestamp: ${data.timestamp}
                    
                    ANALYSIS REQUIREMENTS:
                    1. Determine if current ${data.current}A exceeds threshold ${data.CURRENT_THRESHOLD}A
                    2. If exceeded, analyze potential causes considering ALL parameters
                    3. Provide severity level based on how much threshold is exceeded
                    4. Consider welding equipment context (overheating, gas levels, electrical issues)
                    5. Suggest immediate actionable recommendations
                    
                    SEVERITY LEVELS:
                    - CRITICAL: Current exceeds threshold by >50% OR temperature >80°C
                    - WARNING: Current exceeds threshold by 10-50% OR temperature 60-80°C
                    - NORMAL: All parameters within safe ranges
                    
                    Respond ONLY with valid JSON in this exact format:
                    {
                        "severity": "CRITICAL" | "WARNING" | "NORMAL",
                        "possibleCause": "Brief technical explanation",
                        "recommendation": "Specific actionable steps",
                        "isCurrentExceeded": ${isCurrentExceeded}
                    }`;

        const result = await model.generateContent(prompt)
        const responseText = result.response.text().trim();

        // Clean the response (remove markdown code blocks if present)
        const cleanedResponse = responseText
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

        // console.log(`📝 AI Response: ${cleanedResponse}`);

        const parsedResult = JSON.parse(cleanedResponse) as Omit<AnalysisResult, 'analysisTimestamp'>;

        // Add timestamp and ensure all required fields are present
        const finalResult: AnalysisResult = {
            severity: parsedResult.severity || "UNKNOWN",
            possibleCause: parsedResult.possibleCause || "Analysis incomplete",
            recommendation: parsedResult.recommendation || "Manual inspection required",
            isCurrentExceeded: isCurrentExceeded,
            analysisTimestamp: new Date().toISOString()
        };

        //Storing the finalResult in the database
        const recordToSave = {
            deviceId: data.deviceId,
            timestamp: data.timestamp,
            temperature: data.temperature,
            gas: data.gas,
            current: data.current,
            voltage: data.voltage,
            severity: finalResult.severity,
            possibleCause: finalResult.possibleCause,
            recommendation: finalResult.recommendation,
            isCurrentExceeded: isCurrentExceeded,
            analysisTimestamp: finalResult.analysisTimestamp
        }
        await DeviceTelemetry.create(recordToSave)

        isApiBlocked = false;
        console.log(`✅ Analysis completed for Device with DeviceID: ${data.deviceId}: and status: ${finalResult.severity}`);
        return finalResult;

    } catch (error) {
        if (error instanceof Error) {
            const anyError = error as any;
            if (anyError.response && anyError.response.status === 429) {
                console.error("Rate limit hit! Blocking API calls for 24 hour.");
                isApiBlocked = true;
                blockUntil = Date.now() + (5 * 60 * 1000); // need to Block for 24 hour, as 50 request per 24 hour is limit
            }

        }
        console.error(`❌ Error analyzing telemetry for device ${data.deviceId}:`, error);

        // Fallback analysis based on simple threshold check
        const isCurrentExceeded = data.current > data.CURRENT_THRESHOLD;
        let severity: "CRITICAL" | "WARNING" | "NORMAL" = "NORMAL";

        if (isCurrentExceeded) {
            const exceedanceRatio = (data.current - data.CURRENT_THRESHOLD) / data.CURRENT_THRESHOLD;
            severity = exceedanceRatio > 0.5 ? "CRITICAL" : "WARNING";
        }

        return {
            severity: severity,
            possibleCause: "AI analysis failed - using threshold-based fallback",
            recommendation: isCurrentExceeded
                ? "Current exceeds threshold. Check equipment immediately."
                : "All parameters appear normal.",
            isCurrentExceeded: isCurrentExceeded,
            analysisTimestamp: new Date().toISOString()
        };
    }

}

