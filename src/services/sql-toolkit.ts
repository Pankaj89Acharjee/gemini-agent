import 'dotenv/config';
import { Tool } from "langchain/tools";
import { sequelize } from "../config/db";
import { DeviceTelemetry } from "../models/deviceTelemetry";
import { Device } from "../models/device";
import { QueryTypes } from "sequelize";

// Enhanced Custom Tools for SmartWeld operations
class SmartWeldCustomQueryTool extends Tool {
    name = "smartweld_quick_query";
    description = `Use this tool for common SmartWeld operations. 
    Input should be one of: 'count_records', 'latest_data', 'active_devices', 'high_temperature', 'exceeded_current'
    This tool provides quick access to frequently requested data without needing to write SQL queries.`;

    async _call(input: string): Promise<string> {
        try {
            const query = input.toLowerCase().trim();

            switch (query) {
                case 'count_records':
                    const count = await DeviceTelemetry.count();
                    return `Total telemetry records in the database: ${count}`;

                case 'latest_data':
                    const latest = await DeviceTelemetry.findAll({
                        limit: 5,
                        order: [['timestamp', 'DESC']],
                        raw: true
                    });
                    return `Latest 5 telemetry records:\n${JSON.stringify(latest, null, 2)}`;

                case 'active_devices':
                    const devices = await Device.findAll({
                        where: { status: 'active' },
                        raw: true
                    });
                    return `Active devices in the system:\n${JSON.stringify(devices, null, 2)}`;

                case 'high_temperature':
                    const highTemp = await DeviceTelemetry.findAll({
                        where: sequelize.where(sequelize.col('temperature'), '>', 70),
                        limit: 10,
                        order: [['temperature', 'DESC']],
                        raw: true
                    });
                    return `High temperature records (>70°C):\n${JSON.stringify(highTemp, null, 2)}`;

                case 'exceeded_current':
                    const exceeded = await DeviceTelemetry.findAll({
                        where: { isCurrentExceeded: true },
                        limit: 10,
                        order: [['timestamp', 'DESC']],
                        raw: true
                    });
                    return `Current exceeded records:\n${JSON.stringify(exceeded, null, 2)}`;

                default:
                    return "Available quick queries: count_records, latest_data, active_devices, high_temperature, exceeded_current";
            }
        } catch (error) {
            return `Error executing quick query: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

class SmartWeldSQLTool extends Tool {
    name = "smartweld_sql_query";
    description = `Execute custom SQL queries on the SmartWeld database. 
    Available tables: DeviceTelemetries (contains telemetry data), Device (contains device information)
    Use this tool when you need to write custom SQL queries for specific data analysis.
    Input: A valid SQL SELECT query
    Output: Query results in JSON format`;

    async _call(input: string): Promise<string> {
        try {
            // Basic SQL injection protection - only allow SELECT queries
            const trimmedQuery = input.trim();
            if (!trimmedQuery.toLowerCase().startsWith('select')) {
                return "Error: Only SELECT queries are allowed for security reasons.";
            }

            const result = await sequelize.query(trimmedQuery, {
                type: QueryTypes.SELECT,
                raw: true
            });

            return `Query executed successfully. Results:\n${JSON.stringify(result, null, 2)}`;
        } catch (error) {
            return `SQL Error: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

class SmartWeldDatabaseInfoTool extends Tool {
    name = "smartweld_database_info";
    description = `Get information about the SmartWeld database structure and available data.
    Use this tool to understand what tables and columns are available before writing queries.
    Input: 'schema' or 'tables' or 'sample_data'
    Output: Database schema information or sample data`;

    async _call(input: string): Promise<string> {
        try {
            const query = input.toLowerCase().trim();

            switch (query) {
                case 'schema':
                    const schemaInfo = {
                        tables: {
                            DeviceTelemetries: {
                                description: "Contains real-time welding telemetry data",
                                columns: ["id", "deviceId", "gas", "temperature", "voltage", "current", "timestamp", "isCurrentExceeded"]
                            },
                            Device: {
                                description: "Contains device information and status",
                                columns: ["id", "name", "status", "createdAt", "updatedAt"]
                            }
                        }
                    };
                    return `Database Schema:\n${JSON.stringify(schemaInfo, null, 2)}`;

                case 'tables':
                    const tableCount = await sequelize.query(
                        "SELECT name FROM sqlite_master WHERE type='table'",
                        { type: QueryTypes.SELECT, raw: true }
                    );
                    return `Available tables:\n${JSON.stringify(tableCount, null, 2)}`;

                case 'sample_data':
                    const sampleTelemetry = await DeviceTelemetry.findOne({ raw: true });
                    const sampleDevice = await Device.findOne({ raw: true });
                    return `Sample data:\nTelemetry: ${JSON.stringify(sampleTelemetry, null, 2)}\nDevice: ${JSON.stringify(sampleDevice, null, 2)}`;

                default:
                    return "Available options: 'schema', 'tables', 'sample_data'";
            }
        } catch (error) {
            return `Error getting database info: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

export const getSQLToolkit = async (llm: any) => {
    try {
        // set of tools for the advanced agent
        const tools = [
            new SmartWeldCustomQueryTool(),    // Quick queries for common operations
            new SmartWeldSQLTool(),            // Custom SQL queries for complex analysis
            new SmartWeldDatabaseInfoTool()    // Database schema and structure info
        ];

        console.log("🚀 Advanced SQL Toolkit created with tools:", tools.map(t => ({
            name: t.name,
            description: t.description.substring(0, 100) + "..."
        })));

        return { getTools: () => tools };
    } catch (error) {
        console.error("Error creating advanced SQL toolkit:", error);
        throw error;
    }
};




