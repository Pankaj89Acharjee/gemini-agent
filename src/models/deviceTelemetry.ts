import { DataTypes } from 'sequelize';
import { sequelize } from "../config/db";

export const DeviceTelemetry = sequelize.define('DeviceTelemetries', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    deviceId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Device',
            key: 'deviceId',
        },
        onDelete: 'CASCADE',
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    temperature: DataTypes.FLOAT,
    gas: DataTypes.FLOAT,
    current: DataTypes.FLOAT,
    voltage: DataTypes.FLOAT
},
    {
        freezeTableName: true,
    }
);
