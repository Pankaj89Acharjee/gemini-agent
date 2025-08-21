import cron from 'node-cron'
import { DeviceTelemetry } from '../models/deviceTelemetry'
import { Op } from 'sequelize';
import { analyzeTelemetryBatch } from './agentAI';

const CURRENT_THRESHOLD = 23; // Example threshold for high current


export async function analyzeDataBatch() {
    try {

        //1. Finding all the data that has not been analysed yet
        const unanalyzedTelemetryData = await DeviceTelemetry.findAll({
            where: {
                isAnalysed: false,
                current: { [Op.gt]: CURRENT_THRESHOLD },
            },
            order: [['timestamp', 'DESC']],
            limit: 1000
        });

        if (unanalyzedTelemetryData.length === 0) {
            console.log('No unanalysed telemetry data found.');
            return;
        }


        //Call Germini and send the data for analysis
        const analysedData = await analyzeTelemetryBatch(unanalyzedTelemetryData.map(row => row.get({ plain: true })))
        console.log(`Analyzed AI response... ${JSON.stringify(analysedData, null, 2)}`);


        //Update the fields in the database for the DeviceTelemetry model
        if (analysedData && analysedData.length > 0) {
            const recordsToUpdate = analysedData.map(item => ({
                deviceId: item.deviceId,
                severity: item.severity,
                possibleCause: item.possibleCause,
                recommendation: item.recommendation,
                isCurrentExceeded: item.isCurrentExceeded,
                analysisTimestamp: item.analysisTimestamp,
            }))
            await DeviceTelemetry.bulkCreate(recordsToUpdate, {
                updateOnDuplicate: ['severity', 'possibleCause', 'recommendation', 'isCurrentExceeded', 'analysisTimestamp']
            });
        }


        // 4. Mark the original telemetry records as analyzed
        const processedIds = unanalyzedTelemetryData.map(row => row.get({ plain: true }).id);
        await DeviceTelemetry.update(
            { isAnalysed: true },
            { where: { id: processedIds } }
        );
        console.log(`Analyst Agent: Cycle complete. Marked ${processedIds.length} records as analyzed.`);

    } catch (error) {
        console.error('Error analyzing data batch:', error);
    }
}


cron.schedule('0 * * * *', analyzeDataBatch) // Runs at the start of every hour e.g. 7:00, 8:00, 9:00, etc.

//For minute based schedule use ('* * * * *')