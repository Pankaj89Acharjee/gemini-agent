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
    // Adding deviceId and timestamp to link analysis back to the source record
    deviceId: number;
    timestamp: string | Date;
    severity: "CRITICAL" | "WARNING" | "NORMAL" | "UNKNOWN";
    possibleCause: string;
    recommendation: string;
    analysisTimestamp: string;
    isCurrentExceeded: boolean;
}


// export interface AnalysisResult {
//     severity: "CRITICAL" | "WARNING" | "NORMAL" | "UNKNOWN" | undefined;
//     possibleCause: string | undefined;
//     recommendation: string | undefined;
//     isCurrentExceeded: boolean;
//     analysisTimestamp: string | undefined;
// }


let isApiBlocked = false;
let blockUntil = 0;

const LLM_Model = process.env.LLM_MODEL || 'gemini-1.5-flash';
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}


const genAI = new GoogleGenerativeAI(geminiApiKey);

export async function analyzeTelemetryBatch(data: TelemetryData[]): Promise<AnalysisResult[]> {

    //1. Checking the Circuit breaker first
    if (isApiBlocked && Date.now() < blockUntil) {
        console.log("API is currently blocked due to rate limits. Skipping cycle.");
        return data.map(row => ({
            deviceId: Number(row.deviceId),
            timestamp: row.timestamp,
            severity: "UNKNOWN",
            possibleCause: `API blocked due to rate limits of using model ${LLM_Model}`,
            recommendation: "Wait until API is available",
            isCurrentExceeded: row.current > row.CURRENT_THRESHOLD,
            analysisTimestamp: new Date().toISOString()
        }));
    }


    const cleanData = data.map((row) => ({ ...row }));


    try {
        const model = genAI.getGenerativeModel({ model: LLM_Model });

        const prompt = `
            You are an AI analyst for a "SmartWeld" IoT application, specializing in welding equipment telemetry.
            I have a batch of telemetry data logs. Your task is to analyze ALL of the following records.
            Identify any data points that represent an operational anomaly (e.g., high current, high temperature).

            Use the following severity level definitions:
            - CRITICAL: Current exceeds threshold by >50% OR temperature > 80°C.
            - WARNING: Current exceeds threshold by 10-50% OR temperature is between 60-80°C.
            - NORMAL: All parameters are within safe ranges.

            Data Batch to Analyze:
            ${JSON.stringify(cleanData, null, 2)}

            Your Response Requirements:
            - Analyze every record in the batch.
            - Respond ONLY with a valid JSON array.
            - The array should contain one object for EACH anomaly you identify.
            - If there are NO anomalies in the entire batch, return an empty array: [].
            - Each object in the array must follow this exact format:
              {
                "deviceId": <original_device_id>,
                "gas": <original_gas_value>,
                "current": <original_current_value>,
                "voltage": <original_voltage_value>,
                "temperature": <original_temperature_value>,
                "timestamp": "<original_timestamp>",
                "severity": "CRITICAL" | "WARNING",
                "possibleCause": "Brief technical explanation of the issue.",
                "recommendation": "Specific, actionable steps for an operator to take."
              }`;

        const result = await model.generateContent(prompt)
        const responseText = result.response.text().trim();

        // Clean the response (remove markdown code blocks if present)
        const cleanedResponse = responseText
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

        // console.log(`📝 AI Response: ${cleanedResponse}`);

        const parsedResult = JSON.parse(cleanedResponse) as Omit<AnalysisResult, 'analysisTimestamp' | 'isCurrentExceeded'>[];

        // Add timestamp and isCurrentExceeded for each result
        const finalResult: AnalysisResult[] = parsedResult.map(item => {
            const original = data.find(d => String(d.deviceId) === String(item.deviceId) && d.timestamp === item.timestamp);
            return {
                ...item,
                gas: original ? original.gas : 0,
                analysisTimestamp: new Date().toISOString(),
                isCurrentExceeded: original ? original.current > original.CURRENT_THRESHOLD : false,
            };
        });

        //Resetting the circuit breaker on a successful call
        isApiBlocked = false;
        console.log(`✅ Batch analysis complete. Found ${finalResult.length} anomalies.`)

        return finalResult;
    } catch (error) {
        if (error instanceof Error) {
            const anyError = error as any;
            if (anyError.response && anyError.response.status === 429) {
                console.error("Rate limit hit! Blocking API calls for 24 hour.");
                isApiBlocked = true;
                blockUntil = Date.now() + (5 * 60 * 1000); // need to Block for 01 hour, as 50 request is limit
            }

        }
        console.error(`❌ Error analyzing telemetry for devices [${data.map(d => d.deviceId).join(', ')}]:`, error);

        // Fallback analysis based on simple threshold check for each record
        return data.map(row => {
            const isCurrentExceeded = row.current > row.CURRENT_THRESHOLD;
            let severity: "CRITICAL" | "WARNING" | "NORMAL" = "NORMAL";

            if (isCurrentExceeded) {
                const exceedanceRatio = (row.current - row.CURRENT_THRESHOLD) / row.CURRENT_THRESHOLD;
                severity = exceedanceRatio > 0.5 ? "CRITICAL" : "WARNING";
            }

            return {
                deviceId: Number(row.deviceId),
                timestamp: row.timestamp,
                severity: severity,
                possibleCause: "AI analysis failed - using threshold-based fallback",
                recommendation: isCurrentExceeded
                    ? "Current exceeds threshold. Check equipment immediately."
                    : "All parameters appear normal.",
                isCurrentExceeded: isCurrentExceeded,
                analysisTimestamp: new Date().toISOString()
            };
        });
    }
}


