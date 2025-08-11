import 'dotenv/config'
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/dbConnection';
import { startTelemetryAgent } from './scheduler/telemetryCronJob';
import { sequelize } from "./config/db";
import { analyzeHighCurrent } from './services/agentAI';

const app = express();
const CURRENT_THRESHOLD = 2;

app.use(express.json())
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // Allow all origins by default,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));




async function startServer() {
    try {
        await connectDB()
        await sequelize.sync({ force: true }); // To make the DB up-to-date with the models
        console.log("Connected to the database successfully");

        await startTelemetryAgent();
        console.log("Telemetry Scheduler stareted successfully");

        app.post('/api/telemetry', async (req, res) => {
            try {
                const dataBatch = req.body;

                console.log(`Recieved total ${dataBatch.length} records from telemetry server.`);

                for (const data of dataBatch) {
                    console.log("Data received from telemetry is", data)
                    if (data.current > CURRENT_THRESHOLD) {
                        console.warn(`⚠️ High current detected: ${data.current} A for device ${data.deviceId}`);
                        // Here I need to send the data to the Gemini API 

                        //Send to the agent
                        const aiAnalysis = await analyzeHighCurrent({
                            deviceId: data.deviceId,
                            timestamp: data.timestamp,
                            temperature: data.temperature,
                            voltage: data.voltage,
                            current: data.current,
                            gas: data.gas,
                            CURRENT_THRESHOLD: CURRENT_THRESHOLD
                        });

                        console.log("AI Analysis Result:", aiAnalysis);
                    }
                }
                res.status(200).json({ message: "Data received and processed successfully." });
            } catch (error) {
                console.error("❌ Error processing telemetry data:", error);
                return res.status(500).json({ error: error ||  "Internal Server Error" });

            }

        })
    } catch (error) {
        console.error("❌ Application startup failed:", error);
        // You might want to exit the process if startup fails critically
        process.exit(1);
    }
}

startServer();



export default app