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
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    temperature: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Temperature in Celsius'
    },
    gas: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Gas concentration in ppm'
    },
    current: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Current in Amperes'
    },
    voltage: {
        type: DataTypes.FLOAT,
        allowNull: true,
        comment: 'Voltage in Volts'
    },
    severity: {
        type: DataTypes.ENUM('CRITICAL', 'WARNING', 'NORMAL', 'UNKNOWN'),
        allowNull: true,
    },
    possibleCause: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    recommendation: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    isCurrentExceeded: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
    },
    analysisTimestamp: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    isAnalysed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true,
    }
},
    {
        freezeTableName: true,
        indexes: [
            {
                fields: ['deviceId', 'timestamp'], // Composite index for efficient queries
            },
            {
                fields: ['timestamp'], // Index for time-based queries
            }
        ]
    }
);
