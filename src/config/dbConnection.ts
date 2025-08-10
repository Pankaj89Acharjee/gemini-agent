import { Device } from "../models/device";
import { DeviceTelemetry } from "../models/deviceTelemetry";
import { sequelize } from "./db";

export const connectDB = async () => {
    try {
        await sequelize.authenticate();
        console.log("Database connected...")
        Device.hasMany(DeviceTelemetry, {
            foreignKey: 'id',
            sourceKey: 'deviceId'
        })
        DeviceTelemetry.belongsTo(Device, {
            foreignKey: 'deviceId',
        })
    } catch (error) {
        console.error("Unable to connect to the database:", error);
    }
}