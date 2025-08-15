import 'dotenv/config'
import { Tool } from "langchain/tools";
import { sequelize } from "../config/db";
import { DeviceTelemetry } from "../models/deviceTelemetry";
import { Device } from "../models/device";
import { QueryTypes } from "sequelize";





// Custom SQL Query Tool
class SmartWeldSQLTool extends Tool {
    name = "smartweld_sql_query";
    description = `Query the SmartWeld database for telemetry data and device information. 
    Available tables: 
    - DeviceTelemetries: Contains telemetry data (id, deviceId, timestamp, temperature, gas, current, voltage, severity, possibleCause, recommendation, isCurrentExceeded, analysisTimestamp, isAnalysed)
    - Device: Contains device info (id, deviceType, deviceId, deviceName, status)
    Input should be a valid SQL query. Output is the query result.`;

    async _call(input: string): Promise<string> {
        try {
            const result = await sequelize.query(input, {
                type: QueryTypes.SELECT,
                raw: true
            });
            return JSON.stringify(result, null, 2);
        } catch (error) {
            return `Error executing query: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

// Schema Info Tool
class SmartWeldSchemaToolDataSource extends Tool {
    name = "smartweld_schema_info";
    description = `Get schema information about SmartWeld database tables. 
    Input: table name (DeviceTelemetries or Device)
    Output: table schema and sample data`;

    async _call(input: string): Promise<string> {
        const tableName = input.trim().toLowerCase();

        if (tableName.includes('devicetelemetries') || tableName.includes('telemetry')) {
            const samples = await DeviceTelemetry.findAll({ limit: 3, raw: true });
            return `Table: DeviceTelemetries
Schema: id (INTEGER), deviceId (INTEGER), timestamp (DATE), temperature (FLOAT), gas (FLOAT), current (FLOAT), voltage (FLOAT), severity (TEXT), possibleCause (TEXT), recommendation (TEXT), isCurrentExceeded (BOOLEAN), analysisTimestamp (DATE), isAnalysed (BOOLEAN)
Sample rows: ${JSON.stringify(samples, null, 2)}`;
        } else if (tableName.includes('device')) {
            const samples = await Device.findAll({ limit: 3, raw: true });
            return `Table: Device
Schema: id (INTEGER), deviceType (TEXT), deviceId (TEXT), deviceName (TEXT), status (TEXT)
Sample rows: ${JSON.stringify(samples, null, 2)}`;
        }

        return "Available tables: DeviceTelemetries, Device";
    }
}

// List Tables Tool
class SmartWeldListTablesTool extends Tool {
    name = "smartweld_list_tables";
    description = "List all available tables in the SmartWeld database";

    async _call(input: string): Promise<string> {
        return "Available tables: DeviceTelemetries, Device";
    }
}

export const getSQLToolkit = (llm: any) => {
    const tools = [
        new SmartWeldSQLTool(),
        new SmartWeldSchemaToolDataSource(),
        new SmartWeldListTablesTool()
    ];

    console.log("SmartWeld SQL Tools initialized:", tools.map(t => t.name));
    return { getTools: () => tools };
}




