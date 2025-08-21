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
                    return `📊 **Total Telemetry Records**: ${count.toLocaleString()}`;

                case 'latest_data':
                    const latest = await DeviceTelemetry.findAll({
                        limit: 5,
                        order: [['timestamp', 'DESC']],
                        raw: true
                    });
                    let latestText = "🕒 **Latest 5 Telemetry Records**:\n\n";
                    latest.forEach((record: any, index: number) => {
                        latestText += `${index + 1}. **Device ${record.deviceId}** - ${new Date(record.timestamp).toLocaleString()}\n`;
                        latestText += `   Temperature: ${record.temperature}°C | Current: ${record.current}A | Voltage: ${record.voltage}V\n\n`;
                    });
                    return latestText;

                case 'active_devices':
                    const devices = await Device.findAll({
                        where: { status: 'active' },
                        raw: true
                    });
                    let devicesText = "🟢 **Active Devices**:\n\n";
                    devices.forEach((device: any, index: number) => {
                        const deviceName = device.deviceName || `Device ${device.deviceId}`;
                        devicesText += `${index + 1}. **${deviceName}** (ID: ${device.deviceId})\n`;
                        devicesText += `   Type: ${device.deviceType} | Status: ${device.status}\n\n`;
                    });
                    return devicesText;

                case 'high_temperature':
                    const highTemp = await DeviceTelemetry.findAll({
                        where: sequelize.where(sequelize.col('temperature'), '>', 70),
                        limit: 10,
                        order: [['temperature', 'DESC']],
                        raw: true
                    });
                    let tempText = "🔥 **High Temperature Records (>70°C)**:\n\n";
                    highTemp.forEach((record: any, index: number) => {
                        tempText += `${index + 1}. **Device ${record.deviceId}** - ${record.temperature}°C\n`;
                        tempText += `   Time: ${new Date(record.timestamp).toLocaleString()}\n\n`;
                    });
                    return tempText;

                case 'exceeded_current':
                    const exceeded = await DeviceTelemetry.findAll({
                        where: { isCurrentExceeded: true },
                        limit: 10,
                        order: [['timestamp', 'DESC']],
                        raw: true
                    });
                    let currentText = "⚡ **Current Exceeded Records**:\n\n";
                    exceeded.forEach((record: any, index: number) => {
                        currentText += `${index + 1}. **Device ${record.deviceId}** - ${record.current}A\n`;
                        currentText += `   Time: ${new Date(record.timestamp).toLocaleString()}\n\n`;
                    });
                    return currentText;

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

    private readonly allowedTables = ['DeviceTelemetries', 'Device'];
    private readonly forbiddenKeywords = [
        'DROP', 'DELETE', 'INSERT', 'UPDATE', 'CREATE', 'ALTER', 'TRUNCATE',
        'EXEC', 'EXECUTE', 'UNION', '--', '/*', '*/', 'xp_', 'sp_'
    ];

    private validateSQLQuery(query: string): { isValid: boolean; error?: string } {
        const upperQuery = query.toUpperCase();

        // Check for forbidden keywords
        for (const keyword of this.forbiddenKeywords) {
            if (upperQuery.includes(keyword)) {
                return { isValid: false, error: `Forbidden SQL keyword: ${keyword}` };
            }
        }

        // Must start with SELECT
        if (!upperQuery.trim().startsWith('SELECT')) {
            return { isValid: false, error: 'Only SELECT queries are allowed' };
        }

        // Check for allowed tables only
        const hasAllowedTable = this.allowedTables.some(table =>
            upperQuery.includes(table.toUpperCase())
        );

        if (!hasAllowedTable) {
            return { isValid: false, error: `Query must reference one of the allowed tables: ${this.allowedTables.join(', ')}` };
        }

        // Prevent potential injection patterns
        if (upperQuery.includes('INFORMATION_SCHEMA') ||
            upperQuery.includes('SYS.') ||
            upperQuery.includes('MASTER.')) {
            return { isValid: false, error: 'Access to system tables is not allowed' };
        }

        return { isValid: true };
    }

    async _call(input: string): Promise<string> {
        try {
            const trimmedQuery = input.trim();

            // Validate the query
            const validation = this.validateSQLQuery(trimmedQuery);
            if (!validation.isValid) {
                return `SQL Validation Error: ${validation.error}`;
            }

            // Execute the query
            const result = await sequelize.query(trimmedQuery, {
                type: QueryTypes.SELECT,
                raw: true
            });

            // Limit result size for performance
            const limitedResult = Array.isArray(result) ? result.slice(0, 1000) : result;

            return `Query executed successfully. Results (${limitedResult.length} rows):\n${JSON.stringify(limitedResult, null, 2)}`;
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
                                columns: ["id", "deviceId", "deviceName", "deviceType", "status", "createdAt", "updatedAt"]
                            }
                        }
                    };
                    
                    // Format schema info in a user-friendly way
                    let schemaText = "SmartWeld Database Schema:\n\n";
                    
                    Object.entries(schemaInfo.tables).forEach(([tableName, tableInfo]: [string, any]) => {
                        schemaText += `📋 **${tableName}**\n`;
                        schemaText += `   Description: ${tableInfo.description}\n`;
                        schemaText += `   Columns: ${tableInfo.columns.join(', ')}\n\n`;
                    });
                    
                    return schemaText;

                case 'tables':
                    const allTables = await sequelize.query(
                        "SELECT name FROM sqlite_master WHERE type='table'",
                        { type: QueryTypes.SELECT, raw: true }
                    );
                    
                    // Filter out SQLite system tables and format for user display
                    const userTables = allTables
                        .filter((table: any) => !table.name.startsWith('sqlite_') && table.name !== 'sqlite_sequence')
                        .map((table: any) => table.name);
                    
                    const tableCount = userTables.length;
                    const tableList = userTables.map(table => `**${table}**`).join(', ');
                    
                    return `📋 **Database Tables**\n\nThe SmartWeld database contains **${tableCount} table${tableCount !== 1 ? 's' : ''}**:\n\n${tableList}`;

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

class SmartWeldDeviceTool extends Tool {
    name = "smartweld_device_info";
    description = `Get information about SmartWeld devices in the database.
    Use this tool for device-related queries like counting devices, listing devices, or getting device status.
    Input: 'count_devices', 'list_devices', 'active_devices', 'device_status'
    Output: Device information in a user-friendly format`;

    async _call(input: string): Promise<string> {
        try {
            const query = input.toLowerCase().trim();

            switch (query) {
                case 'count_devices':
                    const totalDevices = await Device.count();
                    const activeDevices = await Device.count({ where: { status: 'active' } });
                    const inactiveDevices = await Device.count({ where: { status: 'inactive' } });
                    
                    return `📱 **Device Summary**\n\n` +
                           `**Total Devices**: ${totalDevices}\n` +
                           `**Active Devices**: ${activeDevices}\n` +
                           `**Inactive Devices**: ${inactiveDevices}`;

                case 'list_devices':
                    const allDevices = await Device.findAll({ raw: true });
                    let deviceList = "📱 **All Devices**:\n\n";
                    allDevices.forEach((device: any, index: number) => {
                        const statusEmoji = device.status === 'active' ? '🟢' : '🔴';
                        const deviceName = device.deviceName || `Device ${device.deviceId}`;
                        deviceList += `${index + 1}. ${statusEmoji} **${deviceName}** (ID: ${device.deviceId})\n`;
                        deviceList += `   Type: ${device.deviceType} | Status: ${device.status}\n\n`;
                    });
                    return deviceList;

                case 'active_devices':
                    const active = await Device.findAll({ 
                        where: { status: 'active' }, 
                        raw: true 
                    });
                    let activeList = "🟢 **Active Devices**:\n\n";
                    active.forEach((device: any, index: number) => {
                        const deviceName = device.deviceName || `Device ${device.deviceId}`;
                        activeList += `${index + 1}. **${deviceName}** (ID: ${device.deviceId})\n`;
                        activeList += `   Type: ${device.deviceType} | Status: ${device.status}\n\n`;
                    });
                    return activeList;

                case 'device_status':
                    const statusCount = await Device.findAll({
                        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                        group: ['status'],
                        raw: true
                    });
                    let statusText = "📊 **Device Status Summary**:\n\n";
                    statusCount.forEach((status: any) => {
                        const emoji = status.status === 'active' ? '🟢' : '🔴';
                        statusText += `${emoji} **${status.status}**: ${status.count} devices\n`;
                    });
                    return statusText;

                default:
                    return "Available device queries: 'count_devices', 'list_devices', 'active_devices', 'device_status'";
            }
        } catch (error) {
            return `Error getting device info: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

class SmartWeldTelemetryAnalysisTool extends Tool {
    name = "smartweld_telemetry_analysis";
    description = `Analyze telemetry data for specific devices and metrics.
    Use this tool for complex queries about device performance, trends, and specific measurements.
    Input: 'max_current:deviceId', 'avg_temperature:deviceId', 'voltage_range:deviceId', 'performance_summary:deviceId'
    Output: Detailed analysis of telemetry data for the specified device`;

    async _call(input: string): Promise<string> {
        try {
            const [analysisType, deviceId] = input.split(':');
            
            if (!deviceId) {
                return "Error: Device ID is required. Format: 'analysis_type:deviceId'";
            }

            switch (analysisType.toLowerCase()) {
                case 'max_current':
                    const maxCurrentResult = await DeviceTelemetry.findAll({
                        where: { deviceId: deviceId },
                        attributes: [
                            [sequelize.fn('MAX', sequelize.col('current')), 'maxCurrent'],
                            [sequelize.fn('MIN', sequelize.col('current')), 'minCurrent'],
                            [sequelize.fn('AVG', sequelize.col('current')), 'avgCurrent'],
                            [sequelize.fn('COUNT', sequelize.col('id')), 'totalReadings']
                        ],
                        raw: true
                    });

                    const latestCurrent = await DeviceTelemetry.findOne({
                        where: { deviceId: deviceId },
                        order: [['timestamp', 'DESC']],
                        raw: true
                    }) as any;

                    const device = await Device.findOne({
                        where: { deviceId: deviceId },
                        raw: true
                    }) as any;

                    const deviceName = device?.deviceName || `Device ${deviceId}`;
                    const result = maxCurrentResult[0] as any;

                    return `📊 **Current Analysis for ${deviceName} (${deviceId})**\n\n` +
                           `**Maximum Current**: ${result.maxCurrent}A\n` +
                           `**Minimum Current**: ${result.minCurrent}A\n` +
                           `**Average Current**: ${result.avgCurrent?.toFixed(2)}A\n` +
                           `**Total Readings**: ${result.totalReadings}\n` +
                           `**Latest Reading**: ${latestCurrent?.current}A (${latestCurrent ? new Date(latestCurrent.timestamp).toLocaleString() : 'N/A'})`;

                case 'avg_temperature':
                    const tempResult = await DeviceTelemetry.findAll({
                        where: { deviceId: deviceId },
                        attributes: [
                            [sequelize.fn('MAX', sequelize.col('temperature')), 'maxTemp'],
                            [sequelize.fn('MIN', sequelize.col('temperature')), 'minTemp'],
                            [sequelize.fn('AVG', sequelize.col('temperature')), 'avgTemp']
                        ],
                        raw: true
                    });

                    const deviceTemp = await Device.findOne({
                        where: { deviceId: deviceId },
                        raw: true
                    }) as any;

                    const deviceNameTemp = deviceTemp?.deviceName || `Device ${deviceId}`;
                    const tempData = tempResult[0] as any;

                    return `🌡️ **Temperature Analysis for ${deviceNameTemp} (${deviceId})**\n\n` +
                           `**Maximum Temperature**: ${tempData.maxTemp}°C\n` +
                           `**Minimum Temperature**: ${tempData.minTemp}°C\n` +
                           `**Average Temperature**: ${tempData.avgTemp?.toFixed(2)}°C`;

                case 'voltage_range':
                    const voltageResult = await DeviceTelemetry.findAll({
                        where: { deviceId: deviceId },
                        attributes: [
                            [sequelize.fn('MAX', sequelize.col('voltage')), 'maxVoltage'],
                            [sequelize.fn('MIN', sequelize.col('voltage')), 'minVoltage'],
                            [sequelize.fn('AVG', sequelize.col('voltage')), 'avgVoltage']
                        ],
                        raw: true
                    });

                    const deviceVoltage = await Device.findOne({
                        where: { deviceId: deviceId },
                        raw: true
                    }) as any;

                    const deviceNameVoltage = deviceVoltage?.deviceName || `Device ${deviceId}`;
                    const voltageData = voltageResult[0] as any;

                    return `⚡ **Voltage Analysis for ${deviceNameVoltage} (${deviceId})**\n\n` +
                           `**Maximum Voltage**: ${voltageData.maxVoltage}V\n` +
                           `**Minimum Voltage**: ${voltageData.minVoltage}V\n` +
                           `**Average Voltage**: ${voltageData.avgVoltage?.toFixed(2)}V`;

                case 'performance_summary':
                    const summaryResult = await DeviceTelemetry.findAll({
                        where: { deviceId: deviceId },
                        attributes: [
                            [sequelize.fn('MAX', sequelize.col('current')), 'maxCurrent'],
                            [sequelize.fn('MAX', sequelize.col('temperature')), 'maxTemp'],
                            [sequelize.fn('MAX', sequelize.col('voltage')), 'maxVoltage'],
                            [sequelize.fn('COUNT', sequelize.col('id')), 'totalReadings'],
                            [sequelize.fn('SUM', sequelize.literal('CASE WHEN "isCurrentExceeded" = 1 THEN 1 ELSE 0 END')), 'exceededCount']
                        ],
                        raw: true
                    });

                    const deviceSummary = await Device.findOne({
                        where: { deviceId: deviceId },
                        raw: true
                    }) as any;

                    const deviceNameSummary = deviceSummary?.deviceName || `Device ${deviceId}`;
                    const summaryData = summaryResult[0] as any;

                    return `📈 **Performance Summary for ${deviceNameSummary} (${deviceId})**\n\n` +
                           `**Peak Current**: ${summaryData.maxCurrent}A\n` +
                           `**Peak Temperature**: ${summaryData.maxTemp}°C\n` +
                           `**Peak Voltage**: ${summaryData.maxVoltage}V\n` +
                           `**Total Readings**: ${summaryData.totalReadings}\n` +
                           `**Current Exceeded**: ${summaryData.exceededCount} times`;

                default:
                    return "Available analysis types: 'max_current:deviceId', 'avg_temperature:deviceId', 'voltage_range:deviceId', 'performance_summary:deviceId'";
            }
        } catch (error) {
            return `Error analyzing telemetry: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

export const getSQLToolkit = async (llm: any) => {
    try {
        // Set of tools for the LangGraph agent
        const tools = [
            new SmartWeldCustomQueryTool(),    // Quick queries for common operations
            new SmartWeldSQLTool(),            // Custom SQL queries for complex analysis
            new SmartWeldDatabaseInfoTool(),    // Database schema and structure info
            new SmartWeldDeviceTool(),          // Device-specific queries
            new SmartWeldTelemetryAnalysisTool() // Telemetry analysis for specific devices
        ];

        console.log("🚀 LangGraph SQL Toolkit created with tools:", tools.map(t => ({
            name: t.name,
            description: t.description.substring(0, 100) + "..."
        })));

        return { getTools: () => tools };
    } catch (error) {
        console.error("Error creating LangGraph SQL toolkit:", error);
        throw error;
    }
};




