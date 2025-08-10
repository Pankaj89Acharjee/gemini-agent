import { DataTypes } from "sequelize";
import { sequelize } from "../config/db";


export const Device = sequelize.define("Device", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    deviceType: DataTypes.STRING,
    deviceId: {
        type: DataTypes.STRING,
        unique: true
    },
    deviceName: DataTypes.STRING,
    status: {
        type: DataTypes.ENUM("active", "deployed", "decommissioned"),
        defaultValue: "deployed"
    },
},
    { freezeTableName: true }
)
