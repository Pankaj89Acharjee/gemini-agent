import 'dotenv/config'
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/dbConnection';
import { startTelemetryAgent } from './scheduler/telemetryCronJob';
import { sequelize } from "./config/db";
import { analyzeHighCurrent } from './services/agentAI';
import { DeviceTelemetry } from './models/deviceTelemetry';
import { Op } from 'sequelize';

const app = express();
const CURRENT_THRESHOLD = 50;

app.use(express.json())
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // Allow all origins by default,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));




async function startServer() {
    try {
        await connectDB()
        await sequelize.getQueryInterface().dropTable('Device_backup').catch(() => { });
        await sequelize.sync(); // To alter the DB up-to-date with the models
        console.log("Connected to the database successfully");



        app.post('/api/telemetry', async (req, res) => {
            try {
                const dataBatch = req.body;

                console.log(`Recieved total ${dataBatch.length} records from telemetry server.`);

                //Inserting all telemetry data into the database
                const insertedRows = await DeviceTelemetry.bulkCreate(dataBatch as [], { returning: true });



                for (const data of insertedRows) {
                    const telemetry = data.get();
                    //console.log("Data received from telemetry database is", telemetry)
                    if (telemetry.current > CURRENT_THRESHOLD) {
                        console.warn(`⚠️ High current detected: ${telemetry.current} A for device ${telemetry.deviceId}`);

                        //Send to the agent
                        const aiAnalysis = await analyzeHighCurrent({
                            deviceId: telemetry.deviceId,
                            timestamp: telemetry.timestamp,
                            temperature: telemetry.temperature,
                            voltage: telemetry.voltage,
                            current: telemetry.current,
                            gas: telemetry.gas,
                            CURRENT_THRESHOLD: CURRENT_THRESHOLD
                        });

                        console.log("AI Analysis Result:", aiAnalysis.severity, aiAnalysis.recommendation);


                        // Finally updating the database with the AI results
                        await data.update({
                            severity: aiAnalysis.severity,
                            possibleCause: aiAnalysis.possibleCause,
                            recommendation: aiAnalysis.recommendation,
                            analysisTimestamp: aiAnalysis.analysisTimestamp
                        })
                    }
                }

                // const totalDataStored = await DeviceTelemetry.findAll({
                //     where: {
                //         current: { [Op.gt]: CURRENT_THRESHOLD }
                //     },
                //     order: [['timestamp', 'DESC']],
                //     limit: 50
                // })
                // console.log(`🚨 Found ${totalDataStored.length} anomaly records:`);
                // console.log(totalDataStored.map(row => row.toJSON()));


                const totalDataStored = await DeviceTelemetry.findAll({

                    order: [['timestamp', 'DESC']],
                    limit: 50
                })
                console.log(`🚨 Found ${totalDataStored.length} number of records:`);
                console.log(totalDataStored.map(row => row.toJSON()));

                res.status(200).json({ message: "Data stored successfully." });
            } catch (error) {
                console.error("❌ Error processing telemetry data:", error);
                return res.status(500).json({ error: error || "Internal Server Error" });
            }

        })

        await startTelemetryAgent();
        console.log("Telemetry Scheduler stareted successfully");


    } catch (error) {
        console.error("❌ Application startup failed:", error);
        // You might want to exit the process if startup fails critically
        process.exit(1);
    }
}

startServer();



export default app