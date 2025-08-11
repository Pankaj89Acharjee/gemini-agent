//Cron Job for inserting realtime Telemetry data

import cron from 'node-cron'
import { Device } from '../models/device'
import { DeviceTelemetry } from '../models/deviceTelemetry'
import axios from 'axios';

//Interface for Telemetry data
interface TelemetryReading {
    deviceId: string;
    temperature: number;
    gas: number;
    current: number;
    voltage: number;
}

const AGENT_API_ENDPOINT = 'http://localhost:5000/api/telemetry'

// Function to generate mock telemetry data for a device
function generateTelemetryData(deviceId: number): Omit<TelemetryReading, 'deviceId' | 'timestamp'> {
    return {
        temperature: parseFloat((Math.random() * 40 + 60).toFixed(2)), // 60-100°C
        gas: parseFloat((Math.random() * 100).toFixed(2)), // 0-100 ppm
        current: parseFloat((Math.random() * 20 + 5).toFixed(2)), // 5-25 A
        voltage: parseFloat((Math.random() * 50 + 200).toFixed(2)), // 200-250 V
    };
}


async function runTelemetryCycle(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting new telemetry cycle...`);

    // 1. Get all active devices
    const activeDevices = await Device.findAll({
        where: { status: ['active', 'deployed'] },
        attributes: ['id']
    });

    if (activeDevices.length === 0) {
        console.log('No active devices found. Skipping cycle.');
        return;
    }

    console.log(`Found ${activeDevices.length} active device(s).`);

    // 2. Generate telemetry data for each device
    const timestamp = new Date();
    const telemetryBatch: TelemetryReading[] = activeDevices.map(device => {
        const deviceId = device.get('id') as number;
        const telemetryData = generateTelemetryData(deviceId);
        return {
            deviceId: deviceId.toString(),
            timestamp: timestamp,
            ...telemetryData
        };
    });


    // 3. Send the exact same batch to the agent server
    console.log(`Sending batch of ${telemetryBatch.length} records to agent...`);
    try {
        const response = await axios.post(AGENT_API_ENDPOINT, telemetryBatch);
        console.log('Response from agent server:', response.data);
    } catch (err) {
        console.error('Error sending data to agent server:', err);
        // Decide if you still want to save the data even if sending fails
    }


    // 4. Save the exact same batch to the database
    await DeviceTelemetry.bulkCreate(telemetryBatch as []);
    console.log(`Successfully inserted ${telemetryBatch.length} telemetry records into the database.`);

}



// Function to seed some sample devices if none exist
async function seedDevicesIfEmpty(): Promise<void> {
    try {
        const deviceCount = await Device.count();

        if (deviceCount === 0) {
            console.log('No devices found. Creating sample devices...');

            const sampleDevices = [
                {
                    deviceType: 'Welding Machine',
                    deviceId: 'WM001',
                    deviceName: 'Main Welding Unit',
                    status: 'active'
                },
                {
                    deviceType: 'Temperature Sensor',
                    deviceId: 'TS001',
                    deviceName: 'Temperature Monitor 1',
                    status: 'deployed'
                },
                {
                    deviceType: 'Gas Monitor',
                    deviceId: 'GM001',
                    deviceName: 'Gas Detection Unit',
                    status: 'active'
                }
            ];

            await Device.bulkCreate(sampleDevices);
            console.log('Sample devices created successfully');
        }
    } catch (error) {
        console.error('Error seeding devices:', error);
    }
}



//Main function to start the telemetry agent and will be called in the app.ts

export async function startTelemetryAgent(): Promise<void> {
    try {
        console.log('Initializing Telemetry Agent...');

        await seedDevicesIfEmpty();

        // cron job scheduled to run every 10 minutes
        // Cron expression: '*/10 * * * *' means every 10 minutes
        cron.schedule('*/1 * * * *', runTelemetryCycle, {
            timezone: "Asia/Kolkata"
        });

        console.log('Telemetry cron job scheduled. Will run every 10 minutes.');

        await runTelemetryCycle();

    } catch (error) {
        console.error('Failed to initialize telemetry agent:', error);
        // Exit or handle the critical failure appropriately
        process.exit(1);
    }
}