import { Sequelize } from "sequelize";

export const getTableSchema = async (sequelize: Sequelize, tableName: string): Promise<string> => {
      try {
            const schemaInfo = await sequelize.getQueryInterface().describeTable(tableName);

            const formattedSchema = Object.entries(schemaInfo)
                  .map(([column, attributes]) => {
                        const attr = attributes as any;
                        return `- ${column} (type: ${attr.type}, nullable: ${attr.allowNull})`;
                  })
                  .join("\n");

            return `Schema for table '${tableName}':\n${formattedSchema}`;
      } catch (error: any) {
            return `Error getting schema for table '${tableName}': ${error.message}. Please ensure the table exists.`;
      }
};

//metadata for LangChain integration
getTableSchema.name = "get-table-schema";
getTableSchema.description = "Useful for getting the schema of a specific table. Provide the table name as input.";