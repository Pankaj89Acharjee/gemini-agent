import { Tool } from "@langchain/core/tools";
import { Sequelize } from "sequelize";

export class GetTableSchemaTool extends Tool {
  name = "get-table-schema";
  description = "Useful for getting the schema of a specific table. Provide the table name as input.";

  constructor(private sequelize: Sequelize) {
    super();
  }

  protected async _call(input: string): Promise<string> {
    try {
      // Extract table name from input
      const tableMatch = input.match(/(?:table|schema|structure)\s+(?:of\s+)?['"]?(\w+)['"]?/i);
      if (!tableMatch) {
        return "Please specify a table name. Example: 'Show me the schema of users table'";
      }
      
      const tableName = tableMatch[1];
      const schemaInfo = await this.sequelize.getQueryInterface().describeTable(tableName);
      
      const formattedSchema = Object.entries(schemaInfo)
        .map(([column, attributes]) => {
          const attr = attributes as any;
          return `- ${column} (type: ${attr.type}, nullable: ${attr.allowNull})`;
        })
        .join("\n");

      return `Schema for table '${tableName}':\n${formattedSchema}`;
    } catch (error: any) {
      return `Error getting schema: ${error.message}. Please ensure the table exists.`;
    }
  }
}